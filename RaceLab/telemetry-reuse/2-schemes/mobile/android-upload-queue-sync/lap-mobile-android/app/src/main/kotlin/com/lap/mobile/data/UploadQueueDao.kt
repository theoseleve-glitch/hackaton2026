package com.lap.mobile.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.lap.schemas.v1.UUID7
import java.time.Instant

/**
 * DAO for the upload queue. [UploadBundleWorker] (T147) calls
 * [dequeueNext] to pick the next row to upload, [updateAttempt] on
 * every retry to record backoff state (T154), and [insertOrIgnore]
 * when a new session finalizes (T150 — IGNORE keeps the persisted
 * idempotency key + any in-flight chunks_sent/attempt_count from
 * being overwritten on a re-enqueue).
 *
 * Queue ordering (T160): session_id is a UUIDv7, which is time-ordered
 * by construction, so `ORDER BY session_id ASC` is natural FIFO without
 * a separate `enqueued_at` column. The `WHERE state = "queued"` filter
 * skips terminal states (`completed`, `failed_permanent`) so a dead or
 * finished row never blocks a younger queued one. The same policy is
 * mirrored in pure Kotlin by [UploadQueueOrdering.selectNextDequeueable]
 * — it's JVM-locked there because `@Query` has CLASS retention.
 */
@Dao
interface UploadQueueDao {
    /**
     * INSERT OR IGNORE — returns the new rowid on a fresh insert, or
     * `-1L` when a row for the same `session_id` already exists.
     * Application policy lives in
     * [com.lap.mobile.upload.IdempotentUploadEnqueuer].
     */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertOrIgnore(row: UploadQueueEntity): Long

    @Query(
        """
        SELECT * FROM upload_queue
        WHERE state = :state
        ORDER BY session_id ASC
        LIMIT 1
        """,
    )
    suspend fun dequeueNext(state: String = "queued"): UploadQueueEntity?

    @Query(
        """
        UPDATE upload_queue
        SET state = :state,
            attempt_count = :attemptCount,
            next_retry_at = :nextRetryAt,
            last_http_code = :lastHttpCode,
            last_error = :lastError
        WHERE session_id = :sessionId
        """,
    )
    suspend fun updateAttempt(
        sessionId: UUID7,
        state: String,
        attemptCount: Int,
        nextRetryAt: Instant?,
        lastHttpCode: Int?,
        lastError: String?,
    ): Int
}
