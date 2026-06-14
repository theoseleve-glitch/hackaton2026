import type { Effect, GameModule, PlayerId, ReduceResult } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import {
  emptyPlayerMap,
  isCloseFinish,
  mvp,
  nextStreak,
  roundMultiplier,
  scoreDelta,
  statLeaders,
  topGap,
} from '@bloop/kit';
import {
  DEFAULT_CONFIG,
  type TracerAction,
  type TracerConfig,
  type TracerEpilogue,
  type TracerPrompt,
  type TracerState,
  type TracerView,
} from './state.js';

export interface TracerContent {
  /** Plain strings (legacy single-locale packs) and/or bilingual {fr,en} cards. */
  prompts: TracerPrompt[];
}

/**
 * Split the single `revealMs` budget into the two-beat reveal: a short held
 * breath (suspense) then the slam (verdict). The suspense beat is capped at a
 * quarter of the budget (≤ 1500 ms) so it reads as a breath, not a wait; the
 * verdict gets the remainder. Pure & deterministic; suspense + verdict ===
 * revealMs, so total reveal wall-time is byte-for-byte unchanged.
 */
function revealBeats(revealMs: number): { suspense: number; verdict: number } {
  const suspense = Math.min(1_500, Math.floor(revealMs / 4));
  return { suspense, verdict: revealMs - suspense };
}

function tallyVotes(state: TracerState): Record<PlayerId, number> {
  const counts = emptyPlayerMap<number>();
  for (const p of state.players) counts[p] = 0;
  for (const target of Object.values(state.votes)) {
    counts[target] = (counts[target] ?? 0) + 1;
  }
  return counts;
}

/**
 * The room-designated player(s) for the round: everyone tied at the max tally,
 * in roster order, when `max > 0`. Aggregate-derived from the public tally — it
 * names WHO the room pointed at, never WHO voted. Empty on a zero-vote round.
 * Deterministic (roster order, no RNG).
 */
function designatedTargets(state: TracerState): PlayerId[] {
  const counts = tallyVotes(state);
  const max = Math.max(0, ...Object.values(counts));
  if (max <= 0) return [];
  return state.players.filter((p) => counts[p] === max);
}

/**
 * CC-2 — the score multiplier in effect for `state.round`. Pure delegation to
 * the kit `roundMultiplier`, which DEFAULTS TO IDENTITY (×1): with no config
 * opts it returns 1, so the award path is byte-for-byte the legacy `+1` and
 * every existing exact-score test stays green. Only an explicit
 * `finalRoundMultiplier` (with `multiplierRounds` / `doubleFromRound`) re-weights
 * the climax round. Deterministic — inputs only, no RNG, no wall clock.
 */
function activeMultiplier(state: TracerState): number {
  return roundMultiplier(state.round, state.config.totalRounds, {
    finalRoundMultiplier: state.config.finalRoundMultiplier,
    multiplierRounds: state.config.multiplierRounds,
    doubleFromRound: state.config.doubleFromRound,
  });
}

/**
 * The post-round scoreboard: `+1 × roundMultiplier` to every designated player.
 * PURE — does not mutate `state.scores`; the caller decides whether/when to
 * commit it. The deferred-scoring keystone (CC-3): `resolveReveal` computes this
 * but holds it, `resolveVerdict` commits it, so the number visibly CLIMBS at the
 * slam. The CC-2 multiplier defaults to ×1 (identity) so the legacy `+1` award
 * is unchanged unless a config opts into late-round weighting.
 */
function awardedScores(state: TracerState): Record<PlayerId, number> {
  const scores = Object.assign(emptyPlayerMap<number>(), state.scores);
  const award = activeMultiplier(state);
  for (const p of designatedTargets(state)) {
    scores[p] = (scores[p] ?? 0) + award;
  }
  return scores;
}

/**
 * CC-5 — advance the public hot-seat streaks at the verdict slam (kit
 * `nextStreak`): each designated player's consecutive-designation `current`
 * increments and `best` keeps their longest run; everyone else resets to 0.
 * Derived from the already-public `designated` set — no new secret. PURE.
 */
function advanceHotStreaks(state: TracerState): TracerState['hotStreaks'] {
  const designated = new Set(designatedTargets(state));
  const next: TracerState['hotStreaks'] = {};
  for (const p of state.players) {
    const prev = state.hotStreaks[p] ?? { current: 0, best: 0 };
    const current = nextStreak(prev.current, designated.has(p));
    next[p] = { current, best: Math.max(prev.best, current) };
  }
  return next;
}

/**
 * CC-5 — derive the over-view cliffhanger from ALREADY-PUBLIC end-of-match
 * state: final `scores` (kit `isCloseFinish` / `topGap` / `mvp`) and the public
 * hot-seat history (kit `statLeaders` over each player's `best`). No new secret;
 * deterministic (the kit folds are stable-sorted). The threshold defaults to 1
 * so a one-card crown reads as a nailbiter.
 */
function deriveEpilogue(state: TracerState): TracerEpilogue {
  const best = emptyPlayerMap<number>();
  for (const p of state.players) best[p] = state.hotStreaks[p]?.best ?? 0;
  const threshold = state.config.closeFinishThreshold ?? 1;
  return {
    closeFinish: isCloseFinish(state.scores, threshold),
    topGap: topGap(state.scores),
    mvp: mvp(state.scores),
    longestHotSeat: statLeaders(best),
  };
}

/**
 * Vote -> reveal SUSPENSE beat. Crucially does NOT score: scores stay frozen at
 * their pre-round value so the climb lands at the verdict slam, not before it.
 * The `round_revealed` analytic fires at the verdict beat (where the result is
 * actually decided), not here.
 */
function resolveReveal(state: TracerState): ReduceResult<TracerState> {
  return {
    state: { ...state, phase: 'reveal', revealStep: 'suspense' },
    effects: [],
  };
}

/**
 * Reveal SUSPENSE -> VERDICT slam. Commits the deferred `+1` (the score climbs
 * NOW), names the designated player(s) via the view, and emits `round_revealed`.
 */
function resolveVerdict(state: TracerState): ReduceResult<TracerState> {
  const scores = awardedScores(state);
  // CC-5: advance public hot-seat streaks at the slam (from the public
  // designation, computed before the streak update — order-independent).
  const hotStreaks = advanceHotStreaks(state);
  const effects: Effect[] = [
    { type: 'analytics', name: 'round_revealed', props: { round: state.round } },
  ];
  return { state: { ...state, revealStep: 'verdict', scores, hotStreaks }, effects };
}

function nextRound(state: TracerState): ReduceResult<TracerState> {
  const round = state.round + 1;
  if (round >= state.config.totalRounds) {
    const over: TracerState = { ...state, phase: 'over', revealStep: null };
    return { state: over, effects: [{ type: 'gameOver', scores: { ...over.scores } }] };
  }
  return {
    state: {
      ...state,
      round,
      phase: 'vote',
      revealStep: null,
      votes: emptyPlayerMap<PlayerId>(),
    },
    effects: [],
  };
}

/**
 * VOTE@1 factory: designation voting over the player roster. One machinery,
 * many configs — 'tracer' (Quick Vote, defaults) and 'pires-potes'
 * (7 × 20s/7s, bilingual pack). Per the platform contract: rejecting an event
 * returns the SAME state reference; votes stay hidden until the atomic reveal;
 * a deadline always advances a timed phase, so a passive or disconnected room
 * rolls forward to 'over' on deadlines alone (missing votes are dropped).
 */
export function createTracer(
  id: string,
  config: Partial<TracerConfig> = {},
): GameModule<TracerState, TracerAction, TracerView, TracerContent> {
  const baseConfig: TracerConfig = { ...DEFAULT_CONFIG, ...config };
  return {
    id,
    version: 1,
    minPlayers: 2,
    maxPlayers: 16,

    init(seed, players, content) {
      const { prompts } = content.data;
      const shuffled = shuffle(createRng(seed), prompts);
      const totalRounds = Math.min(baseConfig.totalRounds, shuffled.length);
      const scores = emptyPlayerMap<number>();
      const hotStreaks = emptyPlayerMap<{ current: number; best: number }>();
      for (const p of players) {
        scores[p] = 0;
        hotStreaks[p] = { current: 0, best: 0 };
      }
      return {
        config: { ...baseConfig, totalRounds },
        players: [...players],
        prompts: shuffled,
        round: 0,
        phase: 'vote',
        revealStep: null,
        votes: emptyPlayerMap<PlayerId>(),
        scores,
        hotStreaks,
      };
    },

    reduce(state, event) {
      if (state.phase === 'over') return { state, effects: [] };

      if (event.type === 'action' && state.phase === 'vote') {
        const { playerId, action } = event;
        if (!state.players.includes(playerId)) return { state, effects: [] };
        if (!state.players.includes(action.target) || action.target === playerId) {
          return { state, effects: [] };
        }
        const votes = Object.assign(emptyPlayerMap<PlayerId>(), state.votes, {
          [playerId]: action.target,
        });
        const next = { ...state, votes };
        if (state.players.every((p) => votes[p] !== undefined)) {
          return resolveReveal(next);
        }
        return { state: next, effects: [] };
      }

      if (event.type === 'deadline') {
        if (state.phase === 'vote') return resolveReveal(state);
        if (state.phase === 'reveal') {
          // Two-beat reveal: suspense hop -> verdict slam -> next round.
          if (state.revealStep === 'suspense') return resolveVerdict(state);
          return nextRound(state);
        }
      }

      return { state, effects: [] };
    },

    view(state, viewer) {
      // Pass-through AS-IS (string | LText): the client picks the locale.
      const prompt = state.prompts[state.round] ?? '';
      if (state.phase === 'vote') {
        const hasVoted = emptyPlayerMap<boolean>();
        for (const p of state.players) hasVoted[p] = state.votes[p] !== undefined;
        return {
          phase: 'vote',
          round: state.round,
          totalRounds: state.config.totalRounds,
          prompt,
          hasVoted,
          myVote: state.votes[viewer] ?? null,
          scores: state.scores,
        };
      }
      if (state.phase === 'reveal') {
        const designated = designatedTargets(state);
        const isVerdict = state.revealStep === 'verdict';
        // CC-2: the award per designated player THIS round (×1 unless weighted).
        const award = activeMultiplier(state);
        // SUSPENSE: scores frozen at pre-round value, nothing awarded yet (empty
        // delta) so the client holds. VERDICT: state.scores already carries the
        // climbed total; reconstruct the pre-round scores (post minus this
        // round's `award` to each designated player) so kit scoreDelta animates
        // the honest climb — by the FULL weighted award, not a flat 1. Derived
        // from PUBLIC scores only — never leaks ballots.
        let delta: Record<PlayerId, number> = emptyPlayerMap<number>();
        if (isVerdict) {
          const before = emptyPlayerMap<number>();
          const awarded = new Set(designated);
          for (const p of state.players) {
            before[p] = (state.scores[p] ?? 0) - (awarded.has(p) ? award : 0);
          }
          delta = scoreDelta(before, state.scores);
        }
        // CC-5: surface the live per-player current streak ONLY at verdict (the
        // streak updates on the slam; at suspense it has not advanced yet, so we
        // hold an empty map to match the "nothing has landed" suspense beat).
        const hotSeat = emptyPlayerMap<number>();
        if (isVerdict) {
          for (const p of state.players) {
            const c = state.hotStreaks[p]?.current ?? 0;
            if (c > 0) hotSeat[p] = c;
          }
        }
        return {
          phase: 'reveal',
          round: state.round,
          totalRounds: state.config.totalRounds,
          prompt,
          tally: tallyVotes(state),
          revealStep: isVerdict ? 'verdict' : 'suspense',
          delta,
          designated,
          // CC-2: the multiplier in effect for THIS round (×1 unless weighted).
          roundMultiplier: award,
          hotSeat,
          scores: state.scores,
        };
      }
      // CC-5: cliffhanger epilogue derived at 'over' from PUBLIC state only.
      return { phase: 'over', scores: state.scores, cliffhanger: deriveEpilogue(state) };
    },

    phaseDurationMs(state) {
      if (state.phase === 'vote') return state.config.voteMs;
      if (state.phase === 'reveal') {
        // Split the single reveal budget into a short held breath then the slam,
        // preserving total reveal wall-time exactly (suspense + verdict ===
        // revealMs). Deterministic, derived from config — no wall clock.
        const { suspense, verdict } = revealBeats(state.config.revealMs);
        return state.revealStep === 'verdict' ? verdict : suspense;
      }
      return null;
    },

    phaseKey(state) {
      if (state.phase === 'over') return 'over';
      if (state.phase === 'reveal') {
        // The extra sub-step needs a distinct key so the deadline scheduler
        // re-arms on suspense -> verdict (Risk #4: an extra deadline hop).
        return `reveal:${state.round}:${state.revealStep ?? 'suspense'}`;
      }
      return `${state.phase}:${state.round}`;
    },
  };
}

/** Back-compat: the original registered module instance, byte-for-byte behavior (id 'tracer', DEFAULT_CONFIG). */
export const tracer: GameModule<TracerState, TracerAction, TracerView, TracerContent> =
  createTracer('tracer');
