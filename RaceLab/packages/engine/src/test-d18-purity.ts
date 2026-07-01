import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKBData } from "./node-kb";
import { recommend } from "./engineer";
import { buildReport } from "./report";
import { buildRacePlan, type RaceWindow, type SelectedRunSummary, type Forecast } from "./race-plan";
import { planRaceDay, type RaceDayInput } from "./raceday";
import { RaceEngineerChat } from "./chat";
import type { ContextBundle } from "./types";
import type { LearningTuple } from "../../schema/src/runs";
import type { WeatherObservation } from "../../schema/src/weather";
import type { TrackSnapshot } from "../../schema/src/tracks";

/**
 * D18 GUARD (spec §5) — the advice path is a pure function of (input, KBData):
 * no fs, no network, no clock, no RNG, never entitlement-gated. This test pins
 * that invariant for all FOUR entry points: recommend / buildReport+buildRacePlan
 * / planRaceDay / RaceEngineerChat.handle.
 *
 * 1. STATIC  — the advice-surface source must not import/call any IO module.
 * 2. RUNTIME — stub globalThis.fetch to throw, then exercise every entry point.
 * 3. DETERMINISM — same inputs → byte-identical JSON (no clock/RNG leaked in).
 * 4. ADVISOR-ALWAYS-FREE — no entitlement/paywall symbol on the advice path.
 *
 * The test loads the KB via node-kb (fs is fine — that's tooling); only the
 * advice path itself must stay IO-free.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string): string => readFileSync(join(here, f), "utf8");

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── 1. STATIC: forbidden IO imports/calls anywhere on the advice path ─────────
const ADVICE_FILES = [
  "engineer.ts",
  "report.ts",
  "race-plan.ts",
  "planner.ts",
  "raceday.ts",
  "reports.ts",
  "plan.ts",
  "chat.ts",
  "retrieval.ts",
  "history.ts",
  "nlu.ts",
  "offline.ts",
  "driving-tips.ts",
  "data.ts",
];

const FORBIDDEN: RegExp[] = [
  /from ["']node:/,
  /require\(["']fs/,
  /\bfetch\(/,
  /XMLHttpRequest/,
  /\bDate\.now\b/,
  /new Date\(\)/,
  /Math\.random/,
  /AsyncStorage/,
];

// Strip comments before the FORBIDDEN scan: a doc-comment that DOCUMENTS the
// invariant ("No Math.random, no Date") must not false-positive — only real code
// usage of a forbidden pattern should trip the guard.
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
for (const f of ADVICE_FILES) {
  const src = stripComments(read(f));
  for (const re of FORBIDDEN) {
    check(`D18 static: ${f} has no ${re}`, !re.test(src), `matched ${re}`);
  }
}

// ── 4. ADVISOR-ALWAYS-FREE: no entitlement/paywall symbol on the advice path ──
const ENTITLEMENT: RegExp[] = [
  /entitlement/i,
  /isPremium/i,
  /paywall/i,
  /subscription/i,
  /\bpro\b.*gate/i,
];
for (const f of ADVICE_FILES) {
  const src = read(f);
  for (const re of ENTITLEMENT) {
    check(`Advisor free: ${f} has no ${re}`, !re.test(src), `matched ${re}`);
  }
}

// ── 2. RUNTIME: stub network to throw, exercise every entry point ─────────────
const data = loadKBData();

const realFetch = (globalThis as { fetch?: unknown }).fetch;
(globalThis as { fetch: unknown }).fetch = () => {
  throw new Error("D18: network touched on the advice path");
};

const bundle: ContextBundle = {
  chassis_template_id: "kyosho-inferno-mp11",
  setup: { front_diff_oil: 8000, center_diff_oil: 5000, rear_diff_oil: 3000, front_sway_bar: 2.3, rear_sway_bar: 2.8, rear_toe: 3 },
  track: { name: "Club Track", surface: "clay", grip: "green", conditions: ["low_grip", "dusty"] },
  feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }] },
  mode: "practice",
};

const runs: SelectedRunSummary[] = [
  { date: "2026-06-08T14:00:00.000Z", track_name: "Club Track", grip: "medium", surface: "clay", air_temp_c: 22, avg_lap_s: 36.1, symptoms: ["understeer"] },
];
const raceWindow: RaceWindow = { start_iso: "2026-06-12T14:00:00.000Z", length_s: 600, type: "sprint" };
const forecast: Forecast = { air_temp_c: 32, rain_risk_pct: 70 };

// William composition inputs (schema-shaped) — pure data, no factories needed.
const williamTrack: TrackSnapshot = {
  track_id: "trk-d18",
  name: "Club Track",
  surface: "clay",
  indoor: false,
};
const williamForecast: readonly WeatherObservation[] = [
  {
    observed_at: "2026-06-12T14:00:00.000Z",
    source: "auto",
    air_temp_c: 32,
    precipitation_probability_pct: 70,
    wind_speed_kmh: 10,
  },
];
const williamPractice: readonly LearningTuple[] = [];

const raceDayInput: RaceDayInput = {
  practice: williamPractice,
  forecast: williamForecast,
  track: williamTrack,
  chassis_template_id: bundle.chassis_template_id,
  current_setup: bundle.setup,
};

try {
  recommend(bundle, data);
  check("D18 runtime: recommend() runs with fetch stubbed to throw", true);

  buildReport(bundle, data);
  check("D18 runtime: buildReport() runs with fetch stubbed to throw", true);

  buildRacePlan(bundle, runs, raceWindow, forecast, data);
  check("D18 runtime: buildRacePlan() (no william) runs", true);

  const plan = buildRacePlan(bundle, runs, raceWindow, forecast, data, {
    practice: williamPractice,
    forecastObs: williamForecast,
    track: williamTrack,
  });
  check(
    "D18 runtime: buildRacePlan() WITH william composition runs + composes adjustments",
    Array.isArray(plan.adjustments),
  );

  const r = planRaceDay(raceDayInput, data);
  check("D18 runtime: planRaceDay() runs and returns a verdict", r.ok || r.reason !== undefined);

  const chat = new RaceEngineerChat(bundle, data);
  chat.greeting();
  chat.handle("it pushes mid corner");
  check("D18 runtime: RaceEngineerChat.greeting()+handle() run", true);
} catch (err) {
  check("D18 runtime: no advice-path entry point touched fetch", false, (err as Error).message);
} finally {
  if (realFetch === undefined) {
    delete (globalThis as { fetch?: unknown }).fetch;
  } else {
    (globalThis as { fetch: unknown }).fetch = realFetch;
  }
}

// ── 3. DETERMINISM: same inputs → byte-identical JSON across two calls ────────
check(
  "D18 determinism: buildReport is byte-identical across two calls",
  JSON.stringify(buildReport(bundle, data)) === JSON.stringify(buildReport(bundle, data)),
);
check(
  "D18 determinism: buildRacePlan is byte-identical across two calls",
  JSON.stringify(buildRacePlan(bundle, runs, raceWindow, forecast, data)) ===
    JSON.stringify(buildRacePlan(bundle, runs, raceWindow, forecast, data)),
);
check(
  "D18 determinism: planRaceDay is byte-identical across two calls",
  JSON.stringify(planRaceDay(raceDayInput, data)) ===
    JSON.stringify(planRaceDay(raceDayInput, data)),
);

// ── 5. NEW CALL-SITE SWEEP: B1 (conditionsShift physics), B2 (readinessFacts
//    data-quality) and E1 (retrieval symptom-frequency boost) must be pure too —
//    same inputs → byte-identical, no clock/RNG/IO leaked into the new branches.
{
  // B1/B2: a hotter + rainy forecast with two runs exercises the mechanism
  // clauses and the <3-run data-quality line.
  const planA = buildRacePlan(bundle, runs, raceWindow, forecast, data);
  const planB = buildRacePlan(bundle, runs, raceWindow, forecast, data);
  check(
    "D18: race-plan with B1/B2 branches is byte-identical across two calls",
    JSON.stringify(planA) === JSON.stringify(planB),
  );
  check(
    "D18: B1 mechanism clause is present (deterministically) on the hot shift",
    planA.conditions_shift.some((l) => /grip|traction|brak/i.test(l)),
    planA.conditions_shift.join(" | "),
  );
  check(
    "D18: B2 data-quality line is present (deterministically)",
    planA.readiness.some((l) => /^(Good|Limited|Single) data:/.test(l)),
    planA.readiness.join(" | "),
  );

  // E1: a symptom tagged 3× exercises the frequency-boost branch in retrieve().
  const multiTag: ContextBundle = {
    ...bundle,
    feedback: {
      tags: [
        { symptom: "understeer", phase: "corner_entry" },
        { symptom: "understeer", phase: "mid_corner" },
        { symptom: "understeer", phase: "corner_exit" },
      ],
    },
  };
  const e1a = JSON.stringify(buildReport(structuredClone(multiTag), data));
  const e1b = JSON.stringify(buildReport(structuredClone(multiTag), data));
  check("D18: E1 symptom-frequency boost path is byte-identical across two calls", e1a === e1b);
}

assert.equal(failures, 0, `${failures} D18 purity check(s) failed`);
if (failures > 0) {
  process.exit(1);
}
console.log("\nAll D18 purity checks passed (advice path: no IO, no clock, no RNG, advisor free)");
