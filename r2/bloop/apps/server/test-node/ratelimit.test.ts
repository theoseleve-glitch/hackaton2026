import { describe, expect, it } from 'vitest';
import { BUCKET_CAP, CLOSE_AFTER_VIOLATIONS, RateLimiter, REFILL_PER_SEC, TokenBucket } from '../src/room/ratelimit.js';

describe('TokenBucket (design §7.4: burst 20, refill 10/s, caller-supplied clock)', () => {
  it('grants exactly the burst capacity at a single instant, then refuses', () => {
    const b = new TokenBucket();
    for (let i = 0; i < BUCKET_CAP; i++) expect(b.take(1_000)).toBe(true);
    expect(b.take(1_000)).toBe(false);
  });

  it('refills at 10 tokens/s: a drained bucket refuses at +50ms, grants at +150ms, is FULL after 2s', () => {
    const b = new TokenBucket();
    for (let i = 0; i < BUCKET_CAP; i++) b.take(1_000);
    expect(b.take(1_050)).toBe(false); // 0.5 tokens accrued — not yet
    expect(b.take(1_150)).toBe(true); // 1.5 tokens since the drain
    const c = new TokenBucket();
    for (let i = 0; i < BUCKET_CAP; i++) c.take(1_000);
    for (let i = 0; i < BUCKET_CAP; i++) expect(c.take(3_000)).toBe(true); // 2s idle = full burst again
    expect(c.take(3_000)).toBe(false);
  });

  it('never refills past the cap', () => {
    const b = new TokenBucket();
    b.take(0);
    for (let i = 0; i < BUCKET_CAP; i++) expect(b.take(3_600_000)).toBe(true); // an hour later: cap, not 36,000
    expect(b.take(3_600_000)).toBe(false);
  });

  it('clamps clock skew: time going backwards never mints tokens', () => {
    const b = new TokenBucket();
    for (let i = 0; i < BUCKET_CAP; i++) b.take(10_000);
    expect(b.take(1_000)).toBe(false); // now < last: refill clamps to 0
    expect(b.take(1_000)).toBe(false); // and stays clamped
  });
});

describe('RateLimiter (warn once -> silent drops -> close on sustained abuse)', () => {
  const drained = (): RateLimiter => {
    const l = new RateLimiter();
    for (let i = 0; i < BUCKET_CAP; i++) expect(l.check(5_000)).toBe('ok');
    return l;
  };

  it('first violation warns (one BAD_MESSAGE), further violations drop silently', () => {
    const l = drained();
    expect(l.check(5_000)).toBe('warn');
    expect(l.check(5_000)).toBe('drop');
    expect(l.check(5_000)).toBe('drop');
  });

  it('the Nth violation closes', () => {
    const l = drained();
    for (let i = 1; i < CLOSE_AFTER_VIOLATIONS; i++) l.check(5_000); // violations 1..N-1
    expect(l.check(5_000)).toBe('close'); // violation N
  });

  it('a well-behaved client at exactly the sustained rate never violates', () => {
    const l = new RateLimiter();
    for (let i = 0; i < 200; i++) expect(l.check(10_000 + i * (1_000 / REFILL_PER_SEC))).toBe('ok');
  });
});
