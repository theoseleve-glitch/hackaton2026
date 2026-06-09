import { describe, expect, it } from 'vitest';
import { createRng, shuffle } from '@bloop/engine';

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng('room-ABCD');
    const b = createRng('room-ABCD');
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('differs across seeds', () => {
    const a = createRng('room-ABCD');
    const b = createRng('room-WXYZ');
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('emits values in [0, 1)', () => {
    const rng = createRng('x');
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('shuffle', () => {
  it('is a deterministic permutation that does not mutate input', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const frozen = Object.freeze([...items]);
    const out1 = shuffle(createRng('s'), frozen);
    const out2 = shuffle(createRng('s'), frozen);
    expect(out1).toEqual(out2);
    expect([...out1].sort()).toEqual([...items].sort());
    expect(frozen).toEqual(items);
  });
});
