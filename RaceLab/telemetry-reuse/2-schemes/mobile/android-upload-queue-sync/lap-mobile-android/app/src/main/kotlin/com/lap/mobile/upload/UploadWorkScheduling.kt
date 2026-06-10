package com.lap.mobile.upload

import androidx.work.ExistingWorkPolicy
import com.lap.schemas.v1.UUID7

/**
 * Constants + small helpers for the upload `WorkRequest`'s
 * `enqueueUniqueWork` call (T159). Keeps the "what makes two upload
 * enqueues collide?" answer in one place so the Android-side
 * scheduler is a thin wrapper:
 *
 * ```kotlin
 * workManager.enqueueUniqueWork(
 *     UploadWorkScheduling.uniqueWorkNameFor(sessionId),
 *     UploadWorkScheduling.existingWorkPolicy,
 *     OneTimeWorkRequestBuilder<UploadBundleWorker>()
 *         .setConstraints(networkPolicy.toUploadConstraints(batteryPolicy))
 *         .build(),
 * )
 * ```
 *
 * Why KEEP, not REPLACE/APPEND: an in-flight upload may have already
 * advanced [com.lap.mobile.data.UploadQueueEntity.chunksSent] (T152
 * resume cursor). REPLACE would cancel + restart, discarding that
 * progress; APPEND would queue a second worker that pulls the same
 * row. KEEP says "if a worker for this session is ENQUEUED, RUNNING,
 * or BLOCKED, ignore the new request" — exactly the no-duplicates
 * contract T159 wants. Once the in-flight worker terminates the slot
 * frees up and a future enqueue lands.
 *
 * The unique-name prefix (`upload-bundle-`) namespaces the upload
 * worker against future BLE / recording-side workers in the same
 * `WorkManager` instance.
 */
object UploadWorkScheduling {
    private const val UNIQUE_NAME_PREFIX: String = "upload-bundle-"

    fun uniqueWorkNameFor(sessionId: UUID7): String = "$UNIQUE_NAME_PREFIX$sessionId"

    val existingWorkPolicy: ExistingWorkPolicy = ExistingWorkPolicy.KEEP
}
