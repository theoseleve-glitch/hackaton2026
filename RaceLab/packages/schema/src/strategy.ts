/**
 * Strategy — deterministic, pure planning (D18). Outputs are computed values,
 * not stored entities. Every plan carries an `assumptions` echo (same
 * explainability principle as the engine's conditions echo) and every tyre-
 * cliff claim carries evidence rows — grounded or silent, never an
 * unauditable boolean.
 */

import type { Confidence } from "./vocab";
import { deepFreeze, isFiniteNum, round } from "./vocab";
import type { LapTime } from "./runs";

export interface PitStop {
  lap: number; // pit at the end of this lap
  time_s: number; // race time at the stop (laps driven + prior pit losses)
  fuel_cc: number; // refill amount
}

export interface StintPlan {
  stint_n: number; // 1-based
  start_lap: number;
  end_lap: number;
  fuel_cc: number; // fuel needed for the stint incl. reserve
}

export interface RacePlanInput {
  race_duration_s: number; // mains are time-based
  avg_lap_s: number;
  tank_cc: number;
  cc_per_lap: number; // from fuelStats over logged runs — caller computes, schema plans
  pit_lane_loss_s: number; // time lost per stop, >= 0
  fuel_reserve_cc?: number; // safety margin per stint, >= 0 (default 0)
  tyre_cliff_lap?: number; // from TyreCliffReport — caps stint length when earlier than the fuel window
}

export interface RacePlan {
  laps_estimate: number;
  stints: readonly StintPlan[];
  stops: readonly PitStop[];
  total_fuel_cc: number;
  margin_laps_per_stint: number; // laps of fuel still in the tank beyond the longest stint
  assumptions: readonly string[]; // input echo — deterministic & explainable, never feels like magic
}

export type RacePlanRejectReason = "invalid_input" | "tank_too_small";

/** Deterministic fuel/stint planner. Even-ish stint distribution (no tiny last
 *  stint); the tyre cliff caps stint length when it bites before the fuel window. */
export function planRace(
  input: RacePlanInput,
): { ok: true; plan: RacePlan } | { ok: false; reason: RacePlanRejectReason } {
  const reserve = input.fuel_reserve_cc ?? 0;
  if (
    !isFiniteNum(input.race_duration_s) ||
    !isFiniteNum(input.avg_lap_s) ||
    !isFiniteNum(input.tank_cc) ||
    !isFiniteNum(input.cc_per_lap) ||
    !isFiniteNum(input.pit_lane_loss_s) ||
    !isFiniteNum(reserve) ||
    (input.tyre_cliff_lap !== undefined && !isFiniteNum(input.tyre_cliff_lap))
  ) {
    return { ok: false, reason: "invalid_input" };
  }
  if (
    input.race_duration_s <= 0 ||
    input.avg_lap_s <= 0 ||
    input.tank_cc <= 0 ||
    input.cc_per_lap <= 0 ||
    input.pit_lane_loss_s < 0 ||
    reserve < 0 ||
    (input.tyre_cliff_lap !== undefined && (!Number.isInteger(input.tyre_cliff_lap) || input.tyre_cliff_lap < 1))
  ) {
    return { ok: false, reason: "invalid_input" };
  }

  const laps_estimate = Math.ceil(input.race_duration_s / input.avg_lap_s);
  const usable_cc = input.tank_cc - reserve;
  const laps_per_tank = Math.floor(usable_cc / input.cc_per_lap);
  if (laps_per_tank < 1) return { ok: false, reason: "tank_too_small" };

  const stint_cap =
    input.tyre_cliff_lap !== undefined ? Math.min(laps_per_tank, input.tyre_cliff_lap) : laps_per_tank;

  const n_stints = Math.ceil(laps_estimate / stint_cap);
  const base = Math.floor(laps_estimate / n_stints);
  const extra = laps_estimate % n_stints; // first `extra` stints get base+1 laps

  const stints: StintPlan[] = [];
  const stops: PitStop[] = [];
  let lap_cursor = 0;
  let total_fuel_cc = 0;
  let longest_stint = 0;
  for (let i = 1; i <= n_stints; i++) {
    const stint_laps = base + (i <= extra ? 1 : 0);
    const fuel_cc = round(stint_laps * input.cc_per_lap + reserve, 1);
    stints.push({ stint_n: i, start_lap: lap_cursor + 1, end_lap: lap_cursor + stint_laps, fuel_cc });
    total_fuel_cc += fuel_cc;
    if (stint_laps > longest_stint) longest_stint = stint_laps;
    lap_cursor += stint_laps;
    if (i < n_stints) {
      stops.push({
        lap: lap_cursor,
        time_s: round(lap_cursor * input.avg_lap_s + (i - 1) * input.pit_lane_loss_s, 1),
        fuel_cc: round((base + (i + 1 <= extra ? 1 : 0)) * input.cc_per_lap + reserve, 1),
      });
    }
  }

  const margin_laps_per_stint = Math.floor(input.tank_cc / input.cc_per_lap) - longest_stint;

  const assumptions = [
    `race ${input.race_duration_s}s @ ${input.avg_lap_s}s/lap -> ${laps_estimate} laps`,
    `tank ${input.tank_cc}cc, ${input.cc_per_lap}cc/lap, reserve ${reserve}cc -> ${laps_per_tank} laps/stint max`,
    ...(input.tyre_cliff_lap !== undefined ? [`tyre cliff caps stints at ${input.tyre_cliff_lap} laps`] : []),
    `pit lane loss ${input.pit_lane_loss_s}s per stop`,
    `${n_stints} stint(s), ${stops.length} stop(s)`,
  ];

  return {
    ok: true,
    plan: deepFreeze({
      laps_estimate,
      stints,
      stops,
      total_fuel_cc: round(total_fuel_cc, 1),
      margin_laps_per_stint,
      assumptions,
    }),
  };
}

export interface TyreCliffEvidence {
  lap_n: number;
  delta_s: number; // lap time minus baseline
  window_avg_s: number; // rolling window average ending at this lap
}

export interface TyreCliffReport {
  detected: boolean;
  cliff_lap?: number; // present iff detected — first lap of the sustained slow suffix
  confidence: Confidence;
  evidence: readonly TyreCliffEvidence[];
}

export interface TyreCliffOptions {
  min_laps?: number; // default 8 — below this, no claim is made (grounded or silent)
  threshold_s?: number; // default 0.5 — slowdown vs baseline that counts as degradation
  window?: number; // default 3 — consecutive slow laps required to call it sustained
}

/** Deterministic cliff detector: baseline = avg of the best `window` laps in
 *  the first half; the cliff is the start of the longest SUFFIX of consecutive
 *  laps all >= baseline + threshold, at least `window` laps long. Confidence:
 *  high when the suffix averages >= 2x threshold over baseline, else medium. */
export function detectTyreCliff(
  laps: readonly LapTime[],
  opts?: TyreCliffOptions,
): TyreCliffReport {
  const min_laps = opts?.min_laps ?? 8;
  const threshold = opts?.threshold_s ?? 0.5;
  const window = opts?.window ?? 3;

  const silent: TyreCliffReport = deepFreeze({ detected: false, confidence: "low", evidence: [] });
  if (laps.length < Math.max(min_laps, window + 1)) return silent;
  if (!laps.every((l) => isFiniteNum(l.t_s) && l.t_s > 0)) return silent;

  // Baseline = best laps from the FIRST HALF only. The pool is CAPPED at
  // floor(len/2): a large `window` must never reach into the degraded second
  // half and inflate the baseline (which would mask a real cliff). We take the
  // best min(window, firstHalf.length) laps and divide by the actual count
  // taken — never by `window` when fewer laps were available.
  const firstHalf = laps.slice(0, Math.floor(laps.length / 2));
  const take = Math.min(window, firstHalf.length);
  const baseline =
    firstHalf.map((l) => l.t_s).sort((a, b) => a - b).slice(0, take).reduce((a, b) => a + b, 0) / take;

  // Longest suffix of consecutive laps all slower than baseline + threshold.
  let suffixStart = laps.length;
  for (let i = laps.length - 1; i >= 0; i--) {
    if (laps[i].t_s >= baseline + threshold) suffixStart = i;
    else break;
  }
  const suffixLen = laps.length - suffixStart;
  if (suffixLen < window || suffixStart === 0) return silent;

  const evidence: TyreCliffEvidence[] = [];
  let deltaSum = 0;
  for (let i = suffixStart; i < laps.length; i++) {
    const from = Math.max(0, i - window + 1);
    const win = laps.slice(from, i + 1);
    const winAvg = win.reduce((a, l) => a + l.t_s, 0) / win.length;
    const delta = laps[i].t_s - baseline;
    deltaSum += delta;
    evidence.push({ lap_n: laps[i].n, delta_s: round(delta, 3), window_avg_s: round(winAvg, 3) });
  }
  const avgDelta = deltaSum / suffixLen;

  return deepFreeze({
    detected: true,
    cliff_lap: laps[suffixStart].n,
    confidence: (avgDelta >= 2 * threshold ? "high" : "medium") as Confidence,
    evidence,
  });
}
