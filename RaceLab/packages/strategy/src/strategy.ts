import { detectTyreCliff } from "./cliff";

/**
 * D30 — deterministic race/pit strategy math. RC timed-race format: the
 * clock runs for race_length_s and you complete the lap you are on when it
 * expires, so total_laps is the SMALLEST lap count whose clock time (start
 * buffer + laps + pit stops) reaches the race length. Stints are fuel-capped
 * (laps per tank minus a safety margin) unless a tyre cliff lands inside the
 * fuel window — then the tyres decide the pits. Pure math, zero deps.
 */

export interface FuelSpec {
  /** tank capacity in cc — used with burn_cc_per_lap when tank_burn_s is absent */
  tank_cc?: number;
  burn_cc_per_lap?: number;
  /** seconds a full tank lasts — takes precedence over the cc pair */
  tank_burn_s?: number;
}

export interface StrategyInputs {
  race_length_s: number;
  race_type: "sprint" | "endurance";
  avg_lap_s: number;
  /** seconds lost to the start before lap pace settles (default 2) */
  start_buffer_s?: number;
  fuel: FuelSpec;
  /** seconds lost per stop (in + refuel + out) */
  pit_loss_s: number;
  /** laps of fuel kept as safety buffer (default 1) */
  margin_laps?: number;
  /** optional lap series for tyre-cliff detection (endurance only) */
  lap_times?: number[];
}

export interface Stint {
  laps: number;
  pit_after?: boolean;
}

export interface PitPlan {
  total_laps: number;
  stint_max_laps: number;
  stints: Stint[];
  stops: number;
  total_time_s: number;
  cliff_lap?: number;
  pit_driver: "fuel" | "tyre_cliff";
  /** human-readable reasoning, every number explained */
  notes: string[];
}

const DEFAULT_START_BUFFER_S = 2;
const DEFAULT_MARGIN_LAPS = 1;

export function computePitPlan(inputs: StrategyInputs): PitPlan {
  validate(inputs);
  const lapsPerTank = lapsPerTankOf(inputs);
  const margin = inputs.margin_laps ?? DEFAULT_MARGIN_LAPS;
  const fuelCap = Math.max(1, lapsPerTank - margin);
  const notes: string[] = [
    fuelNote(inputs, lapsPerTank),
    `Stint cap: ${lapsPerTank} laps per tank - ${margin} lap(s) of fuel margin = ${fuelCap} laps.`,
  ];

  let cap = fuelCap;
  let pitDriver: PitPlan["pit_driver"] = "fuel";
  let cliffLap: number | undefined;
  if (inputs.race_type === "endurance" && inputs.lap_times !== undefined) {
    const cliff = detectTyreCliff(inputs.lap_times);
    cliffLap = cliff.cliff_lap;
    if (cliff.cliff_lap !== undefined && cliff.cliff_lap < fuelCap) {
      cap = cliff.cliff_lap;
      pitDriver = "tyre_cliff";
      notes.push(
        `Tyre cliff at lap ${cliff.cliff_lap} (degrading ${cliff.degradation_s_per_lap.toFixed(2)}s/lap) lands inside the ${fuelCap}-lap fuel window — tyres, not fuel, decide the pits: stints capped at ${cliff.cliff_lap} laps.`,
      );
    } else if (cliff.cliff_lap !== undefined) {
      notes.push(
        `Tyre cliff at lap ${cliff.cliff_lap} is outside the ${fuelCap}-lap fuel window — fuel still decides the pits.`,
      );
    }
  }

  return buildPlan(inputs, cap, pitDriver, cliffLap, notes);
}

/**
 * Endurance only: alternative plans stretching the stint cap by +1 and +2
 * laps — eating into margin_laps, never beyond laps_per_tank. Only options
 * that actually REDUCE stops are returned. Sprint: always [].
 */
export function stretchOptions(plan: PitPlan, inputs: StrategyInputs): PitPlan[] {
  if (inputs.race_type !== "endurance") return [];
  validate(inputs);
  const lapsPerTank = lapsPerTankOf(inputs);
  const options: PitPlan[] = [];
  const seen = new Set<number>([plan.stint_max_laps]);
  for (const extend of [1, 2]) {
    const cap = Math.min(plan.stint_max_laps + extend, lapsPerTank);
    if (seen.has(cap)) continue; // clamped onto the base cap or a prior option
    seen.add(cap);
    const notes: string[] = [
      `Stretch: stint cap ${plan.stint_max_laps} -> ${cap} laps; fuel margin left: ${lapsPerTank - cap} lap(s) of a ${lapsPerTank}-lap tank.`,
    ];
    const option = buildPlan(inputs, cap, "fuel", plan.cliff_lap, notes);
    const saved = plan.stops - option.stops;
    if (saved <= 0) continue;
    option.notes.push(
      `Saves ${saved} stop(s) = ${saved * inputs.pit_loss_s}s of pit loss (${plan.stops} -> ${option.stops} stops).`,
    );
    options.push(option);
  }
  return options;
}

/** Lap count, stints and totals for a given stint cap; appends its reasoning to `notes`. */
function buildPlan(
  inputs: StrategyInputs,
  cap: number,
  pit_driver: PitPlan["pit_driver"],
  cliff_lap: number | undefined,
  notes: string[],
): PitPlan {
  const startBuffer = inputs.start_buffer_s ?? DEFAULT_START_BUFFER_S;
  const time = (laps: number): number =>
    startBuffer + laps * inputs.avg_lap_s + (Math.ceil(laps / cap) - 1) * inputs.pit_loss_s;

  let laps = 1;
  while (time(laps) < inputs.race_length_s) laps++;
  const stops = Math.ceil(laps / cap) - 1;
  const total_time_s = time(laps);
  const stints = distribute(laps, stops + 1);

  notes.push(
    `Race: smallest lap count whose clock time reaches ${inputs.race_length_s}s (you complete the lap you are on) -> ${laps} laps: ${startBuffer}s start + ${laps} x ${inputs.avg_lap_s}s + ${stops} stop(s) x ${inputs.pit_loss_s}s = ${total_time_s}s.`,
    `Stops: ceil(${laps} laps / ${cap}-lap stint cap) - 1 = ${stops}.`,
    `Stints: ${stints.map((s) => s.laps).join(" + ")} = ${laps} laps, split evenly, none over ${cap}.`,
  );
  return {
    total_laps: laps,
    stint_max_laps: cap,
    stints,
    stops,
    total_time_s,
    ...(cliff_lap !== undefined ? { cliff_lap } : {}),
    pit_driver,
    notes,
  };
}

/** Spread laps over stints as evenly as possible (longer stints first).
 *  stintCount = ceil(laps / cap), so no stint can exceed the cap. */
function distribute(totalLaps: number, stintCount: number): Stint[] {
  const base = Math.floor(totalLaps / stintCount);
  const extra = totalLaps % stintCount;
  return Array.from({ length: stintCount }, (_, i) => {
    const laps = base + (i < extra ? 1 : 0);
    return i < stintCount - 1 ? { laps, pit_after: true } : { laps };
  });
}

function lapsPerTankOf(inputs: StrategyInputs): number {
  const f = inputs.fuel;
  if (f.tank_burn_s !== undefined && f.tank_burn_s > 0) {
    return Math.floor(f.tank_burn_s / inputs.avg_lap_s);
  }
  if (
    f.tank_cc !== undefined &&
    f.tank_cc > 0 &&
    f.burn_cc_per_lap !== undefined &&
    f.burn_cc_per_lap > 0
  ) {
    return Math.floor(f.tank_cc / f.burn_cc_per_lap);
  }
  throw new Error(
    "Unusable fuel spec: provide tank_burn_s, or both tank_cc and burn_cc_per_lap (all > 0).",
  );
}

function fuelNote(inputs: StrategyInputs, lapsPerTank: number): string {
  const f = inputs.fuel;
  return f.tank_burn_s !== undefined && f.tank_burn_s > 0
    ? `Fuel: floor(${f.tank_burn_s}s tank burn / ${inputs.avg_lap_s}s avg lap) = ${lapsPerTank} laps per tank.`
    : `Fuel: floor(${f.tank_cc}cc tank / ${f.burn_cc_per_lap}cc per lap) = ${lapsPerTank} laps per tank.`;
}

function validate(inputs: StrategyInputs): void {
  if (!(inputs.race_length_s > 0)) {
    throw new Error(`race_length_s must be > 0 (got ${inputs.race_length_s}).`);
  }
  if (!(inputs.avg_lap_s > 0)) {
    throw new Error(`avg_lap_s must be > 0 (got ${inputs.avg_lap_s}).`);
  }
  lapsPerTankOf(inputs); // throws when the fuel spec is unusable
}
