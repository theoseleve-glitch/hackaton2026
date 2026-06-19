import type { KBData } from "./data";
import { drivingTips } from "./driving-tips";
import { buildReport, type EngineerReport } from "./report";
import type { ContextBundle } from "./types";

/**
 * Layer 5 — the race plan (D30). The night-before briefing: project the
 * selected practice runs onto the race window's forecast, run the same
 * deterministic engineer pipeline forced into race_day mode (D18: no API,
 * no I/O, no clock), and state plainly what shifted, how to drive it, and
 * what is still unresolved. Pure function of its arguments.
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
): RacePlan {
  if (runs.length === 0) {
    throw new Error(
      "Race planning needs at least one selected run — log a practice run and select it first.",
    );
  }
  void race; // part of the planner contract; no race-window-specific rule yet

  const shifted = applyForecast(bundle, forecast);
  const sorted = [...runs].sort((a, b) => a.date.localeCompare(b.date));
  const avgLaps = runs
    .map((r) => r.avg_lap_s)
    .filter((v): v is number => v !== undefined);

  return {
    report: buildReport(shifted, data),
    conditions_shift: conditionsShift(runs, forecast),
    technique_tips: drivingTips(shifted),
    readiness: readinessFacts(sorted),
    race_avg_lap_s: avgLaps.length > 0 ? Math.min(...avgLaps) : undefined,
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
function conditionsShift(runs: SelectedRunSummary[], forecast: Forecast | undefined): string[] {
  const lines: string[] = [];
  const temps = runs.map((r) => r.air_temp_c).filter((v): v is number => v !== undefined);

  if (temps.length === 0) {
    lines.push("No air temperature on your selected runs — temperature shift unknown.");
  } else if (forecast?.air_temp_c === undefined) {
    lines.push("No forecast temperature — temperature shift unknown.");
  } else {
    const practiceAvg = temps.reduce((sum, t) => sum + t, 0) / temps.length;
    const delta = Math.round(forecast.air_temp_c - practiceAvg);
    lines.push(
      delta === 0
        ? `Race window at the same temperature as your practice data (~${Math.round(practiceAvg)}°C).`
        : `Race window ~${Math.abs(delta)}°C ${delta > 0 ? "hotter" : "colder"} than your practice data (${forecast.air_temp_c}°C vs ~${Math.round(practiceAvg)}°C).`,
    );
  }

  if (forecast?.rain_risk_pct !== undefined && forecast.rain_risk_pct >= WET_FROM_PCT) {
    lines.push(`Rain risk ${forecast.rain_risk_pct}% — your selected runs are all dry.`);
  }
  return lines;
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
    lines.push(`Best average lap: ${bestAvg}s — ${best.track_name}, ${best.date}.`);
  }

  const grips: string[] = [];
  for (const r of sorted) if (!grips.includes(r.grip)) grips.push(r.grip);
  lines.push(
    `${sorted.length} run${sorted.length === 1 ? "" : "s"} considered, grips: ${grips.join(", ")}.`,
  );
  return lines;
}

function humanize(id: string): string {
  return id.replace(/_/g, " ");
}
