import { loadKBData } from "./node-kb";
import { analyzeRuns } from "./reports";
import type { RunAnalysisReport } from "./reports";
import { makeOutcomeRecord, makeRun } from "../../schema/src/runs";
import type { OutcomeRecord, RunEntry } from "../../schema/src/runs";
import { makeId } from "../../schema/src/ids";
import type { TrackSnapshot } from "../../schema/src/tracks";

/** analyzeRuns on a realistic 3-run fixture (D18: deterministic, no I/O). */

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

// deterministic entropy so the whole fixture is reproducible
let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const T0 = "2026-06-10T09:00:00.000Z";
const session_id = makeId("ss", Date.parse(T0), rand);
const car_id = makeId("car", Date.parse(T0), rand);
const track: TrackSnapshot = {
  track_id: makeId("trk", Date.parse(T0), rand),
  name: "MRT Club Track",
  surface: "clay",
  indoor: false,
};

function mustRun(r: ReturnType<typeof makeRun>): RunEntry {
  if (!r.ok) {
    console.log(`✗ FATAL: fixture run rejected: ${r.reason}`);
    process.exit(1);
  }
  return r.run;
}

const base = {
  session_id,
  car_id,
  car_name: "MP11 #1",
  car_template_id: "kyosho-inferno-mp11",
  setup_version_id: "sv-base",
  setup_name: "Kit baseline",
  track,
};

// Run 1 — morning practice: stable pace, driver reports mid-corner push
const run1 = mustRun(
  makeRun(
    {
      ...base,
      type: "practice",
      conditions: { grip: "green", dusty: true, bumpiness: "medium", air_temp_c: 18 },
      timing: {
        kind: "laps",
        laps: [35.2, 35.0, 35.1, 35.3, 35.2, 35.1, 35.4, 35.2, 35.3, 35.2].map((t, i) => ({
          n: i + 1,
          t_s: t,
          source: "manual" as const,
        })),
      },
      feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }], text: "pushes mid corner" },
    },
    T0,
    rand,
  ),
);

// Run 2 — qualifier on worn tyres: clear cliff from lap 11
const run2 = mustRun(
  makeRun(
    {
      ...base,
      type: "qualifier",
      conditions: { grip: "green", dusty: true, bumpiness: "medium", air_temp_c: 21 },
      tyres: { wear: "worn", run_count: 6 },
      timing: {
        kind: "laps",
        laps: [
          35.2, 35.0, 35.1, 35.3, 35.2, 35.1, 35.4, 35.2, 35.3, 35.2,
          36.1, 36.3, 36.2, 36.4, 36.5, 36.6,
        ].map((t, i) => ({ n: i + 1, t_s: t, source: "manual" as const })),
      },
      feedback: { tags: [] },
    },
    "2026-06-10T11:00:00.000Z",
    rand,
  ),
);

// Run 3 — main: summary timing, rated better, push persists
const run3 = mustRun(
  makeRun(
    {
      ...base,
      type: "main",
      setup_version_id: "sv-2",
      setup_name: "Softer front",
      conditions: { grip: "medium", air_temp_c: 24 },
      timing: { kind: "summary", result: { best_lap_s: 34.8, avg_lap_s: 35.6, laps: 24, position: 3 } },
      feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }] },
      outcome: "better",
    },
    "2026-06-10T14:00:00.000Z",
    rand,
  ),
);

// Advised change rated WORSE at this track — must demote that rule in the next plan
const ocResult = makeOutcomeRecord(
  {
    session_id,
    car_id,
    car_name: "MP11 #1",
    setting: "front_sway_bar",
    change: "soften front sway bar 2.3 → 2.1",
    citations: ["kb-swaybar-front-softer-301"],
    outcome: "worse",
    setup_version_id: "sv-base",
    setup_name: "Kit baseline",
    track,
    conditions: { grip: "green", dusty: true },
    run_id: run1.id,
  },
  "2026-06-10T10:00:00.000Z",
  rand,
);
if (!ocResult.ok) {
  console.log(`✗ FATAL: fixture outcome rejected: ${ocResult.reason}`);
  process.exit(1);
}
const outcomes: OutcomeRecord[] = [ocResult.record];

const report = analyzeRuns([run1, run2, run3], data, { outcomes });

// ── Shape ─────────────────────────────────────────────────────────────────────
check("report kind/source", report.kind === "engineer_report" && report.source === "offline_deterministic");
check("run_count is 3", report.run_count === 3);
check("track names collected", report.track_names.length === 1 && report.track_names[0] === "MRT Club Track");
check("span covers first → last run", report.span?.from === T0 && report.span?.to === "2026-06-10T14:00:00.000Z");
check(
  "sections in canonical order",
  JSON.stringify(report.sections.map((s) => s.id)) ===
    JSON.stringify(["summary", "conditions", "pace", "tyres", "setup_changes", "next_plan"]),
  JSON.stringify(report.sections.map((s) => s.id)),
);

function section(id: string) {
  return report.sections.find((s) => s.id === id)!;
}
function text(id: string): string {
  return section(id).lines.map((l) => l.text).join("\n");
}

// ── Summary / conditions ──────────────────────────────────────────────────────
check("summary counts run types", /3 run\(s\).*1 practice \/ 1 qualifier \/ 1 main/.test(text("summary")));
check("summary lists setup versions", text("summary").includes("sv-base") && text("summary").includes("sv-2"));
check(
  "conditions rendered via schema renderConditions + conditionsToTags",
  /grip green.*dusty/.test(text("conditions")) && /KB tags: .*low_grip.*dusty/.test(text("conditions")),
);
check("conditions shift detected (green dusty → medium clean)", /Conditions shifted/.test(text("conditions")));

// ── Pace / tyres ──────────────────────────────────────────────────────────────
check(
  "pace via schema lapStats where laps exist",
  /Run 1 \(practice\): best 35s, avg 35.2s, consistency 9\d(\.\d)?% over 10 laps/.test(text("pace")),
  text("pace"),
);
check("summary-timing run echoed as driver-entered", /Run 3 \(main\): driver-entered summary.*P3/.test(text("pace")));
check("best-lap trend computed", /Best-lap trend/.test(text("pace")));
check(
  "tyre cliff via schema detectTyreCliff (lap 11, high confidence)",
  /Run 2 \(qualifier\): tyre cliff from lap 11.*confidence high/.test(text("tyres")),
  text("tyres"),
);
check("clean run reported without a cliff claim", /Run 1 \(practice\): no sustained tyre drop-off/.test(text("tyres")));

// ── Cliff → quantified observation + pit-timing recommendation (M2) ───────────
const tyres = section("tyres");
check(
  "cliff run gets a quantified drop-off observation with a pace-drop %",
  /Run 2 \(qualifier\): tyres fell off ~lap 11 \(pace dropped \d+(\.\d)?% vs the run's baseline\) — plan a stop before it\./.test(
    text("tyres"),
  ),
  text("tyres"),
);
check(
  "cliff run gets a pit-timing recommendation line tied to the cliff lap",
  tyres.lines.some(
    (l) => l.kind === "recommendation" && /cliff lands ~lap 11/.test(l.text) && /size stints to pit/.test(l.text),
  ),
  JSON.stringify(tyres.lines.map((l) => ({ kind: l.kind, text: l.text }))),
);
check(
  "cliff recommendation is grounded in lap data, NOT a fake KB citation (no citations field)",
  tyres.lines
    .filter((l) => l.kind === "recommendation")
    .every((l) => l.citations === undefined || l.citations.length === 0),
  JSON.stringify(tyres.lines.filter((l) => l.kind === "recommendation").map((l) => l.citations)),
);
check(
  "no-cliff run emits NO cliff/fell-off line (silent)",
  !tyres.lines.some((l) => l.text.includes("Run 1 (practice)") && /fell off|cliff lands/.test(l.text)),
  text("tyres"),
);
check(
  "summary-only run (run 3) emits NO tyre-cliff line at all (silent — no lap series)",
  !tyres.lines.some((l) => l.text.includes("Run 3")),
  text("tyres"),
);

// ── Setup-change timeline ─────────────────────────────────────────────────────
const timeline = section("setup_changes");
check(
  "advised change appears with citations",
  timeline.lines.some(
    (l) => l.text.includes("front_sway_bar") && l.text.includes("rated worse") && (l.citations ?? []).includes("kb-swaybar-front-softer-301"),
  ),
  JSON.stringify(timeline.lines),
);
check(
  "bare run rating appears as an observation",
  timeline.lines.some((l) => l.text.includes("run rated better") && l.kind === "observation"),
);

// ── Next plan ─────────────────────────────────────────────────────────────────
const plan = section("next_plan");
check(
  "next plan is KB-cited recommendations",
  plan.lines.length > 0 && plan.lines.every((l) => l.kind === "recommendation" && (l.citations ?? []).length > 0),
  JSON.stringify(plan.lines.map((l) => l.kind)),
);
check(
  "the worse-rated rule is demoted out of the next plan (history read half)",
  !plan.lines.some((l) => (l.citations ?? []).includes("kb-swaybar-front-softer-301")),
  JSON.stringify(plan.lines.map((l) => l.citations)),
);

// ── JSON round-trip (storage persists reports as opaque docs) ─────────────────
const roundTrip = JSON.parse(JSON.stringify(report)) as RunAnalysisReport;
check("report JSON-serializes cleanly (round-trip is identical)", deepEqual(roundTrip, report));

// ── Edge cases ────────────────────────────────────────────────────────────────
{
  const empty = analyzeRuns([], data);
  check("empty input → well-formed report", empty.run_count === 0 && empty.sections.length === 6);
  check(
    "empty input → next plan is an explicit refusal",
    empty.sections.find((s) => s.id === "next_plan")!.lines[0].kind === "refusal",
  );
}
{
  const alien = mustRun(
    makeRun(
      {
        ...base,
        car_template_id: "not-in-kb",
        type: "practice",
        conditions: { grip: "green" },
        feedback: { tags: [{ symptom: "understeer" }] },
      },
      T0,
      rand,
    ),
  );
  const r = analyzeRuns([alien], data);
  const line = r.sections.find((s) => s.id === "next_plan")!.lines[0];
  check(
    "unknown chassis template → refusal, never a throw",
    line.kind === "refusal" && line.text.includes("not-in-kb"),
  );
}
{
  // P0-1 regression: a pending_pdf model (resolves via category template) must
  // GROUND a next-plan, not refuse. analyzeRuns previously did a direct
  // data.templates[id] lookup (reports.ts:278) and refused on all 236 pending
  // models — the same bug fixed in plan.ts/raceday.ts.
  const pending = mustRun(
    makeRun(
      {
        ...base,
        car_template_id: "xray-t4",
        type: "practice",
        conditions: { grip: "high" },
        feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }] },
      },
      T0,
      rand,
    ),
  );
  const r = analyzeRuns([pending], data);
  const line = r.sections.find((s) => s.id === "next_plan")!.lines[0];
  check(
    "pending_pdf chassis (category fallback) → grounded next-plan, not a refusal",
    line.kind !== "refusal",
    `got kind=${line.kind}`,
  );
}
{
  const noFeedback = mustRun(
    makeRun(
      { ...base, type: "practice", conditions: { grip: "green" }, feedback: { tags: [] } },
      T0,
      rand,
    ),
  );
  const r = analyzeRuns([noFeedback], data);
  const line = r.sections.find((s) => s.id === "next_plan")!.lines[0];
  check("no feedback tags → refusal (grounded or silent)", line.kind === "refusal");
}

// ── M2 dedicated cliff cases (isolated runs) ──────────────────────────────────
function lapsTiming(times: number[]) {
  return {
    kind: "laps" as const,
    laps: times.map((t, i) => ({ n: i + 1, t_s: t, source: "manual" as const })),
  };
}

{
  // Clear cliff: ten ~35.1s laps, then six laps a full second slower.
  const cliffRun = mustRun(
    makeRun(
      {
        ...base,
        type: "qualifier",
        conditions: { grip: "green" },
        timing: lapsTiming([
          35.2, 35.0, 35.1, 35.3, 35.2, 35.1, 35.4, 35.2, 35.3, 35.2, 36.4, 36.6, 36.5, 36.7, 36.8, 36.6,
        ]),
        feedback: { tags: [] },
      },
      T0,
      rand,
    ),
  );
  const r = analyzeRuns([cliffRun], data);
  const tline = r.sections.find((s) => s.id === "tyres")!.lines.map((l) => l.text).join("\n");
  check(
    "isolated cliff run → 'tyres fell off' observation appears",
    /tyres fell off ~lap \d+ \(pace dropped \d+(\.\d)?% vs the run's baseline\)/.test(tline),
    tline,
  );
  check(
    "isolated cliff run → pit-timing recommendation present and grounded (no citations)",
    r.sections
      .find((s) => s.id === "tyres")!
      .lines.some((l) => l.kind === "recommendation" && /size stints to pit/.test(l.text) && (l.citations ?? []).length === 0),
    JSON.stringify(r.sections.find((s) => s.id === "tyres")!.lines),
  );
}

{
  // Flat laps — no drop-off. Must be SILENT: no fell-off / cliff-lands lines.
  const flatRun = mustRun(
    makeRun(
      {
        ...base,
        type: "practice",
        conditions: { grip: "green" },
        timing: lapsTiming([35.2, 35.0, 35.1, 35.3, 35.2, 35.1, 35.4, 35.2, 35.3, 35.2, 35.1, 35.2]),
        feedback: { tags: [] },
      },
      T0,
      rand,
    ),
  );
  const r = analyzeRuns([flatRun], data);
  const tlines = r.sections.find((s) => s.id === "tyres")!.lines;
  check(
    "flat-lap run → NO cliff observation/recommendation (silent)",
    !tlines.some((l) => /fell off|cliff lands/.test(l.text)),
    JSON.stringify(tlines.map((l) => l.text)),
  );
  check(
    "flat-lap run → no recommendation line at all in tyres section",
    !tlines.some((l) => l.kind === "recommendation"),
    JSON.stringify(tlines.map((l) => ({ kind: l.kind, text: l.text }))),
  );
}

{
  // Summary-only timing — no per-lap signal. Must be SILENT (no detectTyreCliff,
  // no invented cliff from a driver-entered best/avg).
  const summaryRun = mustRun(
    makeRun(
      {
        ...base,
        type: "main",
        conditions: { grip: "medium" },
        timing: { kind: "summary", result: { best_lap_s: 34.8, avg_lap_s: 35.6, laps: 24, position: 3 } },
        feedback: { tags: [] },
      },
      T0,
      rand,
    ),
  );
  const r = analyzeRuns([summaryRun], data);
  const tlines = r.sections.find((s) => s.id === "tyres")!.lines;
  check(
    "summary-only run → tyres section is the empty-set fallback, no cliff line",
    tlines.length === 1 && /No lap series logged/.test(tlines[0].text),
    JSON.stringify(tlines.map((l) => l.text)),
  );
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

console.log(failures === 0 ? "\nREPORTS: all analyzeRuns tests passed" : `\nREPORTS: ${failures} failures`);
if (failures > 0) process.exit(1);
