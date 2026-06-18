import type { SetupValues } from "../../sheets/src/sheets";
import { bundleFromRun, conditionTags, historyFromRuns } from "./bundle";
import { compareRuns } from "./compare";
import { carStatus, driverStats, seasonStats, checkRecords, computeAchievements, nextMilestone } from "./insights";
import { bestAutonomy } from "./autonomy";
import { lapStats } from "./laps";
import { groupBySetup, sortRuns } from "./sort";
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
import { runBestLap, runFeeling, runPosition } from "./types";
import type { RunEntry } from "./types";
import { makeRun } from "../../schema/src/index";
import type { CarId, MakeRunInput, SessionId, TrackId, TrackSnapshot } from "../../schema/src/index";

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

const SNAP: TrackSnapshot = { track_id: "trk-mrt" as TrackId, name: "MRT", surface: "clay", indoor: false };
const SNAP_IC: TrackSnapshot = { track_id: "trk-ic" as TrackId, name: "Indoor Carpet", surface: "carpet", indoor: true };

/** Mint a schema RunEntry the way the form does — summary timing, driver feel,
 *  run-level autonomy. Accepts the legacy-ish fields and routes them to schema. */
function mintRun(
  over: {
    created_at?: string;
    type?: MakeRunInput["type"];
    car_id?: string;
    track?: TrackSnapshot;
    setup_version_id?: string;
    setup_name?: string;
    conditions?: MakeRunInput["conditions"];
    summary?: MakeRunInput["timing"] extends infer _ ? Record<string, unknown> : never;
    result?: { best_lap_s?: number; avg_lap_s?: number; laps_list?: number[]; position?: number; entrants?: number; driver_confidence?: number };
    feedback?: MakeRunInput["feedback"];
    feeling?: number;
    fatigue?: number;
    autonomy_test?: { time_s?: number; laps?: number };
    duration_min?: number;
    outcome?: MakeRunInput["outcome"];
    note?: string;
    weather?: MakeRunInput["weather"];
  } = {},
): RunEntry {
  const now = over.created_at ?? T0;
  const r = over.result;
  const input: MakeRunInput = {
    type: over.type ?? "practice",
    session_id: "ss-test" as SessionId,
    car_id: (over.car_id ?? "car-001") as CarId,
    car_template_id: "kyosho-inferno-mp11",
    setup_version_id: over.setup_version_id ?? "kyosho-inferno-mp11/kit",
    setup_name: over.setup_name ?? "Kit setup",
    track: over.track ?? SNAP,
    conditions: over.conditions ?? { grip: "green", bumpiness: "rough", dusty: true, air_temp_c: 32, evolution: "improving" },
    feedback: over.feedback ?? { tags: [{ symptom: "understeer", phase: "mid_corner" }], text: "pushes everywhere" },
    ...(r !== undefined
      ? {
          timing: {
            kind: "summary" as const,
            result: {
              ...(r.best_lap_s !== undefined ? { best_lap_s: r.best_lap_s } : {}),
              ...(r.avg_lap_s !== undefined ? { avg_lap_s: r.avg_lap_s } : {}),
              ...(r.laps_list !== undefined ? { laps_list: r.laps_list } : {}),
              ...(r.position !== undefined ? { position: r.position } : {}),
              ...(r.entrants !== undefined ? { entrants: r.entrants } : {}),
              ...(r.driver_confidence !== undefined ? { driver_confidence: r.driver_confidence } : {}),
            },
          },
        }
      : {}),
    ...(over.feeling !== undefined || over.fatigue !== undefined
      ? { driver: { ...(over.feeling !== undefined ? { feeling_1to10: over.feeling } : {}), ...(over.fatigue !== undefined ? { fatigue_1to5: over.fatigue } : {}) } }
      : {}),
    ...(over.autonomy_test !== undefined ? { autonomy_test: over.autonomy_test } : {}),
    ...(over.duration_min !== undefined ? { duration_min: over.duration_min } : {}),
    ...(over.outcome !== undefined ? { outcome: over.outcome } : {}),
    ...(over.note !== undefined ? { note: over.note } : {}),
    ...(over.weather !== undefined ? { weather: over.weather } : {}),
  };
  const res = makeRun(input, now);
  if (!res.ok) throw new Error(`fixture makeRun failed: ${res.reason}`);
  return res.run;
}

// — state ops
let s = initLogbook();
const r1 = mintRun({ result: { best_lap_s: 34.2, avg_lap_s: 35.4, driver_confidence: 2 } });
const a1 = addRun(s, r1);
s = a1.state;
const r2 = mintRun({
  created_at: T1,
  setup_version_id: "sv-aaa",
  setup_name: "Softer front",
  conditions: { grip: "green", bumpiness: "rough", dusty: true, air_temp_c: 34 },
  result: { best_lap_s: 33.8, avg_lap_s: 35.0, driver_confidence: 4 },
});
const a2 = addRun(s, r2);
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

// — similar runs
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
check("bundle: track_id + evolution forwarded", bundle.track.track_id === "trk-mrt" && bundle.track.evolution === "improving");
check("bundle: practice run → practice mode, mains → race_day", bundle.mode === "practice" && bundleFromRun({ ...s.runs[0], type: "main" }, {}, s).mode === "race_day");

// — persistence
const raw = serializeLogbook(s);
const round = deserializeLogbook(raw);
check("serialize/deserialize round-trips", round.ok && JSON.stringify(round.state) === JSON.stringify(s));
check("corrupt blob refused, not wiped", deserializeLogbook("{nope").ok === false);
check("newer format preserved as unknown_format", (() => { const r = deserializeLogbook(JSON.stringify({ format: 99, state: { runs: [] } })); return !r.ok && r.reason === "unknown_format"; })());

// — garage insights (carStatus + seasonStats)
check("carStatus: empty log → fresh", carStatus(initLogbook()).kind === "fresh");
check("carStatus: last run rated better → dialed", carStatus(s).kind === "dialed");
{
  const fighting = updateRun(s, a2.run.id, { outcome: undefined });
  const st = carStatus(fighting);
  check("carStatus: unrated run with symptom → fighting it", st.kind === "fighting" && (st as { symptom: string }).symptom === "understeer");
  const calm = updateRun(fighting, a2.run.id, { feedback: { tags: [] } });
  check("carStatus: no symptom, no rating → just ran", carStatus(calm).kind === "ran");
}
{
  const stats = seasonStats(s);
  check("seasonStats: counts runs and distinct tracks", stats.runs === 2 && stats.tracks === 1);
  check("seasonStats: best lap + which setup did it", stats.best_lap_s === 33.8 && stats.best_lap_setup === "Softer front");
  check("seasonStats: better streak counts rated runs from the end", stats.better_streak === 1);
  check("seasonStats: empty log is all zeros", seasonStats(initLogbook()).runs === 0 && seasonStats(initLogbook()).better_streak === 0);
}

// — driver record
{
  let d = initLogbook();
  d = addRun(d, mintRun({ created_at: "2025-08-10T14:00:00.000Z", type: "main", result: { position: 1, entrants: 12, best_lap_s: 34.5 } })).state;
  d = addRun(d, mintRun({ type: "qualifier", result: { position: 3 } })).state;
  d = addRun(d, mintRun({ created_at: T1, type: "main", result: { position: 5 } })).state;
  d = addRun(d, mintRun({ created_at: T2, result: { position: 2, best_lap_s: 33.2 } })).state; // practice: position ignored for races
  const career = driverStats(d);
  check(
    "driverStats career: races/podiums/wins across years, practice never scores",
    career.runs === 4 && career.races === 3 && career.podiums === 2 && career.wins === 1,
  );
  check("driverStats career: best lap may come from practice", career.best_lap_s === 33.2);
  const y26 = driverStats(d, "2026");
  check("driverStats yearly: only that year counts", y26.runs === 3 && y26.races === 2 && y26.podiums === 1 && y26.wins === 0);
  check("driverStats: empty log is all zeros", driverStats(initLogbook()).races === 0 && driverStats(initLogbook()).podiums === 0);
  const rt = deserializeLogbook(serializeLogbook(d));
  check("position + entrants survive the round-trip", rt.ok && runPosition(rt.state.runs[0]) === 1 && (rt.state.runs[0].timing?.kind === "summary" && rt.state.runs[0].timing.result.entrants === 12));
}

// — delete
s = deleteRun(s, a1.run.id);
check("deleteRun removes the run", s.runs.length === 1 && s.runs[0].id === a2.run.id);
check("deleteRun unknown id is a no-op (same reference)", deleteRun(s, "nope") === s);

// — v2/v3 fields: round-trip + accessors
{
  let v2 = initLogbook();
  const run = mintRun({
    created_at: T2,
    car_id: "car-001",
    track: SNAP,
    feeling: 7,
    fatigue: 3,
    conditions: { grip: "medium" },
    result: { best_lap_s: 34.0, avg_lap_s: 35.1, laps_list: [35.2, 33.9, 35.4] },
    feedback: { tags: [], turns: [{ turn_n: 3, text: "washes wide" }] },
    duration_min: 25,
    autonomy_test: { time_s: 420, laps: 12 },
  });
  v2 = addRun(v2, run).state;
  const r2 = deserializeLogbook(serializeLogbook(v2));
  check("v2/v3 fields survive the round-trip byte-for-byte", r2.ok && JSON.stringify(r2.state) === JSON.stringify(v2));
  const back = r2.ok ? r2.state.runs[0] : undefined;
  check(
    "v2/v3 fields land where they were put",
    back?.car_id === "car-001" &&
      back.track_id === "trk-mrt" &&
      runFeeling(back) === 7 &&
      back.driver?.fatigue_1to5 === 3 &&
      back.duration_min === 25 &&
      back.autonomy_test?.time_s === 420 &&
      back.autonomy_test.laps === 12 &&
      (back.timing?.kind === "summary" && back.timing.result.laps_list?.length === 3) &&
      back.feedback.turns?.[0]?.text === "washes wide",
  );
  check(
    "stored best/avg NOT overwritten from laps_list (user override wins)",
    runBestLap(back!) === 34.0 && lapStats(Array.from(back!.timing?.kind === "summary" ? back!.timing.result.laps_list! : [])).best === 33.9,
  );
}

// — lapStats (pure helper)
check("lapStats: best is the minimum", lapStats([35.2, 33.9, 35.4]).best === 33.9);
check("lapStats: avg rounded to 2 decimals", lapStats([34.2, 33.8, 35.0]).avg === 34.33);
check("lapStats: single lap is its own best and avg", lapStats([34.5]).best === 34.5 && lapStats([34.5]).avg === 34.5);
check(
  "lapStats: empty list throws",
  (() => {
    try {
      lapStats([]);
      return false;
    } catch {
      return true;
    }
  })(),
);

// — sortRuns: defaults, missing-last, stability
{
  const mk = (created_at: string, best_lap_s?: number, feeling?: number): RunEntry =>
    mintRun({
      created_at,
      result: best_lap_s === undefined ? undefined : { best_lap_s, avg_lap_s: best_lap_s + 1 },
      feeling,
    });
  const A = mk(T0, 34.5, 6);
  const B = mk(T1, 33.9); // no feeling
  const C = mk(T2, undefined, 8); // no laps
  const D = mk("2026-06-11T12:00:00.000Z", 34.5, 4); // ties A on best_lap
  const idMap = new Map([[A.id, "A"], [B.id, "B"], [C.id, "C"], [D.id, "D"]]);
  const list = [A, B, C, D];
  const ids = (rs: RunEntry[]): string => rs.map((r) => idMap.get(r.id)).join("");

  check("sortRuns: date defaults desc (newest first)", ids(sortRuns(list, "date")) === "DCBA");
  check("sortRuns: date asc on demand", ids(sortRuns(list, "date", "asc")) === "ABCD");
  check("sortRuns: best_lap defaults asc, missing last, ties stable", ids(sortRuns(list, "best_lap")) === "BADC");
  check("sortRuns: avg_lap defaults asc too", ids(sortRuns(list, "avg_lap")) === "BADC");
  check("sortRuns: missing values stay LAST even when desc", ids(sortRuns(list, "best_lap", "desc")) === "ADBC");
  check("sortRuns: feeling sorts, runs without it last", ids(sortRuns(list, "feeling")) === "CADB");
  check("sortRuns: input array untouched", ids(list) === "ABCD");

  // — groupBySetup
  const ga = mintRun({ created_at: T0 });
  const gb = mintRun({ created_at: T1, setup_version_id: "sv-aaa", setup_name: "Softer front" });
  const gc = mintRun({ created_at: T2 });
  const gMap = new Map([[ga.id, "g1"], [gb.id, "g2"], [gc.id, "g3"]]);
  const gids = (rs: RunEntry[]): string => rs.map((r) => gMap.get(r.id)).join("");
  const groups = groupBySetup([ga, gb, gc]);
  check("groupBySetup: one group per setup version", groups.length === 2);
  check(
    "groupBySetup: most recent activity first",
    groups[0].setup_version_id === "kyosho-inferno-mp11/kit" && groups[1].setup_version_id === "sv-aaa",
  );
  check(
    "groupBySetup: runs keep input order, label carried",
    gids(groups[0].runs) === "g1g3" && groups[0].setup_name === "Kit setup" && groups[1].setup_name === "Softer front",
  );
  check("groupBySetup: empty input → no groups", groupBySetup([]).length === 0);
}

// — bundle: wind forwarding (from schema weather observation)
{
  const windy = mintRun({ weather: { source: "manual", observed_at: T0, wind_speed_kmh: 22 } });
  check("bundle: wind_speed_kmh forwarded into weather", bundleFromRun(windy, {}, s).weather?.wind_kmh === 22);
  check("bundle: no wind logged → none in weather", bundleFromRun(s.runs[0], {}, s).weather?.wind_kmh === undefined);
}

// — bestAutonomy: practice-only, same-track-only, grip preferred, newest wins
{
  const runs: RunEntry[] = [
    mintRun({ track: SNAP, conditions: { grip: "green" }, autonomy_test: { time_s: 410, laps: 12 } }),
    mintRun({ created_at: T1, track: SNAP, conditions: { grip: "green" }, autonomy_test: { time_s: 420, laps: 12 } }),
    mintRun({ created_at: T2, track: SNAP, conditions: { grip: "medium" }, autonomy_test: { time_s: 440 } }),
    mintRun({ created_at: T2, type: "main", track: SNAP, conditions: { grip: "green" }, autonomy_test: { time_s: 999 } }),
    mintRun({ created_at: T2, track: SNAP_IC, conditions: { grip: "green" }, autonomy_test: { time_s: 300 } }),
    mintRun({ created_at: T2, track: SNAP, conditions: { grip: "green" }, autonomy_test: { laps: 11 } }),
  ];
  const best = bestAutonomy(runs, { track_id: "trk-mrt", grip: "green" });
  check("bestAutonomy: same track + same grip, most recent wins", best?.time_s === 420);
  const fallback = bestAutonomy(runs, { track_id: "trk-mrt", grip: "blue_groove" });
  check("bestAutonomy: no grip match → same track any grip, most recent", fallback?.time_s === 440);
  const byName = bestAutonomy(runs, { track_name: "MRT" });
  check("bestAutonomy: track name works when no id given", byName?.time_s === 440);
  check("bestAutonomy: race runs never count (practice-only)", bestAutonomy(runs, { track_id: "trk-mrt", grip: "green" })?.time_s !== 999);
  check("bestAutonomy: autonomy_test without time_s is not a measurement", bestAutonomy([runs[5]], { track_id: "trk-mrt", grip: "green" }) === undefined);
  check("bestAutonomy: unknown track → undefined (never cross-track)", bestAutonomy(runs, { track_name: "Nowhere" }) === undefined);
  check("bestAutonomy: no track in opts → undefined (never cross-track)", bestAutonomy(runs, { grip: "green" }) === undefined);
  check("bestAutonomy: no data at all → undefined", bestAutonomy([], { track_id: "trk-mrt" }) === undefined);
}

// — records (the PB-celebration source)
{
  let r = initLogbook();
  const r1 = addRun(r, mintRun({ result: { best_lap_s: 34.0 } }));
  r = r1.state;
  check("checkRecords: first lap ever is not a career best", checkRecords(r, r1.run).careerBestLap === false);
  const r2 = addRun(r, mintRun({ created_at: T1, result: { best_lap_s: 33.5 } }));
  r = r2.state;
  check("checkRecords: faster lap beats the prior → career + track best", (() => { const rec = checkRecords(r, r2.run); return rec.careerBestLap && rec.trackBestLap; })());
  const r3 = addRun(r, mintRun({ created_at: T2, result: { best_lap_s: 36.0 } }));
  r = r3.state;
  check("checkRecords: slower lap sets no lap record", (() => { const rec = checkRecords(r, r3.run); return !rec.careerBestLap && !rec.trackBestLap; })());

  let c = initLogbook();
  const c1 = addRun(c, mintRun({ type: "main", result: { position: 2 } }));
  c = c1.state;
  check("checkRecords: first competitive top-3 → firstPodium, not firstWin", (() => { const rec = checkRecords(c, c1.run); return rec.firstPodium && !rec.firstWin; })());
  const c2 = addRun(c, mintRun({ created_at: T1, type: "main", result: { position: 1 } }));
  c = c2.state;
  check("checkRecords: first win flagged; podium already happened", (() => { const rec = checkRecords(c, c2.run); return rec.firstWin && !rec.firstPodium; })());
}

// — achievements
{
  const empty = computeAchievements(initLogbook());
  check("achievements: empty log earns nothing, progress 0", empty.every((a) => !a.earned) && empty[0].progress === 0);
  let g = initLogbook();
  g = addRun(g, mintRun()).state;
  const ach = computeAchievements(g);
  check("achievements: First Run earned at 1 run", ach.find((a) => a.id === "first-run")!.earned === true);
  check("achievements: Regular shows live progress 1/10", (() => { const a = ach.find((x) => x.id === "regular")!; return !a.earned && a.hint === "1 / 10 runs"; })());
}

// — milestones
check("nextMilestone: 12 → next 25, prev 10", (() => { const m = nextMilestone(12); return m?.next === 25 && m.prev === 10 && Math.abs(m.progress - 2 / 15) < 1e-9; })());
check("nextMilestone: 0 → next 1, prev 0", (() => { const m = nextMilestone(0); return m?.next === 1 && m.prev === 0; })());
check("nextMilestone: past the top step → null", nextMilestone(2000) === null);

// — driver rates (brag stats)
{
  let p = initLogbook();
  p = addRun(p, mintRun({ type: "main", result: { position: 1 } })).state;
  p = addRun(p, mintRun({ created_at: T1, type: "main", result: { position: 5 } })).state;
  const d = driverStats(p);
  check("driverStats: podium_rate + win_rate over placed races", d.podium_rate === 0.5 && d.win_rate === 0.5);
  check("driverStats: rates undefined with no placed races", driverStats(initLogbook()).podium_rate === undefined);
}

if (failures > 0) {
  console.error(`\n${failures} logbook test(s) failed`);
  process.exit(1);
}
console.log("\nAll logbook tests passed");
