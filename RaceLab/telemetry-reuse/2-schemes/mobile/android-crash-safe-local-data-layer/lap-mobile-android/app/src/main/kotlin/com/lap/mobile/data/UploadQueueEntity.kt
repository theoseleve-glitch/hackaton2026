package com.lap.mobile.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.PrimaryKey
import com.lap.schemas.v1.UUID7
import java.time.Instant

/**
 * One queued-upload row per session; [UploadBundleWorker] (T147)
 * dequeues these FIFO, tracks chunked progress in [chunksSent] /
 * [chunksTotal], and reschedules via [nextRetryAt] on 5xx/network
 * errors (T154 backoff curve).
 *
 * [idempotencyKey] is the session UUIDv7 persisted here so retries
 * replay the exact same key the server first saw (T150) — the ingest
 * side dedupes on this, never on connection retries. [state] is kept
 * as String until T155/T160 promote it to an enum once the full
 * lifecycle (queued / uploading / failed / failed_permanent /
 * completed) is locked down.
 *
 * Cascading FK on [sessionId] sweeps the queue row when a user
 * abandons a local session (T162).
 */
@Entity(
    tableName = "upload_queue",
    foreignKeys = [
        ForeignKey(
            entity = SessionEntity::class,
            parentColumns = ["id"],
            childColumns = ["session_id"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
)
data class UploadQueueEntity(
    @PrimaryKey
    @ColumnInfo(name = "session_id")
    val sessionId: UUID7,
    val state: String,
    @ColumnInfo(name = "chunks_total")
    val chunksTotal: Int,
    @ColumnInfo(name = "idempotency_key")
    val idempotencyKey: String,
    @ColumnInfo(name = "attempt_count")
    val attemptCount: Int = 0,
    @ColumnInfo(name = "next_retry_at")
    val nextRetryAt: Instant? = null,
    @ColumnInfo(name = "last_http_code")
    val lastHttpCode: Int? = null,
    @ColumnInfo(name = "last_error")
    val lastError: String? = null,
    @ColumnInfo(name = "chunks_sent")
    val chunksSent: Int = 0,
)
