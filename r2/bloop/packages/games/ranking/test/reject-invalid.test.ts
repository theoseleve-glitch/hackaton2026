import { describe, expect, it } from 'vitest';
import { content, game, players, rank } from './fixtures.js';

describe('reject-invalid returns the SAME state reference', () => {
  it('a non-permutation (missing a roster id, has a dupe) is rejected', () => {
    const s0 = game.init('seed', players, content);
    // duplicate p1, missing p3
    expect(game.reduce(s0, rank('p1', ['p1', 'p1', 'p2'])).state).toBe(s0);
    // missing one entry (too short for a permutation)
    expect(game.reduce(s0, rank('p1', ['p1', 'p2'])).state).toBe(s0);
    // too long
    expect(game.reduce(s0, rank('p1', ['p1', 'p2', 'p3', 'p3'])).state).toBe(s0);
  });

  it('a wrong-roster id (a non-player target) is rejected', () => {
    const s0 = game.init('seed', players, content);
    expect(game.reduce(s0, rank('p1', ['p1', 'p2', 'ghost'])).state).toBe(s0);
  });

  it('a ballot from a non-roster player is rejected', () => {
    const s0 = game.init('seed', players, content);
    expect(game.reduce(s0, rank('ghost', ['p1', 'p2', 'p3'])).state).toBe(s0);
  });

  it('a rank action in the wrong phase (reveal) is rejected', () => {
    const s0 = game.init('seed', players, content);
    const reveal = game.reduce(s0, { type: 'deadline', at: 0 }).state;
    expect(reveal.phase).toBe('reveal');
    expect(game.reduce(reveal, rank('p1', ['p1', 'p2', 'p3'])).state).toBe(reveal);
  });

  it('a valid re-submit overwrites (new reference); the early-resolve still gates on all connected', () => {
    const s0 = game.init('seed', players, content);
    const s1 = game.reduce(s0, rank('p1', ['p1', 'p2', 'p3'])).state;
    const s2 = game.reduce(s1, rank('p1', ['p3', 'p2', 'p1'])).state;
    expect(s2).not.toBe(s1); // accepted (overwrite) => new reference
    expect(s2.ballots.p1).toEqual(['p3', 'p2', 'p1']);
    expect(s2.phase).toBe('rank'); // p2 & p3 still owed
  });

  it('the final valid ballot early-resolves to reveal', () => {
    const s0 = game.init('seed', players, content);
    let s = game.reduce(s0, rank('p1', ['p1', 'p2', 'p3'])).state;
    s = game.reduce(s, rank('p2', ['p2', 'p1', 'p3'])).state;
    expect(s.phase).toBe('rank');
    s = game.reduce(s, rank('p3', ['p3', 'p2', 'p1'])).state;
    expect(s.phase).toBe('reveal');
  });
});
