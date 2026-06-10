/**
 * Token-bucket rate limiting at the WS message boundary (design §7.4).
 *
 * HIBERNATION CHOICE — in-memory, reset-on-wake (deliberate, per §7.4): the
 * buckets live in a Map on the DO instance and vanish on hibernation. That is
 * CORRECT, not a compromise: the runtime only hibernates an IDLE object, and
 * at REFILL_PER_SEC a drained bucket is full again after 2s of silence — any
 * socket that survives into a hibernation gap would have converged to a full
 * bucket anyway, so a fresh bucket on wake computes the same answer.
 * Persisting tokens+timestamps in the socket attachment instead would add a
 * serializeAttachment() storage write to EVERY message on the hot path —
 * against the billing model (§7.1) — to reproduce what refill math gives free.
 */
export const BUCKET_CAP = 20; // §7.4: burst
export const REFILL_PER_SEC = 10; // §7.4: sustained msgs/s (party games are a vote, a tap)
/** §7.4 "repeated abuse closes the socket": total violations on one connection. */
export const CLOSE_AFTER_VIOLATIONS = 50;

export class TokenBucket {
  private tokens: number;
  private last: number | null = null;

  constructor(private readonly cap = BUCKET_CAP, private readonly refillPerSec = REFILL_PER_SEC) {
    this.tokens = cap;
  }

  /** Caller supplies the clock (pure, Tier-A testable). Skew clamps to zero refill — time going backwards never mints tokens. */
  take(now: number): boolean {
    if (this.last !== null) {
      this.tokens = Math.min(this.cap, this.tokens + (Math.max(0, now - this.last) / 1000) * this.refillPerSec);
    }
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export type RateVerdict = 'ok' | 'warn' | 'drop' | 'close';

/** Per-connection policy: one BAD_MESSAGE warning, then silent drops, then close (§7.4). */
export class RateLimiter {
  private violations = 0;

  constructor(private readonly bucket = new TokenBucket()) {}

  check(now: number): RateVerdict {
    if (this.bucket.take(now)) return 'ok';
    this.violations += 1;
    if (this.violations >= CLOSE_AFTER_VIOLATIONS) return 'close';
    return this.violations === 1 ? 'warn' : 'drop';
  }
}
