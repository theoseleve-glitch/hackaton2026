import { describe, expect, it } from 'vitest';
import { replay } from '@bloop/engine';
import type { GameEvent } from '@bloop/engine';
import type { RankingAction } from '@bloop/game-ranking';
import { content, game, players, rank } from './fixtures.js';

describe('determinism / replay', () => {
  it('same seed -> identical prompt order; init is pure', () => {
    const a = game.init('seed-A', players, content);
    const b = game.init('seed-A', players, content);
    expect(a.prompts.map((p) => p.id)).toEqual(b.prompts.map((p) => p.id));
  });

  it('same seed + same events -> byte-identical final state (replay)', () => {
    const events: GameEvent<RankingAction>[] = [
      rank('p1', ['p3', 'p1', 'p2']),
      rank('p2', ['p3', 'p2', 'p1']),
      rank('p3', ['p2', 'p3', 'p1']),     // -> reveal r0
      { type: 'deadline', at: 1 },         // reveal -> rank r1
      rank('p1', ['p1', 'p2', 'p3']),
      { type: 'playerLeft', playerId: 'p2', at: 2 },
      rank('p3', ['p3', 'p1', 'p2']),     // p2 absent -> reveal r1
      { type: 'deadline', at: 3 },         // reveal -> rank r2
      { type: 'deadline', at: 4 },         // rank timeout -> reveal r2
      { type: 'deadline', at: 5 },         // reveal -> over
    ];
    const final1 = replay(game, 'seed-Z', players, content, events);
    const final2 = replay(game, 'seed-Z', players, content, events);
    expect(JSON.stringify(final1)).toBe(JSON.stringify(final2));
    expect(final1.phase).toBe('over');
  });

  it('folding events one-by-one matches replay (no hidden clock/randomness)', () => {
    const events: GameEvent<RankingAction>[] = [
      rank('p1', ['p2', 'p1', 'p3']),
      rank('p2', ['p2', 'p3', 'p1']),
      rank('p3', ['p3', 'p2', 'p1']),
      { type: 'deadline', at: 1 },
    ];
    let manual = game.init('seed-fold', players, content);
    for (const e of events) manual = game.reduce(manual, e).state;
    const viaReplay = replay(game, 'seed-fold', players, content, events);
    expect(JSON.stringify(manual)).toBe(JSON.stringify(viaReplay));
  });

  it('the seeded Borda tie-break is stable across replays', () => {
    // A perfect 3-cycle: each player ranks differently so all Borda totals tie.
    const events: GameEvent<RankingAction>[] = [
      rank('p1', ['p1', 'p2', 'p3']),
      rank('p2', ['p2', 'p3', 'p1']),
      rank('p3', ['p3', 'p1', 'p2']),
    ];
    const a = replay(game, 'tie-seed', players, content, events);
    const b = replay(game, 'tie-seed', players, content, events);
    expect(a.lastResult?.aggregate).toEqual(b.lastResult?.aggregate);
    // All three Borda totals are equal (each got 2+1+0 across the cycle).
    const pts = a.lastResult!.bordaPoints;
    expect(pts.p1).toBe(pts.p2);
    expect(pts.p2).toBe(pts.p3);
  });
});
