import type { ContextBundle } from "../../engine/src/types";
import type { SetupValues } from "../../sheets/src/sheets";
import { surfaceToTags, powerTypeToTags } from "../../schema/src/runs";
import type { LogbookState, RunEntry } from "./types";

/**
 * The bridge from a logged run to the engine: every engineer request is built
 * FROM the log (D22) — the user never retypes context the log already has.
 * Pure mapping; taxonomy condition tags are derived deterministically.
 */

/** The car's power class (garage vocabulary). Optional — when present it unions
 *  the power tag so legal_in_power-gated rules (gearing/timing) can fire; the
 *  run itself does not carry power, so the caller threads it from the garage. */
export type RunPower = "nitro" | "electric";

/** Derive taxonomy condition tags (packages/kb/taxonomy.yaml vocabulary).
 *  Grip/bumps/dusty/sky/temp from the run's conditions, the surface FAMILY from
 *  the run's track surface (so surface-amplified rules fire and forbidden_on can
 *  exclude), and the power tag when the car's power class is supplied. */
export function conditionTags(run: RunEntry, power?: RunPower): string[] {
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

  // Surface family (clay / loose_dirt / carpet / astroturf / asphalt / …) — the
  // grounding axis the bulk of the 417 rules amplify or forbid on.
  for (const t of surfaceToTags(run.track.surface)) tags.add(t);
  // Power class → power tag (garage "electric" maps to schema "brushless").
  if (power) for (const t of powerTypeToTags(power === "nitro" ? "nitro" : "brushless")) tags.add(t);

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
  opts?: { mode?: ContextBundle["mode"]; question?: string; power?: RunPower },
): ContextBundle {
  const c = run.conditions;
  return {
    chassis_template_id: run.car_template_id,
    setup: { ...setup },
    track: {
      name: run.track.name,
      surface: run.track.surface,
      grip: c.grip,
      conditions: conditionTags(run, opts?.power),
      evolution: c.evolution,
    },
    weather: {
      air_temp_c: c.air_temp_c,
      humidity_pct: c.humidity_pct,
      wind_kmh: c.wind_kmh,
      rain_risk_pct: c.sky === "rain_risk" ? 50 : c.sky === "raining" ? 100 : undefined,
    },
    tyres: run.tyres ? { wear: run.tyres.wear, run_count: run.tyres.run_count } : undefined,
    feedback: { tags: run.feedback.tags, text: run.feedback.text },
    mode: opts?.mode ?? (run.type === "practice" ? "practice" : "race_day"),
    history: historyFromRuns(state, run),
    question: opts?.question,
  };
}
