import { describe, expect, it } from 'vitest';
import { createRanking, LE_CLASSEMENT_CONFIG } from '@bloop/game-ranking';
import { content, game, players, rank, toReveal } from './fixtures.js';

describe('scoring: closeness-to-aggregate (inverted foot-rule -> bands)', () => {
  it('Borda aggregate is the room\'s verdict; closeness scores reward reading the room', () => {
    const s0 = game.init('seed', players, content);
    // p1 & p2 agree perfectly; p3 swaps the bottom two.
    const s = toReveal(s0, {
      p1: ['p1', 'p2', 'p3'],
      p2: ['p1', 'p2', 'p3'],
      p3: ['p1', 'p3', 'p2'],
    });
    expect(s.phase).toBe('reveal');
    const r = s.lastResult!;

    // Borda: p1=6, p2=2, p3=1 -> verdict p1 > p2 > p3 (no ties).
    expect(r.bordaPoints).toMatchObject({ p1: 6, p2: 2, p3: 1 });
    expect(r.aggregate).toEqual(['p1', 'p2', 'p3']);

    // Distances: p1=0, p2=0 (band 0, 3 pts each); p3=2 (band 1, 2 pts).
    const dist = Object.fromEntries(r.closeness.map((c) => [c.playerId, c.distance]));
    expect(dist).toEqual({ p1: 0, p2: 0, p3: 2 });
    const band = Object.fromEntries(r.closeness.map((c) => [c.playerId, c.band]));
    expect(band).toEqual({ p1: 0, p2: 0, p3: 1 });
    expect(r.pointsEarned).toEqual({ p1: 3, p2: 3, p3: 2 });
    expect(r.bestReaders).toEqual(['p1', 'p2']);

    // Scores accumulate the round points.
    expect(s.scores).toMatchObject({ p1: 3, p2: 3, p3: 2 });
    // Streak: top-band finishers advance, the rest reset.
    expect(s.streak).toMatchObject({ p1: 1, p2: 1, p3: 0 });
  });

  it('everyone who nails the verdict ties for the top band', () => {
    const s0 = game.init('seed', players, content);
    const s = toReveal(s0, {
      p1: ['p3', 'p1', 'p2'],
      p2: ['p3', 'p1', 'p2'],
      p3: ['p3', 'p1', 'p2'],
    });
    const r = s.lastResult!;
    expect(r.aggregate).toEqual(['p3', 'p1', 'p2']);
    // All three orderings are identical to the verdict -> distance 0 -> band 0.
    expect(r.closeness.every((c) => c.distance === 0 && c.band === 0)).toBe(true);
    expect(r.pointsEarned).toEqual({ p1: 3, p2: 3, p3: 3 });
    expect(r.bestReaders).toEqual(['p1', 'p2', 'p3']);
  });

  it('a furthest-from-the-room ordering lands a lower band', () => {
    const s0 = game.init('seed', players, content);
    // p1, p2 push p1 to the top; p3 inverts the whole thing.
    const s = toReveal(s0, {
      p1: ['p1', 'p2', 'p3'],
      p2: ['p1', 'p2', 'p3'],
      p3: ['p3', 'p2', 'p1'],
    });
    const r = s.lastResult!;
    // Verdict: p1=6, p2=2, p3=1 -> p1 > p2 > p3.
    expect(r.aggregate).toEqual(['p1', 'p2', 'p3']);
    const dist = Object.fromEntries(r.closeness.map((c) => [c.playerId, c.distance]));
    // p3's full inversion is distance 4 (p1: |2-0|=2, p2: |1-1|=0, p3: |0-2|=2).
    expect(dist).toEqual({ p1: 0, p2: 0, p3: 4 });
    // p1, p2 band 0 (3 pts); p3 band 1 (2 pts).
    expect(r.pointsEarned).toEqual({ p1: 3, p2: 3, p3: 2 });
  });

  it('scoring is deterministic across runs', () => {
    const make = () => {
      const g = createRanking('le-classement', LE_CLASSEMENT_CONFIG);
      const s0 = g.init('det-seed', players, content);
      return toReveal(s0, {
        p1: ['p2', 'p1', 'p3'],
        p2: ['p2', 'p3', 'p1'],
        p3: ['p1', 'p2', 'p3'],
      }, g).lastResult!;
    };
    expect(JSON.stringify(make())).toBe(JSON.stringify(make()));
  });

  it('the streak bonus is default-identity (+0) unless the config opts in', () => {
    // Two consecutive top-band rounds: with no streakBonus opts, points are
    // exactly the band points, never inflated by the streak.
    const s0 = game.init('seed', players, content);
    let s = toReveal(s0, {
      p1: ['p1', 'p2', 'p3'], p2: ['p1', 'p2', 'p3'], p3: ['p1', 'p2', 'p3'],
    });
    expect(s.scores).toMatchObject({ p1: 3, p2: 3, p3: 3 });
    s = game.reduce(s, { type: 'deadline', at: 1 }).state; // -> rank r1
    s = toReveal(s, {
      p1: ['p1', 'p2', 'p3'], p2: ['p1', 'p2', 'p3'], p3: ['p1', 'p2', 'p3'],
    });
    // Round 2: each is now on a streak of 2, but with identity opts the points
    // are still exactly 3 (no bonus): cumulative 6.
    expect(s.scores).toMatchObject({ p1: 6, p2: 6, p3: 6 });
    expect(s.streak).toMatchObject({ p1: 2, p2: 2, p3: 2 });
  });
});
