import type { ContentPack, GameEvent, GameModule, PlayerId } from './types.js';

/**
 * Rebuild state by folding the event log over init. Effects are intentionally
 * dropped: rehydration rebuilds state, not side effects — re-emitting
 * historical effects (analytics, gameOver) on every eviction would be a bug.
 */
export function replay<S, A, V, C>(
  module: GameModule<S, A, V, C>,
  seed: string,
  players: PlayerId[],
  content: ContentPack<C>,
  events: ReadonlyArray<GameEvent<A>>,
): S {
  let state = module.init(seed, players, content);
  for (const event of events) state = module.reduce(state, event).state;
  return state;
}
