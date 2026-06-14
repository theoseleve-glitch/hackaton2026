import { describe, expect, it } from 'vitest';
import { content, game, players, toReveal } from './fixtures.js';

/** Play the 3-round test match to 'over' with a clear winner, returning state. */
function playToOver() {
  let s = game.init('epi-seed', players, content);
  for (let round = 0; round < 3; round += 1) {
    // p1 always nails the verdict; p3 always inverts -> p1 leads.
    s = toReveal(s, {
      p1: ['p1', 'p2', 'p3'],
      p2: ['p1', 'p2', 'p3'],
      p3: ['p3', 'p2', 'p1'],
    });
    s = game.reduce(s, { type: 'deadline', at: round }).state; // reveal -> next / over
  }
  return s;
}

describe('CC-5 epilogue at over (derived from PUBLIC scores only)', () => {
  it('exposes leaderboard, mvp, topGap, closeFinish, onFire', () => {
    const s = playToOver();
    expect(s.phase).toBe('over');
    const v = game.view(s, 'p1');
    if (v.phase !== 'over') throw new Error('expected over view');

    // p1 & p2 read the room every round (3 pts x3 = 9); p3 trails (2 x3 = 6).
    expect(v.scores).toMatchObject({ p1: 9, p2: 9, p3: 6 });
    // Leaderboard: p1 & p2 tied for first (rank 1), p3 third (rank 3).
    expect(v.epilogue.leaderboard[0]!.rank).toBe(1);
    expect(v.epilogue.leaderboard[2]!.playerId).toBe('p3');
    // Tied crown -> no single MVP.
    expect(v.epilogue.mvp).toBeNull();
    // p1 & p2 went on a 3-round top-band streak.
    expect(v.epilogue.onFire).toEqual(['p1', 'p2']);
  });

  it('over view never leaks a ranking buffer (only scores + epilogue)', () => {
    const s = playToOver();
    const v = game.view(s, 'p3');
    if (v.phase !== 'over') throw new Error('expected over view');
    expect('result' in v).toBe(false);
    expect(Object.keys(v).sort()).toEqual(['epilogue', 'phase', 'scores']);
  });
});
