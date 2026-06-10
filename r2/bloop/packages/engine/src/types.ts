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
  /**
   * Pure transition. CONTRACT (shell no-op detection — server-shell review I4):
   * to REJECT/IGNORE an event, return the SAME state reference you were given
   * (`{ state, effects: [] }`), never a fresh-but-equal copy. The shell skips
   * append/broadcast/re-arm exactly when `after === before`; any NEW reference
   * is an ACCEPTED event — logged and broadcast (alarms still re-arm only on a
   * phaseKey change, so an equal-but-fresh state cannot churn timers).
   */
  reduce(state: S, event: GameEvent<A>): ReduceResult<S>;
  /**
   * Per-player projection. `viewer` may be ANY string, including a
   * non-player (spectator, unknown id): implementations must return a
   * non-leaking projection for unknown viewers.
   */
  view(state: S, viewer: PlayerId): V;
  /** Duration in ms of the current phase, or null when untimed. */
  phaseDurationMs(state: S): number | null;
  /**
   * Stable, pure identifier for the current timed-phase *instance*. The shell
   * re-arms its single alarm iff phaseKey changes across a reduce(): the key
   * must change whenever a NEW deadline should start (entering a phase, or
   * re-entering the same phase kind for a new round/turn) and must NOT change
   * for in-phase progress that keeps the running deadline (e.g. a vote
   * arriving mid-vote-phase). Deterministic from state only — no clock, no
   * randomness. Treat the string as logged: it must NEVER embed a secret
   * (words, roles, ballots, answers). Convention: colon-delimited segments,
   * e.g. "vote:0", "reveal:2" — richer multi-segment schemes are welcome for
   * per-turn/per-beat games ("clue:r0:t3", "reveal:r1:gold"); the terminal
   * phase is the bare string "over".
   */
  phaseKey(state: S): string;
}
