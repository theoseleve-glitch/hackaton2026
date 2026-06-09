import type { ContentPack, GameEvent, GameModule, PlayerId } from './types.js';

export function replay<S, A, V>(
  module: GameModule<S, A, V>,
  seed: string,
  players: PlayerId[],
  content: ContentPack,
  events: ReadonlyArray<GameEvent<A>>,
): S {
  let state = module.init(seed, players, content);
  for (const event of events) state = module.reduce(state, event).state;
  return state;
}
