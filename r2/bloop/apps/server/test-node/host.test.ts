import { describe, expect, it } from 'vitest';
import { pickNextHost } from '../src/room/host.js';
import type { Seat } from '../src/room/store.js';

function seat(playerId: string, joinedAt: number, connected: boolean): Seat {
  return {
    playerId, profile: { nickname: playerId, avatar: 'a0' }, isHost: false, connected,
    reconnectTokenHash: 'h', joinedAt, graceUntil: connected ? null : joinedAt + 90_000,
  };
}

describe('pickNextHost (§3.5 host migration)', () => {
  it('picks the longest-joined CONNECTED survivor', () => {
    expect(pickNextHost([seat('p2', 2, false), seat('p3', 3, true), seat('p4', 4, true)])).toBe('p3');
  });

  it('falls back to the longest-joined seat when everyone is in grace', () => {
    expect(pickNextHost([seat('p2', 2, false), seat('p3', 3, false)])).toBe('p2');
  });

  it('returns null for an empty roster (room will be TTL-swept)', () => {
    expect(pickNextHost([])).toBeNull();
  });
});
