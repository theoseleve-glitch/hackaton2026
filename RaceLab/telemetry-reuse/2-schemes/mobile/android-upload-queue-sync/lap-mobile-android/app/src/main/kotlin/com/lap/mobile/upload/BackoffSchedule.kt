package com.lap.mobile.upload

import kotlin.random.Random
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds

/**
 * Per-attempt retry delay for the upload worker (T154).
 *
 * Curve: 1s, 2s, 4s, 8s, 16s, 30s, 60s — pure doubling for the first
 * five steps, then a cap that plateaus the schedule at one minute by
 * attempt 7. Beyond attempt 7 the delay stays pinned at 60s so the
 * function never overflows if a future change raises the
 * [com.lap.mobile.upload.UploadOrchestration]-side max-attempt cap
 * (T155 currently caps at 10 before `failed_permanent`).
 *
 * Jitter: additive 0..25% of the base delay. Additive (not full
 * jitter) so we never retry sooner than the curve says — the
 * back-pressure floor is real. The 25% spread is enough to
 * de-correlate a small fleet without dropping a sub-second delay
 * on attempt 1 into a tight loop.
 *
 * Example, attempt 4 (base 8s): delay ∈ [8.0s, 10.0s]. The
 * pure-base value is locked by [BackoffScheduleTest]; the jitter
 * bounds are sampled across 1000 random seeds in the same test.
 */
object BackoffSchedule {
    private val BASE_DELAYS_MS: LongArray = longArrayOf(
        1_000L,
        2_000L,
        4_000L,
        8_000L,
        16_000L,
        30_000L,
        60_000L,
    )
    private const val JITTER_NUMERATOR: Long = 1L
    private const val JITTER_DENOMINATOR: Long = 4L

    fun delayForAttempt(attempt: Int, random: Random): Duration {
        require(attempt >= 1) { "attempt must be >= 1, got $attempt" }
        val cappedIndex = (attempt - 1).coerceAtMost(BASE_DELAYS_MS.lastIndex)
        val baseMs = BASE_DELAYS_MS[cappedIndex]
        val jitterCeilingMs = baseMs * JITTER_NUMERATOR / JITTER_DENOMINATOR
        val jitterMs = if (jitterCeilingMs == 0L) 0L else random.nextLong(0L, jitterCeilingMs + 1L)
        return (baseMs + jitterMs).milliseconds
    }
}
