import { describe, expect, it } from 'vitest';
import { emptyPlayerMap, tally } from '@bloop/kit';

describe('tally', () => {
  it('counts occurrences of each value', () => {
    const votes = Object.assign(emptyPlayerMap<string>(), { p1: 'p3', p2: 'p3', p3: 'p1' });
    expect(tally(votes)).toEqual({ p3: 2, p1: 1 });
  });

  it('returns an empty null-proto record for an empty buffer', () => {
    const t = tally(emptyPlayerMap<string>());
    expect(Object.keys(t)).toEqual([]);
    expect(Object.getPrototypeOf(t)).toBeNull();
  });

  it('round-trips through JSON', () => {
    const t = tally(Object.assign(emptyPlayerMap<string>(), { a: 'x', b: 'x' }));
    expect(JSON.parse(JSON.stringify(t))).toEqual({ x: 2 });
  });

  it('counts "__proto__" as a plain value (null-proto discipline on the output)', () => {
    const t = tally(Object.assign(emptyPlayerMap<string>(), { p1: '__proto__', p2: '__proto__' }));
    expect(t['__proto__']).toBe(2);
    expect(Object.keys(t)).toEqual(['__proto__']);
  });
});
