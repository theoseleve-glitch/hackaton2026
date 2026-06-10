import type { PlayerId } from '@bloop/engine';
import { emptyPlayerMap } from './player-map.js';

/**
 * Canonical presence map (cross-game convention, synthesis §1.2): the state
 * field is named `connected: Presence`, initialized all-true at init, flipped
 * by playerLeft/playerRejoined. `connected[p] === false` means a greyed seat:
 * the player stays in the roster (keys are NEVER deleted) and keeps their
 * scores. Presence is NOT elimination — games keep vote-driven elimination
 * (e.g. impostor `alive`) as a separate game-local map.
 */
export type Presence = Record<PlayerId, boolean>;

/** Fresh presence for a roster: everyone connected. */
export function initPresence(players: readonly PlayerId[]): Presence {
  const p = emptyPlayerMap<boolean>();
  for (const id of players) p[id] = true;
  return p;
}

/** Copy-on-write flip. Never deletes roster keys, never touches scores. */
export function setConnected(p: Presence, id: PlayerId, v: boolean): Presence {
  return Object.assign(emptyPlayerMap<boolean>(), p, { [id]: v });
}

/** Roster-ordered list of connected players. Connected means `=== true`. */
export function connectedPlayers(players: readonly PlayerId[], p: Presence): PlayerId[] {
  return players.filter((id) => p[id] === true);
}

/**
 * True when every expected actor has an entry in `acted`. `expected` is the
 * game-specific eligible set (e.g. connectedPlayers(...), connected-and-alive,
 * present-non-active) — eligibility stays game logic; this helper owns only
 * the buffer-complete loop. Because absent players are simply not in
 * `expected`, a disconnected player can never stall a phase past its deadline
 * (platform rule, spec §6). Entries are "present" when not undefined, so
 * falsy values like a 0|1 answer count as acted. Vacuously true for an empty
 * `expected` (the deadline path still ends every phase).
 */
export function allActed<V>(
  expected: readonly PlayerId[],
  acted: Record<PlayerId, V>,
): boolean {
  return expected.every((id) => acted[id] !== undefined);
}
