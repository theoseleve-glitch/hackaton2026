package com.lap.mobile.auth

import com.lap.mobile.upload.AuthState
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Predicate kernel: should the sign-in-again modal (T186) be surfaced
 * given a transition in [AuthState]?
 *
 * Rule: surface the modal exactly when:
 *   - the previous observation was [AuthState.Authenticated], AND
 *   - the current observation is [AuthState.Anonymous], AND
 *   - the transition was NOT user-initiated logout.
 *
 * The third condition is what distinguishes "your session passively
 * expired" (T186) from "you tapped Logout" (T175). Both produce the
 * same Authenticated→Anonymous transition; without the intent flag
 * the modal would falsely appear after a normal logout, telling the
 * user their session expired when they actually just tapped sign-out.
 *
 * Cold-launch transitions (previous == null) never surface the modal —
 * the first observation has nothing to "transition from", and a
 * just-installed-app showing "your session expired" would be
 * nonsensical.
 *
 * Symmetric to [com.lap.mobile.upload.AuthRestoreKickPolicy] (T166),
 * which fires on the opposite transition (Anonymous→Authenticated)
 * to drain queued uploads. Together these encode the auth-state-
 * transition reactions: T186 surfaces UX on expiry, T166 drains
 * pending work on restore.
 */
object SessionExpiredDetectionPolicy {
    fun shouldShowExpiredModal(previous: AuthState?, current: AuthState, userInitiatedLogout: Boolean): Boolean =
        previous == AuthState.Authenticated &&
            current == AuthState.Anonymous &&
            !userInitiatedLogout
}

/**
 * Handles a passively-expired session (T186) — clears credentials
 * ONLY, leaves local data intact.
 *
 * The "preserves local data" half of T186 is enforced structurally:
 * the constructor takes ONLY [SecureTokenStorage]. No
 * [UploadWorkCanceller], no [LocalDatabaseResetter] — the impl
 * literally cannot call them. A future change accidentally adding
 * "drop the DB on session expiry" would have to also add the dep,
 * which would surface in code review and a constructor-shape test
 * would catch it.
 *
 * Why preserve uploads + DB:
 *   - Captured-but-unuploaded sessions (rows in [UploadQueueEntity]
 *     with state="queued") will sit there waiting for credentials.
 *     Once the user re-authenticates, T166's
 *     [AuthRestoreKickPolicy] fires on the next
 *     Anonymous→Authenticated transition and drains them. Wiping
 *     the DB on expiry would lose those captures permanently.
 *   - Race the driver just had: the data is sitting on the device,
 *     possibly never seen by the server yet. "Your session expired,
 *     please sign in again" should NOT silently delete it.
 *
 * Distinct from T175's [LogoutUseCase], which DOES wipe DB +
 * cancel uploads — that's an intentional user-driven sign-out.
 */
@Singleton
class HandleSessionExpired
@Inject
constructor(
    private val storage: SecureTokenStorage,
) {
    suspend fun onExpired() {
        storage.clearAll()
    }
}
