import { describe, expect, it } from 'vitest';
import { emptyPlayerMap } from '@bloop/kit';

describe('emptyPlayerMap', () => {
  it('has a null prototype', () => {
    expect(Object.getPrototypeOf(emptyPlayerMap())).toBeNull();
  });

  it('treats "__proto__" as a plain own key (no prototype pollution)', () => {
    const m = emptyPlayerMap<string>();
    m['__proto__'] = 'evil';
    expect(m['__proto__']).toBe('evil');
    expect(Object.keys(m)).toEqual(['__proto__']);
    expect(({} as Record<string, unknown>)['evil']).toBeUndefined();
  });

  it('round-trips through JSON', () => {
    const m = emptyPlayerMap<number>();
    m['p1'] = 1;
    m['p2'] = 2;
    expect(JSON.parse(JSON.stringify(m))).toEqual({ p1: 1, p2: 2 });
  });
});
