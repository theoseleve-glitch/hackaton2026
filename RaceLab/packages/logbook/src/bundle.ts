import type { ContextBundle } from "../../engine/src/types";
import type { SetupValues } from "../../sheets/src/sheets";
import type { LogbookState, RunEntry } from "./types";

/**
 * The bridge from a logged run to the engine: every engineer request is built
 * FROM the log (D22) — the user never retypes context the log already has.
 * Pure mapping; taxonomy condition tags are derived deterministically. Wind now
 * reads off the frozen schema weather observation (run.weather.wind_speed_kmh),
 * not conditions.
 */

/** Derive taxonomy condition tags (packages/kb/taxonomy.yaml vocabulary). */
export function conditionTags(run: RunEntry): string[] {
  const tags = new Set<string>();
  const c = run.conditions;

  if (c.grip === "green") tags.add("low_grip");
  if (c.grip === "high") tags.add("high_grip");
  if (c.grip === "blue_groove") {
    tags.add("high_grip");
    tags.add("blue_groove");
  }
  if (c.bumpiness === "rough") {
    tags.add("bumpy");
    tags.add("rough");
  }
  if (c.bumpiness === "medium") tags.add("bumpy");
  if (c.bumpiness === "smooth") tags.add("smooth");
  if (c.dusty) tags.add("dusty");
  if (c.sky === "raining") tags.add("wet");
  const temp = c.track_temp_c ?? c.air_temp_c;
  if (temp !== undefined && temp >= 30) tags.add("hot");
  if (temp !== undefined && temp <= 10) tags.add("cold");

  return [...tags];
}

/**
 * Learning-loop history: rated runs in similar conditions (same grip),
 * rendered as the engine's (change, conditions, outcome) triples. The
 * "change" is the setup version name — human-meaningful, no resolution needed.
 */
export function historyFromRuns(
  state: LogbookState,
  current: Pick<RunEntry, "id" | "conditions" | "track">,
): NonNullable<ContextBundle["history"]> {
  return state.runs
    .filter((r) => r.id !== current.id && r.outcome !== undefined)
    .filter((r) => r.conditions.grip === current.conditions.grip)
    .map((r) => ({
      change: `ran "${r.setup_name}"`,
      conditions: `${r.conditions.grip} grip ${r.track.surface}${r.track.name === current.track.name ? " (same track)" : ""}`,
      outcome: r.outcome as "better" | "same" | "worse",
    }));
}

/** Assemble the full engine context bundle for a logged run. */
export function bundleFromRun(
  run: RunEntry,
  setup: SetupValues,
  state: LogbookState,
  opts?: { mode?: ContextBundle["mode"]; question?: string },
): ContextBundle {
  const c = run.conditions;
  const wind = run.weather?.wind_speed_kmh;
  return {
    chassis_template_id: run.car_template_id,
    setup: { ...setup },
    track: {
      track_id: run.track_id,
      name: run.track.name,
      surface: run.track.surface,
      grip: c.grip,
      conditions: conditionTags(run),
      evolution: c.evolution,
    },
    weather: {
      air_temp_c: c.air_temp_c,
      humidity_pct: c.humidity_pct,
      wind_kmh: wind,
      rain_risk_pct: c.sky === "rain_risk" ? 50 : c.sky === "raining" ? 100 : undefined,
    },
    tyres: run.tyres ? { wear: run.tyres.wear, run_count: run.tyres.run_count } : undefined,
    feedback: { tags: run.feedback.tags.map((t) => ({ ...t })), text: run.feedback.text },
    mode: opts?.mode ?? (run.type === "practice" ? "practice" : "race_day"),
    history: historyFromRuns(state, run),
    question: opts?.question,
  };
}
