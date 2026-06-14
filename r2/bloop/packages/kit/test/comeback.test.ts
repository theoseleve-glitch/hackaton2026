import { describe, expect, it } from 'vitest';
import { nextStreak, roundMultiplier, streakBonus } from '@bloop/kit';

describe('roundMultiplier', () => {
  it('is identity (1) with no opts — existing scoring stays byte-identical', () => {
    expect(roundMultiplier(0, 5)).toBe(1);
    expect(roundMultiplier(4, 5)).toBe(1);
  });

  it('boosts only the final round by default (multiplierRounds defaults to 1)', () => {
    const opts = { finalRoundMultiplier: 2 };
    expect(roundMultiplier(0, 3, opts)).toBe(1);
    expect(roundMultiplier(1, 3, opts)).toBe(1);
    expect(roundMultiplier(2, 3, opts)).toBe(2); // final (0-based) round
  });

  it('boosts the last N rounds when multiplierRounds is set', () => {
    const opts = { finalRoundMultiplier: 3, multiplierRounds: 2 };
    expect(roundMultiplier(2, 5, opts)).toBe(1);
    expect(roundMultiplier(3, 5, opts)).toBe(3); // last two: rounds 3 and 4
    expect(roundMultiplier(4, 5, opts)).toBe(3);
  });

  it('doubleFromRound is an absolute trigger and takes precedence', () => {
    const opts = { finalRoundMultiplier: 2, doubleFromRound: 1, multiplierRounds: 1 };
    expect(roundMultiplier(0, 4, opts)).toBe(1);
    expect(roundMultiplier(1, 4, opts)).toBe(2);
    expect(roundMultiplier(3, 4, opts)).toBe(2);
  });

  it('ignores a non-positive / non-finite multiplier (never zeroes or inverts scoring)', () => {
    expect(roundMultiplier(4, 5, { finalRoundMultiplier: 0 })).toBe(1);
    expect(roundMultiplier(4, 5, { finalRoundMultiplier: -2 })).toBe(1);
    expect(roundMultiplier(4, 5, { finalRoundMultiplier: Number.NaN })).toBe(1);
    expect(roundMultiplier(4, 5, { finalRoundMultiplier: Infinity })).toBe(1);
  });

  it('clamps out-of-band round and total sanely', () => {
    // final round still triggers even if round overshoots total
    expect(roundMultiplier(99, 3, { finalRoundMultiplier: 2 })).toBe(2);
    // negative round never triggers
    expect(roundMultiplier(-5, 3, { finalRoundMultiplier: 2 })).toBe(1);
    // total <= 0 degrades to a single-round match (round clamps to 0 = final)
    expect(roundMultiplier(0, 0, { finalRoundMultiplier: 2 })).toBe(2);
  });

  it('clamps multiplierRounds to the match length (whole match boosted, not more)', () => {
    const opts = { finalRoundMultiplier: 2, multiplierRounds: 99 };
    expect(roundMultiplier(0, 3, opts)).toBe(2);
    expect(roundMultiplier(2, 3, opts)).toBe(2);
  });
});

describe('nextStreak', () => {
  it('increments on success', () => {
    expect(nextStreak(0, true)).toBe(1);
    expect(nextStreak(3, true)).toBe(4);
  });

  it('resets to 0 on failure', () => {
    expect(nextStreak(5, false)).toBe(0);
    expect(nextStreak(0, false)).toBe(0);
  });

  it('floors garbage / negative prev to 0 before incrementing', () => {
    expect(nextStreak(-3, true)).toBe(1);
    expect(nextStreak(Number.NaN, true)).toBe(1);
  });
});

describe('streakBonus', () => {
  it('is 0 (identity) with no opts', () => {
    expect(streakBonus(5)).toBe(0);
    expect(streakBonus(0)).toBe(0);
  });

  it('awards perStreak per consecutive success', () => {
    expect(streakBonus(3, { perStreak: 2 })).toBe(6);
    expect(streakBonus(1, { perStreak: 5 })).toBe(5);
  });

  it('caps the rewarded streak length', () => {
    expect(streakBonus(10, { perStreak: 2, cap: 3 })).toBe(6); // min(10,3)*2
    expect(streakBonus(2, { perStreak: 2, cap: 3 })).toBe(4); // under cap
  });

  it('is 0 for a zero / garbage streak', () => {
    expect(streakBonus(0, { perStreak: 5 })).toBe(0);
    expect(streakBonus(-4, { perStreak: 5 })).toBe(0);
    expect(streakBonus(Number.NaN, { perStreak: 5 })).toBe(0);
  });

  it('treats perStreak 0 / non-finite as no bonus', () => {
    expect(streakBonus(5, { perStreak: 0 })).toBe(0);
    expect(streakBonus(5, { perStreak: Number.NaN })).toBe(0);
  });
});
