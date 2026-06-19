package com.lap.mobile.upload

import com.lap.mobile.data.UploadQueueDao
import com.lap.mobile.data.UploadQueueEntity
import com.lap.schemas.v1.UUID7
import javax.inject.Inject

/**
 * Result of one [IdempotentUploadEnqueuer.enqueue] call (T150).
 *  - [Created] — a fresh row was inserted; the upload worker can pick
 *    it up on its next tick.
 *  - [AlreadyQueued] — a row for this session already exists; the
 *    persisted row (including its `idempotency_key` and any in-flight
 *    `chunks_sent` / `attempt_count` progress) was left untouched.
 */
enum class EnqueueOutcome { Created, AlreadyQueued }

/**
 * Enqueues a finished session for upload (T150).
 *
 * Policy:
 *   * The session's UUIDv7 is reused as the upload `Idempotency-Key`
 *     so a network retry replays the exact key the server first saw
 *     (ADR-012 dedupe contract).
 *   * The DAO is called with INSERT-OR-IGNORE semantics
 *     ([UploadQueueDao.insertOrIgnore]) so calling [enqueue] again for
 *     the same session — e.g., the user re-taps "upload" while the
 *     worker is parked — does not overwrite the persisted row. That
 *     preserves the idempotency key AND any partial progress
 *     ([UploadQueueEntity.chunksSent], [UploadQueueEntity.attemptCount])
 *     the worker has already recorded.
 *
 * Returned [EnqueueOutcome] tells the caller whether a fresh row was
 * created or one was already in flight; the UI uses this to decide
 * between "Queued" and "Already uploading" toasts.
 */
class IdempotentUploadEnqueuer @Inject constructor(
    private val queueDao: UploadQueueDao,
) {
    suspend fun enqueue(sessionId: UUID7, chunksTotal: Int): EnqueueOutcome {
        val row = UploadQueueEntity(
            sessionId = sessionId,
            state = STATE_QUEUED,
            chunksTotal = chunksTotal,
            idempotencyKey = sessionId,
        )
        return if (queueDao.insertOrIgnore(row) == INSERT_CONFLICT_ROWID) {
            EnqueueOutcome.AlreadyQueued
        } else {
            EnqueueOutcome.Created
        }
    }

    private companion object {
        const val STATE_QUEUED: String = "queued"

        // Room's @Insert(onConflict = IGNORE) returns -1 when the row was skipped
        // because of a primary-key conflict (mirrors SQLite's `INSERT OR IGNORE`).
        const val INSERT_CONFLICT_ROWID: Long = -1L
    }
}
