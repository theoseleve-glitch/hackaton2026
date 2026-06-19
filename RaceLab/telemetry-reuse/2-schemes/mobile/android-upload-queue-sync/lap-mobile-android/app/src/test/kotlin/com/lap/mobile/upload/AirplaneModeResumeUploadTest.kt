package com.lap.mobile.upload

import com.lap.mobile.data.UploadQueueDao
import com.lap.mobile.data.UploadQueueEntity
import com.lap.schemas.v1.UUID7
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneId

/**
 * End-to-end resume scenario (T167). Crosses several earlier task
 * contracts:
 *  - T150: idempotency key is persisted on the row and replayed across
 *    retries so the server-side de-dupe sees both attempts as the
 *    same logical upload.
 *  - T152: chunks_sent cursor isn't reset on a retryable failure, so
 *    the next attempt can resume from where the dropped one stopped
 *    instead of re-uploading bytes the server already accepted.
 *  - T154/T155: a network/5xx failure keeps state="queued" so the
 *    worker re-dequeues it on the next tick.
 *  - T160: the re-dequeue picks the same row back up via FIFO.
 *
 * Each piece is unit-tested in its own task; this test locks the
 * property that they survive *together* across a two-tick "fail then
 * succeed" sequence — the user toggles airplane mode mid-upload and
 * the next reconnect (via T165's ConnectivityKickPolicy) drains the
 * row to "completed" without losing data or duplicating server-side.
 */
private const val SESSION_ID: UUID7 = "01997333-9d2e-7000-8000-00000000000f"
private const val IDEMPOTENCY_KEY: String = "$SESSION_ID-key"
private const val CHUNKS_TOTAL: Int = 8
private const val CHUNKS_SENT_BEFORE_FAILURE: Int = 4
private const val RETRYABLE_HTTP_CODE: Int = 0
private const val RETRYABLE_MESSAGE: String = "Network unavailable: airplane mode"
private const val SUCCESS_HTTP_CODE: Int = 201
private val FIXED_NOW: Instant = Instant.parse("2026-04-25T14:30:00Z")
private val FIXED_CLOCK: Clock = Clock.fixed(FIXED_NOW, ZoneId.of("UTC"))

class AirplaneModeResumeUploadTest {
    @Test
    fun two_tick_retryable_then_success_lands_in_completed_so_user_doesnt_re_capture() = runTest {
        val dao = StatefulFakeQueueDao(
            initialRow = mutableQueuedRow(chunksSent = CHUNKS_SENT_BEFORE_FAILURE),
        )
        val uploader = ScriptedUploader(
            scripted = listOf(
                UploadResult.Retryable(httpCode = RETRYABLE_HTTP_CODE, message = RETRYABLE_MESSAGE),
                UploadResult.Success(httpCode = SUCCESS_HTTP_CODE),
            ),
        )
        val orchestration = UploadOrchestration(queueDao = dao, uploader = uploader, clock = FIXED_CLOCK)

        val firstOutcome = orchestration.runOnce()
        val secondOutcome = orchestration.runOnce()

        assertEquals(UploadOutcome.Retry, firstOutcome)
        assertEquals(UploadOutcome.Success, secondOutcome)
        assertEquals("completed", dao.currentState)
    }

    @Test
    fun chunks_sent_cursor_survives_a_retryable_failure_so_t152_resumes_instead_of_re_uploading_from_zero() {
        // The orchestrator's updateAttempt deliberately doesn't touch
        // chunks_sent — that column is the T152 resume cursor and is
        // only advanced by [BundleMultipartBuilder] callers that have
        // actual chunk-ack proof. Locking this here prevents a future
        // refactor from accidentally including chunksSent in the
        // updateAttempt signature and silently reverting all in-flight
        // resumes to "start over from chunk 0."
        runTest {
            val dao = StatefulFakeQueueDao(
                initialRow = mutableQueuedRow(chunksSent = CHUNKS_SENT_BEFORE_FAILURE),
            )
            val orchestration = UploadOrchestration(
                queueDao = dao,
                uploader = BundleUploader { _, _ ->
                    UploadResult.Retryable(httpCode = RETRYABLE_HTTP_CODE, message = RETRYABLE_MESSAGE)
                },
                clock = FIXED_CLOCK,
            )

            orchestration.runOnce()

            assertEquals(CHUNKS_SENT_BEFORE_FAILURE, dao.currentChunksSent)
        }
    }

    @Test
    fun idempotency_key_replayed_across_retries_so_t150_dedupe_treats_both_attempts_as_one() = runTest {
        val dao = StatefulFakeQueueDao(
            initialRow = mutableQueuedRow(chunksSent = CHUNKS_SENT_BEFORE_FAILURE),
        )
        val uploader = ScriptedUploader(
            scripted = listOf(
                UploadResult.Retryable(httpCode = RETRYABLE_HTTP_CODE, message = RETRYABLE_MESSAGE),
                UploadResult.Success(httpCode = SUCCESS_HTTP_CODE),
            ),
        )
        val orchestration = UploadOrchestration(queueDao = dao, uploader = uploader, clock = FIXED_CLOCK)

        orchestration.runOnce()
        orchestration.runOnce()

        val keysSeen = uploader.observed.map { it.idempotencyKey }.distinct()
        assertEquals(listOf(IDEMPOTENCY_KEY), keysSeen)
    }

    private fun mutableQueuedRow(chunksSent: Int): UploadQueueEntity = UploadQueueEntity(
        sessionId = SESSION_ID,
        state = "queued",
        chunksTotal = CHUNKS_TOTAL,
        idempotencyKey = IDEMPOTENCY_KEY,
        chunksSent = chunksSent,
    )
}

private class ScriptedUploader(scripted: List<UploadResult>) : BundleUploader {
    private val script = scripted.toMutableList()
    val observed: MutableList<UploaderCall> = mutableListOf()

    override suspend fun upload(sessionId: String, idempotencyKey: String): UploadResult {
        observed.add(UploaderCall(sessionId, idempotencyKey))
        check(script.isNotEmpty()) { "ScriptedUploader called more times than scripted; observed=${observed.size}" }
        return script.removeFirst()
    }
}

private data class UploaderCall(val sessionId: String, val idempotencyKey: String)

private class StatefulFakeQueueDao(initialRow: UploadQueueEntity) : UploadQueueDao {
    private var row: UploadQueueEntity = initialRow

    val currentState: String get() = row.state
    val currentChunksSent: Int get() = row.chunksSent

    override suspend fun insertOrIgnore(row: UploadQueueEntity): Long =
        error("insertOrIgnore not exercised by AirplaneModeResumeUploadTest")

    override suspend fun dequeueNext(state: String): UploadQueueEntity? = if (row.state == state) row else null

    override suspend fun updateAttempt(
        sessionId: UUID7,
        state: String,
        attemptCount: Int,
        nextRetryAt: Instant?,
        lastHttpCode: Int?,
        lastError: String?,
    ): Int {
        check(sessionId == row.sessionId) {
            "updateAttempt for unknown sessionId $sessionId (have ${row.sessionId})"
        }
        // Mirror the production DAO contract: only the five columns named
        // in the @Query are touched. chunks_sent + idempotency_key +
        // chunks_total + session_id are intentionally left alone — that's
        // what makes T167's resume + dedup invariants hold.
        row = row.copy(
            state = state,
            attemptCount = attemptCount,
            nextRetryAt = nextRetryAt,
            lastHttpCode = lastHttpCode,
            lastError = lastError,
        )
        return 1
    }
}
