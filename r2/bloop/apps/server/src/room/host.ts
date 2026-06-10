import type { Seat } from './store.js';

/**
 * §3.5 host migration: longest-joined CONNECTED seat wins; if nobody is
 * connected (everyone in grace), longest-joined overall. Null for an empty
 * roster. `seats` must be in join order — Store.listSeats() guarantees it.
 */
export function pickNextHost(seats: readonly Seat[]): string | null {
  const connected = seats.find((s) => s.connected);
  if (connected !== undefined) return connected.playerId;
  return seats.length > 0 ? seats[0]!.playerId : null;
}
