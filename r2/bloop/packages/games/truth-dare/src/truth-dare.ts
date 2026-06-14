import type { Effect, GameModule, PlayerId, ReduceResult } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import {
  allActed,
  connectedPlayers,
  emptyPlayerMap,
  emptySideBets,
  gameOver,
  initPresence,
  nextActiveSeat,
  placeSideBet,
  redactSideBets,
  resolveSideBets,
  setConnected,
} from '@bloop/kit';
import type {
  ActivePrompt,
  Choice,
  DramaTag,
  Intensity,
  LText,
  Reaction,
  ReactionCounts,
  TdItem,
  TruthDareAction,
  TruthDareConfig,
  TruthDareContent,
  TruthDareState,
  TruthDareView,
  TurnVerdict,
  Verdict,
} from './state.js';
import { REACTIONS } from './state.js';

type S = TruthDareState;
type R = ReduceResult<S>;

/** Draw order: the room plays the highest ALLOWED tier, falling down on exhaustion (ToD design §4). */
const TIER_ORDER: readonly Intensity[] = ['spicy', 'party', 'soft'];

const NOOP = (state: S): R => ({ state, effects: [] });

function deckKey(choice: Choice, tier: Intensity): string {
  return `${choice}:${tier}`;
}

/** Seeded no-repeat draw with tier fall-down. Returns null when the whole choice is exhausted. */
function draw(state: S, choice: Choice): { id: string; intensity: Intensity; cursors: Record<string, number> } | null {
  for (const tier of TIER_ORDER) {
    if (!state.config.allowedIntensities.includes(tier)) continue;
    const key = deckKey(choice, tier);
    const deck = state.decks[key] ?? [];
    let cur = state.cursors[key] ?? 0;
    // belt-and-suspenders: skip anything already served
    while (cur < deck.length && state.usedPromptIds.includes(deck[cur]!)) cur += 1;
    if (cur < deck.length) {
      const cursors = Object.assign(Object.create(null) as Record<string, number>, state.cursors, { [key]: cur + 1 });
      return { id: deck[cur]!, intensity: tier, cursors };
    }
  }
  return null;
}

/** Total content-pool exhaustion ends the game gracefully (ToD design §4). */
function exhausted(state: S, effects: Effect[]): R {
  const over: S = { ...state, phase: 'over' };
  return {
    state: over,
    effects: [
      ...effects,
      { type: 'analytics', name: 'pool_exhausted', props: { turnSeq: state.turnSeq } },
      gameOver(over.scores),
    ],
  };
}

/** The choose phase resolved (action, auto-pick, or single-choice auto-skip): draw and enter prompt. */
function resolveChoice(state: S, choice: Choice, effects: Effect[]): R {
  const drawn = draw(state, choice);
  if (drawn === null) return exhausted(state, effects);
  const item = state.itemsById[drawn.id]!;
  const prompt: ActivePrompt = { choice, intensity: drawn.intensity, id: drawn.id, text: item.text };
  return {
    state: {
      ...state,
      phase: 'prompt',
      choice,
      prompt,
      cursors: drawn.cursors,
      usedPromptIds: [...state.usedPromptIds, drawn.id],
    },
    effects,
  };
}

/**
 * The binary truth a "call your shot" prediction is scored against: the active
 * player COMPLETED ('done') iff the turn verdict is 'done'; a 'chickened' OR a
 * 'passed'/escaped turn both mean they did NOT complete, so a 'chickened'
 * prediction wins. (Predictions are done|chickened; the TurnVerdict adds the
 * 'passed' escape, which folds into "did not complete".)
 */
function predictionOutcome(verdict: TurnVerdict): Verdict {
  return verdict === 'done' ? 'done' : 'chickened';
}

/** A correct prediction pays spectatorPoints; a wrong one pays 0 (upside-only, never docks). */
function spectatorPayout(points: number): (bet: Verdict, outcome: Verdict) => number {
  return (bet, outcome) => (bet === outcome ? points : 0);
}

/**
 * Resolve the turn into the score reveal. Scores the active player by `points`;
 * voters never score for the VERDICT. SEPARATELY (CC-1), correct "call your
 * shot" spectators each earn `spectatorPoints` against the FINAL public
 * outcome — a public aggregate applied only here at the reveal, never mid-turn.
 */
function toScore(
  state: S,
  verdict: TurnVerdict,
  tally: { done: number; chickened: number },
  points: number,
  forfeitText: LText | null,
  effects: Effect[],
  patch: Partial<S> = {},
): R {
  const scores = Object.assign(emptyPlayerMap<number>(), state.scores, {
    [state.activePlayer]: (state.scores[state.activePlayer] ?? 0) + points,
  });
  // CC-1: resolve hidden predictions against the now-public outcome. Counts
  // only — per-spectator identity is never surfaced (TK10 floor).
  const specPoints = state.config.spectatorPoints;
  const specOutcome = predictionOutcome(verdict);
  const specDeltas = resolveSideBets(state.predictions, specOutcome, spectatorPayout(specPoints));
  let specCorrect = 0;
  for (const pid of Object.keys(specDeltas)) {
    scores[pid] = (scores[pid] ?? 0) + specDeltas[pid]!;
    specCorrect += 1;
  }
  const specTotal = Object.keys(state.predictions).length;
  const prompt = state.prompt!;
  // CC-5 drama tag (P1-2): derived purely from the public tally — no new secret.
  const dramaTag = dramaTagOf(verdict, tally);
  // CC-4 escape-react beat (P1-3): only on a NON-completed turn when opted in;
  // seed a zeroed public count (the live buffer is empty at reveal entry and
  // fills as spectators react during the score window). null = beat off / done.
  const reactBeatLive = state.config.reactOnEscape === true && verdict !== 'done';
  const reactions: ReactionCounts | null = reactBeatLive
    ? { ouch: 0, respect: 0, coward: 0 }
    : null;
  return {
    state: {
      ...state,
      ...patch,
      phase: 'score',
      outcome: verdict,
      scores,
      // Fresh empty reaction buffer for this reveal (cleared per turn anyway).
      reactions: emptySideBets<Reaction>(),
      lastResult: {
        activePlayer: state.activePlayer,
        choice: prompt.choice,
        intensity: prompt.intensity,
        promptText: prompt.text,
        verdict,
        tally,
        pointsAwarded: points,
        forfeitText,
        spectatorTally: { correct: specCorrect, total: specTotal, pointsEach: specPoints },
        dramaTag,
        reactions,
      },
    },
    effects,
  };
}

function chickened(state: S, reason: string): R {
  return toScore(state, 'chickened', { done: 0, chickened: 0 }, state.config.chickenedPoints, null, [
    { type: 'analytics', name: reason, props: { turnSeq: state.turnSeq } },
  ]);
}

/**
 * Points a verdicted-DONE turn earns. CC-2 P1-1: tier-weighted — a verdicted
 * DONE adds `tierBonus[intensity]` so a spicier completion scores more. The map
 * defaults to all-zero (identity), so without an opt-in the score is exactly
 * `donePoints (+ dareBonus on a dare)` — byte-unchanged from before. A
 * missing/garbage tier entry reads as 0 (never docks). Only ever called on a
 * DONE verdict; pass/chicken keep their flat constants and are never weighted.
 */
function donePoints(config: TruthDareConfig, choice: Choice, intensity: Intensity): number {
  const raw = config.tierBonus?.[intensity];
  const bonus = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
  return config.donePoints + (choice === 'dare' ? config.dareBonus : 0) + bonus;
}

/**
 * CC-5 drama tag (P1-2) — DERIVED purely from the already-public verdict tally,
 * no new secret, no per-voter names (TK10 floor intact). Brief §1.122:
 *   'contested' — a CLOSE split (>=1 vote each side, |done-chickened| <= 1):
 *                 "la salle est divisée".
 *   'roasted'   — UNANIMOUS-against: every cast vote said chickened and at least
 *                 one was cast (done == 0 < chickened): "tout le monde a dit non".
 *   null        — clear/uncontested, or no votes cast.
 * `contested` (a close split) takes precedence over `roasted` so a 1-vs-2 split
 * reads as divided, not a unanimous roast. Pass/chicken/escape (no contested
 * vote, cast == 0) never carry a tag.
 */
function dramaTagOf(verdict: TurnVerdict, tally: { done: number; chickened: number }): DramaTag {
  if (verdict === 'passed') return null;
  const { done, chickened } = tally;
  const cast = done + chickened;
  if (cast === 0) return null;
  if (done >= 1 && chickened >= 1 && Math.abs(done - chickened) <= 1) return 'contested';
  if (done === 0 && chickened > 0) return 'roasted';
  return null;
}

/** CC-4 — public per-enum escape-reaction counts (aggregate; leaks no individual reaction). */
function reactionCountsOf(buffer: Record<PlayerId, Reaction>): ReactionCounts {
  const counts: ReactionCounts = { ouch: 0, respect: 0, coward: 0 };
  for (const p of Object.keys(buffer)) {
    const r = buffer[p];
    if (r !== undefined && REACTIONS.includes(r)) counts[r] += 1;
  }
  return counts;
}

/**
 * CC-4 — who may react during the escape reveal: every CONNECTED roster player
 * who is NOT the active player. SEPARATE from the verdict's voter set; a
 * reaction is a non-scoring cosmetic channel and never feeds a resolve.
 */
function escapeReactors(state: S): PlayerId[] {
  return connectedPlayers(state.players, state.connected).filter((p) => p !== state.activePlayer);
}

/** Whether the escape-react beat is live on this reveal: opted-in AND the turn was NOT completed. */
function escapeReactBeatActive(state: S): boolean {
  return state.config.reactOnEscape === true && state.outcome !== null && state.outcome !== 'done';
}

/** Tally whatever votes are in. 0 cast -> done (benefit of the doubt); ties -> done (>= threshold). */
function resolveVerdict(state: S): R {
  let done = 0;
  let chick = 0;
  for (const v of Object.values(state.verdicts)) {
    if (v === 'done') done += 1;
    else chick += 1;
  }
  const cast = done + chick;
  const verdict: TurnVerdict =
    cast === 0 || done / cast >= state.config.verdictThreshold ? 'done' : 'chickened';
  const intensity = state.prompt?.intensity ?? 'soft';
  const points =
    verdict === 'done'
      ? donePoints(state.config, state.choice ?? 'truth', intensity)
      : state.config.chickenedPoints;
  return toScore(state, verdict, { done, chickened: chick }, points, null, [
    { type: 'analytics', name: 'verdict_resolved', props: { verdict, done, chickened: chick } },
  ]);
}

/** Present players other than the active one — the verdict's eligible voter set. */
function eligibleVoters(state: S): PlayerId[] {
  return connectedPlayers(state.players, state.connected).filter((p) => p !== state.activePlayer);
}

/**
 * 'done' claims enter the verdict ONLY when someone can dispute them; an
 * empty eligible set (e.g. 2-player room, partner disconnected) resolves
 * immediately as done — guarded at entry, never just at deadline.
 */
function enterVerdict(state: S, effects: Effect[]): R {
  const next: S = { ...state, phase: 'verdict', outcome: 'done', verdicts: emptyPlayerMap<Verdict>() };
  if (eligibleVoters(next).length === 0) {
    const r = resolveVerdict(next);
    return { state: r.state, effects: [...effects, ...r.effects] };
  }
  return { state: next, effects };
}

/**
 * Advance to the next present player's turn, or to `over` after the final
 * lap. The lap wrap (and only the lap wrap) emits `round_completed` — the
 * shell's interstitial-ad boundary; the final wrap emits gameOver instead.
 */
function enterTurn(state: S, effects: Effect[]): R {
  const { index, wrapped } = nextActiveSeat(state.rotation, state.turnIndex, state.connected);
  const round = state.round + (wrapped ? 1 : 0);
  if (round >= state.config.totalRounds) {
    const over: S = { ...state, phase: 'over', round };
    return { state: over, effects: [...effects, gameOver(over.scores)] };
  }
  const fx: Effect[] = wrapped
    ? [...effects, { type: 'analytics', name: 'round_completed', props: { round: state.round } }]
    : effects;
  const next: S = {
    ...state,
    phase: 'choose',
    round,
    turnIndex: index,
    turnSeq: state.turnSeq + 1,
    activePlayer: state.rotation[index]!,
    choice: null,
    prompt: null,
    outcome: null,
    verdicts: emptyPlayerMap<Verdict>(),
    predictions: emptySideBets<Verdict>(),
    reactions: emptySideBets<Reaction>(),
  };
  // TRUTH_DARE@2 allowedChoices: a single allowed choice has no choose beat.
  if (next.config.allowedChoices.length === 1) {
    return resolveChoice(next, next.config.allowedChoices[0]!, fx);
  }
  return { state: next, effects: fx };
}

/**
 * TRUTH_DARE@2 — rotating hot-seat: the active player picks Truth or Dare
 * (or, truth-only, gets the question straight away), performs it IRL, and the
 * ROOM verdicts a contested completion claim. One module, config-only
 * variants: truth-or-dare-2 (fun/lover decks, pass economy) and
 * truth-or-drink (truth-only, unlimited drink escape drawing a forfeit card).
 * Canonical spec: docs/designs/2026-06-10-game-truth-or-dare-design.md +
 * wave2 §2.7/§2.8. Contract: rejected events return the SAME state reference.
 */
export function createTruthDare(
  id: string,
  config: TruthDareConfig,
): GameModule<S, TruthDareAction, TruthDareView, TruthDareContent> {
  return {
    id,
    version: 2,
    minPlayers: 2,
    maxPlayers: 16,

    init(seed, players, content) {
      const items = content.data.items.filter(
        (it) =>
          config.allowedIntensities.includes(it.intensity) &&
          (config.deck === null || it.deck === undefined || it.deck === config.deck),
      );
      const itemsById = Object.create(null) as Record<string, TdItem>;
      for (const it of items) itemsById[it.id] = it;
      const decks = Object.create(null) as Record<string, string[]>;
      const cursors = Object.create(null) as Record<string, number>;
      for (const choice of ['truth', 'dare'] as const) {
        for (const tier of config.allowedIntensities) {
          const key = deckKey(choice, tier);
          const pool = items.filter((it) => it.choice === choice && it.intensity === tier).map((it) => it.id);
          decks[key] = shuffle(createRng(`${seed}|${key}`), pool);
          cursors[key] = 0;
        }
      }
      const rotation = shuffle(createRng(`${seed}|rotation`), players);
      const scores = emptyPlayerMap<number>();
      const passesLeft = emptyPlayerMap<number>();
      for (const p of players) {
        scores[p] = 0;
        passesLeft[p] = config.passesPerPlayer;
      }
      const base: S = {
        config: { ...config },
        seed,
        players: [...players],
        connected: initPresence(players),
        rotation,
        turnIndex: 0,
        turnSeq: 0,
        round: 0,
        phase: 'choose',
        activePlayer: rotation[0]!,
        choice: null,
        prompt: null,
        outcome: null,
        itemsById,
        decks,
        cursors,
        usedPromptIds: [],
        verdicts: emptyPlayerMap<Verdict>(),
        predictions: emptySideBets<Verdict>(),
        reactions: emptySideBets<Reaction>(),
        scores,
        passesLeft,
        lastResult: null,
      };
      // Single allowed choice: no choose beat — the first prompt is drawn at init.
      // (Degenerate empty-pack case lands directly on 'over'; init cannot emit effects.)
      if (config.allowedChoices.length === 1) {
        return resolveChoice(base, config.allowedChoices[0]!, []).state;
      }
      return base;
    },

    reduce(state, event) {
      if (state.phase === 'over') return NOOP(state);

      if (event.type === 'action') {
        const { playerId, action } = event;
        if (!state.players.includes(playerId)) return NOOP(state);

        if (action.kind === 'chooseType' && state.phase === 'choose') {
          if (playerId !== state.activePlayer) return NOOP(state);
          if (action.choice !== 'truth' && action.choice !== 'dare') return NOOP(state);
          if (!state.config.allowedChoices.includes(action.choice)) return NOOP(state);
          return resolveChoice(state, action.choice, [
            { type: 'analytics', name: 'choice_made', props: { choice: action.choice } },
          ]);
        }

        if (action.kind === 'declare' && state.phase === 'prompt') {
          if (playerId !== state.activePlayer) return NOOP(state);
          if (action.result === 'done') {
            return enterVerdict(state, [
              { type: 'analytics', name: 'declared', props: { result: 'done' } },
            ]);
          }
          if (action.result === 'chickened') {
            // A self-admitted chicken skips the vote — nothing to adjudicate.
            return chickened(state, 'declared_chickened');
          }
          return NOOP(state);
        }

        if (action.kind === 'pass' && state.phase === 'prompt') {
          if (playerId !== state.activePlayer) return NOOP(state);
          if (state.config.escapeMode === 'forfeit-draw') {
            // Unlimited escape; ignores the pass economy; draws one forfeit
            // card from the dare deck (graceful null on exhaustion — the +3
            // still applies, the stamp shows without a card).
            const drawn = draw(state, 'dare');
            const patch: Partial<S> =
              drawn === null
                ? {}
                : { cursors: drawn.cursors, usedPromptIds: [...state.usedPromptIds, drawn.id] };
            const forfeitText = drawn === null ? null : state.itemsById[drawn.id]!.text;
            return toScore(state, 'passed', { done: 0, chickened: 0 }, state.config.passPoints, forfeitText, [
              { type: 'analytics', name: 'escape_taken', props: { mode: 'forfeit-draw' } },
            ], patch);
          }
          const left = state.passesLeft[playerId] ?? 0;
          if (left <= 0) return NOOP(state);
          const passesLeft = Object.assign(emptyPlayerMap<number>(), state.passesLeft, { [playerId]: left - 1 });
          return toScore(state, 'passed', { done: 0, chickened: 0 }, state.config.passPoints, null, [
            { type: 'analytics', name: 'pass_used', props: { left: left - 1 } },
          ], { passesLeft });
        }

        if (action.kind === 'predict' && state.phase === 'prompt') {
          // CC-1 "call your shot": a hidden spectator prediction. SEPARATE from
          // the primary `declare`/escape act — it NEVER gates the active
          // player's claim and is never an `acted` verdict entry, so it cannot
          // touch the verdict's `allActed` early-resolve. Reject-invalid (bad
          // bet, the active player, a disconnected/duplicate bettor) returns the
          // SAME state reference via NOOP.
          if (action.bet !== 'done' && action.bet !== 'chickened') return NOOP(state);
          const isEligible = playerId !== state.activePlayer && state.connected[playerId] === true;
          const predictions = placeSideBet(state.predictions, playerId, action.bet, isEligible);
          if (predictions === null) return NOOP(state); // ineligible / duplicate -> same ref
          return { state: { ...state, predictions }, effects: [] };
        }

        if (action.kind === 'verdict' && state.phase === 'verdict') {
          if (action.vote !== 'done' && action.vote !== 'chickened') return NOOP(state);
          if (playerId === state.activePlayer) return NOOP(state);
          if (state.connected[playerId] !== true) return NOOP(state);
          if (state.verdicts[playerId] !== undefined) return NOOP(state); // first vote locked
          const verdicts = Object.assign(emptyPlayerMap<Verdict>(), state.verdicts, { [playerId]: action.vote });
          const next: S = { ...state, verdicts };
          if (allActed(eligibleVoters(next), verdicts)) return resolveVerdict(next);
          return { state: next, effects: [] };
        }

        if (action.kind === 'react' && state.phase === 'score') {
          // CC-4 escape-react beat (P1-3): a fixed-enum, NON-SCORING reaction
          // during the reveal of a turn the active player did NOT complete.
          // Accumulated into the SEPARATE `reactions` buffer (first react per
          // spectator locks); it NEVER resolves the turn — `score` still
          // auto-advances on its own deadline regardless of any reaction.
          // Reject-invalid (beat off, completed turn, the active player, a
          // disconnected/duplicate reactor, a bad enum) returns the SAME state
          // reference via NOOP.
          if (!escapeReactBeatActive(state)) return NOOP(state);
          if (!REACTIONS.includes(action.reaction)) return NOOP(state);
          if (playerId === state.activePlayer) return NOOP(state);
          if (state.connected[playerId] !== true) return NOOP(state);
          if (state.reactions[playerId] !== undefined) return NOOP(state); // first react locked
          const reactions = Object.assign(emptySideBets<Reaction>(), state.reactions, {
            [playerId]: action.reaction,
          });
          // Re-stamp the public counts on the reveal card so the snapshot stays
          // in lockstep with the live view (counts only — no names).
          const lastResult = state.lastResult
            ? { ...state.lastResult, reactions: reactionCountsOf(reactions) }
            : state.lastResult;
          return { state: { ...state, reactions, lastResult }, effects: [] };
        }

        return NOOP(state);
      }

      if (event.type === 'deadline') {
        if (state.phase === 'choose') {
          // Deterministic seeded auto-pick among the allowed choices.
          const rng = createRng(`${state.seed}|coin|${state.turnSeq}`);
          const pick = state.config.allowedChoices[Math.floor(rng() * state.config.allowedChoices.length)]!;
          return resolveChoice(state, pick, [
            { type: 'analytics', name: 'choice_auto', props: { choice: pick } },
          ]);
        }
        if (state.phase === 'prompt') {
          // Timed out = chickened: no pass spent, no forfeit auto-assigned.
          return chickened(state, 'prompt_timeout');
        }
        if (state.phase === 'verdict') return resolveVerdict(state);
        if (state.phase === 'score') return enterTurn(state, []);
        return NOOP(state);
      }

      if (event.type === 'playerLeft' || event.type === 'playerRejoined') {
        const wantConnected = event.type === 'playerRejoined';
        if (!state.players.includes(event.playerId)) return NOOP(state);
        if (state.connected[event.playerId] === wantConnected) return NOOP(state);
        const next: S = { ...state, connected: setConnected(state.connected, event.playerId, wantConnected) };
        if (wantConnected) return { state: next, effects: [] }; // rejoiner is simply re-expected
        if (event.playerId === next.activePlayer && (next.phase === 'choose' || next.phase === 'prompt')) {
          // The star bailed mid-turn: chickened, no pass spent — never strand the room.
          if (next.phase === 'choose') {
            // No prompt drawn yet: skip the reveal entirely and hand the turn on.
            return enterTurn(next, [
              { type: 'analytics', name: 'active_left', props: { turnSeq: next.turnSeq } },
            ]);
          }
          return chickened(next, 'active_left');
        }
        if (next.phase === 'verdict') {
          // The claim still stands; a leave can complete (or empty) the
          // expected voter set — resolve with whatever votes are in.
          if (event.playerId === next.activePlayer || allActed(eligibleVoters(next), next.verdicts)) {
            return resolveVerdict(next);
          }
        }
        return { state: next, effects: [] };
      }

      return NOOP(state);
    },

    view(state, viewer) {
      if (state.phase === 'over') {
        return {
          phase: 'over',
          scores: state.scores,
          rotation: state.rotation,
          labels: state.config.labels,
        };
      }
      const common = {
        round: state.round,
        totalRounds: state.config.totalRounds,
        turnSeq: state.turnSeq,
        rotation: state.rotation,
        activePlayer: state.activePlayer,
        connected: state.connected,
        scores: state.scores,
        passesLeft: state.passesLeft,
        escapeMode: state.config.escapeMode,
        labels: state.config.labels,
      };
      const youAreActive = viewer === state.activePlayer;
      if (state.phase === 'choose') {
        return { phase: 'choose', ...common, youAreActive, choices: state.config.allowedChoices };
      }
      const prompt = state.prompt!;
      if (state.phase === 'prompt') {
        const canPass =
          youAreActive &&
          (state.config.escapeMode === 'forfeit-draw' || (state.passesLeft[viewer] ?? 0) > 0);
        // CC-1: owner-only echo + aggregate count, never another spectator's bet.
        const pred = redactSideBets(state.predictions, viewer);
        const youCanPredict =
          !youAreActive && state.connected[viewer] === true && pred.own === null;
        return {
          phase: 'prompt',
          ...common,
          youAreActive,
          choice: prompt.choice,
          intensity: prompt.intensity,
          promptText: prompt.text,
          canPass,
          youCanPredict,
          youPredicted: pred.own,
          predictionsIn: pred.count,
        };
      }
      if (state.phase === 'verdict') {
        const expected = eligibleVoters(state);
        const youVoted = state.verdicts[viewer] ?? null;
        return {
          phase: 'verdict',
          ...common,
          youAreActive,
          choice: prompt.choice,
          intensity: prompt.intensity,
          promptText: prompt.text,
          outcome: state.outcome ?? 'done',
          youCanVote: !youAreActive && expected.includes(viewer) && youVoted === null,
          youVoted,
          votesIn: Object.keys(state.verdicts).length,
          votersExpected: expected.length,
        };
      }
      // score
      const { index, wrapped } = nextActiveSeat(state.rotation, state.turnIndex, state.connected);
      const endsAfter = state.round + (wrapped ? 1 : 0) >= state.config.totalRounds;
      // CC-4 escape-react beat: live public counts + owner-only echo. Off (null)
      // unless opted in AND the turn was not completed.
      const reactBeat = escapeReactBeatActive(state);
      const reactionCounts = reactBeat ? reactionCountsOf(state.reactions) : null;
      const youReacted = Object.prototype.hasOwnProperty.call(state.reactions, viewer)
        ? state.reactions[viewer]!
        : null;
      const youCanReact =
        reactBeat &&
        viewer !== state.activePlayer &&
        state.connected[viewer] === true &&
        youReacted === null;
      return {
        phase: 'score',
        ...common,
        lastResult: state.lastResult!,
        nextActive: endsAfter ? null : state.rotation[index]!,
        reactionCounts,
        youReacted: reactBeat ? youReacted : null,
        youCanReact,
      };
    },

    phaseDurationMs(state) {
      if (state.phase === 'choose') return state.config.chooseMs;
      if (state.phase === 'prompt') return state.config.promptMs;
      if (state.phase === 'verdict') return state.config.verdictMs;
      if (state.phase === 'score') return state.config.scoreMs;
      return null;
    },

    phaseKey(state) {
      // turnSeq (NOT round): unique per (phase, turn) so 2-player laps never collide.
      return state.phase === 'over' ? 'over' : `${state.phase}:${state.turnSeq}`;
    },
  };
}
