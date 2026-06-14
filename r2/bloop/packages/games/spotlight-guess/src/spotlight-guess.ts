import type { GameModule } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import {
  allActed,
  emptyPlayerMap,
  emptySideBets,
  initPresence,
  placeSideBet,
  redactSideBets,
  setConnected,
} from '@bloop/kit';
import {
  advanceFromReveal,
  advanceFromScoreboard,
  currentDomain,
  deriveEpilogue,
  expectedGuessers,
  inDomain,
  resolveReverse,
  resolveRound,
  resolveScale,
  roundScoreMultiplier,
  spotlightOf,
  voidRound,
} from './resolve.js';
import type {
  GuessEntry,
  ReactToken,
  ReverseRound,
  ScaleItemView,
  ScaleRound,
  SpotlightGuessAction,
  SpotlightGuessConfig,
  SpotlightGuessContent,
  SpotlightGuessState,
  SpotlightGuessView,
} from './state.js';

/**
 * SPOTLIGHT_GUESS — 'secret target + converging guesses' (wave2 design §2.10 /
 * §2.11 / §3.3). One rotating spotlight holds a per-round VALUE SECRET (a
 * seeded number, or the pack's realIndex); the room converges on it through a
 * hidden guess buffer with an atomic reveal. Two modes, one reducer:
 * - 'scale'            jeu-de-la-note — target/talk/guess/reveal, band scoring
 * - 'reverse-question' devine-la-question — answer/guess(h0..h2)/reveal/scoreboard,
 *   tier-decaying points with first-write-wins locks
 * Platform contract: rejecting an event returns the SAME state reference; the
 * secret never enters phaseKey/analytics; a passive or disconnected room rolls
 * forward to 'over' on deadlines alone.
 */
export function createSpotlightGuess(
  id: string,
  config: SpotlightGuessConfig,
): GameModule<SpotlightGuessState, SpotlightGuessAction, SpotlightGuessView, SpotlightGuessContent> {
  return {
    id,
    version: 1,
    minPlayers: 3,
    maxPlayers: 16,

    init(seed, players, content) {
      const rng = createRng(seed);
      // First draw: the spotlight rotation order (pack-independent).
      const turnOrder = shuffle(rng, players);
      let scaleRounds: ScaleRound[] = [];
      let targets: number[] = [];
      let reverseRounds: ReverseRound[] = [];
      let totalRounds = 0;
      if (config.mode === 'scale') {
        const items = content.data.mode === 'scale' ? shuffle(rng, content.data.items) : [];
        totalRounds = Math.min(config.totalRounds, items.length);
        const taken = items.slice(0, totalRounds);
        scaleRounds = taken.map((it) => ({
          itemId: it.id, kind: it.kind, prompt: it.prompt, low: it.low, high: it.high,
        }));
        // HIDDEN: pre-drawn for ALL rounds so determinism never depends on event order.
        targets = taken.map((it) =>
          it.kind === 'wheel100' ? Math.floor(rng() * 101) : 1 + Math.floor(rng() * 10));
      } else {
        const items = content.data.mode === 'reverse-question' ? shuffle(rng, content.data.items) : [];
        totalRounds = Math.min(config.totalRounds, items.length);
        reverseRounds = items.slice(0, totalRounds).map((it) => {
          const decoys = it.decoys.slice(0, config.decoyCount);
          // Per-round seeded shuffle of [real, ...decoys]; realIndex stays HIDDEN state.
          const tagged = shuffle(rng, [
            { text: it.question, real: true },
            ...decoys.map((d) => ({ text: d, real: false })),
          ]);
          return {
            itemId: it.id,
            answers: [...it.answers],
            candidates: tagged.map((t) => t.text),
            realIndex: tagged.findIndex((t) => t.real),
            hints: it.hints.slice(0, Math.max(0, config.hintTiers - 1)),
          };
        });
      }
      const scores = emptyPlayerMap<number>();
      for (const p of players) scores[p] = 0;
      return {
        config: { ...config, totalRounds, tierPoints: [...config.tierPoints] },
        players: [...players],
        turnOrder,
        connected: initPresence(players),
        round: 0,
        phase: totalRounds === 0 ? 'over' : config.mode === 'scale' ? 'target' : 'answer',
        spotIndex: 0,
        hintTier: 0,
        scaleRounds,
        targets,
        reverseRounds,
        chosenAnswer: null,
        guesses: emptyPlayerMap<GuessEntry>(),
        reacts: emptySideBets<ReactToken>(),
        voided: false,
        lastGained: emptyPlayerMap<number>(),
        scores,
        // P1 (CC-5) — public per-player superlative tallies, accrued at reveal.
        mindReads: emptyPlayerMap<number>(),
        whiffs: emptyPlayerMap<number>(),
      };
    },

    reduce(state, event) {
      if (state.phase === 'over') return { state, effects: [] };

      if (event.type === 'action') {
        const { playerId, action } = event;
        if (!state.players.includes(playerId)) return { state, effects: [] };
        const spot = spotlightOf(state);

        if (state.config.mode === 'scale') {
          if (action.kind === 'ready' && state.phase === 'target' && playerId === spot) {
            return { state: { ...state, phase: 'talk' }, effects: [] };
          }
          if (action.kind === 'openVotes' && state.phase === 'talk' && playerId === spot
            && state.config.speakerCanEndTalk) {
            return { state: { ...state, phase: 'guess' }, effects: [] };
          }
          // KEYSTONE (P0-A) — live-dial during talk: the SAME hidden guess action
          // is also accepted in 'talk' so guessers set/adjust a first-impression
          // dial while the spotlight performs ("he's losing me, dropping to a 3").
          // Zero new secret — it writes the existing hidden `guesses` buffer at
          // tier 0, exactly like a normal guess. Talk dials do NOT early-resolve
          // (the performance must finish); only the 'guess' phase lets allActed
          // resolve. Locked at talk-end simply by clearing nothing: the seed
          // carries forward and stays overwritable (lockOnSubmit=false).
          if (action.kind === 'guess'
            && (state.phase === 'guess' || state.phase === 'talk')
            && playerId !== spot) {
            if (!inDomain(currentDomain(state), action.value)) return { state, effects: [] };
            // lockOnSubmit=false in scale configs: overwrites allowed until resolve.
            if (state.config.lockOnSubmit && state.guesses[playerId] !== undefined) {
              return { state, effects: [] };
            }
            const guesses = Object.assign(emptyPlayerMap<GuessEntry>(), state.guesses,
              { [playerId]: { value: action.value, tier: 0 } });
            const next = { ...state, guesses };
            // Early-resolve ONLY in the guess phase — never short-circuit talk.
            if (state.phase === 'guess' && allActed(expectedGuessers(next), guesses)) {
              return resolveScale(next);
            }
            return { state: next, effects: [] };
          }
          return { state, effects: [] };
        }

        // reverse-question
        // KEYSTONE (P0-B-lite) — content-free react during the 'answer' beat:
        // a non-spotlight connected player taps once to light their avatar up,
        // killing the blank screen. It writes a SEPARATE hidden buffer (`reacts`)
        // via the kit side-bet primitive — never the primary `guesses` buffer, so
        // it can NEVER advance the primary early-resolve. placeSideBet returns
        // null on any rejected tap (ineligible / already tapped) → SAME state ref.
        if (action.kind === 'react' && state.phase === 'answer') {
          const isEligible = playerId !== spot && state.connected[playerId] === true;
          const reacts = placeSideBet<ReactToken>(state.reacts, playerId, 'ready', isEligible);
          if (reacts === null) return { state, effects: [] };
          return { state: { ...state, reacts }, effects: [] };
        }
        if (action.kind === 'answer' && state.phase === 'answer' && playerId === spot) {
          const answers = state.reverseRounds[state.round]?.answers ?? [];
          if (!Number.isInteger(action.answerIndex)
            || action.answerIndex < 0 || action.answerIndex >= answers.length) {
            return { state, effects: [] };
          }
          return {
            state: { ...state, chosenAnswer: action.answerIndex, phase: 'guess', hintTier: 0 },
            effects: [],
          };
        }
        if (action.kind === 'guess' && state.phase === 'guess' && playerId !== spot) {
          if (state.connected[playerId] !== true) return { state, effects: [] };
          // lockOnSubmit=true: first write wins — the tier ladder demands commitment.
          if (state.config.lockOnSubmit && state.guesses[playerId] !== undefined) {
            return { state, effects: [] };
          }
          const candidates = state.reverseRounds[state.round]?.candidates ?? [];
          if (!Number.isInteger(action.value) || action.value < 0 || action.value >= candidates.length) {
            return { state, effects: [] };
          }
          const guesses = Object.assign(emptyPlayerMap<GuessEntry>(), state.guesses,
            { [playerId]: { value: action.value, tier: state.hintTier } });
          const next = { ...state, guesses };
          if (allActed(expectedGuessers(next), guesses)) return resolveReverse(next);
          return { state: next, effects: [] };
        }
        return { state, effects: [] };
      }

      if (event.type === 'deadline') {
        switch (state.phase) {
          case 'target': return { state: { ...state, phase: 'talk' }, effects: [] };
          case 'talk': return { state: { ...state, phase: 'guess' }, effects: [] };
          // No answer arrived (an answer would have moved the phase): void.
          case 'answer': return voidRound(state);
          case 'guess':
            if (state.config.mode === 'reverse-question'
              && state.hintTier + 1 < state.config.hintTiers) {
              // Next hint becomes public; phaseKey changes → the shell re-arms.
              return { state: { ...state, hintTier: state.hintTier + 1 }, effects: [] };
            }
            return resolveRound(state);
          case 'reveal': return advanceFromReveal(state);
          case 'scoreboard': return advanceFromScoreboard(state);
          default: return { state, effects: [] };
        }
      }

      if (event.type === 'playerLeft' || event.type === 'playerRejoined') {
        const wantConnected = event.type === 'playerRejoined';
        if (!state.players.includes(event.playerId)) return { state, effects: [] };
        if (state.connected[event.playerId] === wantConnected) return { state, effects: [] };
        const next: SpotlightGuessState = {
          ...state,
          connected: setConnected(state.connected, event.playerId, wantConnected),
        };
        if (!wantConnected) {
          const isSpot = event.playerId === spotlightOf(next);
          // The spotlight leaving before the secret-keeping beat ends voids the
          // round immediately — the room never stalls waiting on a ghost.
          if (isSpot && (next.phase === 'target' || next.phase === 'talk' || next.phase === 'answer')) {
            return voidRound(next);
          }
          // A guesser leaving can complete the expected set (never blocks).
          if (next.phase === 'guess' && !isSpot
            && allActed(expectedGuessers(next), next.guesses)) {
            return resolveRound(next);
          }
        }
        return { state: next, effects: [] };
      }

      return { state, effects: [] };
    },

    view(state, viewer) {
      if (state.phase === 'over') {
        // P1 (CC-5) — the epilogue is DERIVED here from already-public state
        // (final scores + public mindReads/whiffs); no new in-match secret.
        return {
          mode: state.config.mode, phase: 'over', scores: state.scores,
          ...deriveEpilogue(state),
        };
      }
      const spotlightId = spotlightOf(state);
      const isSpot = viewer === spotlightId;
      const base = {
        round: state.round,
        totalRounds: state.config.totalRounds,
        spotlightId,
        scores: state.scores,
        connected: state.connected,
        // P1 (CC-2) — PUBLIC late-round score multiplier for the CURRENT round
        // (×1 by default, ×2 on the weighted climax rounds). Pure fold over
        // round/totalRounds/config — identical in every hidden-value world, so it
        // adds no secret and leaves every redaction-invariance test green.
        multiplier: roundScoreMultiplier(state),
      };

      if (state.config.mode === 'scale') {
        const r = state.scaleRounds[state.round];
        const item: ScaleItemView | null = r === undefined
          ? null
          : { id: r.itemId, prompt: r.prompt, low: r.low, high: r.high };
        const domain = currentDomain(state);
        // The secret target reaches ONLY the spotlight pre-reveal.
        const myTarget = isSpot ? state.targets[state.round] ?? null : null;
        if (state.phase === 'target') {
          return {
            ...base, mode: 'scale', phase: 'target', domain, item,
            canEndTalk: state.config.speakerCanEndTalk, myTarget,
          };
        }
        if (state.phase === 'talk') {
          // KEYSTONE (P0-A) — expose the same hidden-buffer aggregate + owner echo
          // as the guess phase so live first-impression dials are legible without
          // leaking any value: acted-booleans are public, the dial stays owner-only.
          const hasGuessed = emptyPlayerMap<boolean>();
          for (const p of state.players) hasGuessed[p] = state.guesses[p] !== undefined;
          return {
            ...base, mode: 'scale', phase: 'talk', domain, item,
            canEndTalk: state.config.speakerCanEndTalk, myTarget,
            hasGuessed, myGuess: state.guesses[viewer]?.value ?? null,
          };
        }
        if (state.phase === 'guess') {
          const hasGuessed = emptyPlayerMap<boolean>();
          for (const p of state.players) hasGuessed[p] = state.guesses[p] !== undefined;
          return {
            ...base, mode: 'scale', phase: 'guess', domain, item, hasGuessed,
            myGuess: state.guesses[viewer]?.value ?? null, myTarget,
          };
        }
        // reveal — atomic promotion of the hidden buffer.
        const guesses = emptyPlayerMap<number>();
        for (const p of state.players) {
          const entry = state.guesses[p];
          if (entry !== undefined) guesses[p] = entry.value;
        }
        return {
          ...base, mode: 'scale', phase: 'reveal', domain, item,
          target: state.voided ? null : state.targets[state.round] ?? null,
          guesses, gained: state.lastGained, voided: state.voided,
        };
      }

      // reverse-question
      const rr = state.reverseRounds[state.round];
      const chosenAnswer = state.chosenAnswer === null
        ? null
        : rr?.answers[state.chosenAnswer] ?? null;
      if (state.phase === 'answer') {
        // Guessers/spectators see NOTHING of the item — no question, no
        // options, no candidates (options could triangulate later candidates).
        // KEYSTONE (P0-B-lite) — the ONLY extra they see is the content-free
        // react aggregate (count) + their own tap echo: redactSideBets gives a
        // non-owner only the count (never another player's marker), the owner
        // additionally sees their own. Zero leak — no value rides on a react.
        const reactView = redactSideBets<ReactToken>(state.reacts, viewer);
        return {
          ...base, mode: 'reverse-question', phase: 'answer',
          question: isSpot ? rr?.candidates[rr.realIndex] ?? null : null,
          answers: isSpot ? rr?.answers ?? null : null,
          reactCount: reactView.count,
          myReact: reactView.own !== null,
        };
      }
      if (state.phase === 'guess') {
        const locked = emptyPlayerMap<boolean>();
        for (const p of state.players) locked[p] = state.guesses[p] !== undefined;
        return {
          ...base, mode: 'reverse-question', phase: 'guess',
          hintTier: state.hintTier,
          hintTiers: state.config.hintTiers,
          tierPoints: state.config.tierPoints,
          chosenAnswer,
          candidates: rr?.candidates ?? [],
          hintsRevealed: (rr?.hints ?? []).slice(0, state.hintTier),
          locked,
          myGuess: state.guesses[viewer] ?? null,
          myRealIndex: isSpot ? rr?.realIndex ?? null : null,
        };
      }
      if (state.phase === 'reveal') {
        return {
          ...base, mode: 'reverse-question', phase: 'reveal',
          chosenAnswer,
          candidates: rr?.candidates ?? [],
          realIndex: state.voided ? null : rr?.realIndex ?? null,
          picks: state.guesses,
          gained: state.lastGained,
          voided: state.voided,
        };
      }
      // scoreboard
      return { ...base, mode: 'reverse-question', phase: 'scoreboard', gained: state.lastGained };
    },

    phaseDurationMs(state) {
      switch (state.phase) {
        case 'target': return state.config.targetReadMs;
        case 'talk': return state.config.talkMs;
        case 'answer': return state.config.answerMs;
        case 'guess':
          return state.config.mode === 'scale' ? state.config.guessMs : state.config.hintIntervalMs;
        case 'reveal': return state.config.revealMs;
        case 'scoreboard': return state.config.scoreboardMs;
        default: return null;
      }
    },

    phaseKey(state) {
      if (state.phase === 'over') return 'over';
      if (state.phase === 'guess' && state.config.mode === 'reverse-question') {
        // Per hint tier — re-arms the single alarm. Never embeds the secret.
        return `guess:r${state.round}:h${state.hintTier}`;
      }
      return `${state.phase}:r${state.round}`;
    },
  };
}
