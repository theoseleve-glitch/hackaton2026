import { describe, expect, it } from 'vitest';
import {
  emptySideBets,
  placeSideBet,
  redactSideBets,
  resolveSideBets,
} from '@bloop/kit';

type Bet = 'survives' | 'chokes';

describe('emptySideBets', () => {
  it('is an empty null-proto buffer', () => {
    const b = emptySideBets<Bet>();
    expect(Object.keys(b)).toEqual([]);
    expect(Object.getPrototypeOf(b)).toBeNull();
  });
});

describe('placeSideBet', () => {
  it('accepts a bet from an eligible player (copy-on-write, null-proto)', () => {
    const b0 = emptySideBets<Bet>();
    const b1 = placeSideBet(b0, 'p1', 'survives', true);
    expect(b1).toEqual({ p1: 'survives' });
    expect(b0).toEqual({}); // input never mutated
    expect(b1).not.toBe(b0);
    expect(Object.getPrototypeOf(b1)).toBeNull();
  });

  it('GUARD 3: rejects (=> null) an ineligible player and never mutates', () => {
    const b0 = placeSideBet(emptySideBets<Bet>(), 'p1', 'survives', true)!;
    const rejected = placeSideBet(b0, 'p2', 'chokes', false);
    expect(rejected).toBeNull();
    expect(b0).toEqual({ p1: 'survives' }); // untouched
  });

  it('GUARD 3: rejects a re-bet over an existing stake (one stake per round)', () => {
    const b1 = placeSideBet(emptySideBets<Bet>(), 'p1', 'survives', true)!;
    const reBet = placeSideBet(b1, 'p1', 'chokes', true);
    expect(reBet).toBeNull();
    expect(b1).toEqual({ p1: 'survives' }); // original stake preserved
  });

  it('rejects an undefined bet (indistinguishable from "no bet")', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(placeSideBet(emptySideBets<Bet>(), 'p1', undefined as any, true)).toBeNull();
  });

  it('is pollution-safe for a "__proto__" player id', () => {
    const b = placeSideBet(emptySideBets<Bet>(), '__proto__', 'survives', true)!;
    expect(b['__proto__']).toBe('survives');
    expect(Object.getPrototypeOf(b)).toBeNull();
    // a second bet from the polluted id is still rejected as a re-bet
    expect(placeSideBet(b, '__proto__', 'chokes', true)).toBeNull();
  });
});

describe('resolveSideBets', () => {
  const payout = (bet: Bet, outcome: Bet): number => (bet === outcome ? 2 : 0);

  it('pays only matching bets, omitting zero entries', () => {
    const buffer = Object.assign(emptySideBets<Bet>(), {
      p1: 'survives',
      p2: 'chokes',
      p3: 'survives',
    });
    const delta = resolveSideBets(buffer, 'survives', payout);
    expect(delta).toEqual({ p1: 2, p3: 2 }); // p2 wrong => omitted
    expect(Object.getPrototypeOf(delta)).toBeNull();
  });

  it('returns an empty delta for an empty buffer', () => {
    expect(resolveSideBets(emptySideBets<Bet>(), 'survives', payout)).toEqual({});
  });

  it('clamps negative / non-finite payouts to 0 (upside-only, never docks score)', () => {
    const buffer = Object.assign(emptySideBets<Bet>(), { p1: 'survives', p2: 'chokes' });
    const weird = resolveSideBets(buffer, 'survives', (bet, o) =>
      bet === o ? Number.NaN : -5,
    );
    expect(weird).toEqual({}); // NaN and -5 both clamp to 0 => omitted
  });

  it('does not mutate the buffer', () => {
    const buffer = Object.assign(emptySideBets<Bet>(), { p1: 'survives' });
    resolveSideBets(buffer, 'survives', payout);
    expect(buffer).toEqual({ p1: 'survives' });
  });
});

describe('redactSideBets', () => {
  const buffer = Object.assign(emptySideBets<Bet>(), {
    p1: 'survives',
    p2: 'chokes',
  });

  it('GUARD 2: owner sees own bet; others see only the aggregate count, never a value', () => {
    const ownerView = redactSideBets(buffer, 'p1');
    expect(ownerView.own).toBe('survives');
    expect(ownerView.count).toBe(2);
    expect(ownerView.bets).toBeNull(); // no per-player map pre-reveal

    const otherView = redactSideBets(buffer, 'p3'); // not a bettor
    expect(otherView.own).toBeNull();
    expect(otherView.count).toBe(2);
    expect(otherView.bets).toBeNull();

    // GUARD 2: no other player's bet value leaks into a non-owner view
    expect(JSON.stringify(otherView)).not.toContain('survives');
    expect(JSON.stringify(otherView)).not.toContain('chokes');
  });

  it('p2 (a bettor) sees only their OWN bet, never p1s', () => {
    const v = redactSideBets(buffer, 'p2');
    expect(v.own).toBe('chokes');
    expect(JSON.stringify(v)).not.toContain('survives'); // p1s bet stays hidden
  });

  it('revealAll exposes the full bet map to everyone (cloned, null-proto)', () => {
    const v = redactSideBets(buffer, 'p3', { revealAll: true });
    expect(v.bets).toEqual({ p1: 'survives', p2: 'chokes' });
    expect(v.bets).not.toBe(buffer); // cloned, never aliases hidden state
    expect(Object.getPrototypeOf(v.bets)).toBeNull();
  });

  it('owner echo is own-property only — a "__proto__" viewer with no bet sees null', () => {
    const v = redactSideBets(buffer, '__proto__');
    expect(v.own).toBeNull();
  });
});
