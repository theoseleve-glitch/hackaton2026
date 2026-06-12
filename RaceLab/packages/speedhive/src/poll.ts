/**
 * politePoll — bounded, slow, injectable polling for the UNOFFICIAL API.
 *
 * We are an uninvited guest on MYLAPS infrastructure: the interval is floored
 * at 30 s no matter what the caller asks for, attempts are hard-capped, and
 * an auth failure aborts IMMEDIATELY (an expired token must never turn into
 * a hammering loop). `sleep` is injected — tests drive the loop with a fake
 * and zero real timers, same D18 culture as everything else.
 */

import type { SpeedhiveResult } from "./client";

/** Hard floor on the polling interval — politeness is not configurable down. */
export const POLL_MIN_INTERVAL_FLOOR_MS = 30_000;

export type SleepFn = (ms: number) => Promise<void>;

export interface PolitePollOptions<T> {
  /** Requested interval between attempts; values below the 30 s floor (or
   *  non-finite) are raised to the floor. */
  min_interval_ms: number;
  /** Hard cap on calls to `fn` (>= 1 integer, else `bad_options`). */
  max_attempts: number;
  /** Injected sleep — the ONLY way time passes here. */
  sleep: SleepFn;
  /**
   * Optional completion predicate, called on EVERY result (success or
   * failure, except auth_required which always aborts):
   *  - absent  → the first ok result ends the poll (one-shot fetch-with-retry)
   *  - present → polling continues until it returns true (live-timing mode:
   *    keep refreshing a classification until the session finishes) or
   *    attempts run out.
   */
  shouldStop?: (result: SpeedhiveResult<T>, attempt: number) => boolean;
}

export type PolitePollOutcome<T> =
  | { ok: true; data: T; attempts: number }
  | { ok: false; reason: "auth_required"; attempts: number }
  | { ok: false; reason: "stopped"; attempts: number; last: SpeedhiveResult<T> }
  | { ok: false; reason: "max_attempts"; attempts: number; last: SpeedhiveResult<T> }
  | { ok: false; reason: "bad_options" };

/**
 * Poll `fn` until done. Never throws; never sleeps after the final attempt.
 *
 *  - result auth_required        → abort NOW (never retry an auth failure)
 *  - result ok + no shouldStop   → done, return data
 *  - result ok + shouldStop true → done, return data
 *  - shouldStop true on failure  → "stopped" with that result attached
 *  - otherwise                   → sleep(max(floor, min_interval_ms)), retry
 *  - attempts exhausted          → "max_attempts" with the last result
 */
export async function politePoll<T>(
  fn: (attempt: number) => Promise<SpeedhiveResult<T>>,
  options: PolitePollOptions<T>,
): Promise<PolitePollOutcome<T>> {
  const attemptsValid =
    typeof options.max_attempts === "number" &&
    Number.isInteger(options.max_attempts) &&
    options.max_attempts >= 1;
  if (!attemptsValid) return { ok: false, reason: "bad_options" };

  const interval =
    typeof options.min_interval_ms === "number" && Number.isFinite(options.min_interval_ms)
      ? Math.max(POLL_MIN_INTERVAL_FLOOR_MS, options.min_interval_ms)
      : POLL_MIN_INTERVAL_FLOOR_MS;

  let last: SpeedhiveResult<T> | undefined;
  for (let attempt = 1; attempt <= options.max_attempts; attempt++) {
    const result = await fn(attempt);
    last = result;

    if (!result.ok && result.reason === "auth_required") {
      return { ok: false, reason: "auth_required", attempts: attempt };
    }
    if (result.ok) {
      if (options.shouldStop === undefined || options.shouldStop(result, attempt)) {
        return { ok: true, data: result.data, attempts: attempt };
      }
    } else if (options.shouldStop !== undefined && options.shouldStop(result, attempt)) {
      return { ok: false, reason: "stopped", attempts: attempt, last: result };
    }

    if (attempt < options.max_attempts) await options.sleep(interval);
  }
  // last is always set: max_attempts >= 1 guarantees one iteration.
  return { ok: false, reason: "max_attempts", attempts: options.max_attempts, last: last as SpeedhiveResult<T> };
}
