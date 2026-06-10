import type { Effect, PlayerId } from '@bloop/engine';
import { emptyPlayerMap } from './player-map.js';

/**
 * Build the gameOver effect with a defensively cloned scores object:
 * effect.scores must never alias live state (the tracer "scores do not
 * alias" invariant — mandatory for all games). Scores are match-local and
 * start at 0 each init; the shell derives session XP from per-match
 * placement, never from raw points (synthesis §1.7).
 */
export function gameOver(scores: Record<PlayerId, number>): Extract<Effect, { type: 'gameOver' }> {
  return { type: 'gameOver', scores: Object.assign(emptyPlayerMap<number>(), scores) };
}
