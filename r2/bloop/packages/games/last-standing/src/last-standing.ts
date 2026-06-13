import type { GameModule, PlayerId, ReduceResult } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import {
  allActed,
  connectedPlayers,
  emptyPlayerMap,
  gameOver,
  initPresence,
  nextActiveSeat,
  setConnected,
} from '@bloop/kit';
import type {
  CurrentDraw,
  JudgeVote,
  LastStandingAction,
  LastStandingConfig,
  LastStandingContent,
  LastStandingItem,
  LastStandingState,
  LastStandingView,
  LastStandingViewBase,
  TurnOutcome,
  TurnResult,
} from './state.js';

type Result = ReduceResult<LastStandingState>;

/** Reject/ignore convention (engine contract I4): SAME state reference. */
const noop = (state: LastStandingState): Result => ({ state, effects: [] });

/** Decaying shot clock: max(minSayMs, sayMs − lap×decay) — pure function of state, guarantees convergence. */
function sayMsForLap(config: LastStandingConfig, lap: number): number {
  return Math.max(config.minSayMs, config.sayMs - lap * config.sayDecayPerLapMs);
}

function aliveOf(state: LastStandingState): PlayerId[] {
  return state.players.filter((p) => state.alive[p] === true);
}

/**
 * Jury for the current turn: PRESENT, not the spotlight, eliminated players
 * gated by deadPlayersJudge (nobody idle — the dead join the jury).
 */
function eligibleJurors(state: LastStandingState): PlayerId[] {
  if (state.spotlight === null) return [];
  return state.players.filter(
    (p) =>
      p !== state.spotlight
      && state.connected[p] === true
      && (state.config.deadPlayersJudge || state.alive[p] === true),
  );
}

/**
 * Resolve the current turn into the result beat. Publishes outcome + tally
 * COUNTS only — the per-player judgeVotes mapping is never exposed, even
 * after resolution.
 */
function toResult(
  state: LastStandingState,
  outcome: TurnOutcome,
  tally: { valid: number; reject: number },
  eliminate: boolean,
): Result {
  const spotlight = state.spotlight ?? '';
  const alive = eliminate
    ? Object.assign(emptyPlayerMap<boolean>(), state.alive, { [spotlight]: false })
    : state.alive;
  const lastTurn: TurnResult = { player: spotlight, outcome, tally };
  return {
    state: { ...state, phase: 'result', alive, lastTurn },
    effects: [{ type: 'analytics', name: 'turn_resolved', props: { outcome, turnSeq: state.turnSeq } }],
  };
}

/**
 * Tally the in-flight ballots and resolve. Rejected iff rejectVotes/castVotes
 * STRICTLY exceeds rejectThreshold — ties, abstentions and zero votes are
 * VALID (benefit of the doubt: funny never cruel, anti-griefing). Votes cast
 * by players who left afterwards still count (first vote locked).
 */
function resolveJudge(state: LastStandingState): Result {
  const cast = Object.keys(state.judgeVotes).length;
  let reject = 0;
  for (const v of Object.values(state.judgeVotes)) if (v === 'reject') reject += 1;
  const tally = { valid: cast - reject, reject };
  const rejected = cast > 0 && reject / cast > state.config.rejectThreshold;
  if (rejected) return toResult(state, 'rejected', tally, true);
  const spotlight = state.spotlight ?? '';
  const scores = Object.assign(emptyPlayerMap<number>(), state.scores, {
    [spotlight]: (state.scores[spotlight] ?? 0) + state.config.validWordPoints,
  });
  const wordsValidated = Object.assign(emptyPlayerMap<number>(), state.wordsValidated, {
    [spotlight]: (state.wordsValidated[spotlight] ?? 0) + 1,
  });
  return toResult({ ...state, scores, wordsValidated }, 'valid', tally, false);
}

/** Enter the thumbs vote; an empty jury at entry auto-validates immediately (zero cast → valid). */
function enterJudge(state: LastStandingState): Result {
  const next: LastStandingState = { ...state, phase: 'judge', judgeVotes: emptyPlayerMap<JudgeVote>() };
  if (eligibleJurors(next).length === 0) return resolveJudge(next);
  return { state: next, effects: [] };
}

/**
 * Advance the seat pointer to the next ALIVE player (elimination is
 * game-local state — presence ≠ elimination, kit presence doc). A wrap past
 * the end of the rotation completes a lap and shrinks the shot clock, except
 * on the round's very first turn (the opener always gets the full clock).
 * A disconnected-but-alive spotlight is eliminated at entry (outcome 'left')
 * so an absentee can never win by hiding.
 */
function enterTurn(state: LastStandingState): Result {
  const seat = nextActiveSeat(state.rotation, state.spotIndex, state.alive);
  const spotlight = state.rotation[seat.index] ?? '';
  const lapInRound = seat.wrapped && state.turnsThisRound > 0 ? state.lapInRound + 1 : state.lapInRound;
  const base: LastStandingState = {
    ...state,
    spotIndex: seat.index,
    spotlight,
    lapInRound,
    turnSeq: state.turnSeq + 1,
    turnsThisRound: state.turnsThisRound + 1,
    judgeVotes: emptyPlayerMap<JudgeVote>(),
  };
  if (state.connected[spotlight] !== true) {
    return toResult(base, 'left', { valid: 0, reject: 0 }, true);
  }
  return { state: { ...base, phase: 'say' }, effects: [] };
}

/**
 * Round opener. Guard at entry: <2 connected players → straight to 'over'
 * (gameOver with current scores) — a collapsed room never blocks. Otherwise
 * the alive map resets to the connected snapshot, the next theme is drawn and
 * a letter is picked from its pre-validated list via a per-(round,item)
 * seeded stream, with cross-round no-repeat per item.
 */
function drawRound(state: LastStandingState, round: number): Result {
  if (connectedPlayers(state.players, state.connected).length < 2) {
    const over: LastStandingState = { ...state, round, phase: 'over' };
    return {
      state: over,
      effects: [
        { type: 'analytics', name: 'room_collapsed', props: { round } },
        gameOver(over.scores),
      ],
    };
  }
  const item = state.deck[state.themeCursor];
  if (item === undefined) {
    // Defensive: afterRound checks deck exhaustion first; an empty pack ends immediately.
    const over: LastStandingState = { ...state, round, phase: 'over' };
    return { state: over, effects: [gameOver(over.scores)] };
  }
  const alive = emptyPlayerMap<boolean>();
  for (const p of state.players) alive[p] = state.connected[p] === true;
  const used = state.usedLetters[item.id] ?? [];
  const fresh = item.letters.filter((l) => !used.includes(l));
  const pool = fresh.length > 0 ? fresh : item.letters;
  const rng = createRng(`${state.seed}|letter|${round}|${item.id}`);
  const letter = pool[Math.floor(rng() * pool.length)] ?? '?';
  const usedLetters = Object.assign(
    Object.create(null) as Record<string, string[]>,
    state.usedLetters,
    { [item.id]: [...used, letter] },
  );
  const current: CurrentDraw = { itemId: item.id, theme: item.theme, letter };
  return {
    state: {
      ...state,
      phase: 'draw',
      round,
      alive,
      // spotIndex persists (the lap order continues across rounds) but the
      // round opener has no spotlight yet — never show a stale one.
      spotlight: null,
      current,
      themeCursor: state.themeCursor + 1,
      usedLetters,
      lapInRound: 0,
      turnsThisRound: 0,
      judgeVotes: emptyPlayerMap<JudgeVote>(),
      lastTurn: null,
      roundWinners: [],
    },
    effects: [],
  };
}

/**
 * Crown the survivor(s): +survivorPoints to the last one standing — cap case:
 * every still-alive player gets it; zero survivors: no bonus. Emits
 * 'round_completed' (the shell's interstitial-ad boundary).
 */
function endRound(state: LastStandingState): Result {
  const winners = aliveOf(state);
  let scores = state.scores;
  if (winners.length > 0 && state.config.survivorPoints !== 0) {
    scores = Object.assign(emptyPlayerMap<number>(), state.scores);
    for (const w of winners) scores[w] = (scores[w] ?? 0) + state.config.survivorPoints;
  }
  return {
    state: { ...state, phase: 'roundEnd', roundWinners: winners, scores },
    effects: [{ type: 'analytics', name: 'round_completed', props: { round: state.round } }],
  };
}

/** Result deadline: next survivor, or roundEnd at aliveCount ≤ 1 / the hard turn cap (safety belt). */
function afterResult(state: LastStandingState): Result {
  const cap = state.rotation.length * state.config.maxTurnsPerRoundFactor;
  if (aliveOf(state).length <= 1 || state.turnsThisRound >= cap) return endRound(state);
  return enterTurn(state);
}

/** roundEnd deadline: next draw, or 'over' after totalRounds / deck exhaustion. */
function afterRound(state: LastStandingState): Result {
  const round = state.round + 1;
  if (round >= state.config.totalRounds || state.themeCursor >= state.deck.length) {
    const over: LastStandingState = { ...state, phase: 'over' };
    return { state: over, effects: [gameOver(over.scores)] };
  }
  return drawRound(state, round);
}

/** Difficulty-bucketed deck: ascending shuffles within buckets 1<2<3; shuffled is one flat permutation. */
function buildDeck(seed: string, config: LastStandingConfig, items: readonly LastStandingItem[]): LastStandingItem[] {
  const rng = createRng(`${seed}|themes`);
  if (config.difficultyCurve !== 'ascending') return shuffle(rng, items);
  const buckets: [LastStandingItem[], LastStandingItem[], LastStandingItem[]] = [[], [], []];
  for (const item of items) {
    const idx = item.difficulty === 2 ? 1 : item.difficulty === 3 ? 2 : 0;
    buckets[idx].push(item);
  }
  return [...shuffle(rng, buckets[0]), ...shuffle(rng, buckets[1]), ...shuffle(rng, buckets[2])];
}

/**
 * LAST_STANDING: turn-based survival-verdict battle royale (wave-2 design
 * 2.14, jeu-du-theme). Theme + letter per round; survivors SHOUT a word under
 * a decaying shot clock; the room thumbs-votes; fail/timeout/leave =
 * eliminated for the round; last one standing takes the bonus. Phones are
 * shot clock + jury only — no word is ever typed.
 */
export function createLastStanding(
  id: string,
  config: LastStandingConfig,
): GameModule<LastStandingState, LastStandingAction, LastStandingView, LastStandingContent> {
  return {
    id,
    version: 1,
    minPlayers: 3, // at 2 the only juror is the direct rival — total conflict of interest
    maxPlayers: 16,

    init(seed, players, content) {
      const deck = buildDeck(seed, config, content.data.items);
      const totalRounds = Math.min(config.totalRounds, deck.length);
      const scores = emptyPlayerMap<number>();
      const wordsValidated = emptyPlayerMap<number>();
      const alive = emptyPlayerMap<boolean>();
      for (const p of players) {
        scores[p] = 0;
        wordsValidated[p] = 0;
        alive[p] = true;
      }
      const base: LastStandingState = {
        config: { ...config, totalRounds },
        seed,
        players: [...players],
        rotation: shuffle(createRng(`${seed}|rotation`), players),
        connected: initPresence(players),
        phase: 'draw',
        round: 0,
        turnSeq: 0,
        lapInRound: 0,
        turnsThisRound: 0,
        spotIndex: -1,
        spotlight: null,
        alive,
        current: null,
        deck,
        themeCursor: 0,
        usedLetters: Object.create(null) as Record<string, string[]>,
        judgeVotes: emptyPlayerMap<JudgeVote>(),
        lastTurn: null,
        roundWinners: [],
        scores,
        wordsValidated,
      };
      return drawRound(base, 0).state;
    },

    reduce(state, event) {
      if (state.phase === 'over') return noop(state);

      if (event.type === 'action') {
        const { playerId, action } = event;
        if (!state.players.includes(playerId)) return noop(state);

        if (action.kind === 'wordSaid') {
          if (state.phase !== 'say' || playerId !== state.spotlight) return noop(state);
          return enterJudge(state);
        }

        if (action.kind === 'giveUp') {
          if (state.phase !== 'say' || playerId !== state.spotlight) return noop(state);
          if (!state.config.allowGiveUp) return noop(state);
          return toResult(state, 'gaveUp', { valid: 0, reject: 0 }, true);
        }

        if (action.kind === 'judge') {
          if (state.phase !== 'judge') return noop(state);
          if (action.vote !== 'valid' && action.vote !== 'reject') return noop(state); // re-guard
          if (!eligibleJurors(state).includes(playerId)) return noop(state);
          if (state.judgeVotes[playerId] !== undefined) return noop(state); // first vote locked
          const judgeVotes = Object.assign(emptyPlayerMap<JudgeVote>(), state.judgeVotes, {
            [playerId]: action.vote,
          });
          const next: LastStandingState = { ...state, judgeVotes };
          if (allActed(eligibleJurors(next), judgeVotes)) return resolveJudge(next);
          return { state: next, effects: [] };
        }

        return noop(state);
      }

      if (event.type === 'deadline') {
        if (state.phase === 'draw') return enterTurn(state);
        if (state.phase === 'say') return toResult(state, 'timeout', { valid: 0, reject: 0 }, true);
        if (state.phase === 'judge') return resolveJudge(state);
        if (state.phase === 'result') return afterResult(state);
        if (state.phase === 'roundEnd') return afterRound(state);
        return noop(state);
      }

      if (event.type === 'playerLeft' || event.type === 'playerRejoined') {
        const wantConnected = event.type === 'playerRejoined';
        if (!state.players.includes(event.playerId)) return noop(state);
        if (state.connected[event.playerId] === wantConnected) return noop(state);
        const next: LastStandingState = {
          ...state,
          connected: setConnected(state.connected, event.playerId, wantConnected),
        };
        if (!wantConnected) {
          // Leaving mid-say as the spotlight = round elimination (outcome 'left').
          if (next.phase === 'say' && event.playerId === next.spotlight) {
            return toResult(next, 'left', { valid: 0, reject: 0 }, true);
          }
          if (next.phase === 'judge') {
            // Spotlight left mid-judge: the claim stands — resolve with votes cast.
            if (event.playerId === next.spotlight) return resolveJudge(next);
            // A leave shrinks the jury and may complete the expected set (never block).
            if (allActed(eligibleJurors(next), next.judgeVotes)) return resolveJudge(next);
          }
        }
        // Rejoin flips presence only: an eliminated rejoiner stays out for the
        // current round and is auto back in at the next draw.
        return { state: next, effects: [] };
      }

      return noop(state);
    },

    view(state, viewer) {
      if (state.phase === 'over') {
        return {
          phase: 'over',
          scores: state.scores,
          rotation: state.rotation,
          wordsValidated: state.wordsValidated,
        };
      }
      // Never expose: deck/themeCursor (upcoming themes), usedLetters, the
      // judgeVotes mapping, seed, current.itemId. The drawn theme+letter are
      // public — they are shouted in the room anyway.
      const base: LastStandingViewBase = {
        round: state.round,
        totalRounds: state.config.totalRounds,
        turnSeq: state.turnSeq,
        rotation: state.rotation,
        alive: state.alive,
        connected: state.connected,
        spotlight: state.spotlight,
        current: state.current === null ? null : { theme: state.current.theme, letter: state.current.letter },
        lapInRound: state.lapInRound,
        sayMsThisLap: sayMsForLap(state.config, state.lapInRound),
        scores: state.scores,
        wordsValidated: state.wordsValidated,
        lastTurn: state.lastTurn,
      };
      if (state.phase === 'say') {
        const youAreSpotlight = viewer === state.spotlight;
        return { ...base, phase: 'say', youAreSpotlight, canGiveUp: youAreSpotlight && state.config.allowGiveUp };
      }
      if (state.phase === 'judge') {
        const jurors = eligibleJurors(state);
        const myVote = state.judgeVotes[viewer] ?? null; // own-vote echo ONLY — never anyone else's
        return {
          ...base,
          phase: 'judge',
          youCanVote: myVote === null && jurors.includes(viewer),
          myVote,
          votesIn: Object.keys(state.judgeVotes).length,
          votersExpected: jurors.length,
        };
      }
      if (state.phase === 'roundEnd') {
        return {
          ...base,
          phase: 'roundEnd',
          roundWinners: state.roundWinners,
          pointsAwarded: state.roundWinners.length > 0 ? state.config.survivorPoints : 0,
        };
      }
      if (state.phase === 'result') return { ...base, phase: 'result' };
      return { ...base, phase: 'draw' };
    },

    phaseDurationMs(state) {
      if (state.phase === 'draw') return state.config.drawMs;
      if (state.phase === 'say') return sayMsForLap(state.config, state.lapInRound);
      if (state.phase === 'judge') return state.config.judgeMs;
      if (state.phase === 'result') return state.config.resultMs;
      if (state.phase === 'roundEnd') return state.config.roundEndMs;
      return null;
    },

    phaseKey(state) {
      if (state.phase === 'over') return 'over';
      if (state.phase === 'draw' || state.phase === 'roundEnd') return `${state.phase}:r${state.round}`;
      // say/judge/result are keyed by the global monotonic turnSeq — the shell
      // re-arms per TURN. No secret ever appears here (theme/letter are public,
      // votes never appear).
      return `${state.phase}:t${state.turnSeq}`;
    },
  };
}
