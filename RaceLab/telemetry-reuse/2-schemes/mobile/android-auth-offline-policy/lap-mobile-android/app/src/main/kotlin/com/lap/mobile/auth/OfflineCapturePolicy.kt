package com.lap.mobile.auth

import com.lap.mobile.upload.AuthState

/**
 * The "captures pile up locally, drain when paired" policy (T183).
 *
 * Two predicates so consumers can ask exactly the question they
 * need:
 *
 *   - [permitsRecordingStart] is the contract that preflight readiness
 *     (T096+) MUST NOT add an auth gate. A driver who loses their
 *     phone session in the pit must still be able to capture the next
 *     outing — that's the whole value proposition of offline-first
 *     capture. This predicate always returns `true`; making it a
 *     function rather than a constant lets future tasks layer in
 *     conditions if needed (battery floor, storage exhaustion, etc.)
 *     without breaking the call sites.
 *
 *   - [permitsUploadAttempt] gates the upload scheduler. If we
 *     enqueued a worker while Anonymous: [AuthInterceptor] (T149)
 *     forwards without bearer, server returns 401, row stays
 *     queued — correct end state, but wastes a worker tick / battery
 *     / log noise on every connectivity or backoff kick. Gating here
 *     means the scheduler simply doesn't enqueue. T166's
 *     [com.lap.mobile.upload.AuthRestoreKickPolicy] is the symmetric
 *     wake-up: kick the queue exactly when auth flips back to
 *     [AuthState.Authenticated], so queued rows drain promptly.
 *
 * Together with T166 these encode the full offline-capture contract.
 * Splitting them into two predicates rather than one boolean keeps
 * "is recording allowed?" and "should upload run now?" independently
 * answerable — they happen to share the same auth dimension today,
 * but the upload predicate could grow conditions (server health
 * check, rate limiting) that would never apply to recording.
 */
object OfflineCapturePolicy {
    @Suppress("UnusedParameter", "FunctionOnlyReturningConstant")
    fun permitsRecordingStart(auth: AuthState): Boolean = true

    fun permitsUploadAttempt(auth: AuthState): Boolean = auth == AuthState.Authenticated
}
