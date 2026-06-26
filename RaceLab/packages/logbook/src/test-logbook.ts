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
check("conditionTags emits the surface FAMILY tag (clay) so surface rules fire", tags.includes("clay"), tags.join(","));
check("conditionTags has NO power tag without a power class", !tags.includes("nitro_power") && !tags.includes("stock_blinky"));
check("conditionTags(nitro) emits the nitro power tag (gearing rules can fire)", conditionTags(s.runs[0], "nitro").includes("nitro_power"));
check("conditionTags(electric) emits the brushless power tag", conditionTags(s.runs[0], "electric").includes("stock_blinky"));
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

// — driver record (driverStats: career vs yearly, podiums/wins from competitive runs only)
{
  let d = initLogbook();
  d = addRun(d, runFixture({ created_at: "2025-08-10T14:00:00.000Z", type: "main", result: { position: 1, entrants: 12, best_lap_s: 34.5 } }), "2025-08-10T14:00:00.000Z").state;
  d = addRun(d, runFixture({ type: "qualifier", result: { position: 3 } }), T0).state;
  d = addRun(d, runFixture({ created_at: T1, type: "main", result: { position: 5 } }), T1).state;
  d = addRun(d, runFixture({ created_at: T2, result: { position: 2, best_lap_s: 33.2 } }), T2).state; // practice: position ignored
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
  check("position + entrants survive the round-trip", rt.ok && rt.state.runs[0].result?.position === 1 && rt.state.runs[0].result?.entrants === 12);
}

// — delete
s = deleteRun(s, a1.run.id);
check("deleteRun removes the run", s.runs.length === 1 && s.runs[0].id === a2.run.id);
check("deleteRun unknown id is a no-op (same reference)", deleteRun(s, "nope") === s);

// — v2 fields (D27): round-trip + user best/avg never overwritten from laps_list
{
  let v2 = initLogbook();
  v2 = addRun(
    v2,
    runFixture({
      car_id: "car-001",
      track_id: "track-mrt",
      feeling: 72,
      fatigue: 3,
      conditions: { grip: "medium", wind_kmh: 18, pressure_hpa: 1013, sun_pct: 80 },
      result: { best_lap_s: 34.0, avg_lap_s: 35.1, laps_list: [35.2, 33.9, 35.4], fuel_used_cc: 120 },
      feedback: { tags: [], corner_notes: [{ corner: 3, note: "washes wide" }] },
    }),
    T2,
  ).state;
  const r2 = deserializeLogbook(serializeLogbook(v2));
  check("v2 fields survive the round-trip byte-for-byte", r2.ok && JSON.stringify(r2.state) === JSON.stringify(v2));
  const back = r2.ok ? r2.state.runs[0] : undefined;
  check(
    "v2 fields land where they were put",
    back?.car_id === "car-001" &&
      back.track_id === "track-mrt" &&
      back.feeling === 72 &&
      back.fatigue === 3 &&
      back.conditions.wind_kmh === 18 &&
      back.conditions.pressure_hpa === 1013 &&
      back.conditions.sun_pct === 80 &&
      back.result?.fuel_used_cc === 120 &&
      back.result.laps_list?.length === 3 &&
      back.feedback.corner_notes?.[0]?.note === "washes wide",
  );
  check(
    "stored best/avg NOT overwritten from laps_list (user override wins; lapStats is for callers)",
    back?.result?.best_lap_s === 34.0 && lapStats(back.result.laps_list!).best === 33.9,
  );
}

// — format-1 migration: a stored v1 blob must read clean, never as corruption
{
  const v1raw =
    '{"format":1,"state":{"runs":[{"id":"run-old","created_at":"2026-05-01T10:00:00.000Z","type":"practice","car_template_id":"kyosho-inferno-mp11","setup_version_id":"kyosho-inferno-mp11/kit","setup_name":"Kit setup","track":{"name":"MRT","surface":"clay","indoor":false},"conditions":{"grip":"green"},"feedback":{"tags":[]}}]}}';
  const m = deserializeLogbook(v1raw);
  check(
    "format-1 envelope migrates: ok, run intact, new fields simply absent",
    m.ok && m.state.runs[0].id === "run-old" && m.state.runs[0].feeling === undefined,
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
  const mk = (id: string, created_at: string, best_lap_s?: number, feeling?: number): RunEntry => ({
    ...runFixture({
      created_at,
      result: best_lap_s === undefined ? undefined : { best_lap_s, avg_lap_s: best_lap_s + 1 },
      feeling,
    }),
    id,
  });
  const list = [
    mk("A", T0, 34.5, 60),
    mk("B", T1, 33.9), // no feeling
    mk("C", T2, undefined, 80), // no laps
    mk("D", "2026-06-11T12:00:00.000Z", 34.5, 40), // ties A on best_lap
  ];
  const ids = (rs: RunEntry[]): string => rs.map((r) => r.id).join("");

  check("sortRuns: date defaults desc (newest first)", ids(sortRuns(list, "date")) === "DCBA");
  check("sortRuns: date asc on demand", ids(sortRuns(list, "date", "asc")) === "ABCD");
  check("sortRuns: best_lap defaults asc (fastest first), missing last, ties stable", ids(sortRuns(list, "best_lap")) === "BADC");
  check("sortRuns: avg_lap defaults asc too", ids(sortRuns(list, "avg_lap")) === "BADC");
  check("sortRuns: missing values stay LAST even when desc", ids(sortRuns(list, "best_lap", "desc")) === "ADBC");
  check("sortRuns: feeling sorts, runs without it last", ids(sortRuns(list, "feeling")) === "CADB");
  check("sortRuns: input array untouched", ids(list) === "ABCD");

  // — groupBySetup
  const ga = { ...runFixture({ created_at: T0 }), id: "g1" };
  const gb = { ...runFixture({ created_at: T1, setup_version_id: "sv-aaa", setup_name: "Softer front" }), id: "g2" };
  const gc = { ...runFixture({ created_at: T2 }), id: "g3" };
  const groups = groupBySetup([ga, gb, gc]);
  check("groupBySetup: one group per setup version", groups.length === 2);
  check(
    "groupBySetup: most recent activity first",
    groups[0].setup_version_id === "kyosho-inferno-mp11/kit" && groups[1].setup_version_id === "sv-aaa",
  );
  check(
    "groupBySetup: runs keep input order, label carried",
    ids(groups[0].runs) === "g1g3" && groups[0].setup_name === "Kit setup" && groups[1].setup_name === "Softer front",
  );
  check("groupBySetup: empty input → no groups", groupBySetup([]).length === 0);
}

// — bundle: wind forwarding (v2)
{
  const windy = { ...s.runs[0], conditions: { ...s.runs[0].conditions, wind_kmh: 22 } };
  check("bundle: wind_kmh forwarded into weather", bundleFromRun(windy, {}, s).weather?.wind_kmh === 22);
  check("bundle: no wind logged → none in weather", bundleFromRun(s.runs[0], {}, s).weather?.wind_kmh === undefined);
}

// — v3 fields: duration_min + autonomy_test (format STAYS 2: all-new fields
//   are optional, so a round-trip — not a migration — proves compatibility)
{
  let v3 = initLogbook();
  v3 = addRun(
    v3,
    runFixture({
      duration_min: 25,
      result: { autonomy_test: { time_s: 420, laps: 12 } },
    }),
    T0,
  ).state;
  const raw3 = serializeLogbook(v3);
  check("v3: format stays 2 (no migration needed)", raw3.startsWith('{"format":2'));
  const r3 = deserializeLogbook(raw3);
  check("v3: round-trips byte-for-byte", r3.ok && JSON.stringify(r3.state) === JSON.stringify(v3));
  const back3 = r3.ok ? r3.state.runs[0] : undefined;
  check(
    "v3: duration_min + autonomy_test land where they were put",
    back3?.duration_min === 25 && back3.result?.autonomy_test?.time_s === 420 && back3.result.autonomy_test.laps === 12,
  );
}

// — bestAutonomy: practice-only, same-track-only, grip preferred, newest wins
{
  const mk = (
    id: string,
    over: Partial<Omit<RunEntry, "id">>,
  ): RunEntry => ({ ...runFixture(over), id });
  const runs: RunEntry[] = [
    // oldest first, logbook order
    mk("au-1", { track_id: "track-mrt", conditions: { grip: "green" }, result: { autonomy_test: { time_s: 410, laps: 12 } } }),
    mk("au-2", { created_at: T1, track_id: "track-mrt", conditions: { grip: "green" }, result: { autonomy_test: { time_s: 420, laps: 12 } } }),
    mk("au-3", { created_at: T2, track_id: "track-mrt", conditions: { grip: "medium" }, result: { autonomy_test: { time_s: 440 } } }),
    mk("au-race", { created_at: T2, type: "main", track_id: "track-mrt", conditions: { grip: "green" }, result: { autonomy_test: { time_s: 999 } } }),
    mk("au-other", { created_at: T2, track: { name: "Indoor Carpet", surface: "carpet", indoor: true }, track_id: "track-ic", conditions: { grip: "green" }, result: { autonomy_test: { time_s: 300 } } }),
    mk("au-lapsonly", { created_at: T2, track_id: "track-mrt", conditions: { grip: "green" }, result: { autonomy_test: { laps: 11 } } }),
  ];
  const best = bestAutonomy(runs, { track_id: "track-mrt", grip: "green" });
  check(
    "bestAutonomy: same track + same grip, most recent of those wins (older grip match beats newer mismatch)",
    best?.time_s === 420 && best.from_run_id === "au-2",
  );
  const fallback = bestAutonomy(runs, { track_id: "track-mrt", grip: "blue_groove" });
  check("bestAutonomy: no grip match → same track any grip, most recent", fallback?.time_s === 440 && fallback.from_run_id === "au-3");
  const byName = bestAutonomy(runs, { track_name: "MRT" });
  check("bestAutonomy: track name works when no id given; no grip → newest at the track", byName?.time_s === 440 && byName.from_run_id === "au-3");
  check("bestAutonomy: race runs never count (practice-only)", bestAutonomy(runs, { track_id: "track-mrt", grip: "green" })?.time_s !== 999);
  check("bestAutonomy: autonomy_test without time_s is not a measurement", bestAutonomy([runs[5]], { track_id: "track-mrt", grip: "green" }) === undefined);
  check("bestAutonomy: unknown track → undefined (never cross-track)", bestAutonomy(runs, { track_name: "Nowhere" }) === undefined);
  check("bestAutonomy: no track in opts → undefined (never cross-track)", bestAutonomy(runs, { grip: "green" }) === undefined);
  check("bestAutonomy: no data at all → undefined", bestAutonomy([], { track_id: "track-mrt" }) === undefined);
}

// — records (the PB-celebration source): a beat needs a prior to beat
{
  let r = initLogbook();
  const r1 = addRun(r, runFixture({ result: { best_lap_s: 34.0 } }), T0);
  r = r1.state;
  check("checkRecords: first lap ever is not a career best (nothing to beat)", checkRecords(r, r1.run).careerBestLap === false);
  const r2 = addRun(r, runFixture({ created_at: T1, result: { best_lap_s: 33.5 } }), T1);
  r = r2.state;
  check("checkRecords: faster lap beats the prior → career + track best", (() => { const rec = checkRecords(r, r2.run); return rec.careerBestLap && rec.trackBestLap; })());
  const r3 = addRun(r, runFixture({ created_at: T2, result: { best_lap_s: 36.0 } }), T2);
  r = r3.state;
  check("checkRecords: slower lap sets no lap record", (() => { const rec = checkRecords(r, r3.run); return !rec.careerBestLap && !rec.trackBestLap; })());

  let c = initLogbook();
  const c1 = addRun(c, runFixture({ type: "main", result: { position: 2 } }), T0);
  c = c1.state;
  check("checkRecords: first competitive top-3 → firstPodium, not firstWin", (() => { const rec = checkRecords(c, c1.run); return rec.firstPodium && !rec.firstWin; })());
  const c2 = addRun(c, runFixture({ created_at: T1, type: "main", result: { position: 1 } }), T1);
  c = c2.state;
  check("checkRecords: first win flagged; podium already happened", (() => { const rec = checkRecords(c, c2.run); return rec.firstWin && !rec.firstPodium; })());
}

// — achievements: deterministic, recomputed from the log, with live progress
{
  const empty = computeAchievements(initLogbook());
  check("achievements: empty log earns nothing, progress 0", empty.every((a) => !a.earned) && empty[0].progress === 0);
  let g = initLogbook();
  g = addRun(g, runFixture(), T0).state;
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
  p = addRun(p, runFixture({ type: "main", result: { position: 1 } }), T0).state;
  p = addRun(p, runFixture({ created_at: T1, type: "main", result: { position: 5 } }), T1).state;
  const d = driverStats(p);
  check("driverStats: podium_rate + win_rate over placed races", d.podium_rate === 0.5 && d.win_rate === 0.5);
  check("driverStats: rates undefined with no placed races", driverStats(initLogbook()).podium_rate === undefined);
}

if (failures > 0) {
  console.error(`\n${failures} logbook test(s) failed`);
  process.exit(1);
}
console.log("\nAll logbook tests passed");
