import type { KBData } from "./data";
import { drivingTips } from "./driving-tips";
import { buildReport, type EngineerReport } from "./report";
import { planRaceDay, type PlannedAdjustment } from "./planner"; // William's race-day planner
import type { ContextBundle } from "./types";
import type { LearningTuple } from "../../schema/src/runs";
import type { WeatherObservation } from "../../schema/src/weather";
import type { TrackSnapshot } from "../../schema/src/tracks";

/**
 * Layer 5 — the race plan (D30). The night-before briefing: project the
 * selected practice runs onto the race window's forecast, run the same
 * deterministic engineer pipeline forced into race_day mode (D18: no API,
 * no I/O, no clock), and state plainly what shifted, how to drive it, and
 * what is still unresolved. Pure function of its arguments.
 *
 * The flat 8-part report (`report`) is Theo's product contract — the poster
 * every card renders. William's `planRaceDay` is composed in as ADDITIVE,
 * cited forecast adjustments (`adjustments`) and explicit grounded-or-silent
 * gaps (`refusals`), shown only when the app supplies schema-shaped inputs.
 */

/** One selected run, as the caller summarises it from the logbook. */
export interface SelectedRunSummary {
  date: string;
  track_name: string;
  grip: string;
  surface: string;
  air_temp_c?: number;
  best_lap_s?: number;
  avg_lap_s?: number;
  symptoms: string[];
  outcome?: "better" | "same" | "worse";
}

export interface RaceWindow {
  start_iso: string;
  length_s: number;
  type: "sprint" | "endurance";
}

export interface Forecast {
  air_temp_c?: number;
  humidity_pct?: number;
  wind_kmh?: number;
  rain_risk_pct?: number;
}

export interface RacePlan {
  report: EngineerReport;
  conditions_shift: string[];
  technique_tips: string[];
  readiness: string[];
  race_avg_lap_s?: number;
  /** R2-1 — sprint-vs-endurance mindset line, grounded in universal race-craft
   *  (no KB citation). Always present so the briefing names the race type. */
  race_type_note: string;
  /** NEW — William's grounded, cited forecast adjustments (when `william` supplied). */
  adjustments?: PlannedAdjustment[];
  /** NEW — grounded-or-silent gaps the KB cannot cover (when `william` supplied). */
  refusals?: { aspect: string; message: string }[];
}

/** Forecast thresholds that add taxonomy condition tags to the bundle. */
const HOT_FROM_C = 30;
const COLD_TO_C = 10;
const WET_FROM_PCT = 50;

/** Planning requires at least one selected run (product rule) — throws otherwise. */
export function buildRacePlan(
  bundle: ContextBundle,
  runs: SelectedRunSummary[],
  race: RaceWindow,
  forecast: Forecast | undefined,
  data: KBData,
  // OPTIONAL William inputs — when the app can supply schema-shaped data the
  // façade composes William's race-day planner for grounded cited adjustments.
  // Optional so this file compiles + renders identically before the app wires it.
  william?: {
    practice: readonly LearningTuple[];
    forecastObs: readonly WeatherObservation[];
    track: TrackSnapshot;
  },
): RacePlan {
  if (runs.length === 0) {
    throw new Error(
      "Race planning needs at least one selected run — log a practice run and select it first.",
    );
  }

  // Theo half (unchanged): forecast-shifted flat report + technique tips + readiness
  const shifted = applyForecast(bundle, forecast);
  const sorted = [...runs].sort((a, b) => a.date.localeCompare(b.date));
  // M5: only finite averages feed race_avg_lap_s — a non-finite value would
  // poison Math.min and leak NaN/Infinity into the user-facing plan.
  const avgLaps = runs
    .map((r) => r.avg_lap_s)
    .filter((v): v is number => v !== undefined && Number.isFinite(v));

  // William half (NEW, optional): grounded forecast adjustments + explicit refusals
  let adjustments: PlannedAdjustment[] | undefined;
  let refusals: RacePlan["refusals"];
  if (william) {
    const res = planRaceDay(
      {
        practice: william.practice,
        forecast: william.forecastObs,
        track: william.track,
        chassis_template_id: bundle.chassis_template_id,
        current_setup: bundle.setup,
      },
      data, // same KBData — pure, no I/O
    );
    if (res.ok) {
      adjustments = res.plan.adjustments;
      refusals = res.plan.refusals;
    }
  }

  return {
    report: buildReport(shifted, data),
    conditions_shift: conditionsShift(runs, forecast, race),
    technique_tips: drivingTips(shifted),
    readiness: readinessFacts(sorted),
    race_avg_lap_s: avgLaps.length > 0 ? Math.min(...avgLaps) : undefined,
    race_type_note: raceTypeNote(race),
    ...(adjustments ? { adjustments } : {}),
    ...(refusals && refusals.length > 0 ? { refusals } : {}),
  };
}

/** New bundle (never mutates the input): forecast merged onto weather,
 *  threshold condition tags added without duplicates, mode forced to race_day. */
function applyForecast(bundle: ContextBundle, forecast: Forecast | undefined): ContextBundle {
  const added: string[] = [];
  if (forecast?.air_temp_c !== undefined && forecast.air_temp_c >= HOT_FROM_C) added.push("hot");
  if (forecast?.air_temp_c !== undefined && forecast.air_temp_c <= COLD_TO_C) added.push("cold");
  if (forecast?.rain_risk_pct !== undefined && forecast.rain_risk_pct >= WET_FROM_PCT) {
    added.push("wet");
  }
  return {
    ...bundle,
    track: {
      ...bundle.track,
      conditions: [
        ...bundle.track.conditions,
        ...added.filter((c) => !bundle.track.conditions.includes(c)),
      ],
    },
    weather: forecast ? { ...bundle.weather, ...forecast } : bundle.weather,
    mode: "race_day",
  };
}

/** Human lines: what the race window changes vs the SELECTED practice data.
 *  Temperature compares against the average air_temp_c of runs that have one;
 *  a missing-temp side (runs or forecast) always yields an explicit line. */
function conditionsShift(
  runs: SelectedRunSummary[],
  forecast: Forecast | undefined,
  race: RaceWindow,
): string[] {
  const lines: string[] = [];
  const temps = runs.map((r) => r.air_temp_c).filter((v): v is number => v !== undefined);

  if (temps.length === 0) {
    lines.push("No air temperature on your selected runs — temperature shift unknown.");
  } else if (forecast?.air_temp_c === undefined) {
    lines.push("No forecast temperature — temperature shift unknown.");
  } else {
    const practiceAvg = temps.reduce((sum, t) => sum + t, 0) / temps.length;
    const delta = Math.round(forecast.air_temp_c - practiceAvg);
    if (delta === 0) {
      lines.push(`Race window at the same temperature as your practice data (~${Math.round(practiceAvg)}°C).`);
    } else {
      // B1: universal physics, NOT a KB rule — hotter air/track lowers grip;
      // colder raises it. Pair the bare delta with what it does to the car.
      const mechanism =
        delta > 0
          ? " Hotter air and track mean less grip — the car needs more rear traction to put the power down."
          : " Colder air and track mean more grip but slower-warming tyres — expect a sharper front once they're in.";
      // R2-2: forecast-vs-practice delta, stated scientifically with a race-type
      // weighting. A temperature gap is universal physics (no KB citation): a
      // big delta means the grip is meaningfully different from what you tuned
      // in, and the rear-traction adjustments matter MORE in the race than they
      // did in practice. Endurance compounds it (a stint-long drift), sprint is
      // a single window.
      const big = Math.abs(delta) >= 5;
      const weight =
        big && delta > 0
          ? race.type === "endurance"
            ? " Over a long run that grip loss compounds, so the rear-traction adjustments matter more than they did in practice."
            : " On a one-lap sprint window the rear-traction adjustments matter more than they did in practice — get them right before the run."
          : big && delta < 0
            ? " The extra grip is more than your practice saw, so expect the car to turn in sharper than you tuned for."
            : "";
      lines.push(
        `Race window ~${Math.abs(delta)}°C ${delta > 0 ? "hotter" : "colder"} than your practice data (${forecast.air_temp_c}°C vs ~${Math.round(practiceAvg)}°C).${mechanism}${weight}`,
      );
    }
  }

  if (forecast?.rain_risk_pct !== undefined && forecast.rain_risk_pct >= WET_FROM_PCT) {
    // B1: rain physics — less grip, longer braking. Universal, not a KB rule.
    // R2-2: the selected practice ran dry, so the wet is an UNTESTED condition —
    // say so plainly so the racer knows they have no reference for it.
    lines.push(
      `Rain risk ${forecast.rain_risk_pct}% — your selected runs are all dry, so you have no wet reference here. Less grip and longer braking: brake earlier and straighter, and feed throttle later on exit.`,
    );
  }
  return lines;
}

/** R2-1 — sprint vs endurance mindset. Universal race-craft, not a KB tuning
 *  rule (so no citation): sprints reward one-lap pace and a clean, committed
 *  first corner with the setup locked; endurance rewards consistency and tyre/
 *  fuel preservation, favouring changes that hold up over a long run. */
function raceTypeNote(race: RaceWindow): string {
  const minutes = Math.round(race.length_s / 60);
  const lengthTxt = minutes >= 1 ? ` (~${minutes} min)` : "";
  if (race.type === "sprint") {
    return `Sprint${lengthTxt}: it's won on one-lap pace and a clean, committed first corner — qualify well, lock the setup, and make the fewest changes you can.`;
  }
  return `Endurance${lengthTxt}: it's won on consistency and looking after the tyres and fuel — favour changes that stay good lap after lap over a quick one-lap gain.`;
}

/** Facts from the selected runs (chronologically sorted): unresolved symptoms
 *  (no later run rated better), the best average lap and where it came from,
 *  and a coverage line. */
function readinessFacts(sorted: SelectedRunSummary[]): string[] {
  const lines: string[] = [];

  const unresolved: string[] = [];
  sorted.forEach((run, i) => {
    if (sorted.slice(i + 1).some((r) => r.outcome === "better")) return;
    for (const s of run.symptoms) if (!unresolved.includes(s)) unresolved.push(s);
  });
  for (const s of unresolved) {
    lines.push(`Unresolved: ${humanize(s)} — no later selected run was rated better.`);
  }

  let best: SelectedRunSummary | undefined;
  let bestAvg = Number.POSITIVE_INFINITY;
  for (const r of sorted) {
    if (r.avg_lap_s !== undefined && r.avg_lap_s < bestAvg) {
      bestAvg = r.avg_lap_s;
      best = r;
    }
  }
  if (best) {
    lines.push(`Best average lap: ${bestAvg.toFixed(2)}s — ${best.track_name}, ${best.date}.`);
  }

  // B2: a data-quality signal so thin data is read as "be cautious", not fact.
  const grips: string[] = [];
  for (const r of sorted) if (!grips.includes(r.grip)) grips.push(r.grip);
  const quality = sorted.length >= 3 ? "Good" : sorted.length === 2 ? "Limited" : "Single";
  const caution =
    sorted.length < 3
      ? " — thin data, so expect the car to behave a little differently on race day."
      : "";
  lines.push(
    `${quality} data: ${sorted.length} run${sorted.length === 1 ? "" : "s"} on grips ${grips.join(", ")}${caution}.`,
  );
  return lines;
}

function humanize(id: string): string {
  return id.replace(/_/g, " ");
}
