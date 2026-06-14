package com.lap.mobile.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.lap.schemas.v1.SourceTag
import com.lap.schemas.v1.UUID7
import java.time.Instant

/**
 * Local journal row for one capture session. Created at ARMED state,
 * transitioned through RECORDING/FINALIZING to COMPLETED (or FAILED);
 * the full state machine arrives in T075. [startedAt] fills when
 * recording begins and [endedAt] when finalize completes, so both stay
 * null for IDLE rows.
 *
 * [state] is kept as String here — T075 introduces the typed
 * SessionState enum and its converter. [fileUri] points at the local
 * bundle on disk (ADR-012: bundle is uploaded opaque), `null` until
 * BundleV2Writer (T131) atomically renames.
 */
@Entity(tableName = "sessions")
data class SessionEntity(
    @PrimaryKey
    val id: UUID7,
    val state: String,
    val source: SourceTag,
    @ColumnInfo(name = "started_at")
    val startedAt: Instant? = null,
    @ColumnInfo(name = "ended_at")
    val endedAt: Instant? = null,
    @ColumnInfo(name = "track_id")
    val trackId: UUID7? = null,
    @ColumnInfo(name = "car_id")
    val carId: UUID7? = null,
    @ColumnInfo(name = "sample_count")
    val sampleCount: Int = 0,
    @ColumnInfo(name = "file_uri")
    val fileUri: String? = null,
)
