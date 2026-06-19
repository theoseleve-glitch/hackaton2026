package com.lap.mobile.data

import java.time.Clock
import java.time.Duration
import java.time.Instant

/**
 * Default stale threshold (12× the 5 s heartbeat cadence from
 * [JournalWriter]). A row whose last heartbeat is older than this is
 * treated as evidence the app crashed mid-recording, and the recovery
 * modal (T058) offers Finalize-from-journal (T059) per ADR-012.
 */
private const val DEFAULT_STALE_THRESHOLD_SECONDS: Long = 60L

/**
 * Startup reconciler. Runs at app launch (T076 SessionCoordinator
 * wires it in) and returns journal rows whose last heartbeat is
 * older than [staleThreshold]. The comparison is strict (`>`, not
 * `>=`), so a row exactly at the boundary is still fresh — avoids
 * flapping when a heartbeat lands milliseconds before app kill.
 *
 * The reconciler itself is pure: it reads the DAO with a cutoff
 * derived from [clock] minus [staleThreshold] and relays what the
 * DAO returns. That lets unit tests drive it off a [FixedClock]
 * without Room or an Android runtime.
 */
class JournalReconciler(
    private val dao: JournalDao,
    private val clock: Clock,
    private val staleThreshold: Duration = Duration.ofSeconds(DEFAULT_STALE_THRESHOLD_SECONDS),
) {
    suspend fun findStaleSessions(): List<SessionJournalEntity> {
        val cutoff = Instant.now(clock).minus(staleThreshold)
        return dao.listStale(cutoff)
    }
}
