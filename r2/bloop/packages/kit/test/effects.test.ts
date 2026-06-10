import { describe, expect, it } from 'vitest';
import { emptyPlayerMap, gameOver } from '@bloop/kit';

describe('gameOver', () => {
  it('builds a gameOver effect carrying the given scores', () => {
    const scores = Object.assign(emptyPlayerMap<number>(), { p1: 3, p2: 0 });
    expect(gameOver(scores)).toEqual({ type: 'gameOver', scores: { p1: 3, p2: 0 } });
  });

  it('clones scores — the effect never aliases live state', () => {
    const live = Object.assign(emptyPlayerMap<number>(), { p1: 1 });
    const eff = gameOver(live);
    expect(eff.scores).not.toBe(live);
    eff.scores['p1'] = 999;
    expect(live['p1']).toBe(1);
  });

  it('returns a null-proto, JSON-safe scores object', () => {
    const eff = gameOver(Object.assign(emptyPlayerMap<number>(), { p1: 2 }));
    expect(Object.getPrototypeOf(eff.scores)).toBeNull();
    expect(JSON.parse(JSON.stringify(eff))).toEqual({ type: 'gameOver', scores: { p1: 2 } });
  });
});
