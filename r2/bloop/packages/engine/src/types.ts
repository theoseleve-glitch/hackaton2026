export type PlayerId = string;

export interface ContentPack<D = unknown> {
  id: string;
  version: number;
  data: D;
}

/** Events fed to a game reducer. `at` is a server-assigned ms timestamp so replay is deterministic. */
export type GameEvent<A> =
  | { type: 'action'; playerId: PlayerId; action: A; at: number }
  | { type: 'deadline'; at: number }
  | { type: 'playerLeft'; playerId: PlayerId; at: number }
  | { type: 'playerRejoined'; playerId: PlayerId; at: number };

export type Effect =
  | { type: 'analytics'; name: string; props?: Record<string, string | number | boolean> }
  | { type: 'gameOver'; scores: Record<PlayerId, number> };

export interface ReduceResult<S> {
  state: S;
  effects: Effect[];
}

/**
 * The platform's core contract (spec §4). Pure TypeScript only:
 * no Cloudflare imports, no I/O, no Date.now/Math.random — all
 * nondeterminism enters via seed and event timestamps.
 */
export interface GameModule<S, A, V> {
  id: string;
  version: number;
  minPlayers: number;
  maxPlayers: number;
  init(seed: string, players: PlayerId[], content: ContentPack): S;
  reduce(state: S, event: GameEvent<A>): ReduceResult<S>;
  view(state: S, viewer: PlayerId): V;
  /** ms remaining for the current phase, or null when untimed. */
  deadline(state: S): number | null;
}
