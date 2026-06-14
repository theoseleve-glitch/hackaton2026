import type { Effect, PlayerId, ReduceResult } from '@bloop/engine';
import {
  connectedPlayers, emptyPlayerMap, emptySideBets, gameOver, isCloseFinish, mvp,
  nextActiveSeat, roundMultiplier, statLeaders,
} from '@bloop/kit';
import type {
  GuessEntry, ReactToken, ScaleDomain, SpotlightEpilogue, SpotlightGuessState,
} from './state.js';

// ---------------------------------------------------------------------------
// Pure helpers shared by the reducer, the views and the resolvers.
// ---------------------------------------------------------------------------

/**
 * Closeness band (design §2.10, binding). scale10: d=0→4, d=1→2, d=2→1, ≥3→0.
 * wheel100: d≤5→4, ≤10→3, ≤20→2, ≤33→1, else 0. Ties share the band — all
 * closest win, never a cruel single loser. Max 4 pts/round for everyone.
 */
export function band(domain: ScaleDomain, d: number): number {
  if (domain === 'scale10') {
    if (d === 0) return 4;
    if (d === 1) return 2;
    if (d === 2) return 1;
    return 0;
  }
  if (d <= 5) return 4;
  if (d <= 10) return 3;
  if (d <= 20) return 2;
  if (d <= 33) return 1;
  return 0;
}

/** The authored pack mixes scale10/wheel100 items — the CURRENT item's kind rules the domain. */
export function currentDomain(state: SpotlightGuessState): ScaleDomain {
  return state.scaleRounds[state.round]?.kind ?? state.config.domain;
}

export function inDomain(domain: ScaleDomain, value: number): boolean {
  if (!Number.isInteger(value)) return false;
  return domain === 'scale10' ? value >= 1 && value <= 10 : value >= 0 && value <= 100;
}

export function spotlightOf(state: SpotlightGuessState): PlayerId {
  return state.turnOrder[state.spotIndex] ?? '';
}

/** The expected actor set for the guess buffer: connected players minus the spotlight. */
export function expectedGuessers(state: SpotlightGuessState): PlayerId[] {
  const spot = spotlightOf(state);
  return connectedPlayers(state.players, state.connected).filter((p) => p !== spot);
}

export function zeroMap(players: readonly PlayerId[]): Record<PlayerId, number> {
  const m = emptyPlayerMap<number>();
  for (const p of players) m[p] = 0;
  return m;
}

/**
 * P1 (CC-2) — the late-round score multiplier for the CURRENT round. Pure pass
 * through to the kit's `roundMultiplier`; with no `lateRoundMultiplier` config
 * it returns 1 (identity) so every existing exact-score test is unchanged.
 */
export function roundScoreMultiplier(state: SpotlightGuessState): number {
  return roundMultiplier(state.round, state.config.totalRounds, state.config.lateRoundMultiplier);
}

/**
 * P1 (CC-5) — derive the game-over epilogue from already-PUBLIC end-of-match
 * state ONLY (final scores + the public mindReads/whiffs tallies). Pure &
 * replay-identical: `mvp`/`statLeaders` resolve ties by a stable ascending-id
 * order; no RNG, no wall-clock, NO new secret. Default-safe when the tallies
 * are empty (a non-leaked superlative is simply not awarded).
 */
export function deriveEpilogue(state: SpotlightGuessState): SpotlightEpilogue {
  const readers = statLeaders(state.mindReads);
  const fooled = statLeaders(state.whiffs);
  const threshold = state.config.closeFinishThreshold ?? -1;
  return {
    mvp: mvp(state.scores),
    closeFinish: isCloseFinish(state.scores, threshold),
    bestMindReaders: readers.players,
    bestMindReads: readers.value,
    mostFooled: fooled.players,
    mostFooledWhiffs: fooled.value,
    mindReads: state.mindReads,
    whiffs: state.whiffs,
  };
}

// ---------------------------------------------------------------------------
// Round resolution
// ---------------------------------------------------------------------------

/**
 * Void the round (spotlight left, or the secret answer never arrived):
 * jump to a voided reveal, zero points, hidden buffer dropped. Never blocks.
 */
export function voidRound(state: SpotlightGuessState): ReduceResult<SpotlightGuessState> {
  return {
    state: {
      ...state,
      phase: 'reveal',
      voided: true,
      guesses: emptyPlayerMap<GuessEntry>(),
      lastGained: zeroMap(state.players),
    },
    effects: [{ type: 'analytics', name: 'round_skipped', props: { round: state.round } }],
  };
}

/**
 * Atomic promotion (scale): every submitted guess scores its closeness band;
 * the speaker scores the band of the LOWER-MEDIAN submitted distance
 * (rewards calibrating the whole room) — 0 with no guesses.
 */
export function resolveScale(state: SpotlightGuessState): ReduceResult<SpotlightGuessState> {
  const domain = currentDomain(state);
  const target = state.targets[state.round] ?? 0;
  const gained = zeroMap(state.players);
  const scores = Object.assign(emptyPlayerMap<number>(), state.scores);
  // P1 (CC-2) — escalating late-round weight (×1 by default; the band math below
  // is untouched, so the closeness ladder's shape stays exactly the same).
  const mult = roundScoreMultiplier(state);
  // P1 (CC-5) — clone the PUBLIC tallies; the band reveal is public, so reading
  // exact/whiffed off it adds no secret.
  const mindReads = Object.assign(emptyPlayerMap<number>(), state.mindReads);
  const whiffs = Object.assign(emptyPlayerMap<number>(), state.whiffs);
  const distances: number[] = [];
  for (const p of state.players) {
    const entry = state.guesses[p];
    if (entry === undefined) continue;
    const d = Math.abs(entry.value - target);
    distances.push(d);
    const pts = band(domain, d) * mult;
    gained[p] = pts;
    scores[p] = (scores[p] ?? 0) + pts;
    if (d === 0) mindReads[p] = (mindReads[p] ?? 0) + 1; // a perfect read of the secret number
    else if (band(domain, d) === 0) whiffs[p] = (whiffs[p] ?? 0) + 1; // submitted, scored nothing
  }
  if (distances.length > 0) {
    distances.sort((a, b) => a - b);
    const spot = spotlightOf(state);
    const median = distances[Math.floor((distances.length - 1) / 2)]!;
    const pts = band(domain, median) * mult;
    gained[spot] = pts; // the spotlight never guesses, so this never overwrites a guesser band
    scores[spot] = (scores[spot] ?? 0) + pts;
  }
  return {
    state: { ...state, phase: 'reveal', scores, lastGained: gained, mindReads, whiffs },
    effects: [{ type: 'analytics', name: 'round_revealed', props: { round: state.round } }],
  };
}

/**
 * Atomic promotion (reverse-question): a correct lock pays its tier
 * (300/200/100 by default); the mystery player gains
 * readerPointsPerCorrectGuess per correct guesser.
 */
export function resolveReverse(state: SpotlightGuessState): ReduceResult<SpotlightGuessState> {
  const real = state.reverseRounds[state.round]?.realIndex ?? -1;
  const gained = zeroMap(state.players);
  const scores = Object.assign(emptyPlayerMap<number>(), state.scores);
  // P1 (CC-2) — final-round tier ladder + reader bonus double (×1 by default).
  const mult = roundScoreMultiplier(state);
  // P1 (CC-5) — public tallies cloned from the now-public lock outcomes.
  const mindReads = Object.assign(emptyPlayerMap<number>(), state.mindReads);
  const whiffs = Object.assign(emptyPlayerMap<number>(), state.whiffs);
  let correct = 0;
  for (const p of state.players) {
    const entry = state.guesses[p];
    if (entry === undefined) continue; // a non-locker is neither a read nor a whiff
    if (entry.value === real) {
      const pts = (state.config.tierPoints[entry.tier] ?? 0) * mult;
      gained[p] = pts;
      scores[p] = (scores[p] ?? 0) + pts;
      correct += 1;
      mindReads[p] = (mindReads[p] ?? 0) + 1; // read the secret question behind the answer
    } else {
      whiffs[p] = (whiffs[p] ?? 0) + 1; // locked the wrong candidate — fooled
    }
  }
  const spot = spotlightOf(state);
  const readerPts = correct * state.config.readerPointsPerCorrectGuess * mult;
  gained[spot] = readerPts;
  scores[spot] = (scores[spot] ?? 0) + readerPts;
  return {
    state: { ...state, phase: 'reveal', scores, lastGained: gained, mindReads, whiffs },
    effects: [
      { type: 'analytics', name: 'round_revealed', props: { round: state.round, correct } },
    ],
  };
}

export function resolveRound(state: SpotlightGuessState): ReduceResult<SpotlightGuessState> {
  return state.config.mode === 'scale' ? resolveScale(state) : resolveReverse(state);
}

export function startNextRound(state: SpotlightGuessState): SpotlightGuessState {
  const { index } = nextActiveSeat(state.turnOrder, state.spotIndex, state.connected);
  return {
    ...state,
    round: state.round + 1,
    spotIndex: index,
    phase: state.config.mode === 'scale' ? 'target' : 'answer',
    hintTier: 0,
    chosenAnswer: null,
    guesses: emptyPlayerMap<GuessEntry>(),
    // KEYSTONE (P0-B-lite) — fresh react buffer for the next 'answer' beat.
    reacts: emptySideBets<ReactToken>(),
    voided: false,
    lastGained: emptyPlayerMap<number>(),
  };
}

/** reveal deadline → scoreboard (reverse, when due / last) | next round | over (CLONED gameOver scores). */
export function advanceFromReveal(state: SpotlightGuessState): ReduceResult<SpotlightGuessState> {
  const effects: Effect[] = [
    { type: 'analytics', name: 'round_completed', props: { round: state.round } },
  ];
  const isLast = state.round + 1 >= state.config.totalRounds;
  if (state.config.mode === 'reverse-question') {
    const due = state.config.scoreboardEvery > 0
      && (state.round + 1) % state.config.scoreboardEvery === 0;
    // Always one scoreboard beat before over (the interstitial ad slot).
    if (isLast || due) return { state: { ...state, phase: 'scoreboard' }, effects };
    return { state: startNextRound(state), effects };
  }
  if (isLast) {
    const over: SpotlightGuessState = { ...state, phase: 'over' };
    return { state: over, effects: [...effects, gameOver(over.scores)] };
  }
  return { state: startNextRound(state), effects };
}

export function advanceFromScoreboard(state: SpotlightGuessState): ReduceResult<SpotlightGuessState> {
  if (state.round + 1 >= state.config.totalRounds) {
    const over: SpotlightGuessState = { ...state, phase: 'over' };
    return { state: over, effects: [gameOver(over.scores)] };
  }
  return { state: startNextRound(state), effects: [] };
}
