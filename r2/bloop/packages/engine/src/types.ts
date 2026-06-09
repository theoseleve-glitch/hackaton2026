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
 *
 * Contract decisions:
 * - The player roster is fixed at init; there is no mid-game join event by
 *   design. Disconnections surface as playerLeft/playerRejoined events.
 * - Modules never see wall-clock time. phaseDurationMs is a pure function of
 *   state; the shell converts it to an absolute deadline when a phase is
 *   entered, persists it, and re-arms alarms after rehydration.
 */
export interface GameModule<S, A, V, C = unknown> {
  id: string;
  version: number;
  minPlayers: number;
  maxPlayers: number;
  init(seed: string, players: PlayerId[], content: ContentPack<C>): S;
  reduce(state: S, event: GameEvent<A>): ReduceResult<S>;
  /**
   * Per-player projection. `viewer` may be ANY string, including a
   * non-player (spectator, unknown id): implementations must return a
   * non-leaking projection for unknown viewers.
   */
  view(state: S, viewer: PlayerId): V;
  /** Duration in ms of the current phase, or null when untimed. */
  phaseDurationMs(state: S): number | null;
}
