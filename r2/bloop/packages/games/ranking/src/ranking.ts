import type { Effect, GameModule, PlayerId, ReduceResult } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import {
  allActed,
  connectedPlayers,
  emptyPlayerMap,
  gameOver,
  initPresence,
  isCloseFinish,
  leaderboard,
  mvp,
  nextStreak,
  setConnected,
  streakBonus,
  superlativeWinners,
  topGap,
} from '@bloop/kit';
import type {
  Ballot,
  CloseResult,
  Epilogue,
  RankingAction,
  RankingConfig,
  RankingContent,
  RankingState,
  RankingView,
  RoundResult,
} from './state.js';

const EMPTY_RESULT: RoundResult = {
  promptId: '', aggregate: [], bordaPoints: {}, ballots: {},
  closeness: [], pointsEarned: {}, bestReaders: [],
};

/** Stable ascending-id comparator (no RNG, replay-identical). */
function byId(a: PlayerId, b: PlayerId): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Is `order` a valid FULL ORDERING of `roster`? A permutation: same length,
 * every roster id present exactly once, no extras, no dupes. The submitter is
 * NOT excluded — a player ranks the whole table including themselves.
 */
function isPermutation(order: PlayerId[], roster: PlayerId[]): boolean {
  if (order.length !== roster.length) return false;
  const seen = emptyPlayerMap<true>();
  for (const id of order) {
    if (seen[id] === true) return false; // duplicate
    if (!roster.includes(id)) return false; // not in roster
    seen[id] = true;
  }
  // length + roster-membership + no-dupes ⇒ exact cover of the roster.
  return true;
}

/**
 * THE ROOM'S VERDICT (Borda count). Each ballot orders the roster most->least;
 * position 0 grants the most points (= roster length − 1), the last position 0.
 * Summed across every ballot, then sorted DESC by total. Ties are broken by a
 * SEEDED-but-deterministic order: we shuffle the roster once with the match
 * seed and use that as the tie-break key (so a coin-flip tie is stable on every
 * replay, never wall-clock or insertion-order dependent). Returns the ordered
 * aggregate + the per-target Borda totals. Pure.
 */
function aggregateVerdict(
  state: RankingState,
): { aggregate: PlayerId[]; bordaPoints: Record<PlayerId, number> } {
  const roster = state.players;
  const n = roster.length;
  const bordaPoints = emptyPlayerMap<number>();
  for (const p of roster) bordaPoints[p] = 0;
  for (const p of roster) {
    const ballot = state.ballots[p];
    if (ballot === undefined) continue;
    for (let i = 0; i < ballot.length; i += 1) {
      const target = ballot[i]!;
      // position i (most-first) is worth (n − 1 − i): #1 gets n−1, last gets 0.
      bordaPoints[target] = (bordaPoints[target] ?? 0) + (n - 1 - i);
    }
  }
  // Seeded tie-break key: a deterministic shuffle of the roster. Lower index
  // wins a tie. createRng is the engine's seeded PRNG — no wall-clock.
  const tieOrder = shuffle(createRng(`${state.seed}|verdict|r${state.round}`), roster);
  const tieIdx = emptyPlayerMap<number>();
  tieOrder.forEach((p, i) => { tieIdx[p] = i; });
  const aggregate = [...roster].sort(
    (a, b) => (bordaPoints[b]! - bordaPoints[a]!) || (tieIdx[a]! - tieIdx[b]!),
  );
  return { aggregate, bordaPoints };
}

/**
 * Closeness of a single ballot to the aggregate = inverted-Spearman foot-rule:
 * sum over every roster target of |position-in-ballot − position-in-aggregate|.
 * 0 = identical ordering (perfectly read the room); larger = further off. Both
 * orderings are full permutations of the same roster, so every target has a
 * position in each. Pure, integer, deterministic.
 */
function footRuleDistance(ballot: Ballot, aggregate: PlayerId[]): number {
  const aggPos = emptyPlayerMap<number>();
  aggregate.forEach((p, i) => { aggPos[p] = i; });
  let d = 0;
  for (let i = 0; i < ballot.length; i += 1) {
    const target = ballot[i]!;
    const ai = aggPos[target];
    if (ai === undefined) continue; // defensive; should not happen for a permutation
    d += Math.abs(i - ai);
  }
  return d;
}

/**
 * Promote the hidden ballot buffer atomically: compute the room's verdict,
 * score every submitter by closeness (distance -> band -> points), advance
 * streaks, and expose EVERYTHING (verdict, all ballots, scores) into the public
 * reveal result. Players who never balloted are not scored and keep their prior
 * streak untouched (a disconnect is not a miss). Zero ballots => empty verdict,
 * no points, no streak changes.
 */
function enterReveal(state: RankingState): ReduceResult<RankingState> {
  const { aggregate, bordaPoints } = aggregateVerdict(state);

  // Distance of every submitter's ballot to the verdict.
  const submitters = state.players.filter((p) => state.ballots[p] !== undefined);
  const distances = submitters
    .map((p) => ({ p, d: footRuleDistance(state.ballots[p]!, aggregate) }))
    .sort((a, b) => (a.d - b.d) || byId(a.p, b.p));

  // Closeness BANDS by distinct distance (competition banding): all submitters
  // sharing the smallest distance are band 0, the next distinct distance band 1,
  // etc. A band pays config.pointsByBand[band] (0 past the table).
  const scores = Object.assign(emptyPlayerMap<number>(), state.scores);
  const pointsEarned = emptyPlayerMap<number>();
  const closeness: CloseResult[] = [];
  const bestReaders: PlayerId[] = [];
  const bandOf = emptyPlayerMap<number>();
  let i = 0;
  let band = 0;
  while (i < distances.length) {
    let j = i;
    while (j < distances.length && distances[j]!.d === distances[i]!.d) j += 1;
    const bandPts = state.config.pointsByBand[band] ?? 0;
    for (let k = i; k < j; k += 1) {
      const { p, d } = distances[k]!;
      bandOf[p] = band;
      const pts = bandPts;
      pointsEarned[p] = pts;
      scores[p] = (scores[p] ?? 0) + pts;
      closeness.push({ playerId: p, distance: d, band, points: pts });
      if (band === 0) bestReaders.push(p);
    }
    i = j;
    band += 1;
  }

  // CC-2 — advance the per-player streak: landing the TOP band (band 0) is the
  // success event. Only submitters are folded; a non-submitter keeps their
  // streak. The bonus is default-identity (+0) unless the config opts in.
  const streak = Object.assign(emptyPlayerMap<number>(), state.streak);
  const bestStreak = Object.assign(emptyPlayerMap<number>(), state.bestStreak);
  for (const p of submitters) {
    const success = bandOf[p] === 0;
    const next = nextStreak(streak[p] ?? 0, success);
    streak[p] = next;
    if (next > (bestStreak[p] ?? 0)) bestStreak[p] = next;
    if (success) {
      const bonus = streakBonus(next, state.config.streakBonus);
      if (bonus !== 0) {
        pointsEarned[p] = (pointsEarned[p] ?? 0) + bonus;
        scores[p] = (scores[p] ?? 0) + bonus;
      }
    }
  }

  // Clone the hidden buffer into the PUBLIC result (never alias hidden state).
  const ballots = emptyPlayerMap<Ballot>();
  for (const p of submitters) ballots[p] = [...state.ballots[p]!];

  // Stable ascending-id ordering for the public closeness list.
  closeness.sort((a, b) => byId(a.playerId, b.playerId));
  bestReaders.sort(byId);

  const lastResult: RoundResult = {
    promptId: state.prompts[state.round]?.id ?? '',
    aggregate, bordaPoints, ballots, closeness, pointsEarned, bestReaders,
  };
  return {
    state: { ...state, phase: 'reveal', scores, streak, bestStreak, lastResult },
    effects: [{ type: 'analytics', name: 'round_revealed', props: { round: state.round } }],
  };
}

/** reveal deadline -> next round (fresh hidden buffer), or over (cloned scores). */
function endRound(state: RankingState): ReduceResult<RankingState> {
  const effects: Effect[] = [
    { type: 'analytics', name: 'round_completed', props: { round: state.round } },
  ];
  const round = state.round + 1;
  if (round >= state.config.totalRounds) {
    const over: RankingState = { ...state, phase: 'over' };
    return { state: over, effects: [...effects, gameOver(over.scores)] };
  }
  return {
    state: {
      ...state, round, phase: 'rank',
      ballots: emptyPlayerMap<Ballot>(),
      lastResult: null,
    },
    effects,
  };
}

/**
 * CC-5 — derive the 'over' epilogue PURELY from already-PUBLIC state: the final
 * `scores` and the public `bestStreak` accumulator. NO new secret, NO RNG, NO
 * clock — the superlatives use the kit `leaderboard`/`mvp`/`topGap`/
 * `isCloseFinish`/`superlativeWinners`, all stable ascending-id ordered, so the
 * payload is replay-identical.
 */
function epilogueOf(state: RankingState): Epilogue {
  const scores = state.scores;
  let maxStreak = 0;
  for (const p of Object.keys(state.bestStreak)) {
    maxStreak = Math.max(maxStreak, state.bestStreak[p] ?? 0);
  }
  const onFire = maxStreak < 2
    ? []
    : superlativeWinners(state.bestStreak, (s) => s === maxStreak);
  return {
    leaderboard: leaderboard(scores),
    mvp: mvp(scores),
    topGap: topGap(scores),
    closeFinish: state.config.closeFinishThreshold !== undefined
      && isCloseFinish(scores, state.config.closeFinishThreshold),
    onFire,
  };
}

/**
 * RANKING — "Le Classement" rank-the-room party game. Each round draws a seeded
 * prompt ("Du plus ___ au moins ___" about the PLAYERS); every player privately
 * submits a FULL ORDERING (permutation) of the roster; the reveal computes the
 * room's aggregate verdict (Borda, seeded tie-break) and scores each player by
 * closeness to it (inverted foot-rule -> bands). Platform contract: rejecting an
 * event returns the SAME state reference; ballots live in a HIDDEN buffer until
 * the atomic reveal; an absent/passive room still rolls forward on deadlines.
 */
export function createRanking(
  id: string,
  config: RankingConfig,
): GameModule<RankingState, RankingAction, RankingView, RankingContent> {
  return {
    id,
    version: 1,
    // Ranking needs a verdict + a tie-breaking third body; >8 is unwieldy to
    // order on a phone, so we cap the table sensibly.
    minPlayers: 3,
    maxPlayers: 8,

    init(seed, players, content) {
      const prompts = shuffle(createRng(seed), content.data.prompts);
      const totalRounds = Math.min(config.totalRounds, prompts.length);
      const scores = emptyPlayerMap<number>();
      const streak = emptyPlayerMap<number>();
      const bestStreak = emptyPlayerMap<number>();
      for (const p of players) {
        scores[p] = 0;
        streak[p] = 0;
        bestStreak[p] = 0;
      }
      return {
        config: { ...config, totalRounds },
        players: [...players],
        connected: initPresence(players),
        prompts,
        round: 0,
        phase: totalRounds === 0 ? 'over' : 'rank',
        seed,
        ballots: emptyPlayerMap<Ballot>(),
        scores,
        streak,
        bestStreak,
        lastResult: null,
      };
    },

    reduce(state, event) {
      if (state.phase === 'over') return { state, effects: [] };

      if (event.type === 'action') {
        const { playerId, action } = event;
        // Wrong phase / unknown actor / wrong kind => SAME reference (reject).
        if (state.phase !== 'rank') return { state, effects: [] };
        if (!state.players.includes(playerId)) return { state, effects: [] };
        if (action.kind !== 'rank') return { state, effects: [] };
        // Semantic validity (defense in depth behind the zod schema): the
        // ordering must be a true permutation of the roster. Non-permutation /
        // wrong-roster / duplicate-entry => reject (SAME reference).
        if (!isPermutation(action.order, state.players)) return { state, effects: [] };

        const ballots = Object.assign(
          emptyPlayerMap<Ballot>(), state.ballots, { [playerId]: [...action.order] },
        );
        const next = { ...state, ballots };
        // Early-resolve when every CONNECTED player has submitted (allActed over
        // the connected set so an absent player can never block the round).
        if (allActed(connectedPlayers(next.players, next.connected), ballots)) {
          return enterReveal(next);
        }
        return { state: next, effects: [] };
      }

      if (event.type === 'deadline') {
        if (state.phase === 'rank') return enterReveal(state);
        if (state.phase === 'reveal') return endRound(state);
        return { state, effects: [] };
      }

      if (event.type === 'playerLeft' || event.type === 'playerRejoined') {
        const wantConnected = event.type === 'playerRejoined';
        if (!state.players.includes(event.playerId)) return { state, effects: [] };
        if (state.connected[event.playerId] === wantConnected) return { state, effects: [] };
        const next = { ...state, connected: setConnected(state.connected, event.playerId, wantConnected) };
        // A leave can complete the expected set — never let an absent player
        // stall the rank phase past its deadline.
        if (!wantConnected && next.phase === 'rank'
          && connectedPlayers(next.players, next.connected).length > 0
          && allActed(connectedPlayers(next.players, next.connected), next.ballots)) {
          return enterReveal(next);
        }
        return { state: next, effects: [] };
      }

      return { state, effects: [] };
    },

    view(state, viewer) {
      if (state.phase === 'over') {
        return { phase: 'over', scores: state.scores, epilogue: epilogueOf(state) };
      }
      const prompt = state.prompts[state.round] ?? null;
      const base = {
        round: state.round,
        totalRounds: state.config.totalRounds,
        scores: state.scores,
        streak: state.streak,
      };
      if (state.phase === 'rank') {
        const hasSubmitted = emptyPlayerMap<boolean>();
        for (const p of state.players) hasSubmitted[p] = state.ballots[p] !== undefined;
        // OWNER-ONLY echo: own-property lookup so a non-owner / unknown viewer
        // structurally cannot receive a foreign ballot, and an id colliding with
        // a prototype key still gets a correct null.
        const myOrder = Object.prototype.hasOwnProperty.call(state.ballots, viewer)
          ? [...state.ballots[viewer]!]
          : null;
        return {
          phase: 'rank',
          ...base,
          prompt,
          roster: [...state.players],
          hasSubmitted,
          myOrder,
        };
      }
      // reveal — the hidden buffer was promoted atomically into lastResult.
      return {
        phase: 'reveal',
        ...base,
        prompt,
        result: state.lastResult ?? EMPTY_RESULT,
      };
    },

    phaseDurationMs(state) {
      if (state.phase === 'rank') return state.config.rankMs;
      if (state.phase === 'reveal') return state.config.revealMs;
      return null;
    },

    phaseKey(state) {
      if (state.phase === 'over') return 'over';
      return `${state.phase}:r${state.round}`;
    },
  };
}
