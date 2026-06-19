import { getTemplate } from "./data";
import { loadKBData } from "./node-kb";
import { buildRacePlan, type Forecast, type RaceWindow, type SelectedRunSummary } from "./race-plan";
import type { ContextBundle } from "./types";

/** Tests for the race-plan façade (D30): practice log + forecast → race-day plan. */

const data = loadKBData();

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function bundle(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    chassis_template_id: "kyosho-inferno-mp11",
    setup: { front_diff_oil: 8000, center_diff_oil: 5000, rear_diff_oil: 3000, front_sway_bar: 2.3, rear_sway_bar: 2.8 },
    track: { name: "Club Track", surface: "clay", grip: "green", conditions: ["low_grip", "dusty"] },
    feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }] },
    mode: "practice",
    ...overrides,
  };
}

const RACE: RaceWindow = { start_iso: "2026-06-12T14:00:00.000Z", length_s: 600, type: "sprint" };

function dryRuns(): SelectedRunSummary[] {
  return [
    { date: "2026-06-08T14:00:00.000Z", track_name: "Club Track", grip: "medium", surface: "clay", air_temp_c: 22, best_lap_s: 34.9, avg_lap_s: 36.1, symptoms: ["understeer"] },
    { date: "2026-06-09T10:00:00.000Z", track_name: "Club Track", grip: "high", surface: "clay", air_temp_c: 26, best_lap_s: 34.1, avg_lap_s: 35.2, symptoms: ["understeer"], outcome: "same" },
  ];
}

// 1. Two dry practice runs + hot (32°C) rainy (70%) forecast
{
  const input = bundle();
  const forecast: Forecast = { air_temp_c: 32, rain_risk_pct: 70 };
  const plan = buildRacePlan(input, dryRuns(), RACE, forecast, data);

  check("mode forced to race_day, reflected in the report", /RACE DAY/.test(plan.report.conditions_echo), plan.report.conditions_echo);
  check("forecast ≥30°C adds 'hot' to the echoed conditions", /\bhot\b/.test(plan.report.conditions_echo), plan.report.conditions_echo);
  check("rain risk ≥50% adds 'wet' to the echoed conditions", /\bwet\b/.test(plan.report.conditions_echo), plan.report.conditions_echo);
  check(
    "conditions_shift states the temperature delta (32 vs avg 24 → ~8°C hotter)",
    plan.conditions_shift.some((l) => l.includes("~8°C hotter")),
    plan.conditions_shift.join(" | "),
  );
  check(
    "conditions_shift states the rain risk vs dry practice data",
    plan.conditions_shift.some((l) => /[Rr]ain risk 70%/.test(l)),
    plan.conditions_shift.join(" | "),
  );
  check(
    "readiness flags the unresolved symptom (never followed by a 'better' run)",
    plan.readiness.some((l) => l.includes("Unresolved") && l.includes("understeer")),
    plan.readiness.join(" | "),
  );
  check(
    "readiness names the best avg lap (2dp) and its run/date",
    plan.readiness.some((l) => l.includes("35.20s") && l.includes("2026-06-09")),
    plan.readiness.join(" | "),
  );
  check(
    "readiness coverage line signals data quality + counts runs/grips",
    plan.readiness.some((l) => l.includes("Limited data: 2 runs on grips medium, high")),
    plan.readiness.join(" | "),
  );
  check("race_avg_lap_s picks the minimum avg over selected runs", plan.race_avg_lap_s === 35.2, String(plan.race_avg_lap_s));
  check("technique_tips fire from the shifted conditions", plan.technique_tips.length > 0 && plan.technique_tips.length <= 3, String(plan.technique_tips.length));
  check(
    "input bundle is never mutated",
    input.mode === "practice" && input.track.conditions.length === 2 && input.weather === undefined,
  );
}

// 2. Cold forecast (≤10°C) adds 'cold'
{
  const plan = buildRacePlan(bundle(), dryRuns(), RACE, { air_temp_c: 8 }, data);
  check("forecast ≤10°C adds 'cold' to the echoed conditions", /\bcold\b/.test(plan.report.conditions_echo), plan.report.conditions_echo);
}

// 3. No temperature data on the selected runs → explicit line
{
  const runs = dryRuns().map((r) => ({ ...r, air_temp_c: undefined }));
  const plan = buildRacePlan(bundle(), runs, RACE, { air_temp_c: 32 }, data);
  check(
    "no run temps → conditions_shift says the shift is unknown",
    plan.conditions_shift.some((l) => /[Nn]o air temperature/.test(l)),
    plan.conditions_shift.join(" | "),
  );
}

// 4. No forecast at all — plan still works, mode still race_day
{
  const runs: SelectedRunSummary[] = [
    { date: "2026-06-08T14:00:00.000Z", track_name: "Club Track", grip: "medium", surface: "clay", symptoms: [] },
  ];
  const plan = buildRacePlan(bundle(), runs, RACE, undefined, data);
  check("undefined forecast → race_day plan without condition shifts", /RACE DAY/.test(plan.report.conditions_echo));
  check("no avg laps → race_avg_lap_s undefined", plan.race_avg_lap_s === undefined, String(plan.race_avg_lap_s));
  check("single run coverage line is singular + Single-data quality", plan.readiness.some((l) => l.includes("Single data: 1 run on grips medium")), plan.readiness.join(" | "));
}

// 5. A symptom followed chronologically by a 'better' run is NOT unresolved
{
  const runs: SelectedRunSummary[] = [
    { date: "2026-06-08T14:00:00.000Z", track_name: "Club Track", grip: "medium", surface: "clay", symptoms: ["oversteer"] },
    { date: "2026-06-09T10:00:00.000Z", track_name: "Club Track", grip: "medium", surface: "clay", symptoms: [], outcome: "better" },
  ];
  const plan = buildRacePlan(bundle(), runs, RACE, undefined, data);
  check("resolved symptom not flagged", !plan.readiness.some((l) => l.includes("oversteer")), plan.readiness.join(" | "));
}

// 6. Empty runs → planning refused with a clear error (product rule)
{
  let threw = false;
  try {
    buildRacePlan(bundle(), [], RACE, { air_temp_c: 32 }, data);
  } catch (e) {
    threw = e instanceof Error && /at least one selected run/.test(e.message);
  }
  check("empty runs throws a clear error", threw);
}

// 7. The generic chassis template resolves from the KB
{
  const t = getTemplate(data, "generic-offroad");
  check("getTemplate resolves generic-offroad", t.template_id === "generic-offroad" && t.brand === "Generic");
  check("generic template carries no kit defaults", Object.values(t.fields).every((f) => !("kit_default" in f)));
}

// 8. Determinism: same inputs → identical plan (D18)
{
  const a = JSON.stringify(buildRacePlan(bundle(), dryRuns(), RACE, { air_temp_c: 32, rain_risk_pct: 70 }, data));
  const b = JSON.stringify(buildRacePlan(bundle(), dryRuns(), RACE, { air_temp_c: 32, rain_risk_pct: 70 }, data));
  check("plan is deterministic", a === b);
}

// 9. Planner clarity invariants (locks B1/B2)
{
  // +5°C hotter forecast (24 avg → 29) → conditions_shift pairs a mechanism clause.
  const hotter = buildRacePlan(bundle(), dryRuns(), RACE, { air_temp_c: 29 }, data);
  check(
    "B1: hotter conditions_shift includes a mechanism clause (grip/traction/brake)",
    hotter.conditions_shift.some((l) => /hotter/.test(l) && /grip|traction|brak/i.test(l)),
    hotter.conditions_shift.join(" | "),
  );
  const wet = buildRacePlan(bundle(), dryRuns(), RACE, { rain_risk_pct: 70 }, data);
  check(
    "B1: rain conditions_shift tells you to brake earlier/straighter",
    wet.conditions_shift.some((l) => /[Rr]ain risk/.test(l) && /brake earlier/i.test(l)),
    wet.conditions_shift.join(" | "),
  );
  // <3 runs → readiness emits a Limited/Single data-quality line.
  const thin = buildRacePlan(bundle(), dryRuns(), RACE, undefined, data); // 2 runs
  check(
    "B2: <3 runs emits a Limited/Single data-quality line",
    thin.readiness.some((l) => /^(Limited|Single) data:/.test(l)),
    thin.readiness.join(" | "),
  );
  // Unresolved symptom is listed BEFORE the best-pace line.
  const ordered = buildRacePlan(bundle(), dryRuns(), RACE, undefined, data);
  const unresolvedIdx = ordered.readiness.findIndex((l) => l.includes("Unresolved"));
  const bestIdx = ordered.readiness.findIndex((l) => l.includes("Best average lap"));
  check(
    "B2: unresolved symptom precedes the best-pace line",
    unresolvedIdx >= 0 && bestIdx >= 0 && unresolvedIdx < bestIdx,
    `unresolved@${unresolvedIdx} best@${bestIdx} | ${ordered.readiness.join(" | ")}`,
  );
}

// 10. R2-1: race-type differentiation (sprint vs endurance briefing)
{
  const sprint = buildRacePlan(bundle(), dryRuns(), { ...RACE, type: "sprint", length_s: 600 }, undefined, data);
  check(
    "R2-1: sprint race_type_note biases toward one-lap pace + few changes",
    /sprint/i.test(sprint.race_type_note) && /one-lap pace/i.test(sprint.race_type_note) && /fewest changes|first corner/i.test(sprint.race_type_note),
    sprint.race_type_note,
  );
  const endurance = buildRacePlan(bundle(), dryRuns(), { ...RACE, type: "endurance", length_s: 1800 }, undefined, data);
  check(
    "R2-1: endurance race_type_note biases toward consistency + tyre/fuel preservation",
    /endurance/i.test(endurance.race_type_note) && /consistency/i.test(endurance.race_type_note) && /tyre|fuel/i.test(endurance.race_type_note),
    endurance.race_type_note,
  );
  check(
    "R2-1: sprint and endurance notes are different",
    sprint.race_type_note !== endurance.race_type_note,
  );
  check(
    "R2-1: race_type_note states the window length in minutes",
    /10 min/.test(sprint.race_type_note) && /30 min/.test(endurance.race_type_note),
    `${sprint.race_type_note} || ${endurance.race_type_note}`,
  );
}

// 11. R2-2: forecast-vs-practice comparison stated scientifically + race-type weighted
{
  // +8°C hotter (24 avg → 32) on an ENDURANCE race → compounding-grip weighting.
  const endHot = buildRacePlan(bundle(), dryRuns(), { ...RACE, type: "endurance", length_s: 1800 }, { air_temp_c: 32 }, data);
  check(
    "R2-2: big hotter delta on endurance says the grip loss compounds over the run",
    endHot.conditions_shift.some((l) => /hotter/.test(l) && /compounds/i.test(l) && /matter more than .* in practice/i.test(l)),
    endHot.conditions_shift.join(" | "),
  );
  // Same delta on a SPRINT → single-window weighting, still flags it matters more.
  const sprHot = buildRacePlan(bundle(), dryRuns(), { ...RACE, type: "sprint", length_s: 600 }, { air_temp_c: 32 }, data);
  check(
    "R2-2: big hotter delta on sprint frames it as a one-lap window, still matters more than practice",
    sprHot.conditions_shift.some((l) => /sprint/i.test(l) && /matter more than .* in practice/i.test(l)),
    sprHot.conditions_shift.join(" | "),
  );
  check(
    "R2-2: sprint vs endurance forecast-shift wording differs",
    JSON.stringify(endHot.conditions_shift) !== JSON.stringify(sprHot.conditions_shift),
  );
  // Small delta (≤4°C) → no race-type weighting clause (just the base mechanism).
  const small = buildRacePlan(bundle(), dryRuns(), { ...RACE, type: "endurance", length_s: 1800 }, { air_temp_c: 27 }, data);
  check(
    "R2-2: small delta does NOT add a compounding/sprint weighting clause",
    small.conditions_shift.some((l) => /hotter/.test(l)) && !small.conditions_shift.some((l) => /compounds|one-lap sprint window/i.test(l)),
    small.conditions_shift.join(" | "),
  );
  // Wet forecast over dry practice → states it's an untested condition (no reference).
  const wet = buildRacePlan(bundle(), dryRuns(), RACE, { rain_risk_pct: 70 }, data);
  check(
    "R2-2: wet over dry practice is flagged as an untested condition (no reference)",
    wet.conditions_shift.some((l) => /[Rr]ain risk/.test(l) && /no wet reference/i.test(l)),
    wet.conditions_shift.join(" | "),
  );
}

if (failures > 0) {
  console.error(`\n${failures} race-plan test(s) failed`);
  process.exit(1);
}
console.log("\nAll race-plan tests passed");
