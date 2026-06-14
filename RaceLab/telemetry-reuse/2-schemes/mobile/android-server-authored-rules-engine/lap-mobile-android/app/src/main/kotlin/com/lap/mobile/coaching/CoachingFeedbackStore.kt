package com.lap.mobile.coaching

import java.time.Instant

/**
 * User-feedback record on a coaching prompt (T219).
 *
 * Two distinct semantics encoded by [kind]:
 *   - [CoachingFeedbackKind.DISMISSED]: user saw the tip and tapped
 *     Dismiss without flagging. Weak signal — tells the server
 *     "user acknowledged this rule fired", useful for noise tuning.
 *   - [CoachingFeedbackKind.FLAGGED_WRONG]: user explicitly tagged
 *     this rule as a false positive. Strong signal — server should
 *     consider suppressing or re-tuning the offending rule.
 */
data class CoachingFeedback(
    val ruleId: String,
    val kind: CoachingFeedbackKind,
    val recordedAt: Instant,
)

/**
 * Why two kinds in one log rather than two separate tables: the
 * upload pipeline ships them together (per-rule feedback batch),
 * the server's analytics groups them by rule_id, and the storage
 * cost is identical. A single table with a kind column is simpler
 * than two parallel tables that always grow together.
 */
enum class CoachingFeedbackKind { DISMISSED, FLAGGED_WRONG }

/**
 * Persistent log of coaching-prompt user feedback (T219).
 *
 * Append-only by design — each user action records a new entry
 * even if the same rule was flagged before. The server-side rule
 * tuner needs counts and timestamps, not deduplication.
 *
 * Production binds [RoomCoachingFeedbackStore]; tests can substitute
 * an in-memory fake. Storage-agnostic interface keeps the consumer
 * code (the coaching prompt callbacks) free of Room dependencies.
 *
 * Lifecycle:
 *   1. User taps Dismiss / Flag-as-wrong on a [com.lap.mobile.ui.coaching.CoachingPromptCard]
 *   2. Card's callback invokes [recordDismissal] / [recordFlaggedWrong]
 *   3. Future feedback uploader (probably bundled with /api/v1/feedback
 *      backend task) reads via [loadAll], POSTs to server, calls [clear]
 *
 * The clear-after-upload pattern means this table stays small —
 * tens of records per active driver-day. No retention policy
 * needed; clear is gated on successful upload.
 */
interface CoachingFeedbackStore {
    suspend fun recordDismissal(ruleId: String)

    suspend fun recordFlaggedWrong(ruleId: String)

    suspend fun loadAll(): List<CoachingFeedback>

    suspend fun clear()
}
