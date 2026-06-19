package com.lap.mobile.data

/**
 * Typed recording lifecycle (T075). Promoted from the magic strings
 * [FinalizeFromJournal] and [CrashedSessionReconciler] use today; the
 * existing wire values are preserved exactly so persisted Room rows
 * stay valid without a data migration.
 *
 * Lifecycle:
 *
 * ```
 *           ┌────── cancel ──────┐
 *           ▼                    │
 *         IDLE ─── preflight ─→ ARMED ─── start ─→ RECORDING
 *                                                  │     │ │
 *                                       normal stop│     │ │error
 *                                                  ▼     │ ▼
 *                                              FINALIZING│ FAILED
 *                                                  │  │  │
 *                                       finalize ok│  │  │recovery
 *                                                  ▼  ▼  ▼
 *                                              COMPLETED ←┘
 *                                              FAILED ←(finalize err)
 * ```
 *
 * The recovery shortcut RECORDING → COMPLETED is allowed because
 * [FinalizeFromJournal] takes that path when bringing a crashed
 * session to terminal via journal replay (T059); forbidding it would
 * break existing behavior.
 *
 * Companion `fromWire` mirrors the lap-schemas [com.lap.schemas.v1.SourceTag]
 * convention. T075 ships the type only — refactoring callers from
 * raw strings to `RecordingState` is a follow-up.
 */
enum class RecordingState(val wireValue: String) {
    IDLE("idle"),
    ARMED("armed"),
    RECORDING("recording"),
    FINALIZING("finalizing"),
    COMPLETED("completed"),
    FAILED("failed"),
    ;

    val isTerminal: Boolean
        get() = this == COMPLETED || this == FAILED

    fun canTransitionTo(next: RecordingState): Boolean = next in allowedNextStates()

    private fun allowedNextStates(): Set<RecordingState> = when (this) {
        IDLE -> setOf(ARMED)
        ARMED -> setOf(IDLE, RECORDING)
        RECORDING -> setOf(FINALIZING, COMPLETED, FAILED)
        FINALIZING -> setOf(COMPLETED, FAILED)
        COMPLETED, FAILED -> emptySet()
    }

    companion object {
        fun fromWire(value: String): RecordingState? = entries.firstOrNull { it.wireValue == value }
    }
}
