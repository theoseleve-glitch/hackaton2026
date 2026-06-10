import { describe, expect, it } from 'vitest';
import { AlarmQueue, nextPhaseDeadline, type RoomTimerSource } from '../src/room/alarm-mux.js';

const queue = (over: Partial<RoomTimerSource> = {}) =>
  AlarmQueue.fromRoom({ phase: null, graces: [], ttlFireAt: 10_000, ...over });

describe('AlarmQueue (pure EDF over phase/grace/ttl, design §6)', () => {
  it('earliest picks the minimum across kinds', () => {
    const q = queue({ phase: { key: 'vote:0', fireAt: 5_000 }, graces: [{ playerId: 'p1', fireAt: 7_000 }] });
    expect(q.earliest()).toEqual({ kind: 'phase', key: 'vote:0', fireAt: 5_000 });
  });

  it('a quiet room still has its ttl horizon (earliest is non-null by construction)', () => {
    expect(queue().earliest()).toEqual({ kind: 'ttl', key: 'ttl', fireAt: 10_000 });
  });

  it('due returns only ripe timers, earliest first', () => {
    const q = queue({
      phase: { key: 'vote:0', fireAt: 5_000 },
      graces: [{ playerId: 'p1', fireAt: 3_000 }, { playerId: 'p2', fireAt: 99_000 }],
    });
    expect(q.due(6_000).map((t) => [t.kind, t.key])).toEqual([['grace', 'p1'], ['phase', 'vote:0']]);
  });

  it('on a tie fires phase < grace < ttl, so activity lands before the ttl idleness check', () => {
    const q = queue({ phase: { key: 'vote:0', fireAt: 10_000 }, graces: [{ playerId: 'p1', fireAt: 10_000 }] });
    expect(q.due(10_000).map((t) => t.kind)).toEqual(['phase', 'grace', 'ttl']);
  });

  it('nextPhaseDeadline keeps the running deadline while phaseKey is unchanged (a vote must not reset the clock)', () => {
    expect(nextPhaseDeadline('vote:0', 'vote:0', 30_000, 1_000, 4_500)).toBe(4_500);
    expect(nextPhaseDeadline('vote:0', 'vote:0', null, 1_000, null)).toBeNull();
  });

  it('nextPhaseDeadline re-arms on phase entry: at + duration, or null when untimed', () => {
    expect(nextPhaseDeadline('vote:0', 'reveal:0', 5_000, 31_000, 31_000)).toBe(36_000);
    expect(nextPhaseDeadline('reveal:2', 'over', null, 99_000, 77_000)).toBeNull();
  });
});
