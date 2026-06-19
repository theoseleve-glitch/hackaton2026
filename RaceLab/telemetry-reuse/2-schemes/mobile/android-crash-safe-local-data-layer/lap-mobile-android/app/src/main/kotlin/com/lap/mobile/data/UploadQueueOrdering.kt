package com.lap.mobile.data

/**
 * Pure-Kotlin mirror of [UploadQueueDao.dequeueNext]'s policy (T160).
 *
 * Two properties:
 *  - **FIFO via UUIDv7 ordering.** session_id's first 48 bits are a
 *    Unix-ms timestamp, so a smaller id was enqueued first. Sorting
 *    by `session_id ASC` is exactly "oldest enqueue first" — no
 *    separate `enqueued_at` column needed (the DAO kdoc calls this
 *    out; this kernel makes the property assertable on the JVM).
 *  - **Skip terminal states.** Only `state = "queued"` rows are
 *    candidates. `failed_permanent` (T155 cap reached) and
 *    `completed` (already uploaded) are skipped so a dead or
 *    finished row never blocks a younger queued one.
 *
 * Why this kernel exists: `@Query` annotations have CLASS retention,
 * so the SQL string can't be reflected on at runtime — we can't
 * unit-test the production query directly without an instrumented
 * Room runtime (T083+). The kernel encodes the same policy in
 * Kotlin so the contract is JVM-locked and the dashboard
 * "next-up" view can call the same function without round-tripping
 * through Room.
 */
object UploadQueueOrdering {
    private const val STATE_QUEUED: String = "queued"

    fun selectNextDequeueable(rows: List<UploadQueueEntity>): UploadQueueEntity? = rows
        .filter { it.state == STATE_QUEUED }
        .minByOrNull { it.sessionId }
}
