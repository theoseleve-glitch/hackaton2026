import type { PlayerId } from '@bloop/engine';
import type { Presence } from './presence.js';

/**
 * Advance from `fromIndex` forward through `order` (mod length) to the next
 * connected seat. `wrapped` is true when the scan passed the end of `order`
 * — callers bump a round/lap counter on wrap. If NO seat is connected the
 * result degenerates to (fromIndex + 1) % order.length: non-deadlocking by
 * design; the shell's empty-room/grace logic ends the game, the rotation
 * itself never spins forever.
 * `fromIndex` must be a valid index into `order` (or -1 for "before the
 * first turn"); out-of-range values are not part of the contract.
 */
export function nextActiveSeat(
  order: readonly PlayerId[],
  fromIndex: number,
  connected: Presence,
): { index: number; wrapped: boolean } {
  const len = order.length;
  if (len === 0) return { index: 0, wrapped: false }; // degenerate; rosters are >= minPlayers
  for (let step = 1; step <= len; step++) {
    const raw = fromIndex + step;
    const index = raw % len;
    if (connected[order[index]!] === true) return { index, wrapped: raw >= len };
  }
  return { index: (fromIndex + 1) % len, wrapped: fromIndex + 1 >= len };
}
