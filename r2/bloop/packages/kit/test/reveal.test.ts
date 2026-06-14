import { describe, expect, it } from 'vitest';
import { emptyPlayerMap, scoreDelta } from '@bloop/kit';

describe('scoreDelta', () => {
  it('computes after - before per player, omitting unchanged (zero) entries', () => {
    const before = Object.assign(emptyPlayerMap<number>(), { p1: 3, p2: 1, p3: 5 });
    const after = Object.assign(emptyPlayerMap<number>(), { p1: 5, p2: 1, p3: 8 });
    const d = scoreDelta(before, after);
    expect(d).toEqual({ p1: 2, p3: 3 }); // p2 unchanged => omitted
    expect(Object.getPrototypeOf(d)).toBeNull();
  });

  it('treats a player missing from before as a full award (starts at 0)', () => {
    const before = emptyPlayerMap<number>();
    const after = Object.assign(emptyPlayerMap<number>(), { p1: 2 });
    expect(scoreDelta(before, after)).toEqual({ p1: 2 });
  });

  it('includes before-only players (e.g. a deduction) as a negative delta', () => {
    const before = Object.assign(emptyPlayerMap<number>(), { p1: 3 });
    const after = emptyPlayerMap<number>();
    expect(scoreDelta(before, after)).toEqual({ p1: -3 });
  });

  it('is empty when nothing changed', () => {
    const m = Object.assign(emptyPlayerMap<number>(), { p1: 4, p2: 2 });
    expect(scoreDelta(m, { ...m })).toEqual({});
  });

  it('skips non-finite arithmetic instead of emitting NaN', () => {
    const before = Object.assign(emptyPlayerMap<number>(), { p1: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const after = Object.assign(emptyPlayerMap<number>(), { p1: Number.NaN as any, p2: 3 });
    const d = scoreDelta(before, after);
    expect(d).toEqual({ p1: -1, p2: 3 }); // p1: 0 - 1 = -1 (NaN after reads as 0)
  });

  it('does not mutate either input and is JSON-safe', () => {
    const before = Object.assign(emptyPlayerMap<number>(), { p1: 1 });
    const after = Object.assign(emptyPlayerMap<number>(), { p1: 4 });
    const d = scoreDelta(before, after);
    expect(before).toEqual({ p1: 1 });
    expect(after).toEqual({ p1: 4 });
    expect(JSON.parse(JSON.stringify(d))).toEqual({ p1: 3 });
  });

  it('is pollution-safe for a "__proto__" player', () => {
    const before = emptyPlayerMap<number>();
    before['__proto__'] = 1;
    const after = emptyPlayerMap<number>();
    after['__proto__'] = 3;
    const d = scoreDelta(before, after);
    expect(d['__proto__']).toBe(2);
    expect(Object.getPrototypeOf(d)).toBeNull();
  });
});
