import type { SetupValues } from "../../sheets/src/sheets";
import { bundleFromRun, conditionTags, historyFromRuns } from "./bundle";
import { compareRuns } from "./compare";
import {
  addRun,
  deleteRun,
  initLogbook,
  lastRun,
  previousRun,
  rateRun,
  similarRuns,
  updateRun,
} from "./logbook";
import { deserializeLogbook, serializeLogbook } from "./persist";
import type { RunEntry } from "./types";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const T0 = "2026-06-11T09:00:00.000Z";
const T1 = "2026-06-11T10:00:00.000Z";
const T2 = "2026-06-11T11:00:00.000Z";

function runFixture(over: Partial<Omit<RunEntry, "id">> = {}): Omit<RunEntry, "id"> {
  return {
    created_at: T0,
    type: "practice",
    car_template_id: "kyosho-inferno-mp11",
    setup_version_id: "kyosho-inferno-mp11/kit",
    setup_name: "Kit setup",
    track: { name: "MRT", surface: "clay", indoor: false },
    conditions: { grip: "green", bumpiness: "rough", dusty: true, air_temp_c: 32, evolution: "improving" },
    tyres: { compound: "soft", wear: "worn", run_count: 6 },
    result: { best_lap_s: 34.2, avg_lap_s: 35.4, driver_confidence: 2 },
    feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }], text: "pushes everywhere" },
    ...over,
  };
}

// — state ops
let s = initLogbook();
const a1 = addRun(s, runFixture(), T0);
s = a1.state;
const a2 = addRun(
  s,
  runFixture({
    created_at: T1,
    setup_version_id: "sv-aaa",
    setup_name: "Softer front",
    conditions: { grip: "green", bumpiness: "rough", dusty: true, air_temp_c: 34 },
    result: { best_lap_s: 33.8, avg_lap_s: 35.0, driver_confidence: 4 },
  }),
  T1,
);
s = a2.state;
check("addRun appends chronologically with unique ids", s.runs.length === 2 && s.runs[0].id !== s.runs[1].id);
check("lastRun returns the newest", lastRun(s)?.id === a2.run.id);
check("previousRun finds the run before", previousRun(s, a2.run.id)?.id === a1.run.id);
check("previousRun of the first run is undefined", previousRun(s, a1.run.id) === undefined);

const beforeUpdate = s;
s = updateRun(s, a2.run.id, { note: "felt hooked up" });
check("updateRun patches in place, new state", s !== beforeUpdate && s.runs[1].note === "felt hooked up");
check("updateRun preserves id/created_at", s.runs[1].id === a2.run.id && s.runs[1].created_at === T1);
check("updateRun unknown id is a no-op (same reference)", updateRun(s, "nope", { note: "x" }) === s);

s = rateRun(s, a2.run.id, "better");
check("rateRun stores the outcome", s.runs[1].outcome === "better");

// — similar runs (Layer 2: what did I usually do in these conditions?)
const sim = similarRuns(s, { grip: "green" }, { surface: "clay", exclude_id: a2.run.id });
check("similarRuns matches grip+surface, excludes self, newest first", sim.length === 1 && sim[0].id === a1.run.id);
check("similarRuns respects grip", similarRuns(s, { grip: "blue_groove" }).length === 0);

// — comparison (Layer 2)
const SETUPS: Record<string, SetupValues> = {
  "kyosho-inferno-mp11/kit": { front_diff_oil: 8000, front_sway_bar: 2.3 },
  "sv-aaa": { front_diff_oil: 7000, front_sway_bar: 2.3 },
};
const cmp = compareRuns(s.runs[0], s.runs[1], (id) => SETUPS[id]);
check("compare: setup diff via the one diff function", cmp.setup_changes?.length === 1 && cmp.setup_changes[0].field === "front_diff_oil");
check("compare: later run faster (negative delta)", cmp.best_lap_delta_s === -0.4 && cmp.faster === "b");
check("compare: easier to drive (confidence +2)", cmp.confidence_delta === 2 && cmp.easier === "b");
check("compare: condition drift captured", cmp.condition_changes.some((c) => c.field === "air_temp_c"));
check("compare: summary warns setup AND conditions changed", cmp.summary.some((l) => l.includes("not attributable")));
const cmpNoSetup = compareRuns(s.runs[0], s.runs[1], () => undefined);
check("compare: unresolvable setup degrades gracefully", cmpNoSetup.setup_changes === undefined && cmpNoSetup.summary.some((l) => l.includes("unavailable")));

// — bundle bridge (Layer 1 → engine)
const tags = conditionTags(s.runs[0]);
check("conditionTags derives taxonomy vocabulary", ["low_grip", "dusty", "bumpy", "rough", "hot"].every((t) => tags.includes(t)), tags.join(","));
const hist = historyFromRuns(s, s.runs[0]);
check("history only includes RATED runs at same grip", hist.length === 1 && hist[0].outcome === "better");
const bundle = bundleFromRun(s.runs[0], SETUPS["kyosho-inferno-mp11/kit"], s);
check("bundle: chassis/track/feedback wired", bundle.chassis_template_id === "kyosho-inferno-mp11" && bundle.track.grip === "green" && bundle.feedback.tags.length === 1);
check("bundle: tyres + evolution forwarded", bundle.tyres?.wear === "worn" && bundle.track.evolution === "improving");
check("bundle: practice run → practice mode, mains → race_day", bundle.mode === "practice" && bundleFromRun({ ...s.runs[0], type: "main" }, {}, s).mode === "race_day");

// — persistence
const raw = serializeLogbook(s);
const round = deserializeLogbook(raw);
check("serialize/deserialize round-trips", round.ok && JSON.stringify(round.state) === JSON.stringify(s));
check("corrupt blob refused, not wiped", deserializeLogbook("{nope").ok === false);
check("newer format preserved as unknown_format", (() => { const r = deserializeLogbook(JSON.stringify({ format: 99, state: { runs: [] } })); return !r.ok && r.reason === "unknown_format"; })());

// — delete
s = deleteRun(s, a1.run.id);
check("deleteRun removes the run", s.runs.length === 1 && s.runs[0].id === a2.run.id);
check("deleteRun unknown id is a no-op (same reference)", deleteRun(s, "nope") === s);

if (failures > 0) {
  console.error(`\n${failures} logbook test(s) failed`);
  process.exit(1);
}
console.log("\nAll logbook tests passed");
