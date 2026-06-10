package com.lap.mobile.account

import com.lap.mobile.upload.AuthState

/**
 * Decides WHEN to fire a [SyncMeProfileUseCase] (T189).
 *
 * Mirror-image shape of T186's
 * [com.lap.mobile.auth.SessionExpiredDetectionPolicy]:
 *   - T186 fires on Authenticated→Anonymous (passive expiry).
 *   - T189 fires on Anonymous→Authenticated (login).
 *
 * Pure function — no Android, no time, no I/O — so the contract is
 * locked by JVM unit tests and the Android shell can't accidentally
 * change semantics by changing how it observes its environment.
 *
 * Only the *transition into* Authenticated triggers — staying
 * Authenticated doesn't re-fetch (we already have the profile),
 * cold-launch with already-Authenticated doesn't fetch via this
 * policy ([com.lap.mobile.upload.AuthRestoreKickPolicy] handles
 * that null→Authenticated case for upload draining; profile sync
 * can ride that same trigger via a separate orchestrator without
 * polluting THIS predicate with two different "I want to fetch"
 * semantics).
 */
object ProfileSyncTriggerPolicy {
    fun shouldTriggerSync(previous: AuthState?, current: AuthState): Boolean {
        return previous == AuthState.Anonymous && current == AuthState.Authenticated
    }
}
