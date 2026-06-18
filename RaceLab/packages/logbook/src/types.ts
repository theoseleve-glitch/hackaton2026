/**
 * Layer 1 — the Run Log, now backed by the canonical schema `RunEntry`
 * (packages/schema). The logbook no longer owns a parallel RunEntry shape:
 * `RunEntry` IS the schema RunEntry, and `LogbookState` is `{ runs: RunEntry[] }`.
 *
 * The schema moved timing under a discriminated `RunTiming` union (read via
 * `effectiveTiming(run)`), driver feel under `RunEntry.driver`
 * (feeling_1to10 / fatigue_1to5 / confidence_1to5), the autonomy test up to the
 * run level (`RunEntry.autonomy_test`), and per-corner notes onto
 * `RunFeedback.turns`. The accessors below are the ONE place that knows those
 * field names, so insights/screens read through them instead of re-deriving.
 */

import type {
  Bumpiness,
  DriverState,
  FeedbackTag,
  Grip,
  Outcome,
  RunConditions,
  RunEntry,
  RunFeedback,
  RunResult,
  RunType,
  Sky,
  TimingStats,
  TrackEvolution,
  TrackSnapshot,
  Traffic,
  TyreSet,
  TyreWear,
} from "../../schema/src/index";
import { effectiveTiming } from "../../schema/src/index";

export type {
  Bumpiness,
  DriverState,
  FeedbackTag,
  Grip,
  Outcome,
  RunConditions,
  RunEntry,
  RunFeedback,
  RunResult,
  RunType,
  Sky,
  TimingStats,
  TrackSnapshot,
  TrackEvolution,
  Traffic,
  TyreSet,
  TyreWear,
};

/** A logged run's TrackInfo is the schema TrackSnapshot (name/surface/indoor/…). */
export type TrackInfo = TrackSnapshot;

export interface LogbookState {
  runs: RunEntry[]; // chronological, oldest first
}

// ── timing accessors (the cascade's single source of truth) ─────────────────

/** Best lap (s) — laps-branch is derived via lapStats, summary echoes its field. */
export function runBestLap(run: RunEntry): number | undefined {
  return effectiveTiming(run)?.best_lap_s;
}
export function runAvgLap(run: RunEntry): number | undefined {
  return effectiveTiming(run)?.avg_lap_s;
}
export function runConsistency(run: RunEntry): number | undefined {
  return effectiveTiming(run)?.consistency_pct;
}
export function runLapCount(run: RunEntry): number | undefined {
  return effectiveTiming(run)?.lap_count;
}

/** Position/entrants/mistakes/traffic live on the SUMMARY branch's RunResult
 *  (non-timing facts a manual summary carries). */
export function runResultFacts(run: RunEntry): RunResult | undefined {
  if (run.timing === undefined) return undefined;
  return run.timing.kind === "summary" ? run.timing.result : run.timing.result;
}
export function runPosition(run: RunEntry): number | undefined {
  return runResultFacts(run)?.position;
}
export function runEntrants(run: RunEntry): number | undefined {
  return runResultFacts(run)?.entrants;
}
/** Summary-branch raw lap list (theo's laps_list — preserved on round-trip). */
export function runLapsList(run: RunEntry): readonly number[] | undefined {
  if (run.timing?.kind === "summary") return run.timing.result.laps_list;
  if (run.timing?.kind === "laps") return run.timing.laps.map((l) => l.t_s);
  return undefined;
}

/** Run-level autonomy test (schema moved it off `result`). */
export function runAutonomy(run: RunEntry): { time_s?: number; laps?: number } | undefined {
  return run.autonomy_test;
}

/** Driver feel (0–100 slider is stored as Rating1to10 on driver.feeling_1to10). */
export function runFeeling(run: RunEntry): number | undefined {
  return run.driver?.feeling_1to10;
}
export function runFatigue(run: RunEntry): number | undefined {
  return run.driver?.fatigue_1to5;
}
export function runConfidence(run: RunEntry): number | undefined {
  return run.driver?.confidence_1to5;
}
