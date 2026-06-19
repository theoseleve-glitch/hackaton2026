package com.lap.mobile.auth

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Cancels every queued/running upload Worker. The production
 * implementation calls
 * [androidx.work.WorkManager.cancelAllWorkByTag] (or
 * `cancelUniqueWork` per
 * `UploadWorkScheduling.uniqueWorkNameFor`) and `awaits` the resulting
 * `Operation.result` so logout doesn't proceed to credential drop while
 * a worker is still mid-PUT — see [LogoutUseCase] for the why.
 *
 * Modelled as a `fun interface` so JVM tests can supply a no-op or a
 * recorder without dragging WorkManager onto the test classpath
 * (Robolectric isn't on the test runtime today and pulling it in for
 * one test isn't worth the toolchain risk after T171).
 */
fun interface UploadWorkCanceller {
    suspend fun cancelAllUploads()
}

/**
 * Wipes every row from every Room table. The production
 * implementation calls [androidx.room.RoomDatabase.clearAllTables]
 * inside a `withContext(Dispatchers.IO)` so the call site can stay on
 * the main coroutine; tests get to inject a no-op or a recorder.
 *
 * NOT a destructive `db.delete()` — `clearAllTables()` resets each
 * table's autoincrement counter and runs inside Room's own
 * single-transaction guarantee, which is what we want when a user
 * logs out: a different account signing in next must see a clean
 * slate.
 */
fun interface LocalDatabaseResetter {
    suspend fun resetAll()
}

/**
 * Orchestrates a logout (T175) — the three side effects that together
 * leave the device in a "fresh install minus the APK" state.
 *
 * Order is locked at the kernel level (not delegated to callers)
 * because the wrong order produces avoidable noise:
 *
 *   1. **Cancel uploads first.** A worker reading
 *      [SecureTokenStorage.read] mid-upload would see null and hit
 *      401, triggering T174's [TokenAuthenticator] refresh against
 *      a refresh token that's about to be wiped. Cancelling first
 *      means the worker never makes that doomed round trip.
 *
 *   2. **Clear tokens second.** With workers gone, dropping the token
 *      pair is just a memory write; nothing concurrently reads it.
 *
 *   3. **Reset DB last.** Wiping local cache last keeps the audit
 *      trail simple — "credentials gone" before "data gone" matches
 *      how a user reasons about logout: "you're not signed in
 *      anymore, and your local copy is gone too".
 *
 * All three steps are individually idempotent (clearing empty storage,
 * cancelling no-workers, resetting an empty DB are no-ops), which is
 * what lets a double-tapped Logout button or a screen that fires
 * twice not fail.
 *
 * Production [UploadWorkCanceller] + [LocalDatabaseResetter] impls
 * are [PENDING: device-required] — both are thin wrappers around
 * Android-runtime APIs (WorkManager, Room) that JVM unit tests can't
 * meaningfully exercise. The orchestration order — the part that
 * actually risks racing against in-flight workers — is locked here
 * by [LogoutUseCaseTest].
 */
@Singleton
class LogoutUseCase
@Inject
constructor(
    private val storage: SecureTokenStorage,
    private val canceller: UploadWorkCanceller,
    private val resetter: LocalDatabaseResetter,
) {
    suspend fun logout() {
        canceller.cancelAllUploads()
        storage.clearAll()
        resetter.resetAll()
    }
}
