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

  it('matches pinned golden values (replay compatibility across versions)', () => {
    // Changing the PRNG implementation breaks replay of stored event logs.
    const r = createRng('room-ABCD');
    expect(r()).toBe(0.06625232240185142);
    expect(r()).toBe(0.5166024933569133);
    expect(r()).toBe(0.02813275600783527);
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

  it('handles empty and single-element arrays', () => {
    expect(shuffle(createRng('s'), [])).toEqual([]);
    expect(shuffle(createRng('s'), ['only'])).toEqual(['only']);
  });
});
