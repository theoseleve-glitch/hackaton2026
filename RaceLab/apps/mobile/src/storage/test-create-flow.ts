/**
 * Phase 2B create-flow integration test (Node/tsx) — proves the LIVE create path
 * end-to-end, headless (no device, no AsyncStorage), over the REAL code paths:
 *
 *     form-like input
 *        → schema entities  (makeCar / makeTrack / makeRun)
 *        → storage repos    (memoryStorage() → openRepos → put/getAll)
 *        → advice           (bundleFromRun → buildReport, grounded-or-silent)
 *        → reports repo     (round-trip the EngineerReport doc)
 *        → relaunch         (re-open repos over the SAME storage → survives)
 *
 * The cutover is tsc + unit-test green and boots on a device, but the migrated
 * CREATE path (the one a fresh user actually exercises) had no end-to-end proof.
 * This test is that proof. It deliberately uses the same factories the screens
 * use (makeCar from the garage form, makeTrack from the tracks form, makeRun
 * from the run log) and the same repos the RepoProvider opens.
 *
 * Run:  npx tsx apps/mobile/src/storage/test-create-flow.ts   (cwd = RaceLab/)
 */

import { memoryStorage, openRepos } from "../../../../packages/storage/src";
import {
  CUSTOM_CHASSIS_ID,
  makeCar,
  makeTrack,
  makeRun,
  makeId,
  isoToMs,
  snapshotTrack,
  effectiveTiming,
} from "../../../../packages/schema/src";
import type {
  Car,
  Track,
  RunEntry,
  SessionId,
  MakeRunInput,
} from "../../../../packages/schema/src";
import { bundleFromRun } from "../../../../packages/logbook/src";
import { buildReport, assertValidKBData } from "../../../../packages/engine/src";
import type { KBData } from "../../../../packages/engine/src";
// Load the KB exactly the way the APP does (apps/mobile/src/kb.ts): the
// pre-compiled packages/kb/bundle.json, validated through assertValidKBData.
// (The engine's own tests use the Node-only node-kb.ts loader, which pulls
//  node:fs into the mobile tsconfig — this bundle path is the true live one.)
import bundleJson from "../../../../packages/kb/bundle.json";

// ── tiny assert harness ─────────────────────────────────────────────────────
let passed = 0;
let failures = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// Deterministic clock + rng so the run is reproducible and id-stable.
const NOW = "2026-06-19T10:00:00.000Z";
let seed = 1;
const rand = (): number => {
  // tiny LCG — enough to give makeId distinct suffixes within one run
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

/** Hard stop that NARROWS for tsc (process.exit isn't typed `never` here). */
function fail(msg: string): never {
  console.error(`\n  ABORT ${msg}`);
  throw new Error(msg);
}

/** No NaN / Infinity / literal "undefined"|"NaN" leaked into rendered text. */
function isCleanText(s: unknown): boolean {
  if (typeof s !== "string") return s === undefined;
  return !/\b(undefined|NaN|Infinity)\b/.test(s);
}

async function main(): Promise<void> {
  // ── 1. in-memory store + repos (the RepoProvider construction path) ────────
  console.log("\n[1] open in-memory store + repos");
  const storage = memoryStorage();
  const opened = await openRepos(storage, { rand });
  check("openRepos ok", opened.ok, opened.ok ? undefined : opened.reason);
  if (!opened.ok) fail(`openRepos failed: ${opened.reason}`);
  const repos = opened.repos;

  // ── 2. CREATE a Car (the garage form: CUSTOM_CHASSIS_ID + custom overrides) ─
  console.log("\n[2] create Car → put → getAll round-trip");
  const carRes = makeCar(
    {
      name: "Race MP11",
      chassis_id: CUSTOM_CHASSIS_ID,
      power_type: "nitro",
      template_id: "kyosho-inferno-mp11",
      drivetrain: "4wd",
      fuel_tank_cc: 125,
      transponder_id: "TR-99821",
      custom: { brand: "Kyosho", model: "Inferno MP11", category: "buggy", scale: "1/8" },
    },
    NOW,
    undefined,
    rand,
  );
  check("makeCar ok", carRes.ok, carRes.ok ? undefined : carRes.reason);
  if (!carRes.ok) fail(`makeCar rejected: ${carRes.reason}`);
  const car: Car = carRes.car;

  const carPut = await repos.cars.put(car, NOW);
  check("cars.put ok", carPut.ok, carPut.ok ? undefined : carPut.reason);

  const carsAll = await repos.cars.getAll();
  check("cars.getAll ok", carsAll.ok, carsAll.ok ? undefined : carsAll.reason);
  if (carsAll.ok) {
    check("exactly 1 car stored", carsAll.values.length === 1, String(carsAll.values.length));
    const got = carsAll.values[0];
    check("car id round-trips", got.id === car.id);
    check(
      "car identity facts survive (custom brand/model/category/scale)",
      got.custom?.brand === "Kyosho" &&
        got.custom?.model === "Inferno MP11" &&
        got.custom?.category === "buggy" &&
        got.custom?.scale === "1/8",
    );
    check(
      "car persisted product fields survive (power/drivetrain/tank/transponder/template)",
      got.power_type === "nitro" &&
        got.drivetrain === "4wd" &&
        got.fuel_tank_cc === 125 &&
        got.transponder_id === "TR-99821" &&
        got.template_id === "kyosho-inferno-mp11" &&
        got.chassis_id === CUSTOM_CHASSIS_ID,
    );
    check("no corrupt cars on read", carsAll.corrupt.length === 0);
  }

  // ── 3. CREATE a Track (the tracks form) ────────────────────────────────────
  console.log("\n[3] create Track → put → getAll round-trip");
  const trackRes = makeTrack(
    {
      name: "Club Clay Track",
      surface: "clay",
      indoor: false,
      is_public: true,
      traits: ["technical", "dusty"],
    },
    NOW,
    rand,
  );
  check("makeTrack ok", trackRes.ok, trackRes.ok ? undefined : trackRes.reason);
  if (!trackRes.ok) fail(`makeTrack rejected: ${trackRes.reason}`);
  const track: Track = trackRes.track;

  const trackPut = await repos.tracks.put(track, NOW);
  check("tracks.put ok", trackPut.ok, trackPut.ok ? undefined : trackPut.reason);

  const tracksAll = await repos.tracks.getAll();
  check("tracks.getAll ok", tracksAll.ok, tracksAll.ok ? undefined : tracksAll.reason);
  if (tracksAll.ok) {
    check("exactly 1 track stored", tracksAll.values.length === 1, String(tracksAll.values.length));
    const got = tracksAll.values[0];
    check("track id + identity round-trip", got.id === track.id && got.name === "Club Clay Track" && got.surface === "clay" && got.indoor === false);
    check("no corrupt tracks on read", tracksAll.corrupt.length === 0);
  }

  // ── 4. CREATE a Run referencing the car + a snapshot of the track ──────────
  console.log("\n[4] create Run (snapshotTrack + summary timing) → put → getAll");
  const snap = snapshotTrack(track);
  // a real session id — the repo's parse-on-write validates ids with isId("ss",…),
  // so a hand-typed "ss-create-flow" would (correctly) be refused on store.
  const sessionId = makeId("ss", isoToMs(NOW), rand) as SessionId;
  const runInput: MakeRunInput = {
    type: "practice",
    session_id: sessionId,
    car_id: car.id,
    car_name: car.name,
    car_template_id: car.template_id ?? "kyosho-inferno-mp11",
    setup_version_id: "kyosho-inferno-mp11/kit",
    setup_name: "Kit setup",
    track: snap,
    conditions: { grip: "green", bumpiness: "rough", dusty: true, air_temp_c: 32, evolution: "improving" },
    feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }], text: "pushes mid-corner" },
    timing: { kind: "summary", result: { best_lap_s: 34.2, avg_lap_s: 35.4, driver_confidence: 3 } },
  };
  const runRes = makeRun(runInput, NOW, rand);
  check("makeRun ok", runRes.ok, runRes.ok ? undefined : runRes.reason);
  if (!runRes.ok) fail(`makeRun rejected: ${runRes.reason}`);
  const run: RunEntry = runRes.run;

  check("run references the created car_id", run.car_id === car.id);
  check("run froze the track snapshot (track_id + name)", run.track_id === track.id && run.track.name === track.name);

  const timing = effectiveTiming(run);
  check("effectiveTiming returns the summary result", timing !== null && timing.best_lap_s === 34.2 && timing.avg_lap_s === 35.4, JSON.stringify(timing));

  const runPut = await repos.runs.put(run, NOW);
  check("runs.put ok", runPut.ok, runPut.ok ? undefined : runPut.reason);

  const runsAll = await repos.runs.getAll();
  check("runs.getAll ok", runsAll.ok, runsAll.ok ? undefined : runsAll.reason);
  if (runsAll.ok) {
    check("exactly 1 run stored", runsAll.values.length === 1, String(runsAll.values.length));
    const got = runsAll.values[0];
    check("run id round-trips", got.id === run.id);
    check(
      "run timing survives the round-trip (effectiveTiming on the stored copy)",
      (() => {
        const tg = effectiveTiming(got);
        return tg !== null && tg.best_lap_s === 34.2 && tg.avg_lap_s === 35.4;
      })(),
    );
    check("no corrupt runs on read", runsAll.corrupt.length === 0);
  }

  // ── 5. ADVICE PATH: run + setup → bundle → report (grounded-or-silent) ─────
  console.log("\n[5] advice path: bundleFromRun → buildReport");
  const KB = bundleJson as unknown as KBData;
  assertValidKBData(KB); // same validation gate the app runs at boot
  const setup: Record<string, string | number> = {
    front_diff_oil: 8000,
    center_diff_oil: 5000,
    rear_diff_oil: 3000,
    front_sway_bar: 2.3,
    rear_sway_bar: 2.8,
  };
  const logbook = { runs: [run] };

  let report: ReturnType<typeof buildReport> | undefined;
  let threw = false;
  try {
    const bundle = bundleFromRun(run, setup, logbook);
    check(
      "bundle wired from the run (chassis + track grip + feedback)",
      bundle.chassis_template_id === (car.template_id ?? "kyosho-inferno-mp11") &&
        bundle.track.grip === "green" &&
        bundle.feedback.tags.length === 1,
    );
    check("bundle forwards the stored track_id", bundle.track.track_id === track.id);
    report = buildReport(bundle, KB);
  } catch (e) {
    threw = true;
    check("advice path did NOT throw", false, String(e));
  }
  check("advice path did NOT throw", !threw);

  if (report) {
    const r = report;
    check("report kind is valid", r.kind === "report" || r.kind === "do_nothing" || r.kind === "refusal", r.kind);
    // grounded-or-silent: any emitted setup change MUST cite ≥1 KB rule, and
    // every citation it makes MUST be echoed in the rationale (no orphan advice).
    if (r.kind === "report") {
      check("a report recommends a primary change", r.primary !== undefined);
      if (r.primary) {
        check("primary change is grounded (cites ≥1 KB rule)", r.primary.citations.length > 0);
        check(
          "every primary citation is surfaced in the rationale (grounded)",
          r.primary.citations.every((c) => r.rationale.includes(c)),
          r.rationale,
        );
        check("confidence mirrors the primary rule", r.confidence === r.primary.confidence, r.confidence);
      }
      if (r.secondary) {
        check("secondary (when present) uses a DIFFERENT lever", r.secondary.setting !== r.primary?.setting);
        check("secondary (when present) is grounded too", r.secondary.citations.length > 0);
      }
    }
    // no NaN / undefined / Infinity leaked as rendered text anywhere user-facing
    check(
      "no NaN/undefined/Infinity in rendered text",
      isCleanText(r.diagnosis) &&
        isCleanText(r.rationale) &&
        isCleanText(r.expected_behavior) &&
        isCleanText(r.conditions_echo) &&
        isCleanText(r.message) &&
        r.do_not_touch.every(isCleanText) &&
        r.driving_tips.every(isCleanText) &&
        (r.primary === undefined || (isCleanText(r.primary.change) && isCleanText(r.primary.mechanism) && isCleanText(r.primary.expected_effect))),
    );
  }

  // ── 6. ROUND-TRIP the report through repos.reports ─────────────────────────
  console.log("\n[6] persist the report through repos.reports");
  if (report) {
    const reportDoc = {
      id: `rep-${run.id}`,
      created_at: NOW,
      run_id: run.id,
      car_id: car.id,
      report, // the full EngineerReport stored opaquely (ReportDoc allows extra keys)
    };
    const repPut = await repos.reports.put(reportDoc, NOW);
    check("reports.put ok", repPut.ok, repPut.ok ? undefined : repPut.reason);

    const reportsAll = await repos.reports.getAll();
    check("reports.getAll ok", reportsAll.ok, reportsAll.ok ? undefined : reportsAll.reason);
    if (reportsAll.ok) {
      check("exactly 1 report stored", reportsAll.values.length === 1, String(reportsAll.values.length));
      const got = reportsAll.values[0] as { id: string; run_id?: string };
      check("report doc round-trips (id + run_id)", got.id === `rep-${run.id}` && got.run_id === run.id);
      check("no corrupt reports on read", reportsAll.corrupt.length === 0);
    }
  } else {
    check("report available to persist", false, "buildReport produced nothing");
  }

  // ── 7. RELAUNCH: re-open repos over the SAME storage (never-wipe) ──────────
  console.log("\n[7] relaunch: re-open repos over the SAME storage → entities survive");
  const reopened = await openRepos(storage, { rand });
  check("re-open repos ok (cold relaunch)", reopened.ok, reopened.ok ? undefined : reopened.reason);
  if (reopened.ok) {
    const r2 = reopened.repos;
    const [c2, t2, rn2, rp2] = await Promise.all([
      r2.cars.getAll(),
      r2.tracks.getAll(),
      r2.runs.getAll(),
      r2.reports.getAll(),
    ]);
    check("car survives relaunch", c2.ok && c2.values.length === 1 && c2.values[0].id === car.id);
    check("track survives relaunch", t2.ok && t2.values.length === 1 && t2.values[0].id === track.id);
    check("run survives relaunch", rn2.ok && rn2.values.length === 1 && rn2.values[0].id === run.id);
    check("report survives relaunch", rp2.ok && rp2.values.length === 1);
    check(
      "no duplication on relaunch (exactly one of each)",
      c2.ok && c2.values.length === 1 && t2.ok && t2.values.length === 1 && rn2.ok && rn2.values.length === 1,
    );
  }

  // ── summary ────────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failures} failed.`);
  if (failures === 0) {
    console.log("ALL CHECKS PASSED — create path round-trips: write + advice (grounded) + relaunch-survival.");
    process.exit(0);
  } else {
    console.error(`${failures} CHECK(S) FAILED.`);
    process.exit(1);
  }
}

void main().catch((e) => {
  console.error("test threw:", e);
  process.exit(1);
});
