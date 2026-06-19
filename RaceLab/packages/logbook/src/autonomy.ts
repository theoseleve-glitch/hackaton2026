import { runAutonomy, runLapCount } from "./types";
import type { RunEntry } from "./types";
import { fuelStats } from "../../schema/src/index";

/**
 * Race-strategy autonomy from logged run-until-dry tests (v3). A PRACTICE run
 * carrying a run-level autonomy_test.time_s is a MEASURED "seconds a full tank
 * lasts"; bestAutonomy picks the most trustworthy one for a venue. Pure
 * function — runs are taken in logbook order (oldest first), so the last match
 * is the most recent. (Schema moved autonomy_test to the run level.)
 */

export interface BestAutonomyOpts {
  track_id?: string;
  track_name?: string;
  grip?: string;
}

/**
 * Most recent PRACTICE run with a measured autonomy_test.time_s at the SAME
 * track — matched by track_id when given (or by track name). Preference order:
 * same track AND same conditions.grip first, then same track any grip, then
 * undefined. NEVER cross-track.
 */
export function bestAutonomy(
  runs: RunEntry[],
  opts: { track_id?: string; track_name?: string; grip?: string },
): { time_s: number; from_run_id: string } | undefined {
  const candidates = runs.filter(
    (r) => r.type === "practice" && typeof runAutonomy(r)?.time_s === "number" && sameTrack(r, opts),
  );
  const newest = (list: RunEntry[]): RunEntry | undefined => list[list.length - 1];
  const chosen =
    (opts.grip !== undefined
      ? newest(candidates.filter((r) => r.conditions.grip === opts.grip))
      : undefined) ?? newest(candidates);
  const time_s = chosen !== undefined ? runAutonomy(chosen)?.time_s : undefined;
  return chosen !== undefined && time_s !== undefined
    ? { time_s, from_run_id: chosen.id }
    : undefined;
}

/** Same venue: track_id match when the caller gives one, else name match.
 *  No track in opts → nothing matches (cross-track is never an answer). */
function sameTrack(run: RunEntry, opts: BestAutonomyOpts): boolean {
  if (opts.track_id !== undefined && run.track_id === opts.track_id) return true;
  return opts.track_name !== undefined && run.track.name === opts.track_name;
}

// ── F1 — consumption-history derivation (feeds strategy's consumption_based) ──

/** Mean/std of fuel burn (cc-per-lap) across the selected runs, plus the tank
 *  capacity to turn a rate into a range. Strategy's consumption_based input. */
export interface ConsumptionHistory {
  mean_cc_per_lap: number;
  std_dev_cc_per_lap: number;
  runs_sampled: number;
  tank_cc: number;
}

/**
 * F1 — derive a consumption estimate from a set of logged runs. Each run that
 * carries BOTH a clean fuel log (consumed_cc) and a lap count yields one
 * cc-per-lap sample via the schema `fuelStats` helper; the mean and population
 * standard deviation are computed across those samples. The tank capacity is the
 * most recent run's logged `fuel.tank_cc` (runs are oldest-first, so the last
 * one with a tank is the freshest). Pure + deterministic; runs missing fuel or
 * laps are silently dropped (never poison the estimate). Returns undefined when
 * fewer than one clean sample, or no tank capacity, is available — the strategy
 * then falls back to the single autonomy test.
 */
export function deriveConsumption(runs: readonly RunEntry[]): ConsumptionHistory | undefined {
  const samples: number[] = [];
  let tank_cc: number | undefined;
  for (const r of runs) {
    const laps = runLapCount(r);
    const stats = fuelStats(r.fuel, laps);
    if (stats.cc_per_lap !== undefined && Number.isFinite(stats.cc_per_lap) && stats.cc_per_lap > 0) {
      samples.push(stats.cc_per_lap);
    }
    // freshest logged tank capacity wins (oldest-first order → last one is newest)
    if (r.fuel?.tank_cc !== undefined && Number.isFinite(r.fuel.tank_cc) && r.fuel.tank_cc > 0) {
      tank_cc = r.fuel.tank_cc;
    }
  }
  if (samples.length < 1 || tank_cc === undefined) return undefined;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
  const std = Math.sqrt(variance);
  if (!Number.isFinite(mean) || !(mean > 0) || !Number.isFinite(std)) return undefined;
  return {
    mean_cc_per_lap: Math.round(mean * 100) / 100,
    std_dev_cc_per_lap: Math.round(std * 100) / 100,
    runs_sampled: samples.length,
    tank_cc,
  };
}
