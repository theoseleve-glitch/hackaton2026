import type { Effect, GameModule, PlayerId, ReduceResult } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import { emptyPlayerMap } from '@bloop/kit';
import {
  DEFAULT_CONFIG,
  type TracerAction,
  type TracerConfig,
  type TracerPrompt,
  type TracerState,
  type TracerView,
} from './state.js';

export interface TracerContent {
  /** Plain strings (legacy single-locale packs) and/or bilingual {fr,en} cards. */
  prompts: TracerPrompt[];
}

function tallyVotes(state: TracerState): Record<PlayerId, number> {
  const counts = emptyPlayerMap<number>();
  for (const p of state.players) counts[p] = 0;
  for (const target of Object.values(state.votes)) {
    counts[target] = (counts[target] ?? 0) + 1;
  }
  return counts;
}

function resolveReveal(state: TracerState): ReduceResult<TracerState> {
  const counts = tallyVotes(state);
  const max = Math.max(0, ...Object.values(counts));
  const scores = Object.assign(emptyPlayerMap<number>(), state.scores);
  if (max > 0) {
    for (const p of state.players) {
      if (counts[p] === max) scores[p] = (scores[p] ?? 0) + 1;
    }
  }
  const effects: Effect[] = [
    { type: 'analytics', name: 'round_revealed', props: { round: state.round } },
  ];
  return { state: { ...state, phase: 'reveal', scores }, effects };
}

function nextRound(state: TracerState): ReduceResult<TracerState> {
  const round = state.round + 1;
  if (round >= state.config.totalRounds) {
    const over: TracerState = { ...state, phase: 'over' };
    return { state: over, effects: [{ type: 'gameOver', scores: { ...over.scores } }] };
  }
  return {
    state: { ...state, round, phase: 'vote', votes: emptyPlayerMap<PlayerId>() },
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
      for (const p of players) scores[p] = 0;
      return {
        config: { ...baseConfig, totalRounds },
        players: [...players],
        prompts: shuffled,
        round: 0,
        phase: 'vote',
        votes: emptyPlayerMap<PlayerId>(),
        scores,
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
        if (state.phase === 'reveal') return nextRound(state);
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
        return {
          phase: 'reveal',
          round: state.round,
          totalRounds: state.config.totalRounds,
          prompt,
          tally: tallyVotes(state),
          scores: state.scores,
        };
      }
      return { phase: 'over', scores: state.scores };
    },

    phaseDurationMs(state) {
      if (state.phase === 'vote') return state.config.voteMs;
      if (state.phase === 'reveal') return state.config.revealMs;
      return null;
    },

    phaseKey(state) {
      return state.phase === 'over' ? 'over' : `${state.phase}:${state.round}`;
    },
  };
}

/** Back-compat: the original registered module instance, byte-for-byte behavior (id 'tracer', DEFAULT_CONFIG). */
export const tracer: GameModule<TracerState, TracerAction, TracerView, TracerContent> =
  createTracer('tracer');
