import { describe, expect, it } from 'vitest';
import { content, game, players, rank } from './fixtures.js';

describe('presence', () => {
  it('playerLeft/playerRejoined flip presence; unknown ids and redundant flips are no-ops', () => {
    const s0 = game.init('seed', players, content);
    expect(game.reduce(s0, { type: 'playerLeft', playerId: 'ghost', at: 0 }).state).toBe(s0);
    expect(game.reduce(s0, { type: 'playerRejoined', playerId: 'p1', at: 0 }).state).toBe(s0);
    const s1 = game.reduce(s0, { type: 'playerLeft', playerId: 'p1', at: 0 }).state;
    expect(s1.connected['p1']).toBe(false);
    // Redundant leave => same reference.
    expect(game.reduce(s1, { type: 'playerLeft', playerId: 'p1', at: 1 }).state).toBe(s1);
    const s2 = game.reduce(s1, { type: 'playerRejoined', playerId: 'p1', at: 2 }).state;
    expect(s2.connected['p1']).toBe(true);
  });

  it('a disconnect does not block early-resolve: remaining connected players resolve the round', () => {
    const s0 = game.init('seed', players, content);
    const s1 = game.reduce(s0, rank('p1', ['p1', 'p2', 'p3'])).state;
    const s2 = game.reduce(s1, rank('p2', ['p2', 'p1', 'p3'])).state;
    // p3 still expected -> stays in rank.
    expect(s2.phase).toBe('rank');
    // p3 disconnects -> p1 & p2 are now the full expected set -> resolve.
    const s3 = game.reduce(s2, { type: 'playerLeft', playerId: 'p3', at: 1 }).state;
    expect(s3.phase).toBe('reveal');
    // The leaver's ballot is absent (they never submitted) — not scored.
    if (s3.lastResult === null) throw new Error('expected a result');
    expect(s3.lastResult.ballots.p3).toBeUndefined();
  });

  it('a rejoined player is expected again mid-rank', () => {
    const s0 = game.init('seed', players, content);
    const s1 = game.reduce(s0, { type: 'playerLeft', playerId: 'p3', at: 0 }).state;
    const s2 = game.reduce(s1, rank('p1', ['p1', 'p2', 'p3'])).state;
    const s3 = game.reduce(s2, { type: 'playerRejoined', playerId: 'p3', at: 1 }).state;
    // p2 AND p3 now expected — a p2 ballot alone must not resolve.
    const s4 = game.reduce(s3, rank('p2', ['p2', 'p1', 'p3'])).state;
    expect(s4.phase).toBe('rank');
  });

  it('rejoin is idempotent (a connected player rejoining is a no-op)', () => {
    const s0 = game.init('seed', players, content);
    expect(game.reduce(s0, { type: 'playerRejoined', playerId: 'p2', at: 0 }).state).toBe(s0);
  });

  it('an already-submitted player who leaves keeps their ballot counted at reveal', () => {
    const s0 = game.init('seed', players, content);
    const s1 = game.reduce(s0, rank('p1', ['p1', 'p2', 'p3'])).state;
    // p1 leaves after submitting; p2 & p3 still expected.
    const s2 = game.reduce(s1, { type: 'playerLeft', playerId: 'p1', at: 1 }).state;
    expect(s2.phase).toBe('rank');
    const s3 = game.reduce(s2, rank('p2', ['p2', 'p1', 'p3'])).state;
    const s4 = game.reduce(s3, rank('p3', ['p2', 'p3', 'p1'])).state;
    expect(s4.phase).toBe('reveal');
    // p1's pre-leave ballot still counted.
    if (s4.lastResult === null) throw new Error('expected a result');
    expect(s4.lastResult.ballots.p1).toEqual(['p1', 'p2', 'p3']);
  });
});
