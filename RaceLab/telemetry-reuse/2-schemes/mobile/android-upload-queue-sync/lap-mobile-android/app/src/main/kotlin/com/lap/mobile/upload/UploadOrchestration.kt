package com.lap.mobile.upload

import com.lap.mobile.data.UploadQueueDao
import java.time.Clock
import kotlin.random.Random
import kotlin.time.toJavaDuration

private const val STATE_QUEUED: String = "queued"
private const val STATE_COMPLETED: String = "completed"
private const val STATE_FAILED_PERMANENT: String = "failed_permanent"

/**
 * Outcome of one HTTP attempt by [BundleUploader] (T147 + T148).
 *  - [Success] — server accepted the bundle (typically 2xx).
 *  - [Retryable] — transient (5xx, 408, network) — caller schedules
 *    a retry per the T154 backoff curve.
 *  - [PermanentFailure] — client error (4xx other than auth/timeout)
 *    — bundle is malformed or rejected; no retry will help, surface
 *    to user so they can investigate or abandon.
 */
sealed interface UploadResult {
    data class Success(val httpCode: Int) : UploadResult
    data class Retryable(val httpCode: Int?, val message: String) : UploadResult
    data class PermanentFailure(val httpCode: Int, val message: String) : UploadResult
}

/**
 * Single-attempt upload seam (T147). Lets the orchestration stay
 * pure-Kotlin / JVM-testable while the actual HTTP work
 * ([com.lap.mobile.upload.IngestApi], T148+) lives behind the
 * fun-interface and gets exercised by the integration tests.
 */
fun interface BundleUploader {
    suspend fun upload(sessionId: String, idempotencyKey: String): UploadResult
}

/**
 * Aggregated outcome of one orchestration tick (T147). The worker
 * (UploadBundleWorker) maps these to ListenableWorker.Result —
 * NothingToDo + Success → Result.success, Retry → Result.retry,
 * PermanentFailure → Result.failure. Splitting the outcome from the
 * worker.Result lets the orchestration stay JVM-testable without
 * Robolectric.
 */
enum class UploadOutcome { NothingToDo, Success, Retry, PermanentFailure }

/**
 * Pure orchestration of one upload attempt (T147). One tick:
 *   1. dequeue next "queued" row from [UploadQueueDao] (FIFO via
 *      UUIDv7 ordering per T160).
 *   2. delegate to [BundleUploader] for the actual HTTP work.
 *   3. update the queue row state + attempt count + last error / http
 *      code based on the [UploadResult].
 *
 * Returns an [UploadOutcome] the worker maps to a WorkManager Result
 * for the runtime. On a retryable failure (T169) the orchestrator
 * stamps `next_retry_at = clock.instant() + BackoffSchedule.delayForAttempt`
 * so WorkManager / a future scheduler can pace re-enqueue per the
 * T154 curve instead of re-firing on the next constraint poll. The
 * `random` parameter feeds [BackoffSchedule]'s 0..25% jitter; defaults
 * to `Random.Default` so existing call sites that don't care about
 * deterministic delay continue to compile.
 */
class UploadOrchestration @javax.inject.Inject constructor(
    private val queueDao: UploadQueueDao,
    private val uploader: BundleUploader,
    private val clock: Clock,
    private val random: Random = Random.Default,
) {
    suspend fun runOnce(): UploadOutcome {
        val row = queueDao.dequeueNext() ?: return UploadOutcome.NothingToDo
        val result = uploader.upload(row.sessionId, row.idempotencyKey)
        val nextAttempt = row.attemptCount + 1
        return when (result) {
            is UploadResult.Success -> {
                queueDao.updateAttempt(
                    sessionId = row.sessionId,
                    state = STATE_COMPLETED,
                    attemptCount = nextAttempt,
                    nextRetryAt = null,
                    lastHttpCode = result.httpCode,
                    lastError = null,
                )
                UploadOutcome.Success
            }
            is UploadResult.Retryable -> {
                // Cap retries at MAX_ATTEMPTS_BEFORE_PERMANENT (T155). Past
                // that bound a flapping endpoint or a quietly malformed
                // bundle would otherwise keep the row in the queue forever;
                // flipping to failed_permanent stops the scheduler and lets
                // the UI surface a manual-retry CTA (T161).
                val capReached = nextAttempt >= MAX_ATTEMPTS_BEFORE_PERMANENT
                // Stamp next_retry_at on every Retryable that stays queued so
                // WorkManager paces re-enqueue per the T154 backoff curve
                // (T169). On the cap-reached flip to failed_permanent there's
                // no scheduled retry — leave it null.
                val backoffDelay = if (capReached) {
                    null
                } else {
                    BackoffSchedule.delayForAttempt(attempt = nextAttempt, random = random)
                }
                queueDao.updateAttempt(
                    sessionId = row.sessionId,
                    state = if (capReached) STATE_FAILED_PERMANENT else STATE_QUEUED,
                    attemptCount = nextAttempt,
                    nextRetryAt = backoffDelay?.let { clock.instant().plus(it.toJavaDuration()) },
                    lastHttpCode = result.httpCode,
                    lastError = result.message,
                )
                if (capReached) UploadOutcome.PermanentFailure else UploadOutcome.Retry
            }
            is UploadResult.PermanentFailure -> {
                queueDao.updateAttempt(
                    sessionId = row.sessionId,
                    state = STATE_FAILED_PERMANENT,
                    attemptCount = nextAttempt,
                    nextRetryAt = null,
                    lastHttpCode = result.httpCode,
                    lastError = result.message,
                )
                UploadOutcome.PermanentFailure
            }
        }
    }

    companion object {
        /**
         * Hard cap on retry attempts before a session's queue row is
         * marked failed_permanent (T155). The 10th retryable response is
         * the last one we honour; anything beyond would leave a flapping
         * endpoint (or a quietly malformed bundle) cycling forever.
         */
        const val MAX_ATTEMPTS_BEFORE_PERMANENT: Int = 10
    }
}
