import { detectTyreCliff } from "./cliff";

/**
 * D30 v2 — time-first race/pit strategy. A pit strategy talks in TIME before
 * refueling: autonomy_s (seconds a full tank lasts at race pace — measured
 * by the logbook run-until-dry test) minus a safety margin caps every stint.
 * Laps are used INTERNALLY only — RC timed-race format: you box at the end
 * of a lap and you finish the lap you are on when the clock expires — but
 * every public number is seconds. Pure math, zero deps; notes[] explain
 * every number in pilot language (they ARE the product).
 */

export interface StrategyInputs {
  race_length_s: number;
  race_type: "sprint" | "endurance";
  avg_lap_s: number;
  /** seconds a full tank lasts at race pace (logbook autonomy test) */
  autonomy_s: number;
  /** seconds lost per stop (in + refuel + out) */
  pit_loss_s: number;
  /** safety margin per stint, seconds; default = one avg lap */
  margin_s?: number;
  /** endurance only: lap series for tyre-cliff detection */
  lap_times?: number[];
  /** R6-3 — true when autonomy_s is an ESTIMATE, not a measured full-tank run.
   *  The math is unchanged, but the notes say so up front and tell the racer to
   *  log a real run, so the plan never implies false precision. */
  autonomy_estimated?: boolean;
}

export interface Stint {
  duration_s: number;
  pit_after: boolean;
}

export interface PitPlan {
  stops: number;
  /** the applied stint cap in seconds: autonomy_s - margin_s, unless a tyre
   *  cliff lands inside that window (then the cliff time) */
  stint_max_s: number;
  stints: Stint[];
  /** race-clock moments to box, cumulative (driving + prior pit_loss_s) */
  pit_at_s: number[];
  total_time_s: number;
  pit_driver: "fuel" | "tyre_cliff";
  cliff_lap?: number;
  /** plain-language reasoning — these ARE the product */
  notes: string[];
}

export function computePitPlan(inputs: StrategyInputs): PitPlan {
  validate(inputs);
  const margin = inputs.margin_s ?? inputs.avg_lap_s;
  const fuelCap = inputs.autonomy_s - margin;
  if (!(fuelCap > 0)) {
    throw new Error(
      `stint_max_s = autonomy_s - margin_s = ${inputs.autonomy_s} - ${margin} = ${fuelCap}s — must be > 0: the safety margin eats the whole tank.`,
    );
  }
  const notes: string[] = [];
  // R6-3 — no measured fuel run: say it's an estimate and what to log, BEFORE
  // any number, so the plan never implies false precision the racer didn't give.
  if (inputs.autonomy_estimated) {
    notes.push(
      `Heads up: no full-tank run is logged yet, so this assumes a fuel autonomy of ~${mmss(inputs.autonomy_s)} (${inputs.autonomy_s}s) — it's an ESTIMATE, not measured. Log one run-until-dry on a full tank and re-plan for a real number; until then treat the stop count as a rough guide and keep a lap of extra reserve.`,
    );
  }
  notes.push(
    `Full tank lasts ~${mmss(inputs.autonomy_s)} (${inputs.autonomy_s}s)${inputs.autonomy_estimated ? " (estimated)" : ""} at your ${inputs.avg_lap_s.toFixed(1)}s pace.`,
    `Boxing every ${mmss(fuelCap)} (${fuelCap}s) — that's full autonomy minus a ${margin}s safety reserve${inputs.margin_s === undefined ? " (one average lap, the default)" : ""}, held back against fuel-test variance and slow stops.`,
  );

  let cap = fuelCap;
  let pitDriver: PitPlan["pit_driver"] = "fuel";
  let cliffLap: number | undefined;
  // R6-3 — defer the lever-rationale notes ("Fuel/Tyres set the stops") until we
  // know the plan actually HAS stops: on a single-tank, no-pit race they'd be
  // misleading. Collect them here and append only if stops > 0.
  const leverNotes: string[] = [];
  if (inputs.race_type === "endurance" && inputs.lap_times !== undefined) {
    const cliff = detectTyreCliff(inputs.lap_times);
    cliffLap = cliff.cliff_lap;
    if (cliff.cliff_lap !== undefined) {
      const cliffTime = cliff.cliff_lap * inputs.avg_lap_s;
      if (cliffTime < fuelCap) {
        cap = cliffTime;
        pitDriver = "tyre_cliff";
        leverNotes.push(
          `Tyres fall off a cliff after ~${mmss(cliffTime)} (lap ${cliff.cliff_lap}, ~${cliff.degradation_s_per_lap.toFixed(2)}s/lap) — that's ${mmss(cliffTime)} vs the ${mmss(fuelCap)} fuel window, so tyres run out of grip first. Box every ${mmss(cliffTime)} to stay ahead of the cliff.`,
        );
        // R4-1: the tyres, not the tank, set the stops here — a bigger tank
        // wouldn't move them. Make that tradeoff explicit so nobody chases fuel.
        leverNotes.push(
          `Tyres, not fuel, set the stops here: the cliff lands ${mmss(fuelCap - cliffTime)} (${Math.round(fuelCap - cliffTime)}s) BEFORE the tank runs low — a bigger tank wouldn't help, you'd box on grip anyway. Win the stops by making the tyres last, not by carrying more fuel.`,
        );
      } else {
        leverNotes.push(
          `Tyre cliff at ~${mmss(cliffTime)} (lap ${cliff.cliff_lap}) sits outside the ${fuelCap}s fuel window — fuel still decides the pits.`,
        );
        // R4-1: fuel sets the stops — the tyres outlast the tank, so the lever
        // that moves the stop count is tank size / consumption, not tyre life.
        leverNotes.push(
          `Fuel, not tyres, sets the stops here: the tank runs low ${mmss(cliffTime - fuelCap)} (${Math.round(cliffTime - fuelCap)}s) BEFORE the tyres cliff — to cut a stop you need more range (bigger tank or leaner consumption), not more tyre life.`,
        );
      }
    }
  }
  // R4-1: when fuel alone decides (sprint, or endurance with no cliff data),
  // still name the driver so the racer knows which lever moves the stop count.
  if (pitDriver === "fuel" && cliffLap === undefined) {
    leverNotes.push(
      `Fuel sets the stops: the tank is the binding limit here (no tyre cliff in the window), so the lever that changes the stop count is range — a bigger tank or leaner consumption — not tyre life.`,
    );
  }

  const plan = buildPlan(inputs, cap, pitDriver, cliffLap, notes);
  // R6-3 — single-tank / no-pit race: a clear, dedicated line instead of the
  // fuel/tyre lever rationale (which only makes sense when you actually stop).
  if (plan.stops === 0) {
    plan.notes.push(
      `One tank covers the whole race — no stop needed. Just manage the tyres and bring it home; the fuel window (${mmss(fuelCap)}) is longer than the race, so the pit lane never comes into it.`,
    );
  } else {
    plan.notes.push(...leverNotes);
  }
  return plan;
}

/**
 * Endurance only: alternative plans stretching the stint cap by +1 and +2
 * average laps INTO the safety margin — never beyond autonomy_s. Only
 * options that actually REDUCE stops are returned; their notes state the
 * time saved and the remaining margin in seconds. Sprint: always [].
 */
export function stretchOptions(plan: PitPlan, inputs: StrategyInputs): PitPlan[] {
  if (inputs.race_type !== "endurance") return [];
  validate(inputs);
  const options: PitPlan[] = [];
  const seen = new Set<number>([plan.stint_max_s]);
  for (const extraLaps of [1, 2]) {
    const cap = Math.min(plan.stint_max_s + extraLaps * inputs.avg_lap_s, inputs.autonomy_s);
    if (seen.has(cap)) continue; // clamped onto the base cap or a prior option
    seen.add(cap);
    const remaining = inputs.autonomy_s - cap;
    const notes: string[] = [
      `Stretch: box every ${mmss(cap)} (${cap}s) instead of ${mmss(plan.stint_max_s)} (${plan.stint_max_s}s) — eating into the safety margin.`,
    ];
    const option = buildPlan(inputs, cap, "fuel", plan.cliff_lap, notes);
    const saved = plan.stops - option.stops;
    if (saved <= 0) continue;
    option.notes.push(
      `Saves ${saved} stop(s) = ${saved * inputs.pit_loss_s}s of pit loss (${plan.stops} -> ${option.stops} stops); remaining margin: ${remaining}s of tank.`,
    );
    // R4-1: state WHY this stretch beats the base plan scientifically — the
    // stop-count vs stint-length tradeoff, decided by where the tyre cliff is.
    // base stint length vs this one (avg per stint, seconds), so the cost of the
    // saved stop is legible: you carry the tyres ~Ns longer each stint.
    const baseStint = plan.stint_max_s;
    const longerBy = cap - baseStint;
    const timeSaved = saved * inputs.pit_loss_s;
    const cliffLate = plan.pit_driver === "fuel"; // fuel-bound base ⇒ no cliff inside the window
    option.notes.push(
      `Why it beats the ${plan.stops}-stop plan: one fewer trip down pit lane saves ${mmss(timeSaved)} (${timeSaved}s) of standing time, at the cost of running each stint ${mmss(longerBy)} (${Math.round(longerBy)}s) longer on the same tyres. ${
        cliffLate
          ? "Worth it here because there's no tyre cliff inside the fuel window — the rubber holds, so trading stops for stint length is a clean net gain."
          : "Weigh it against the cliff: only take the stretch if the tyres still have grip that deep into the stint."
      }`,
    );
    options.push(option);
  }
  return options;
}

/** Stints, pit moments and totals for a given stint cap (seconds); appends
 *  its reasoning to `notes`. Laps are INTERNAL: you box at the end of a lap,
 *  so stints are whole laps under the cap, and the race lap count is the
 *  smallest whose clock time (driving + pit stops) reaches race_length_s —
 *  you finish the lap you are on. */
function buildPlan(
  inputs: StrategyInputs,
  cap_s: number,
  pit_driver: PitPlan["pit_driver"],
  cliff_lap: number | undefined,
  notes: string[],
): PitPlan {
  // Whole laps per stint; a stint is never shorter than one lap (you cannot
  // box mid-lap), even if the cap is tighter than a single lap.
  const lapCap = Math.max(1, Math.floor(cap_s / inputs.avg_lap_s));
  const clock = (laps: number): number =>
    laps * inputs.avg_lap_s + (Math.ceil(laps / lapCap) - 1) * inputs.pit_loss_s;

  let laps = 1;
  while (clock(laps) < inputs.race_length_s) laps++;
  const stintCount = Math.ceil(laps / lapCap);
  const stops = stintCount - 1;
  const stints: Stint[] = distribute(laps, stintCount).map((n, i) => ({
    duration_s: n * inputs.avg_lap_s,
    pit_after: i < stintCount - 1,
  }));

  const pit_at_s: number[] = [];
  let t = 0;
  for (let i = 0; i < stops; i++) {
    t += stints[i].duration_s;
    pit_at_s.push(t);
    t += inputs.pit_loss_s;
  }
  const total_time_s = laps * inputs.avg_lap_s + stops * inputs.pit_loss_s;

  notes.push(
    `${mmss(inputs.race_length_s)} race and you finish the lap you're on: ~${laps} laps = ${mmss(laps * inputs.avg_lap_s)} (${laps * inputs.avg_lap_s}s) of driving.`,
    stops === 0
      ? `Zero pit loss — you run flag to flag on one tank; total ~${mmss(total_time_s)} (${total_time_s}s).`
      : `${stops} stop(s) x ${inputs.pit_loss_s}s = ${mmss(stops * inputs.pit_loss_s)} (${stops * inputs.pit_loss_s}s) lost in the pits; total ~${mmss(total_time_s)} (${total_time_s}s).`,
  );
  if (stops > 0) {
    notes.push(
      `Stints: ${stints.map((s) => mmss(s.duration_s)).join(", ")} (all under the ${mmss(cap_s)} cap). Box on the race clock at ${pit_at_s.map(mmss).join(", ")}.`,
    );
  }

  return {
    stops,
    stint_max_s: cap_s,
    stints,
    pit_at_s,
    total_time_s,
    pit_driver,
    ...(cliff_lap !== undefined ? { cliff_lap } : {}),
    notes,
  };
}

/** Spread laps over stints as evenly as possible (longer stints first).
 *  stintCount = ceil(laps / lapCap), so no stint can exceed the cap. */
function distribute(totalLaps: number, stintCount: number): number[] {
  const base = Math.floor(totalLaps / stintCount);
  const extra = totalLaps % stintCount;
  return Array.from({ length: stintCount }, (_, i) => base + (i < extra ? 1 : 0));
}

/** "6:25" for 385s (rounded to the second). */
function mmss(s: number): string {
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  return `${m}:${String(total - m * 60).padStart(2, "0")}`;
}

function validate(inputs: StrategyInputs): void {
  if (!(inputs.race_length_s > 0)) {
    throw new Error(`race_length_s must be > 0 (got ${inputs.race_length_s}).`);
  }
  if (!(inputs.avg_lap_s > 0)) {
    throw new Error(`avg_lap_s must be > 0 (got ${inputs.avg_lap_s}).`);
  }
  if (!(inputs.autonomy_s > 0)) {
    throw new Error(
      `autonomy_s must be > 0 (got ${inputs.autonomy_s}) — measure it with a logbook run-until-dry test.`,
    );
  }
  if (inputs.pit_loss_s < 0) {
    throw new Error(`pit_loss_s must be >= 0 (got ${inputs.pit_loss_s}).`);
  }
}
