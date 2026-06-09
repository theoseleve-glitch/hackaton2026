import type { GameModule, PlayerId } from '@bloop/engine';
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

export const tracer: GameModule<TracerState, TracerAction, TracerView, TracerContent> = {
  id: 'tracer',
  version: 1,
  minPlayers: 2,
  maxPlayers: 16,

  init(seed, players, content) {
    const { prompts } = content.data;
    const shuffled = shuffle(createRng(seed), prompts);
    const totalRounds = Math.min(DEFAULT_CONFIG.totalRounds, shuffled.length);
    const scores: Record<PlayerId, number> = {};
    for (const p of players) scores[p] = 0;
    return {
      config: { ...DEFAULT_CONFIG, totalRounds },
      players: [...players],
      prompts: shuffled,
      round: 0,
      phase: 'vote',
      votes: {},
      scores,
    };
  },

  reduce(state, _event) {
    return { state, effects: [] }; // completed in Tasks 6-7
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
