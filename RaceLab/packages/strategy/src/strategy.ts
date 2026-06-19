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
  /** F1 — consumption history across logged runs (cc burned per lap). When
   *  `use_consumption_estimate` is on, a tank-range estimate is derived from it
   *  with a pessimistic 2σ envelope and BLENDED with the single autonomy test.
   *  Derived from real logs only (mean/std of fuel.consumed_cc / lap_count). */
  consumption_based?: {
    /** mean cc burned per lap across the sampled runs (> 0) */
    mean_cc_per_lap: number;
    /** standard deviation of cc-per-lap across the sampled runs (>= 0) */
    std_dev_cc_per_lap: number;
    /** how many runs contributed a clean cc-per-lap sample */
    runs_sampled: number;
    /** full-tank capacity in cc — turns cc-per-lap into a lap range */
    tank_cc: number;
  };
  /** F1 — opt-in: use the consumption history above to estimate tank range.
   *  Off (or no consumption data) → behaves exactly as before. */
  use_consumption_estimate?: boolean;
  /** F3 — field size the strategy is run against (RunEntry.result.entrants).
   *  Drives the pit-traffic-vs-field estimate. Absent → assume a default field
   *  (8) but flag the resulting risks conservatively as `unknown`. */
  entrants?: number;
  /** F3 — your end-of-race / scored position, when known. Refines the lapped-
   *  car estimate; absent → the field-size heuristic alone. */
  current_position?: number;
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
  /** F1 — tank range estimated from logged consumption (cc-per-lap), with a
   *  pessimistic 2σ envelope. Present only when a consumption estimate was
   *  used; absent → the plan ran on the single autonomy test alone. */
  autonomy_estimate?: {
    /** seconds a full tank lasts at the mean consumption rate */
    mean_s: number;
    /** seconds a full tank lasts at mean + 2σ consumption (conservative floor) */
    pessimistic_s: number;
    /** runs that contributed a clean cc-per-lap sample */
    derived_from_runs: number;
  };
  /** F3 — per pit moment, the traffic risk of rejoining there (RC-honest:
   *  computed from YOUR pace + field size only, never rival telemetry).
   *  Conservative — `unknown` when data is missing, `none` solo/no-field.
   *  Present only when there is a field to reason about. */
  pit_traffic_risks?: Array<{
    pit_at_s: number;
    pit_lap: number;
    risk_type: "lapped_cars" | "pack_rejoin" | "backmarker_zone" | "none" | "unknown";
    severity: "low" | "medium" | "high";
    mitigation?: string;
  }>;
  /** plain-language reasoning — these ARE the product */
  notes: string[];
}

export function computePitPlan(inputs: StrategyInputs): PitPlan {
  validate(inputs);
  const margin = inputs.margin_s ?? inputs.avg_lap_s;

  // F1 — consumption-based range estimate (pure, NaN-guarded). When opted in
  // AND the consumption history is clean, derive tank range from cc-per-lap and
  // BLEND it with the single autonomy test. The effective autonomy used to cap
  // stints is FLOORED at the pessimistic (mean + 2σ) value so the plan stays
  // conservative against fuel-test variance. No/dirty data → no change.
  const est = consumptionEstimate(inputs);
  const effectiveAutonomy =
    est !== undefined
      ? // blend the mean-rate range with the single measured test (simple
        // average — both are equally valid signals), then floor by the
        // pessimistic envelope so we never plan a window we can't guarantee.
        Math.min((est.mean_s + inputs.autonomy_s) / 2, est.pessimistic_s)
      : inputs.autonomy_s;

  const fuelCap = effectiveAutonomy - margin;
  if (!(fuelCap > 0)) {
    throw new Error(
      `stint_max_s = autonomy_s - margin_s = ${round1(effectiveAutonomy)} - ${margin} = ${round1(fuelCap)}s — must be > 0: the safety margin eats the whole tank.`,
    );
  }
  const notes: string[] = [];
  // F1 — surface the consumption-derived range up front (before the fuel-window
  // note) so the racer sees where the autonomy number came from. High variance
  // → tell them to log a clean fuel test.
  if (est !== undefined) {
    notes.push(
      `Tank autonomy from ${est.derived_from_runs} logged run(s): ${mmss(est.mean_s)} mean, ${mmss(est.pessimistic_s)} with a 2σ margin (~${est.mean_cc_per_lap.toFixed(1)}cc/lap${est.std_dev_cc_per_lap > 0 ? ` ±${est.std_dev_cc_per_lap.toFixed(1)}` : ""}). Planning on the conservative ${mmss(effectiveAutonomy)} window — blended with your ${mmss(inputs.autonomy_s)} tank test and floored at the 2σ figure.`,
    );
    if (est.high_variance) {
      notes.push(
        `Your logged fuel burn varies a lot run-to-run (±${est.std_dev_cc_per_lap.toFixed(1)}cc/lap, ~${Math.round(est.cv_pct)}% of the mean) — this range is rough. Log one clean run-until-dry on a full tank with a dialed tune for a tighter number.`,
      );
    }
  }
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
  // F1 — attach the consumption-derived range estimate (when one was used).
  if (est !== undefined) {
    plan.autonomy_estimate = {
      mean_s: round1(est.mean_s),
      pessimistic_s: round1(est.pessimistic_s),
      derived_from_runs: est.derived_from_runs,
    };
  }
  // R6-3 — single-tank / no-pit race: a clear, dedicated line instead of the
  // fuel/tyre lever rationale (which only makes sense when you actually stop).
  if (plan.stops === 0) {
    plan.notes.push(
      `One tank covers the whole race — no stop needed. Just manage the tyres and bring it home; the fuel window (${mmss(fuelCap)}) is longer than the race, so the pit lane never comes into it.`,
    );
  } else {
    plan.notes.push(...leverNotes);
  }
  // F3 — pit-window-vs-traffic. RC-honest: per pit moment, estimate the rejoin
  // traffic risk from YOUR pace + field size only. Conservative — flags
  // `unknown` when data is missing, `none` solo/no-field. Adds its own notes.
  const traffic = pitTrafficRisks(inputs, plan);
  if (traffic !== undefined) {
    plan.pit_traffic_risks = traffic.risks;
    plan.notes.push(...traffic.notes);
  }
  return plan;
}

// ── F3 — pit-window-vs-traffic (RC-honest) ───────────────────────────────────

/**
 * Per pit moment, the risk of rejoining into traffic, computed from YOUR pace +
 * field size ONLY (RC has no rival telemetry — see the design's F2 skip). Pure,
 * deterministic, conservative: missing/garbage field data → `unknown`, a solo
 * race or a single-entry field → `none`. Returns undefined when there are no
 * stops to reason about (no rejoin happens).
 *
 * Model:
 *  - rejoin_s[i] = pit_at_s[i] + pit_loss_s (race-clock moment you re-enter)
 *  - out-lap is slow: avg_lap_s * 1.05 (cold tyres, light/high-rev).
 *  - leader_laps = race_length_s / avg_lap_s (rough leader lap count).
 *  - backmarkers run fewer laps; a leader who is far enough ahead starts lapping
 *    them late in the race. If your rejoin lands in that late window AND you are
 *    near the front, flag `lapped_cars`.
 *  - pack_rejoin: when a uniform fuel/tyre stint cap means most of the field
 *    boxes around the same moment, rejoining stacks you into a pack.
 */
function pitTrafficRisks(
  inputs: StrategyInputs,
  plan: PitPlan,
): { risks: NonNullable<PitPlan["pit_traffic_risks"]>; notes: string[] } | undefined {
  if (plan.stops === 0 || plan.pit_at_s.length === 0) return undefined;

  // Field size: entrants when given + finite, else the default 8 — but a
  // defaulted field makes every risk `unknown` (we are guessing the field).
  const entrantsGiven =
    inputs.entrants !== undefined &&
    isFiniteNum(inputs.entrants) &&
    Number.isInteger(inputs.entrants) &&
    inputs.entrants >= 1;
  const entrants = entrantsGiven ? (inputs.entrants as number) : DEFAULT_ENTRANTS;
  const fieldUnknown = !entrantsGiven;

  // Lap you box on for each scheduled stop: cumulative laps through stints 0..i.
  const pitLaps: number[] = [];
  {
    let cumDur = 0;
    for (let i = 0; i < plan.stints.length; i++) {
      cumDur += plan.stints[i].duration_s;
      if (plan.stints[i].pit_after) pitLaps.push(Math.max(1, Math.round(cumDur / inputs.avg_lap_s)));
    }
  }
  const pitLapAt = (i: number, pitAt: number): number =>
    pitLaps[i] ?? Math.max(1, Math.round(pitAt / inputs.avg_lap_s));

  // Solo / two-car field → nobody to be lapped by or packed with.
  if (entrantsGiven && entrants <= 2) {
    const risks = plan.pit_at_s.map((pitAt, i) => ({
      pit_at_s: round1(pitAt),
      pit_lap: pitLapAt(i, pitAt),
      risk_type: "none" as const,
      severity: "low" as const,
    }));
    return {
      risks,
      notes: [
        `Pit traffic: a ${entrants}-car field — no pack to rejoin into and no one to be lapped by. Box on the fuel/tyre window; clear air either way.`,
      ],
    };
  }

  const outLap = inputs.avg_lap_s * 1.05;
  const leaderLaps = inputs.race_length_s / inputs.avg_lap_s; // rough
  // Backmarkers are roughly entrants/2 positions back; a clear leader catches
  // them about (entrants/2) of their laps from the flag — i.e. the lapped-car
  // zone opens in the final ~third of the race. Kept deliberately rough.
  const lappedZoneStart = inputs.race_length_s * (2 / 3);
  // Near the front? With a known position, "front" = top third. Unknown
  // position → we cannot claim you are leading, so lapped-car risk stays
  // `unknown` rather than asserted.
  const positionGiven =
    inputs.current_position !== undefined &&
    isFiniteNum(inputs.current_position) &&
    Number.isInteger(inputs.current_position) &&
    inputs.current_position >= 1;
  const nearFront = positionGiven && (inputs.current_position as number) <= Math.max(1, Math.ceil(entrants / 3));

  // Pack-rejoin: a uniform stint cap syncs the field's pit windows. If everyone
  // runs the same fuel/tyre math, you all box within a lap of each other and
  // rejoin together. We flag it on every scheduled stop (the sync repeats).
  const uniformCap = plan.stint_max_s; // the shared cap the whole field would run
  const packLikely = entrants >= 4 && uniformCap > 0 && uniformCap < inputs.race_length_s;

  const notes: string[] = [];
  const risks = plan.pit_at_s.map((pitAt, i) => {
    const rejoin = pitAt + inputs.pit_loss_s;
    const pit_lap = pitLapAt(i, pitAt);
    const base = { pit_at_s: round1(pitAt), pit_lap };

    if (fieldUnknown) {
      return {
        ...base,
        risk_type: "unknown" as const,
        severity: "low" as const,
        mitigation: "Log the field size (entrants) on your race runs and I can flag rejoin traffic for real.",
      };
    }

    // Lapped cars: only in the late window, and only if we can place you near
    // the front. Position unknown → `unknown` (we won't assert you're leading).
    const inLappedZone = rejoin >= lappedZoneStart && leaderLaps >= entrants;
    if (inLappedZone && nearFront) {
      return {
        ...base,
        risk_type: "lapped_cars" as const,
        severity: "high" as const,
        mitigation: "On cold out-lap tyres you'll catch backmarkers — pit a lap earlier/later to rejoin in clear air, and be patient lapping them.",
      };
    }
    if (inLappedZone && !positionGiven) {
      return {
        ...base,
        risk_type: "unknown" as const,
        severity: "low" as const,
        mitigation: "Late-race rejoin could meet lapped cars — tell me your position and I'll know if you're the one lapping.",
      };
    }

    // Pack rejoin from the synced uniform window.
    if (packLikely) {
      return {
        ...base,
        risk_type: "pack_rejoin" as const,
        severity: "high" as const,
        mitigation: "Pit ±1 lap to break the sync (only if it doesn't cost a stop) — rejoining a lap off the pack buys you clear air on the cold out-lap.",
      };
    }

    return { ...base, risk_type: "none" as const, severity: "low" as const };
  });

  // One summary note in pilot language.
  const kinds = new Set(risks.map((r) => r.risk_type));
  if (kinds.has("lapped_cars")) {
    notes.push(
      `Pit traffic: your out-lap runs ~${mmss(outLap)} (cold tyres, ${(outLap - inputs.avg_lap_s).toFixed(1)}s off pace). A late stop can drop you among lapped cars — flagged below; pit a lap off to rejoin clear.`,
    );
  } else if (kinds.has("pack_rejoin")) {
    notes.push(
      `Pit traffic: a ${entrants}-car field on the same ${mmss(uniformCap)} window all boxes together — you risk rejoining into a pack on cold tyres. Breaking the pit sync by ±1 lap (when it's free) gets you clear air.`,
    );
  } else if (kinds.has("unknown")) {
    notes.push(
      `Pit traffic: not enough field/position data to call rejoin traffic — log entrants and your position and I'll flag it. Until then, assume clear air but watch your mirrors on the out-lap.`,
    );
  } else {
    notes.push(
      `Pit traffic: a ${entrants}-car field, but your stops don't line up with the lapped-car window or a synced pack — clean rejoins expected.`,
    );
  }
  return { risks, notes };
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

// ── F1/F3 small helpers ──────────────────────────────────────────────────────

/** F3 — assumed field size when entrants is not logged (design default). */
const DEFAULT_ENTRANTS = 8;
/** A run's fuel burn is "high variance" when its 2σ cc/lap envelope exceeds
 *  this fraction of the mean — the estimate is then too rough to trust. */
const HIGH_VARIANCE_CV = 0.15; // coefficient of variation (σ/mean) threshold

function isFiniteNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/** One decimal, NaN-safe (used in pilot-facing numbers and thrown messages). */
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

interface ConsumptionEstimate {
  mean_s: number;
  pessimistic_s: number;
  derived_from_runs: number;
  mean_cc_per_lap: number;
  std_dev_cc_per_lap: number;
  high_variance: boolean;
  cv_pct: number;
}

/**
 * F1 — turn logged cc-per-lap consumption into a tank-range estimate, in
 * seconds, with a pessimistic 2σ envelope. Returns undefined (→ no change to
 * the plan) unless the racer opted in AND every input is finite and sane:
 *   mean_s        = (tank_cc / mean_cc_per_lap) * avg_lap_s
 *   pessimistic_s = (tank_cc / (mean_cc_per_lap + 2σ)) * avg_lap_s
 * Pure + deterministic; any non-finite / non-positive field drops the estimate
 * entirely (we never fabricate a range from garbage). The derivation of mean/σ
 * across runs lives in the logbook (deriveConsumption) — here we only consume a
 * pre-computed {mean, std, runs_sampled, tank_cc}.
 */
function consumptionEstimate(inputs: StrategyInputs): ConsumptionEstimate | undefined {
  if (inputs.use_consumption_estimate !== true) return undefined;
  const c = inputs.consumption_based;
  if (c === undefined) return undefined;
  const { mean_cc_per_lap, std_dev_cc_per_lap, runs_sampled, tank_cc } = c;
  // NaN-guard every field; bail (no estimate) on anything non-finite or insane.
  if (!isFiniteNum(mean_cc_per_lap) || !(mean_cc_per_lap > 0)) return undefined;
  if (!isFiniteNum(std_dev_cc_per_lap) || std_dev_cc_per_lap < 0) return undefined;
  if (!isFiniteNum(tank_cc) || !(tank_cc > 0)) return undefined;
  if (!isFiniteNum(runs_sampled) || !Number.isInteger(runs_sampled) || runs_sampled < 1) return undefined;
  if (!isFiniteNum(inputs.avg_lap_s) || !(inputs.avg_lap_s > 0)) return undefined;

  const mean_s = (tank_cc / mean_cc_per_lap) * inputs.avg_lap_s;
  const pessimisticRate = mean_cc_per_lap + 2 * std_dev_cc_per_lap;
  const pessimistic_s = (tank_cc / pessimisticRate) * inputs.avg_lap_s;
  if (!isFiniteNum(mean_s) || !isFiniteNum(pessimistic_s) || mean_s <= 0 || pessimistic_s <= 0) {
    return undefined;
  }
  const cv = std_dev_cc_per_lap / mean_cc_per_lap; // coefficient of variation
  return {
    mean_s,
    pessimistic_s,
    derived_from_runs: runs_sampled,
    mean_cc_per_lap,
    std_dev_cc_per_lap,
    high_variance: cv > HIGH_VARIANCE_CV,
    cv_pct: cv * 100,
  };
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
