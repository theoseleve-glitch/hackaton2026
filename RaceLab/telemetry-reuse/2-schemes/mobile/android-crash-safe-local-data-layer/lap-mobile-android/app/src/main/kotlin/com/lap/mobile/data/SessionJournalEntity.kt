package com.lap.mobile.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.PrimaryKey
import com.lap.schemas.v1.UUID7
import java.time.Instant

/**
 * Heartbeat row for an in-progress capture. The journal writer (T054)
 * bumps [lastHeartbeatAt] every 5 s while recording; the startup
 * reconciler (T055) scans for rows with gaps > 60 s to detect sessions
 * the app crashed out of (so the user can recover the raw buffer via
 * Finalize-from-journal, T059).
 *
 * [fileOffset] tracks how far we've written into the crash-safe buffer
 * (T079) so recovery can resume there. [status] is kept as String here;
 * T055/T059 only read a small set of values (`recording` /
 * `finalizing` / `stale`), promoted to an enum when the recovery flow
 * needs exhaustive matching.
 *
 * One journal row per session — PK is [sessionId] with a cascading FK
 * to [SessionEntity].
 */
@Entity(
    tableName = "session_journal",
    foreignKeys = [
        ForeignKey(
            entity = SessionEntity::class,
            parentColumns = ["id"],
            childColumns = ["session_id"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
)
data class SessionJournalEntity(
    @PrimaryKey
    @ColumnInfo(name = "session_id")
    val sessionId: UUID7,
    @ColumnInfo(name = "last_heartbeat_at")
    val lastHeartbeatAt: Instant,
    val status: String,
    @ColumnInfo(name = "file_offset")
    val fileOffset: Long = 0L,
)
