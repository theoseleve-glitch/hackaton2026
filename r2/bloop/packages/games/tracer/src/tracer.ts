import type { Effect, GameModule, PlayerId, ReduceResult } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import {
  DEFAULT_CONFIG,
  type TracerAction,
  type TracerState,
  type TracerView,
} from './state.js';

export interface TracerContent {
  prompts: string[];
}

/**
 * Player-keyed maps use null prototypes: player IDs are untrusted strings,
 * and assigning obj['__proto__'] on a default-prototype object silently
 * corrupts the map instead of creating a key. Null-proto objects stay
 * JSON-serializable, unlike Map.
 */
function emptyPlayerMap<V>(): Record<PlayerId, V> {
  return Object.create(null) as Record<PlayerId, V>;
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
  return { state, effects: [] }; // completed in Task 7
}

export const tracer: GameModule<TracerState, TracerAction, TracerView, TracerContent> = {
  id: 'tracer',
  version: 1,
  minPlayers: 2,
  maxPlayers: 16,

  init(seed, players, content) {
    const { prompts } = content.data;
    const shuffled = shuffle(createRng(seed), prompts);
    const totalRounds = Math.min(DEFAULT_CONFIG.totalRounds, shuffled.length);
    const scores = emptyPlayerMap<number>();
    for (const p of players) scores[p] = 0;
    return {
      config: { ...DEFAULT_CONFIG, totalRounds },
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

  view(state, _viewer) {
    return { phase: 'over', scores: state.scores }; // completed in Task 8
  },

  phaseDurationMs(state) {
    if (state.phase === 'vote') return state.config.voteMs;
    if (state.phase === 'reveal') return state.config.revealMs;
    return null;
  },
};
