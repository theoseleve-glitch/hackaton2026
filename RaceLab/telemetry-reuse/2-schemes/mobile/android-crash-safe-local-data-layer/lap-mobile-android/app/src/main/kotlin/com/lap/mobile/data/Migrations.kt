package com.lap.mobile.data

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Home for manual [Migration] objects wired into Room at builder time
 * per T053 strategy (strict migrations in prod, destructive fallback in
 * dev). Each migration object lives here so the full schema history is
 * searchable in one file; DAOs stay out of the migration authoring
 * business.
 */

/**
 * v1 → v2: add `session_journal` (T043). The table carries a cascading
 * FK to `sessions.id` so dropping a session drops its journal row. CREATE
 * mirrors the shape of [SessionJournalEntity]; Room's instrumented
 * migration test (T053+) diffs this against the KSP-generated schema
 * JSON to verify column-for-column fidelity.
 */
val MIGRATION_1_2: Migration = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS session_journal (
                session_id TEXT NOT NULL PRIMARY KEY,
                last_heartbeat_at TEXT NOT NULL,
                status TEXT NOT NULL,
                file_offset INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )
            """.trimIndent(),
        )
    }
}

/**
 * v2 → v3: add `upload_queue` (T044). Cascading FK on session_id so
 * abandoning a local session (T162) sweeps its queue row too. Indexed
 * on state so T160 FIFO dequeue stays cheap as the queue grows.
 */
val MIGRATION_2_3: Migration = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS upload_queue (
                session_id TEXT NOT NULL PRIMARY KEY,
                state TEXT NOT NULL,
                chunks_total INTEGER NOT NULL,
                idempotency_key TEXT NOT NULL,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                next_retry_at TEXT,
                last_http_code INTEGER,
                last_error TEXT,
                chunks_sent INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_upload_queue_state ON upload_queue(state)")
    }
}

/**
 * v3 → v4: add `insight_cache` (T045). Payload is kotlinx-serialized
 * JSON of a [com.lap.schemas.v1.CoachingInsight], keyed by insight id
 * with a session_id FK for cascade cleanup and an index for the
 * list-by-session dashboard query.
 */
val MIGRATION_3_4: Migration = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS insight_cache (
                id TEXT NOT NULL PRIMARY KEY,
                session_id TEXT NOT NULL,
                driver_id TEXT NOT NULL,
                payload TEXT NOT NULL,
                cached_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS index_insight_cache_session_id ON insight_cache(session_id)")
    }
}

/**
 * v4 → v5: add `prescription_cache` (T046). No FK to sessions —
 * prescriptions are longitudinal and may outlive individual sessions
 * (ADR-012, backend-authored per driver). Indexed on driver_id for
 * the list-by-driver dashboard query.
 */
val MIGRATION_4_5: Migration = object : Migration(4, 5) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS prescription_cache (
                id TEXT NOT NULL PRIMARY KEY,
                driver_id TEXT NOT NULL,
                payload TEXT NOT NULL,
                cached_at TEXT NOT NULL
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS index_prescription_cache_driver_id ON prescription_cache(driver_id)")
    }
}

/**
 * v5 → v6: add `track_cache` (T047). Global catalog — no FK, no index
 * beyond the implicit PK index (track lookups are by id).
 */
val MIGRATION_5_6: Migration = object : Migration(5, 6) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS track_cache (
                id TEXT NOT NULL PRIMARY KEY,
                name TEXT NOT NULL,
                layout TEXT NOT NULL,
                sectors_json TEXT NOT NULL,
                cached_at TEXT NOT NULL
            )
            """.trimIndent(),
        )
    }
}

/**
 * v6 → v7: add `rule_bundle` (T048). Single bundle per id (typically
 * the calver version); duplicate fetches overwrite. TTL + signature
 * check happen at read time in the coaching layer, not at the SQL
 * level.
 */
val MIGRATION_6_7: Migration = object : Migration(6, 7) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS rule_bundle (
                id TEXT NOT NULL PRIMARY KEY,
                version TEXT NOT NULL,
                bundle_json TEXT NOT NULL,
                signature TEXT NOT NULL,
                fetched_at TEXT NOT NULL
            )
            """.trimIndent(),
        )
    }
}

/**
 * v7 → v8: add `last_used_racebox` (T124). Single-row "settings"-style
 * table — id is the literal "singleton" sentinel so the device pairing
 * UX has at most one persisted target per app install. No FK
 * (RaceBox identity outlives any local session); savedAt lets a
 * future "auto-clear stale pairings after N days" sweep remain a
 * single SQL filter.
 */
val MIGRATION_7_8: Migration = object : Migration(7, 8) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS last_used_racebox (
                id TEXT NOT NULL PRIMARY KEY,
                address TEXT NOT NULL,
                name TEXT,
                saved_at TEXT NOT NULL
            )
            """.trimIndent(),
        )
    }
}

/**
 * v8 → v9: add `upload_preferences` (T156). Singleton-row "settings"
 * table mirroring the `last_used_racebox` shape — one row per app
 * install, keyed by the literal "singleton" sentinel. Holds the
 * user's upload toggles; T156 introduces `allow_metered` (default
 * 0 = false = UNMETERED_ONLY); T157 + T158 will extend the row
 * with WiFi-only and battery toggles.
 */
val MIGRATION_8_9: Migration = object : Migration(8, 9) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS upload_preferences (
                id TEXT NOT NULL PRIMARY KEY,
                allow_metered INTEGER NOT NULL DEFAULT 0
            )
            """.trimIndent(),
        )
    }
}

/**
 * v9 → v10: add `force_when_battery_low` to `upload_preferences`
 * (T158). DEFAULT 0 (false) so any row written by a v9 install
 * keeps the safe behaviour — defer uploads while the battery is
 * low. ALTER TABLE ADD COLUMN with NOT NULL + DEFAULT is the
 * SQLite-compatible way to extend an existing table without a
 * full rewrite.
 */
val MIGRATION_9_10: Migration = object : Migration(9, 10) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            "ALTER TABLE upload_preferences ADD COLUMN force_when_battery_low INTEGER NOT NULL DEFAULT 0",
        )
    }
}

/**
 * v10 → v11: add `coaching_feedback` (T219). Append-only log of
 * user dismissal + flag-as-wrong events on coaching prompts.
 * Auto-incrementing PK so multiple flags on the same rule across
 * sessions all persist; indexed on recorded_at so the future
 * feedback uploader streams records chronologically without a
 * full table scan.
 */
val MIGRATION_10_11: Migration = object : Migration(10, 11) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS coaching_feedback (
                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                rule_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                recorded_at TEXT NOT NULL
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_coaching_feedback_recorded_at ON coaching_feedback(recorded_at)",
        )
    }
}
