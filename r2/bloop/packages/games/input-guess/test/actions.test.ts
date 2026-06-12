import { describe, expect, it } from 'vitest';
import { inputGuessActionSchema } from '@bloop/game-input-guess';

/** The wire boundary: the server validates client action.payload with this BEFORE reduce(). */
describe('inputGuessActionSchema (zod, server boundary)', () => {
  it('accepts both kinds across their full valid range', () => {
    expect(inputGuessActionSchema.safeParse({ kind: 'guess', value: 0 }).success).toBe(true);
    expect(inputGuessActionSchema.safeParse({ kind: 'guess', value: 999_999_999 }).success).toBe(true);
    expect(inputGuessActionSchema.safeParse({ kind: 'pick', cardIndex: 0 }).success).toBe(true);
    expect(inputGuessActionSchema.safeParse({ kind: 'pick', cardIndex: 15 }).success).toBe(true);
  });

  it('rejects floats, negatives, out-of-range, and non-finite numbers', () => {
    expect(inputGuessActionSchema.safeParse({ kind: 'guess', value: 4.5 }).success).toBe(false);
    expect(inputGuessActionSchema.safeParse({ kind: 'guess', value: -1 }).success).toBe(false);
    expect(inputGuessActionSchema.safeParse({ kind: 'guess', value: 1_000_000_000 }).success).toBe(false);
    expect(inputGuessActionSchema.safeParse({ kind: 'guess', value: Number.NaN }).success).toBe(false);
    expect(inputGuessActionSchema.safeParse({ kind: 'guess', value: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(inputGuessActionSchema.safeParse({ kind: 'pick', cardIndex: 0.5 }).success).toBe(false);
    expect(inputGuessActionSchema.safeParse({ kind: 'pick', cardIndex: -1 }).success).toBe(false);
    expect(inputGuessActionSchema.safeParse({ kind: 'pick', cardIndex: 16 }).success).toBe(false);
  });

  it('rejects hostile shapes: wrong kinds, string numbers, missing fields, junk', () => {
    expect(inputGuessActionSchema.safeParse({ kind: 'guess', value: '42' }).success).toBe(false);
    expect(inputGuessActionSchema.safeParse({ kind: 'pick', value: 3 }).success).toBe(false);
    expect(inputGuessActionSchema.safeParse({ kind: 'ballot', pick: 'A' }).success).toBe(false);
    expect(inputGuessActionSchema.safeParse({ kind: 'guess' }).success).toBe(false);
    expect(inputGuessActionSchema.safeParse({}).success).toBe(false);
    expect(inputGuessActionSchema.safeParse(null).success).toBe(false);
    expect(inputGuessActionSchema.safeParse('guess').success).toBe(false);
  });
});
