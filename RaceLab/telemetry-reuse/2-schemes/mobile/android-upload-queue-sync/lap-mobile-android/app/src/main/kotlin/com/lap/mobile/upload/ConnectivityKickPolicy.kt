package com.lap.mobile.upload

/**
 * Two-state coarse view of "do we currently have a usable network?"
 * Anything more granular (cellular vs wifi, metered vs unmetered) is
 * already handled by [com.lap.mobile.data.UploadPreferencesRepository] +
 * [toUploadConstraints] (T156/T157). This enum exists only to drive
 * the kick-or-not decision in [ConnectivityKickPolicy].
 */
enum class NetworkAvailability { Available, Unavailable }

/**
 * Single-method contract the future Android `ConnectivityManager.NetworkCallback`
 * wrapper calls when [ConnectivityKickPolicy] says we should re-poke
 * the upload worker.
 *
 * Production wires this to [androidx.work.WorkManager.enqueueUniqueWork]
 * with [com.lap.mobile.upload.UploadWorkScheduling.uniqueWorkNameFor]
 * (T159) — `ExistingWorkPolicy.KEEP` ensures the kick is idempotent
 * even if the policy somehow fires twice.
 *
 * `fun interface` so the wrapper's call site can be a lambda in tests
 * without ceremony.
 */
fun interface UploadQueueKicker {
    fun kick()
}

/**
 * Pure-Kotlin policy: given the previous and current [NetworkAvailability]
 * observations, should we kick the upload worker now?
 *
 * Rule: kick exactly on transitions *into* [NetworkAvailability.Available]
 * — either from [NetworkAvailability.Unavailable] or from a `null` prior
 * (the first observation right after registering the callback).
 *
 * Why a kernel over a stateful Android wrapper:
 *  - The Android wrapper has to register/unregister `NetworkCallback`
 *    against `ConnectivityManager`, which can't run on the JVM.
 *  - The "when do we kick?" decision is the actual UX-critical bit:
 *    it's the difference between uploads resuming the moment the train
 *    leaves the tunnel vs. the user waiting for WorkManager's next
 *    constraint-check tick (which can be minutes).
 *  - Locking the rule in pure Kotlin means the headline behavior is
 *    JVM-tested; the wrapper just translates Android callback shape
 *    into `(previous, current)` calls into this policy.
 *
 * Wifi-band handoffs (2.4 → 5 GHz) yield two `onAvailable` callbacks
 * for two different `Network` instances. The policy returns false on
 * the second one (Available → Available) so we don't pointlessly hammer
 * WorkManager — and even if we did, T159's `ExistingWorkPolicy.KEEP`
 * dedupes at the work-enqueue layer.
 */
object ConnectivityKickPolicy {
    fun shouldKickQueue(previous: NetworkAvailability?, current: NetworkAvailability): Boolean =
        current == NetworkAvailability.Available && previous != NetworkAvailability.Available
}
