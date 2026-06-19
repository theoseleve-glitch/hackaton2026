package com.lap.mobile.data

import androidx.room.RoomDatabase
import androidx.room.migration.Migration

/**
 * Migration policy for the local Room database. T053 contract:
 *
 *  - **dev flavor**: `fallbackToDestructiveMigration()` is allowed so
 *    the local DB gets wiped (and re-initialized) any time a schema
 *    change lands without an accompanying [Migration]. This keeps
 *    rapid iteration cheap — no one wants to hand-write a migration
 *    while the table shape is still in flux.
 *  - **staging / prod flavors**: strict migrations ONLY. Room will
 *    throw `IllegalStateException` at DB open time if a version step
 *    is unwired. User-captured sessions must never be silently wiped.
 *
 * The DI module reads `BuildConfig.FLAVOR` at runtime and passes
 * `destructiveMigrationAllowed = FLAVOR == "dev"` into
 * [migrationPolicyFor]; [applyTo] then pushes the policy onto the
 * Room builder before `build()`.
 *
 * Keeping the policy as a plain data class (not a builder lambda) lets
 * unit tests assert it without an Android runtime.
 */
data class MigrationPolicy(
    val migrations: List<Migration>,
    val destructiveFallback: Boolean,
) {
    fun <T : RoomDatabase> applyTo(builder: RoomDatabase.Builder<T>): RoomDatabase.Builder<T> {
        // Iterate rather than splat: detekt's performance.SpreadOperator
        // rule fires on `*migrations.toTypedArray()`, and the per-call
        // cost of adding migrations one-by-one is negligible at startup.
        migrations.forEach { builder.addMigrations(it) }
        if (destructiveFallback) {
            @Suppress("DEPRECATION")
            builder.fallbackToDestructiveMigration()
        }
        return builder
    }
}

fun migrationPolicyFor(destructiveMigrationAllowed: Boolean): MigrationPolicy = MigrationPolicy(
    migrations = listOf(
        MIGRATION_1_2,
        MIGRATION_2_3,
        MIGRATION_3_4,
        MIGRATION_4_5,
        MIGRATION_5_6,
        MIGRATION_6_7,
        MIGRATION_7_8,
        MIGRATION_8_9,
        MIGRATION_9_10,
        MIGRATION_10_11,
    ),
    destructiveFallback = destructiveMigrationAllowed,
)
