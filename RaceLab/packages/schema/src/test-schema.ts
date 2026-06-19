/**
 * racelab-schema test suite — assertion style mirrors packages/sessions:
 * plain checks, console output, exit(1) on any failure.
 */

import { isId, isoToMs, makeId } from "./ids";
import {
  CUSTOM_CHASSIS_ID,
  classLabels,
  makeCar,
  sectionApplies,
  sheetSections,
  visibleSections,
} from "./cars";
import type { ChassisRegistryEntry, SheetSection } from "./cars";
import { addTrackRecord, bestRecord, makeTrack, snapshotTrack } from "./tracks";
import type { Track, TrackTurn } from "./tracks";
import { deriveSky, makeWeatherObservation, resolveConditions, weatherAtTime } from "./weather";
import type { WeatherObservation } from "./weather";
import {
  conditionsToTags,
  effectiveTiming,
  fuelStats,
  lapDeltas,
  lapStats,
  learningTuples,
  makeOutcomeRecord,
  makeRun,
  positionDeltas,
  renderConditions,
  surfaceToTags,
  powerTypeToTags,
  buildConditionTags,
  toEngineHistory,
  toLapSeries,
} from "./runs";
import type { ImportedLaps, LapTime, MakeRunInput, RunConditions } from "./runs";
import {
  conditionsFromTags,
  liftSessionsOutcome,
  liftSessionsRun,
  liftTheoRunEntry,
} from "./bridge";
import type { SessionsOutcomeRecord, SessionsRun, TheoRunEntry } from "./bridge";
import {
  FEATURES,
  FREE_FEATURES,
  GRACE_DAYS,
  checkEntitlement,
  effectiveSubscriptionStatus,
  initAccount,
  makeDriverProfile,
  startTrial,
} from "./account";
import type { AccountState } from "./account";
import { detectTyreCliff, planRace } from "./strategy";
import { appendOutbox, entriesAfter, initOutbox, pruneOutbox } from "./outbox";
import {
  parseAccountState,
  parseCar,
  parseOutboxState,
  parseOutcomeRecord,
  parseRunEntry,
  parseTrack,
  parseWeatherObservation,
} from "./parse";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function fatal(label: string): never {
  console.log(`✗ FATAL: ${label}`);
  process.exit(1);
}
function throws(fn: () => void): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

const T0 = "2026-06-11T09:00:00.000Z";
const T1 = "2026-06-11T09:20:00.000Z";
const T2 = "2026-06-11T10:05:00.000Z";
const T3 = "2026-06-11T11:30:00.000Z";
const T4 = "2026-06-11T14:00:00.000Z";
const DAY = 86_400_000;

// ═══ ids ═════════════════════════════════════════════════════════════════════

console.log("\n— ids —");
{
  const id = makeId("car", Date.parse(T0));
  check("makeId shape: prefix-ts36-rand8", new RegExp(`^car-${Date.parse(T0).toString(36)}-[0-9a-z]{8}$`).test(id), id);
  const many = new Set<string>();
  for (let i = 0; i < 200; i++) many.add(makeId("run", Date.parse(T0)));
  check("makeId: 200 same-timestamp ids are unique", many.size === 200);
  check("makeId: every suffix is fixed-width 8", [...many].every((x) => x.split("-")[2].length === 8));
  check("makeId throws on NaN now_ms", throws(() => makeId("ss", NaN)));
  check("makeId throws on negative now_ms", throws(() => makeId("ss", -5)));
  check("isoToMs parses ISO", isoToMs(T0) === Date.parse(T0));
  check("isoToMs throws on garbage", throws(() => isoToMs("not-a-date")));
  check("isId accepts a generated id", isId("car", id));
  check("isId rejects a foreign prefix", !isId("trk", id));
  check("isId rejects garbage", !isId("car", "car-zzz"));
  check("makeId: injected rand is fully reproducible", makeId("car", Date.parse(T0), () => 0.5) === makeId("car", Date.parse(T0), () => 0.5));
  check("makeId: a rand yielding 0 still terminates fixed-width", new RegExp(`^car-${Date.parse(T0).toString(36)}-0{8}$`).test(makeId("car", Date.parse(T0), () => 0)));
}

// ═══ cars ════════════════════════════════════════════════════════════════════

console.log("\n— cars —");
const REGISTRY: ChassisRegistryEntry[] = [
  {
    chassis_id: "kyosho-inferno-mp11",
    template_id: "kyosho-inferno-mp11",
    brand: "Kyosho",
    model: "Inferno MP11",
    category: "buggy",
    scale: "1/8",
    type: "offroad-competition",
    default_power_type: "nitro",
  },
];
const carRes = makeCar(
  { name: "  MP11 #1  ", chassis_id: "kyosho-inferno-mp11", power_type: "nitro", transponder_id: "9954321" },
  T0,
  REGISTRY,
);
if (!carRes.ok) fatal("makeCar happy path rejected");
const car = carRes.car;
check("makeCar: id uses car- prefix + ts36", car.id.startsWith(`car-${Date.parse(T0).toString(36)}-`));
check("makeCar: name is trimmed", car.name === "MP11 #1");
check("makeCar: created_at stamped from now", car.created_at === T0);
check("makeCar: optional fields stay absent", car.photo_uri === undefined && car.notes === undefined);
check("makeCar: car is frozen", throws(() => { (car as { name: string }).name = "x"; }));
check("makeCar rejects an empty name", !makeCar({ name: "   ", chassis_id: "kyosho-inferno-mp11", power_type: "nitro" }, T0).ok);
check(
  "makeCar rejects an unknown chassis when a registry is given",
  (() => { const r = makeCar({ name: "Ghost", chassis_id: "nope", power_type: "nitro" }, T0, REGISTRY); return !r.ok && r.reason === "unknown_chassis"; })(),
);
check("makeCar accepts any chassis without a registry", makeCar({ name: "Ghost", chassis_id: "nope", power_type: "brushless" }, T0).ok);
check(
  "makeCar: CUSTOM_CHASSIS_ID bypasses the registry (unknown-chassis escape hatch)",
  (() => { const r = makeCar({ name: "Mugen MBX8", chassis_id: CUSTOM_CHASSIS_ID, power_type: "nitro" }, T0, REGISTRY); return r.ok && classLabels(r.car, REGISTRY) === null; })(),
);

const labels = classLabels(car, REGISTRY);
check("classLabels reads category/scale/type from the registry", labels !== null && labels.category === "buggy" && labels.scale === "1/8" && labels.type === "offroad-competition");
check("classLabels is null for an unknown chassis", classLabels({ chassis_id: "nope" }, REGISTRY) === null);

const nitroSheet = sheetSections("nitro");
const elecSheet = sheetSections("brushless");
check("sheetSections(nitro) = common + engine/clutch/fuel/exhaust", nitroSheet.includes("engine") && nitroSheet.includes("clutch") && nitroSheet.includes("fuel_system") && nitroSheet.includes("exhaust") && !nitroSheet.includes("esc"));
check("sheetSections(brushless) = common + esc/motor/gearing/battery", elecSheet.includes("esc") && elecSheet.includes("motor") && elecSheet.includes("gearing") && elecSheet.includes("battery") && !elecSheet.includes("engine"));
check("both sheets share the common sections", nitroSheet.includes("front_suspension") && elecSheet.includes("front_suspension") && nitroSheet.length === 10 && elecSheet.length === 10);

const SECTIONS: SheetSection[] = [
  { id: "geometry", label: "Geometry", fields: ["camber_f"] },
  { id: "clutch", label: "Clutch", fields: ["clutch_springs"], when: { power_type: ["nitro"] } },
  { id: "esc", label: "ESC", fields: ["esc_model"], when: { power_type: ["brushless"] } },
  { id: "eighth", label: "1/8 only", fields: ["x"], when: { scale: ["1/8"] } },
];
check("sectionApplies: no `when` is always visible", sectionApplies(undefined, { power_type: "nitro" }));
check("sectionApplies: power_type matches", sectionApplies({ power_type: ["nitro"] }, { power_type: "nitro", labels }));
check("sectionApplies: power_type mismatch hides", !sectionApplies({ power_type: ["brushless"] }, { power_type: "nitro", labels }));
check("sectionApplies: class facet matches via registry labels", sectionApplies({ scale: ["1/8"] }, { power_type: "nitro", labels }));
check("sectionApplies: class facet FAILS CLOSED without labels", !sectionApplies({ scale: ["1/8"] }, { power_type: "nitro" }));
const vis = visibleSections(SECTIONS, { power_type: "nitro", labels });
check("visibleSections filters by predicate", vis.length === 3 && vis.some((s) => s.id === "clutch") && !vis.some((s) => s.id === "esc"));

// ═══ tracks ══════════════════════════════════════════════════════════════════

console.log("\n— tracks —");
const TURNS: TrackTurn[] = [
  { n: 1, direction: "L", corner_type: "hairpin", bumps: "rough" },
  { n: 2, direction: "R", corner_type: "sweeper", banking: "off_camber" },
  { n: 3, direction: "L", corner_type: "jump_section", surface_override: "astro" },
];
const trackRes = makeTrack(
  {
    name: "MCD Raceway",
    surface: "clay",
    indoor: false,
    is_public: true,
    gps: { lat: 48.86, lon: 2.35 },
    layout: "2026-spring",
    turns: TURNS,
    records: [{ class: "1/8 nitro buggy", best_lap_s: 32.1, holder: "A. Pro", date: "2026-05-01", source: "manual" }],
    photos: ["file:///photos/mcd.jpg"],
  },
  T0,
);
if (!trackRes.ok) fatal("makeTrack happy path rejected");
const track = trackRes.track;
check("makeTrack: id uses trk- prefix", track.id.startsWith(`trk-${Date.parse(T0).toString(36)}-`));
check("makeTrack: turns/records/photos carried", track.turns?.length === 3 && track.records.length === 1 && track.photos?.length === 1);
check("makeTrack: track is deep-frozen (turns push throws)", throws(() => { (track.turns as unknown as { push: (x: unknown) => void }).push({}); }));
check("makeTrack: records array frozen", throws(() => { (track.records as unknown as { push: (x: unknown) => void }).push({}); }));
check("makeTrack: input turn objects are detached", (() => { TURNS[0].notes = "MUTATED"; return track.turns?.[0].notes === undefined; })());
check("makeTrack: records default to [] when omitted", (() => { const r = makeTrack({ name: "Bare", surface: "astro", indoor: true, is_public: false }, T0); return r.ok && r.track.records.length === 0; })());
check("makeTrack rejects an empty name", (() => { const r = makeTrack({ name: " ", surface: "clay", indoor: false, is_public: false }, T0); return !r.ok && r.reason === "empty_name"; })());
check("makeTrack rejects duplicate turn numbers", (() => { const r = makeTrack({ name: "X", surface: "clay", indoor: false, is_public: false, turns: [{ n: 1, direction: "L", corner_type: "hairpin" }, { n: 1, direction: "R", corner_type: "sweeper" }] }, T0); return !r.ok && r.reason === "duplicate_turn_n"; })());
check("makeTrack rejects turn n = 0", (() => { const r = makeTrack({ name: "X", surface: "clay", indoor: false, is_public: false, turns: [{ n: 0, direction: "L", corner_type: "hairpin" }] }, T0); return !r.ok && r.reason === "out_of_range"; })());
check("makeTrack rejects non-integer turn n", (() => { const r = makeTrack({ name: "X", surface: "clay", indoor: false, is_public: false, turns: [{ n: 1.5, direction: "L", corner_type: "hairpin" }] }, T0); return !r.ok && r.reason === "out_of_range"; })());
check("makeTrack rejects NaN turn n", (() => { const r = makeTrack({ name: "X", surface: "clay", indoor: false, is_public: false, turns: [{ n: NaN, direction: "L", corner_type: "hairpin" }] }, T0); return !r.ok && r.reason === "non_finite_numeric"; })());
check("makeTrack rejects out-of-range gps", (() => { const r = makeTrack({ name: "X", surface: "clay", indoor: false, is_public: false, gps: { lat: 95, lon: 0 } }, T0); return !r.ok && r.reason === "out_of_range"; })());
check("makeTrack rejects NaN gps", (() => { const r = makeTrack({ name: "X", surface: "clay", indoor: false, is_public: false, gps: { lat: 0, lon: NaN } }, T0); return !r.ok && r.reason === "non_finite_numeric"; })());
check("makeTrack rejects a record with NaN lap", (() => { const r = makeTrack({ name: "X", surface: "clay", indoor: false, is_public: false, records: [{ class: "c", best_lap_s: NaN, source: "manual" }] }, T0); return !r.ok && r.reason === "non_finite_numeric"; })());
check("makeTrack rejects a record with lap <= 0", (() => { const r = makeTrack({ name: "X", surface: "clay", indoor: false, is_public: false, records: [{ class: "c", best_lap_s: 0, source: "manual" }] }, T0); return !r.ok && r.reason === "out_of_range"; })());
check("makeTrack rejects a record with an empty class", (() => { const r = makeTrack({ name: "X", surface: "clay", indoor: false, is_public: false, records: [{ class: " ", best_lap_s: 30, source: "manual" }] }, T0); return !r.ok && r.reason === "empty_class"; })());

const rec2 = addTrackRecord(track, { class: "1/8 nitro buggy", best_lap_s: 31.8, holder: "B. Faster", source: "speedhive" });
if (!rec2.ok) fatal("addTrackRecord rejected a valid record");
const track2: Track = rec2.track;
check("addTrackRecord appends to a NEW frozen track", track2.records.length === 2 && track.records.length === 1 && Object.isFrozen(track2.records));
check("addTrackRecord rejects NaN", (() => { const r = addTrackRecord(track, { class: "c", best_lap_s: Infinity, source: "manual" }); return !r.ok && r.reason === "non_finite_numeric"; })());
check("bestRecord computes the class best (never stored)", bestRecord(track2, "1/8 nitro buggy")?.best_lap_s === 31.8);
check("bestRecord is null for a class with no record", bestRecord(track2, "1/10 buggy") === null);
check("bestRecord tie keeps the earliest appended", (() => { const r = addTrackRecord(track2, { class: "1/8 nitro buggy", best_lap_s: 31.8, holder: "C. Same", source: "manual" }); return r.ok && bestRecord(r.track, "1/8 nitro buggy")?.holder === "B. Faster"; })());

const snap = snapshotTrack(track2);
check("snapshotTrack: identity + turns, no records", snap.track_id === track2.id && snap.name === "MCD Raceway" && snap.layout === "2026-spring" && snap.turns?.length === 3 && !("records" in snap));
check("snapshotTrack: snapshot is frozen", throws(() => { (snap as { name: string }).name = "x"; }));

// ═══ weather ═════════════════════════════════════════════════════════════════

console.log("\n— weather —");
const obsRes = makeWeatherObservation({
  observed_at: T0,
  source: "auto",
  air_temp_c: 24,
  humidity_pct: 140,
  wind_speed_kmh: -3,
  wind_dir_deg: 370,
  pressure_hpa: 1013.2,
  precipitation_mm: -1,
  cloud_cover_pct: 130,
  sky: "cloudy",
});
if (!obsRes.ok) fatal("makeWeatherObservation happy path rejected");
const obs = obsRes.observation;
check("weather: humidity clamps to 100", obs.humidity_pct === 100);
check("weather: cloud cover clamps to 100", obs.cloud_cover_pct === 100);
check("weather: wind speed clamps to 0", obs.wind_speed_kmh === 0);
check("weather: precipitation clamps to 0", obs.precipitation_mm === 0);
check("weather: wind direction normalizes mod 360", obs.wind_dir_deg === 10);
check("weather: negative wind direction normalizes", (() => { const r = makeWeatherObservation({ observed_at: T0, source: "manual", wind_dir_deg: -90 }); return r.ok && r.observation.wind_dir_deg === 270; })());
check("weather: pressure (Patm) carried for nitro", obs.pressure_hpa === 1013.2);
check("weather: observation is frozen", throws(() => { (obs as { air_temp_c?: number }).air_temp_c = 1; }));
check("weather rejects NaN numerics", (() => { const r = makeWeatherObservation({ observed_at: T0, source: "auto", pressure_hpa: NaN }); return !r.ok && r.reason === "non_finite_numeric"; })());
check("weather rejects Infinity numerics", (() => { const r = makeWeatherObservation({ observed_at: T0, source: "auto", air_temp_c: Infinity }); return !r.ok && r.reason === "non_finite_numeric"; })());
check("weather rejects an unparseable timestamp", (() => { const r = makeWeatherObservation({ observed_at: "yesterday-ish", source: "backfill" }); return !r.ok && r.reason === "invalid_timestamp"; })());
check("weather rejects an offset-less (Open-Meteo local) timestamp", (() => { const r = makeWeatherObservation({ observed_at: "2026-06-11T09:00", source: "auto" }); return !r.ok && r.reason === "invalid_timestamp"; })());
check("weather accepts an explicit +02:00 offset", makeWeatherObservation({ observed_at: "2026-06-11T11:00:00+02:00", source: "auto" }).ok);
check("weather: rain probability clamps to [0, 100]", (() => { const r = makeWeatherObservation({ observed_at: T0, source: "auto", precipitation_probability_pct: 140 }); return r.ok && r.observation.precipitation_probability_pct === 100; })());
check("weather: rain probability rejects NaN", (() => { const r = makeWeatherObservation({ observed_at: T0, source: "auto", precipitation_probability_pct: NaN }); return !r.ok && r.reason === "non_finite_numeric"; })());
check(
  "deriveSky: documented raining/rain_risk/cloudy/sunny rule",
  deriveSky({ observed_at: T0, source: "auto", precipitation_mm: 0.4 }) === "raining" &&
    deriveSky({ observed_at: T0, source: "auto", precipitation_probability_pct: 45 }) === "rain_risk" &&
    deriveSky({ observed_at: T0, source: "auto", precipitation_probability_pct: 10, cloud_cover_pct: 80 }) === "cloudy" &&
    deriveSky({ observed_at: T0, source: "auto", cloud_cover_pct: 20 }) === "sunny" &&
    deriveSky({ observed_at: T0, source: "auto" }) === undefined,
);

// resolveConditions: manual wins per-field, provenance records both directions
const MANUAL: RunConditions = { grip: "medium", air_temp_c: 28, dusty: true };
const resolved = resolveConditions(obs, MANUAL);
check("resolveConditions: manual air_temp wins over auto", resolved.conditions.air_temp_c === 28);
check("resolveConditions: blank humidity auto-fills", resolved.conditions.humidity_pct === 100);
check("resolveConditions: blank sky auto-fills", resolved.conditions.sky === "cloudy");
check("resolveConditions: driver-observed fields pass through", resolved.conditions.grip === "medium" && resolved.conditions.dusty === true && resolved.conditions.track_temp_c === undefined);
check("resolveConditions: overridden records the manual win", resolved.provenance.overridden.length === 1 && resolved.provenance.overridden[0] === "air_temp_c");
check("resolveConditions: auto_filled records both filled fields", JSON.stringify(resolved.provenance.auto_filled) === '["humidity_pct","sky"]');
check("resolveConditions: result is frozen", throws(() => { (resolved.conditions as { grip: string }).grip = "high"; }));
check("resolveConditions: caller's manual object stays detached", (() => { const m: RunConditions = { grip: "green" }; const r = resolveConditions(obs, m); m.grip = "high"; return r.conditions.grip === "green"; })());
check("resolveConditions without auto: empty provenance", (() => { const r = resolveConditions(undefined, MANUAL); return r.conditions.air_temp_c === 28 && r.conditions.humidity_pct === undefined && r.provenance.auto_filled.length === 0 && r.provenance.overridden.length === 0; })());
check("resolveConditions: auto without sky never fills sky", (() => { const o = makeWeatherObservation({ observed_at: T0, source: "auto", air_temp_c: 20 }); if (!o.ok) return false; const r = resolveConditions(o.observation, { grip: "green" }); return r.conditions.sky === undefined && r.provenance.auto_filled.length === 1; })());

// weatherAtTime
{
  const o0 = { observed_at: T0, source: "auto" as const, air_temp_c: 20 };
  const o2 = { observed_at: T2, source: "auto" as const, air_temp_c: 26 };
  const log: WeatherObservation[] = [o0, o2];
  check("weatherAtTime: latest at-or-before", weatherAtTime(log, T1)?.air_temp_c === 20);
  check("weatherAtTime: exact match wins", weatherAtTime(log, T2)?.air_temp_c === 26);
  check("weatherAtTime: nothing before the first observation", weatherAtTime(log, "2026-06-11T08:00:00.000Z") === undefined);
  check("weatherAtTime: undefined log is undefined", weatherAtTime(undefined, T1) === undefined);
  // Regression (offset-less created_at skew): an OFFSET-LESS `at` (a lifted-legacy
  // or write-path created_at that escaped the load-path offset check) must be
  // read as UTC, never device-local — so it resolves to the SAME observation as
  // its Z-suffixed twin regardless of the runner's timezone.
  const tNoOffset = "2026-06-11T09:20:00.000"; // T1 minus the Z
  check("weatherAtTime: offset-less `at` is interpreted as UTC (no device-local skew)", weatherAtTime(log, tNoOffset)?.air_temp_c === weatherAtTime(log, T1)?.air_temp_c && weatherAtTime(log, tNoOffset)?.air_temp_c === 20);
  check("weatherAtTime: unparseable `at` yields undefined, never NaN-joins", weatherAtTime(log, "not-a-date") === undefined);
}

// ═══ runs ════════════════════════════════════════════════════════════════════

console.log("\n— runs —");
const LAPS: LapTime[] = [
  { n: 1, t_s: 34.2, source: "manual" },
  { n: 2, t_s: 33.8, source: "manual" },
  { n: 3, t_s: 34.0, source: "manual" },
];
const SS_ID = makeId("ss", Date.parse(T0)); // proper generated shape — parse validators enforce it
const RUN_BASE: MakeRunInput = {
  type: "qualifier",
  session_id: SS_ID,
  car_id: car.id,
  car_name: car.name,
  car_template_id: "kyosho-inferno-mp11",
  setup_version_id: "sv-aaa",
  setup_name: "Softer front bar",
  track: snap,
  conditions: { grip: "medium", bumpiness: "rough", dusty: true, air_temp_c: 24, track_temp_c: 38, humidity_pct: 60 },
  feedback: { tags: [{ symptom: "understeer", phase: "entry" }], text: "pushy into the hairpin" },
};
const INPUT_CONDITIONS = RUN_BASE.conditions;

const r1res = makeRun(
  {
    ...RUN_BASE,
    conditions_provenance: { auto_filled: ["humidity_pct"], overridden: [] },
    weather: obs,
    tyres: { brand: "PMT", compound: "soft", wear: "light", run_count: 2 },
    fuel: { tank_cc: 125, consumed_cc: 100 },
    timing: { kind: "laps", laps: LAPS, import: { imported_at: T1, transponder_id: "9954321" } },
    feedback: { ...RUN_BASE.feedback, turns: [{ turn_n: 1, text: "washes wide" }, { turn_n: 3, tags: [{ symptom: "bottoming" }] }] },
    driver: { feeling_1to10: 14, fatigue_1to5: 2, confidence_1to5: 0 },
    outcome: "better",
    note: "first proper run",
  },
  T1,
);
if (!r1res.ok) fatal(`makeRun (laps) rejected: ${r1res.reason}`);
const run1 = r1res.run;
check("makeRun: id uses run- prefix + ts36", run1.id.startsWith(`run-${Date.parse(T1).toString(36)}-`));
check("makeRun: track_id derived from the snapshot", run1.track_id === track2.id);
check("makeRun: frozen track snapshot with turns", run1.track.turns?.length === 3 && run1.track !== snap);
check("makeRun: conditions are a frozen detached copy", (() => { (INPUT_CONDITIONS as { grip: string }).grip = "blue_groove"; const ok = run1.conditions.grip === "medium"; (INPUT_CONDITIONS as { grip: string }).grip = "medium"; return ok; })());
check("makeRun: deep-frozen (laps push throws)", throws(() => { const t = run1.timing; if (t?.kind === "laps") (t.laps as unknown as { push: (x: unknown) => void }).push({}); }));
check("makeRun: deep-frozen (conditions assignment throws)", throws(() => { (run1.conditions as { grip: string }).grip = "high"; }));
check("makeRun: deep-frozen (turn feedback throws)", throws(() => { (run1.feedback.turns![0] as { text?: string }).text = "x"; }));
check("makeRun: driver feeling clamps 14 -> 10", run1.driver?.feeling_1to10 === 10);
check("makeRun: driver confidence clamps 0 -> 1", run1.driver?.confidence_1to5 === 1);
check("makeRun: provenance + raw weather frozen onto the run", run1.conditions_provenance?.auto_filled[0] === "humidity_pct" && run1.weather?.pressure_hpa === 1013.2);
check("makeRun: denormalized labels survive store resets", run1.setup_name === "Softer front bar" && run1.car_name === "MP11 #1");

const et = effectiveTiming(run1);
check("effectiveTiming (laps): stats computed, never stored", et !== null && et.lap_count === 3 && et.best_lap_s === 33.8 && et.avg_lap_s === 34 && et.consistency_pct === 99.5);
check("lapDeltas computed", JSON.stringify(lapDeltas(LAPS)) === "[-0.4,0.2]");
check("lapStats of empty series", lapStats([]).lap_count === 0 && lapStats([]).best_lap_s === undefined);

const sumRes = makeRun(
  {
    ...RUN_BASE,
    timing: { kind: "summary", result: { best_lap_s: 33.9, avg_lap_s: 34.5, consistency_pct: 97.2, laps: 12, position: 3, mistakes: 1, driver_confidence: 4, traffic: "some", tyre_state_after: "medium" } },
  },
  T2,
);
if (!sumRes.ok) fatal(`makeRun (summary) rejected: ${sumRes.reason}`);
const run2 = sumRes.run;
{
  const t = run2.timing;
  const result = t?.kind === "summary" ? t.result : null;
  check("makeRun (summary): Theo's RunResult stored verbatim", result !== null && result.best_lap_s === 33.9 && result.position === 3 && result.traffic === "some" && result.tyre_state_after === "medium");
  check("makeRun: driver_confidence normalized into DriverState (one home)", run2.driver?.confidence_1to5 === 4 && result !== null && !("driver_confidence" in result));
  check("effectiveTiming (summary): echoes the manual stats", effectiveTiming(run2)?.best_lap_s === 33.9 && effectiveTiming(run2)?.lap_count === 12);
  check("makeRun: an explicit driver confidence beats the deprecated field", (() => { const r = makeRun({ ...RUN_BASE, driver: { confidence_1to5: 2 }, timing: { kind: "summary", result: { driver_confidence: 4 } } }, T2); return r.ok && r.run.driver?.confidence_1to5 === 2; })());
}

// makeRun guards
check("makeRun rejects an empty setup_version_id", (() => { const r = makeRun({ ...RUN_BASE, setup_version_id: " " }, T1); return !r.ok && r.reason === "empty_setup_version"; })());
check("makeRun rejects NaN air temp", (() => { const r = makeRun({ ...RUN_BASE, conditions: { grip: "medium", air_temp_c: NaN } }, T1); return !r.ok && r.reason === "non_finite_numeric"; })());
check("makeRun clamps humidity to 100", (() => { const r = makeRun({ ...RUN_BASE, conditions: { grip: "medium", humidity_pct: 130 } }, T1); return r.ok && r.run.conditions.humidity_pct === 100; })());
check("makeRun rejects negative tyre run_count", (() => { const r = makeRun({ ...RUN_BASE, tyres: { run_count: -1 } }, T1); return !r.ok && r.reason === "out_of_range"; })());
check("makeRun rejects fractional tyre run_count", (() => { const r = makeRun({ ...RUN_BASE, tyres: { run_count: 2.5 } }, T1); return !r.ok && r.reason === "out_of_range"; })());
check("makeRun rejects NaN tyre run_count", (() => { const r = makeRun({ ...RUN_BASE, tyres: { run_count: NaN } }, T1); return !r.ok && r.reason === "non_finite_numeric"; })());
check("makeRun rejects consumed > tank", (() => { const r = makeRun({ ...RUN_BASE, fuel: { tank_cc: 125, consumed_cc: 130 } }, T1); return !r.ok && r.reason === "out_of_range"; })());
check("makeRun rejects a zero tank", (() => { const r = makeRun({ ...RUN_BASE, fuel: { tank_cc: 0 } }, T1); return !r.ok && r.reason === "out_of_range"; })());
check("makeRun rejects NaN fuel", (() => { const r = makeRun({ ...RUN_BASE, fuel: { consumed_cc: NaN } }, T1); return !r.ok && r.reason === "non_finite_numeric"; })());
check("makeRun rejects an empty laps array", (() => { const r = makeRun({ ...RUN_BASE, timing: { kind: "laps", laps: [] } }, T1); return !r.ok && r.reason === "bad_lap_sequence"; })());
check("makeRun rejects non-increasing lap numbers", (() => { const r = makeRun({ ...RUN_BASE, timing: { kind: "laps", laps: [{ n: 1, t_s: 30, source: "manual" }, { n: 1, t_s: 31, source: "manual" }] } }, T1); return !r.ok && r.reason === "bad_lap_sequence"; })());
check("makeRun rejects a zero lap time", (() => { const r = makeRun({ ...RUN_BASE, timing: { kind: "laps", laps: [{ n: 1, t_s: 0, source: "manual" }] } }, T1); return !r.ok && r.reason === "bad_lap_sequence"; })());
check("makeRun rejects a NaN lap time", (() => { const r = makeRun({ ...RUN_BASE, timing: { kind: "laps", laps: [{ n: 1, t_s: NaN, source: "manual" }] } }, T1); return !r.ok && r.reason === "non_finite_numeric"; })());
check("makeRun rejects a negative summary best lap", (() => { const r = makeRun({ ...RUN_BASE, timing: { kind: "summary", result: { best_lap_s: -1 } } }, T1); return !r.ok && r.reason === "out_of_range"; })());
check("makeRun rejects consistency > 100", (() => { const r = makeRun({ ...RUN_BASE, timing: { kind: "summary", result: { consistency_pct: 120 } } }, T1); return !r.ok && r.reason === "out_of_range"; })());
check("makeRun rejects fractional summary laps", (() => { const r = makeRun({ ...RUN_BASE, timing: { kind: "summary", result: { laps: 3.5 } } }, T1); return !r.ok && r.reason === "out_of_range"; })());
check("makeRun rejects position 0", (() => { const r = makeRun({ ...RUN_BASE, timing: { kind: "summary", result: { position: 0 } } }, T1); return !r.ok && r.reason === "out_of_range"; })());
check("makeRun rejects negative mistakes", (() => { const r = makeRun({ ...RUN_BASE, timing: { kind: "summary", result: { mistakes: -1 } } }, T1); return !r.ok && r.reason === "out_of_range"; })());
check("makeRun rejects feedback for an unknown turn", (() => { const r = makeRun({ ...RUN_BASE, feedback: { tags: [], turns: [{ turn_n: 99, text: "?" }] } }, T1); return !r.ok && r.reason === "unknown_turn"; })());
check("makeRun rejects empty turn feedback", (() => { const r = makeRun({ ...RUN_BASE, feedback: { tags: [], turns: [{ turn_n: 1, text: "  " }] } }, T1); return !r.ok && r.reason === "empty_turn_feedback"; })());
check("makeRun accepts any turn_n when the snapshot has no turn map", (() => { const bare = makeTrack({ name: "Bare", surface: "astro", indoor: true, is_public: false }, T0); if (!bare.ok) return false; const r = makeRun({ ...RUN_BASE, track: snapshotTrack(bare.track), feedback: { tags: [], turns: [{ turn_n: 7, text: "loose" }] } }, T1); return r.ok; })());
check("makeRun rejects NaN driver feeling", (() => { const r = makeRun({ ...RUN_BASE, driver: { feeling_1to10: NaN } }, T1); return !r.ok && r.reason === "non_finite_numeric"; })());

// hand-built TrackSnapshot turns clear the same bar as makeTrack (the type is
// exported and literal-constructable — e.g. a future "quick log" screen)
const handSnap = (turns: TrackTurn[]) => ({ track_id: track2.id, name: "Hand-built", surface: "clay" as const, indoor: false, turns });
check("makeRun rejects a hand-built snapshot with a NaN turn n", (() => { const r = makeRun({ ...RUN_BASE, track: handSnap([{ n: NaN, direction: "L", corner_type: "hairpin" }]) }, T1); return !r.ok && r.reason === "non_finite_numeric"; })());
check("makeRun rejects duplicate snapshot turn numbers", (() => { const r = makeRun({ ...RUN_BASE, track: handSnap([{ n: 1, direction: "L", corner_type: "hairpin" }, { n: 1, direction: "R", corner_type: "sweeper" }]) }, T1); return !r.ok && r.reason === "duplicate_turn_n"; })());
check("makeRun rejects snapshot turn n = 0", (() => { const r = makeRun({ ...RUN_BASE, track: handSnap([{ n: 0, direction: "L", corner_type: "hairpin" }]) }, T1); return !r.ok && r.reason === "out_of_range"; })());

// weather goes through THE weather constructor — same envelope both paths
check("makeRun rejects NaN weather pressure (shared weather constructor)", (() => { const r = makeRun({ ...RUN_BASE, weather: { observed_at: T0, source: "auto", pressure_hpa: NaN } }, T1); return !r.ok && r.reason === "non_finite_numeric"; })());
check("makeRun rejects an offset-less weather timestamp", (() => { const r = makeRun({ ...RUN_BASE, weather: { observed_at: "2026-06-11T09:00", source: "auto" } }, T1); return !r.ok && r.reason === "invalid_timestamp"; })());
check("makeRun stores CLAMPED weather (one validity envelope per fact)", (() => { const r = makeRun({ ...RUN_BASE, weather: { observed_at: T0, source: "auto", humidity_pct: 140, precipitation_mm: -1, wind_dir_deg: 720 } }, T1); return r.ok && r.run.weather?.humidity_pct === 100 && r.run.weather?.precipitation_mm === 0 && r.run.weather?.wind_dir_deg === 0; })());

// full-entity reproducibility under injected entropy (golden tests, bug repro)
check("makeRun: fully reproducible under an injected rand", (() => { const a = makeRun(RUN_BASE, T1, () => 0.25); const b = makeRun(RUN_BASE, T1, () => 0.25); return a.ok && b.ok && a.run.id === b.run.id && JSON.stringify(a.run) === JSON.stringify(b.run); })());

// outcome records
const citations = ["HUDY p.12", "HUDY p.13"];
const ocRes = makeOutcomeRecord(
  {
    session_id: SS_ID,
    car_id: car.id,
    car_name: car.name,
    setting: "rear_diff_oil",
    change: "3000 -> 4000",
    citations,
    outcome: "better",
    setup_version_id: "sv-aaa",
    setup_name: "Softer front bar",
    track: snap,
    conditions: { grip: "medium", dusty: true },
    run_id: run2.id,
    note: "calmer exit",
  },
  T4,
);
if (!ocRes.ok) fatal(`makeOutcomeRecord rejected: ${ocRes.reason}`);
const oc1 = ocRes.record;
check("makeOutcomeRecord: id uses oc- prefix", oc1.id.startsWith(`oc-${Date.parse(T4).toString(36)}-`));
check("makeOutcomeRecord: citations copied + frozen", oc1.citations !== citations && Object.isFrozen(oc1.citations) && oc1.citations.length === 2);
check("makeOutcomeRecord: frozen track snapshot + conditions", Object.isFrozen(oc1.track) && Object.isFrozen(oc1.conditions) && oc1.track_id === track2.id);
check("makeOutcomeRecord rejects an empty setting", (() => { const r = makeOutcomeRecord({ ...oc1, setting: " ", citations: [], track: snap, conditions: { grip: "medium" } }, T4); return !r.ok && r.reason === "empty_setting"; })());
check("makeOutcomeRecord rejects an empty change", (() => { const r = makeOutcomeRecord({ ...oc1, change: "", citations: [], track: snap, conditions: { grip: "medium" } }, T4); return !r.ok && r.reason === "empty_change"; })());
check("makeOutcomeRecord rejects an empty setup version", (() => { const r = makeOutcomeRecord({ ...oc1, setup_version_id: " ", citations: [], track: snap, conditions: { grip: "medium" } }, T4); return !r.ok && r.reason === "empty_setup_version"; })());
check("makeOutcomeRecord carries the REQUIRED car name (renders without a garage join)", oc1.car_name === "MP11 #1");
check("makeOutcomeRecord rejects an empty car name", (() => { const r = makeOutcomeRecord({ ...oc1, car_name: " ", citations: [], track: snap, conditions: { grip: "medium" } }, T4); return !r.ok && r.reason === "empty_car_name"; })());
check("makeOutcomeRecord rejects a NaN snapshot turn", (() => { const r = makeOutcomeRecord({ ...oc1, citations: [], conditions: { grip: "medium" }, track: { track_id: track2.id, name: "Hand-built", surface: "clay", indoor: false, turns: [{ n: NaN, direction: "L", corner_type: "hairpin" }] } }, T4); return !r.ok && r.reason === "non_finite_numeric"; })());

// derived fuel stats
check("fuelStats derives cc/lap and laps/tank", (() => { const s = fuelStats({ tank_cc: 125, consumed_cc: 100 }, 25); return s.cc_per_lap === 4 && s.laps_per_tank === 31; })());
check("fuelStats yields nothing without inputs", (() => { const s = fuelStats(undefined, 25); return s.cc_per_lap === undefined && s.laps_per_tank === undefined; })());
check("fuelStats never divides by zero", fuelStats({ tank_cc: 125, consumed_cc: 100 }, 0).cc_per_lap === undefined);

// speedhive shapes
const IMPORTED: ImportedLaps = {
  source: "speedhive",
  imported_at: T2,
  laps: [
    { n: 1, t_s: 35.1, position_in_session: 3 },
    { n: 2, t_s: 34.6, position_in_session: 2 },
    { n: 3, t_s: 34.7, position_in_session: 2 },
    { n: 4, t_s: 34.9 },
  ],
  event_name: "Spring GP",
  transponder_id: "9954321",
};
const seriesRes = toLapSeries(IMPORTED);
if (!seriesRes.ok) fatal(`toLapSeries rejected a clean import: ${seriesRes.reason}`);
const series = seriesRes.series;
check("toLapSeries: every lap stamped speedhive + meta carried", series.laps.length === 4 && series.laps.every((l) => l.source === "speedhive") && series.import?.event_name === "Spring GP");
check("toLapSeries: frozen", throws(() => { (series.laps as unknown as { push: (x: unknown) => void }).push({}); }));
check("toLapSeries rejects a NaN Speedhive lap (same rules as makeRun)", (() => { const r = toLapSeries({ ...IMPORTED, laps: [{ n: 1, t_s: NaN }] }); return !r.ok && r.reason === "non_finite_numeric"; })());
check("toLapSeries rejects a non-increasing Speedhive sequence", (() => { const r = toLapSeries({ ...IMPORTED, laps: [{ n: 2, t_s: 30 }, { n: 2, t_s: 31 }] }); return !r.ok && r.reason === "bad_lap_sequence"; })());
check("lapStats: poisoned series yields count only, never NaN stats", (() => { const s = lapStats([{ n: 1, t_s: NaN, source: "manual" }, { n: 2, t_s: 30, source: "manual" }]); return s.lap_count === 2 && s.best_lap_s === undefined && s.consistency_pct === undefined; })());
check("positionDeltas: gained/held/unknown", JSON.stringify(positionDeltas(IMPORTED.laps)) === "[1,0,null]");

// learning loop bridge
{
  const ratedUnclaimed = makeRun({ ...RUN_BASE, outcome: "worse" }, T2);
  const unrated = makeRun(RUN_BASE, T3);
  if (!ratedUnclaimed.ok || !unrated.ok) fatal("learning-loop fixture runs rejected");
  // run2 (rated "better"... no outcome set) — claim run2 via oc1.run_id; rate it through a fresh fixture instead
  const ratedClaimed = makeRun({ ...RUN_BASE, outcome: "better" }, T3);
  if (!ratedClaimed.ok) fatal("claimed fixture run rejected");
  const oc2 = makeOutcomeRecord({ session_id: SS_ID, car_id: car.id, car_name: car.name, setting: "front_oil", change: "500 -> 450", citations: ["HUDY p.4"], outcome: "better", setup_version_id: "sv-aaa", setup_name: "Softer front bar", track: snap, conditions: { grip: "medium", bumpiness: "rough" }, run_id: ratedClaimed.run.id }, T4);
  if (!oc2.ok) fatal("learning-loop outcome record rejected");

  const tuples = learningTuples([ratedUnclaimed.run, unrated.run, ratedClaimed.run], [oc2.record]);
  check("learningTuples: outcome record + unclaimed rating, claimed run deduped", tuples.length === 2);
  check("learningTuples: sorted by time", tuples[0].source.kind === "run_rating" && tuples[1].source.kind === "outcome_record");
  check("learningTuples: change carried with citations", tuples[1].change?.setting === "front_oil" && tuples[1].change?.citations[0] === "HUDY p.4");
  check("learningTuples: frozen", Object.isFrozen(tuples) && Object.isFrozen(tuples[0]));

  const history = toEngineHistory(tuples);
  check("toEngineHistory: only change-bearing tuples become history rows", history.length === 1 && history[0].change === "front_oil: 500 -> 450" && history[0].outcome === "better");
  check("toEngineHistory: conditions rendered deterministically", history[0].conditions === "grip medium, bumps rough");
  check("toEngineHistory: track filter applies", toEngineHistory(tuples, { track_id: "trk-elsewhere1" }).length === 0);
  check("toEngineHistory: limit keeps the most recent", toEngineHistory(tuples, { limit: 0 }).length === 0 && toEngineHistory(tuples, { limit: 5 }).length === 1);

  // COMPILE-checked: the bridge output must be assignable to the engine's
  // MUTABLE ContextBundle.history slot (structural copy of engine types.ts).
  const engineSlot: { change: string; conditions: string; outcome: "better" | "same" | "worse" }[] =
    toEngineHistory(tuples);
  engineSlot.push({ change: "x: y", conditions: "grip medium", outcome: "same" });
  check(
    "toEngineHistory: mutable unfrozen rows for the engine seam",
    engineSlot.length === 2 && !Object.isFrozen(toEngineHistory(tuples)) && toEngineHistory(tuples).every((r) => !Object.isFrozen(r)),
  );
}

check(
  "renderConditions is a stable single line",
  renderConditions({ grip: "medium", bumpiness: "rough", dusty: true, sky: "raining", evolution: "improving", air_temp_c: 24, track_temp_c: 38, humidity_pct: 60 }) ===
    "grip medium, bumps rough, dusty, sky raining, evol improving, air 24C, track 38C, hum 60%",
);
check("conditionsToTags: green/rough/dusty/raining/hot", JSON.stringify(conditionsToTags({ grip: "green", bumpiness: "rough", dusty: true, sky: "raining", air_temp_c: 32 })) === '["low_grip","rough","dusty","wet","hot"]');
check("conditionsToTags: blue groove maps alone", JSON.stringify(conditionsToTags({ grip: "blue_groove" })) === '["blue_groove"]');
check("conditionsToTags: medium bumpiness reads bumpy", JSON.stringify(conditionsToTags({ grip: "medium", bumpiness: "medium" })) === '["bumpy"]');
check("conditionsToTags: cold air + high grip", JSON.stringify(conditionsToTags({ grip: "high", air_temp_c: 5 })) === '["high_grip","cold"]');
check("conditionsToTags: hot track temp alone triggers hot", JSON.stringify(conditionsToTags({ grip: "medium", track_temp_c: 45 })) === '["hot"]');

// ── tag producers + the single assembler (the bundle.track.conditions contract) ──
check("surfaceToTags: astroturf id → astroturf family", JSON.stringify(surfaceToTags("astroturf")) === '["astroturf"]');
check("surfaceToTags: loose loam → loose_dirt", JSON.stringify(surfaceToTags("loose_dirt_loam")) === '["loose_dirt"]');
check("surfaceToTags: grip-carried surface (hard_packed_dirt) → [] (grip field carries it)", JSON.stringify(surfaceToTags("hard_packed_dirt")) === "[]");
check("powerTypeToTags: nitro → nitro_power", JSON.stringify(powerTypeToTags("nitro")) === '["nitro_power"]');
check("powerTypeToTags: brushless DEFAULTS to stock_blinky (D13-safe)", JSON.stringify(powerTypeToTags("brushless")) === '["stock_blinky"]');
// the assembler unions all three, deduped — this IS what the app assigns to bundle.track.conditions
check(
  "buildConditionTags: unions conditions+surface+power, deduped",
  JSON.stringify(buildConditionTags({ conditions: { grip: "high", air_temp_c: 32 }, surface: "astroturf", power: "nitro" })) ===
    '["high_grip","hot","astroturf","nitro_power"]',
);
check(
  "buildConditionTags: partial context (surface only) still yields the surface tag, no refuse",
  JSON.stringify(buildConditionTags({ surface: "carpet_onroad" })) === '["carpet"]',
);
check(
  "buildConditionTags: forgetting power/surface is no longer possible — empty input → [] (graceful, deterministic)",
  JSON.stringify(buildConditionTags({})) === "[]",
);
check(
  "buildConditionTags: a wet surface tag and a rain condition tag dedupe to one wet",
  JSON.stringify(buildConditionTags({ conditions: { grip: "medium", sky: "raining" }, surface: "mud_pit" })) === '["wet"]',
);
check("buildConditionTags: result is frozen (no caller mutation of the contract)", Object.isFrozen(buildConditionTags({ surface: "astroturf" })));

// ═══ bridge (one-shot lifts from the legacy models) ══════════════════════════

console.log("\n— bridge —");
{
  const ctx = {
    track_id: track2.id,
    session_id: makeId("ss", Date.parse(T0)),
    car_id: car.id,
    car_name: car.name,
    car_template_id: "kyosho-inferno-mp11",
  };
  const sRun: SessionsRun = {
    id: "run-old000001",
    at: T1,
    type: "practice",
    setup_version_id: "sv-aaa",
    setup_name: "Kit baseline",
    track: { name: "MCD Raceway", surface: "clay", grip: "medium", conditions: ["dusty", "rough", "low_grip", "mystery_tag"] },
    best_lap_s: 35.2,
    lap_count: 18,
    feedback_text: "loose on power",
  };
  const lifted = liftSessionsRun(sRun, ctx);
  if (!lifted.ok) fatal(`liftSessionsRun rejected: ${lifted.reason}`);
  check("liftSessionsRun: canonical run with synthesized linkage", lifted.run.session_id === ctx.session_id && lifted.run.car_id === car.id && lifted.run.track.track_id === track2.id && lifted.run.track.indoor === false && lifted.run.created_at === T1);
  check("liftSessionsRun: grip from track, tags reverse-mapped, unknown tags drop", lifted.run.conditions.grip === "medium" && lifted.run.conditions.dusty === true && lifted.run.conditions.bumpiness === "rough" && lifted.run.conditions.sky === undefined);
  check("liftSessionsRun: summary timing + feedback text carried", (() => { const t = lifted.run.timing; return t?.kind === "summary" && t.result.best_lap_s === 35.2 && t.result.laps === 18 && lifted.run.feedback.text === "loose on power"; })());
  check("liftSessionsRun: full makeRun validation applies (bad legacy data rejects)", (() => { const r = liftSessionsRun({ ...sRun, best_lap_s: NaN }, ctx); return !r.ok && r.reason === "non_finite_numeric"; })());

  const sOc: SessionsOutcomeRecord = {
    id: "oc-old0000001",
    at: T2,
    setting: "front_oil",
    change: "500 -> 450",
    citations: ["HUDY p.4"],
    outcome: "better",
    setup_version_id: "sv-aaa",
    setup_name: "Kit baseline",
    track: { name: "MCD Raceway", surface: "clay", grip: "high", conditions: ["wet"] },
    note: "old store",
  };
  const liftedOc = liftSessionsOutcome(sOc, ctx);
  check("liftSessionsOutcome: required car_name from context + conditions from tags", liftedOc.ok && liftedOc.record.car_name === "MP11 #1" && liftedOc.record.conditions.grip === "high" && liftedOc.record.conditions.sky === "raining" && liftedOc.record.citations[0] === "HUDY p.4");

  check(
    "conditionsFromTags: documented reverse mapping (hot/cold/grip tags ignored)",
    JSON.stringify(conditionsFromTags({ name: "x", surface: "clay", grip: "green", conditions: ["dusty", "smooth", "wet", "hot"] })) ===
      JSON.stringify({ grip: "green", dusty: true, bumpiness: "smooth", sky: "raining" }),
  );

  const theoEntry: TheoRunEntry = {
    id: "old-1",
    created_at: T2,
    type: "qualifier",
    car_template_id: "kyosho-inferno-mp11",
    setup_version_id: "sv-aaa",
    setup_name: "Kit baseline",
    track: { name: "Indoor Arena", surface: "carpet", indoor: true, layout: "v2" },
    conditions: { grip: "high", air_temp_c: 21 },
    tyres: { brand: "PMT", wear: "light", run_count: 1 },
    result: { best_lap_s: 28.4, laps: 20, position: 2, driver_confidence: 4, traffic: "some", tyre_state_after: "destroyed" },
    feedback: { tags: [{ symptom: "oversteer", phase: "exit" }], text: "edgy" },
    outcome: "better",
    note: "his store",
  };
  const tctx = { track_id: track2.id, session_id: "ss-legacy0001" as const, car_id: car.id, car_name: car.name };
  const tl = liftTheoRunEntry(theoEntry, tctx);
  if (!tl.ok) fatal(`liftTheoRunEntry rejected: ${tl.reason}`);
  check("liftTheoRunEntry: result -> summary timing, TrackInfo -> snapshot", (() => { const t = tl.run.timing; return tl.run.track.track_id === track2.id && tl.run.track.surface === "carpet" && tl.run.track.indoor === true && tl.run.track.layout === "v2" && t?.kind === "summary" && t.result.best_lap_s === 28.4 && t.result.traffic === "some"; })());
  check("liftTheoRunEntry: driver_confidence normalized into DriverState", (() => { const t = tl.run.timing; return tl.run.driver?.confidence_1to5 === 4 && t?.kind === "summary" && !("driver_confidence" in t.result); })());
  check("liftTheoRunEntry: unknown tyre_state_after DROPS the field, keeps the run", (() => { const t = tl.run.timing; return t?.kind === "summary" && t.result.tyre_state_after === undefined && tl.run.tyres?.wear === "light"; })());
  check("liftTheoRunEntry rejects an unknown surface", (() => { const r = liftTheoRunEntry({ ...theoEntry, track: { ...theoEntry.track, surface: "dirt" } }, tctx); return !r.ok && r.reason === "unknown_surface"; })());
}

// ═══ account / entitlements ══════════════════════════════════════════════════

console.log("\n— account —");
const acct0 = initAccount();
check("initAccount: anonymous, status none, frozen", acct0.user_id === undefined && acct0.subscription.status === "none" && throws(() => { (acct0.subscription as { status: string }).status = "active"; }));

check("makeDriverProfile: country uppercased, level kept", (() => { const r = makeDriverProfile({ level: "club", age: 34, country: "fr" }); return r.ok && r.profile.country === "FR" && r.profile.level === "club" && r.profile.age === 34; })());
check("makeDriverProfile: age clamps to [1,120]", (() => { const a = makeDriverProfile({ level: "pro", age: 150 }); const b = makeDriverProfile({ level: "pro", age: 0.4 }); return a.ok && a.profile.age === 120 && b.ok && b.profile.age === 1; })());
check("makeDriverProfile rejects NaN age", (() => { const r = makeDriverProfile({ level: "club", age: NaN }); return !r.ok && r.reason === "non_finite_numeric"; })());
check("makeDriverProfile rejects a non-alpha2 country", (() => { const r = makeDriverProfile({ level: "club", country: "France" }); return !r.ok && r.reason === "invalid_country"; })());

const trialRes = startTrial(acct0, T0, 14);
if (!trialRes.ok) fatal("startTrial rejected a fresh account");
const acctTrial = trialRes.account;
check("startTrial: stamps start/end and asserts trial", acctTrial.trial_started_at === T0 && acctTrial.trial_ends_at === new Date(Date.parse(T0) + 14 * DAY).toISOString() && acctTrial.subscription.status === "trial");
check("startTrial: result frozen, original untouched", Object.isFrozen(acctTrial) && acct0.trial_started_at === undefined);
check("startTrial rejects a second trial", (() => { const r = startTrial(acctTrial, T1, 14); return !r.ok && r.reason === "trial_already_used"; })());
check("startTrial rejects an invalid duration", (() => { const a = startTrial(acct0, T0, 0); const b = startTrial(acct0, T0, NaN); return !a.ok && a.reason === "invalid_duration" && !b.ok && b.reason === "invalid_duration"; })());

const acctActive: AccountState = { user_id: "u1", subscription: { status: "active", source: "web", validated_at: T0, expires_at: new Date(Date.parse(T0) + 30 * DAY).toISOString() } };
const acctGrace: AccountState = { user_id: "u1", subscription: { status: "active", source: "web", validated_at: T0, expires_at: new Date(Date.parse(T0) - 3 * DAY).toISOString() } };
const acctSubExpired: AccountState = { user_id: "u1", subscription: { status: "active", source: "web", validated_at: T0, expires_at: new Date(Date.parse(T0) - 10 * DAY).toISOString() } };
const acctTrialExpired = ((): AccountState => {
  const r = startTrial(acct0, new Date(Date.parse(T0) - 20 * DAY).toISOString(), 14);
  if (!r.ok) fatal("trial-expired fixture rejected");
  return r.account;
})();

check("startTrial rejects when already subscribed", (() => { const r = startTrial(acctActive, T0, 14); return !r.ok && r.reason === "already_subscribed"; })());

check("effective status: fresh account is none", effectiveSubscriptionStatus(acct0, T0) === "none");
check("effective status: inside the trial window", effectiveSubscriptionStatus(acctTrial, T1) === "trial");
check("effective status: trial lapses to expired", effectiveSubscriptionStatus(acctTrial, new Date(Date.parse(T0) + 15 * DAY).toISOString()) === "expired");
check("effective status: active before expiry", effectiveSubscriptionStatus(acctActive, T0) === "active");
check("effective status: active with no expiry stays active", effectiveSubscriptionStatus({ subscription: { status: "active", source: "web" } }, T4) === "active");
check("effective status: lapsed sub inside GRACE_DAYS is grace", effectiveSubscriptionStatus(acctGrace, T0) === "grace");
check("effective status: lapsed sub past grace is expired", effectiveSubscriptionStatus(acctSubExpired, T0) === "expired");

// entitlement matrix: states x (free advisor | premium feature)
check("matrix none: advisor free", JSON.stringify(checkEntitlement(acct0, "advisor", T0)) === '{"allowed":true,"via":"free"}');
check("matrix none: premium requires subscription", JSON.stringify(checkEntitlement(acct0, "multi_car", T0)) === '{"allowed":false,"reason":"requires_subscription"}');
check("matrix trial-active: premium allowed via trial", JSON.stringify(checkEntitlement(acctTrial, "multi_car", T1)) === '{"allowed":true,"via":"trial"}');
check("matrix trial-active: advisor still free", JSON.stringify(checkEntitlement(acctTrial, "advisor", T1)) === '{"allowed":true,"via":"free"}');
check("matrix trial-expired: premium blocked as trial_expired", JSON.stringify(checkEntitlement(acctTrialExpired, "analytics", T0)) === '{"allowed":false,"reason":"trial_expired"}');
check("matrix trial-expired: advisor SURVIVES (D18 hook)", JSON.stringify(checkEntitlement(acctTrialExpired, "advisor", T0)) === '{"allowed":true,"via":"free"}');
check("matrix active: premium allowed via subscription", JSON.stringify(checkEntitlement(acctActive, "strategy_planner", T0)) === '{"allowed":true,"via":"subscription"}');
check("matrix grace: premium allowed via grace", JSON.stringify(checkEntitlement(acctGrace, "speedhive_import", T0)) === '{"allowed":true,"via":"grace"}');
check("matrix expired: premium blocked as subscription_expired", JSON.stringify(checkEntitlement(acctSubExpired, "analytics", T0)) === '{"allowed":false,"reason":"subscription_expired"}');
check("matrix expired: advisor still free", JSON.stringify(checkEntitlement(acctSubExpired, "advisor", T0)) === '{"allowed":true,"via":"free"}');

// clock-edge boundaries — the paywall flips at EXACT instants; pin the <= semantics
const plusMs = (iso: string, delta: number): string => new Date(Date.parse(iso) + delta).toISOString();
const acctExpiresT0: AccountState = { user_id: "u1", subscription: { status: "active", source: "web", validated_at: T0, expires_at: T0 } };
check("boundary: exactly expires_at is still active", effectiveSubscriptionStatus(acctExpiresT0, T0) === "active");
check("boundary: 1ms past expires_at flips to grace", effectiveSubscriptionStatus(acctExpiresT0, plusMs(T0, 1)) === "grace");
check("boundary: exactly grace end is still grace", effectiveSubscriptionStatus(acctExpiresT0, plusMs(T0, GRACE_DAYS * DAY)) === "grace");
check("boundary: 1ms past grace end is expired", effectiveSubscriptionStatus(acctExpiresT0, plusMs(T0, GRACE_DAYS * DAY + 1)) === "expired");
const trialEnd = plusMs(T0, 14 * DAY); // acctTrial.trial_ends_at
check("boundary: exactly trial_ends_at is still trial", effectiveSubscriptionStatus(acctTrial, trialEnd) === "trial");
check("boundary: 1ms past trial_ends_at is expired", effectiveSubscriptionStatus(acctTrial, plusMs(trialEnd, 1)) === "expired");

// the free/paid boundary is ONE array — sweep every feature and pin the set
check("FEATURES sweep: on a none account exactly {advisor} is allowed", FEATURES.every((f) => checkEntitlement(acct0, f, T0).allowed === (f === "advisor")));
check("FREE_FEATURES literal pin (D18 acquisition hook)", JSON.stringify(FREE_FEATURES) === '["advisor"]');

// stored-status branches that timestamps alone never reach
const acctServerExpiredNeverPaid: AccountState = { subscription: { status: "expired", source: "web" } };
const acctServerExpiredPaid: AccountState = { subscription: { status: "expired", source: "web", validated_at: T0 } };
const acctStoredGrace: AccountState = { user_id: "u1", subscription: { status: "grace", source: "web", validated_at: T0, expires_at: new Date(Date.parse(T0) - 3 * DAY).toISOString() } };
check("stored 'expired' computes expired", effectiveSubscriptionStatus(acctServerExpiredNeverPaid, T0) === "expired");
check("never-paid + server-asserted expired upsells as trial_expired (not renew)", (() => { const r = checkEntitlement(acctServerExpiredNeverPaid, "analytics", T0); return !r.allowed && r.reason === "trial_expired"; })());
check("paid (validated_at) + server-asserted expired upsells as subscription_expired", (() => { const r = checkEntitlement(acctServerExpiredPaid, "analytics", T0); return !r.allowed && r.reason === "subscription_expired"; })());
check("stored 'grace' inside the window computes grace", effectiveSubscriptionStatus(acctStoredGrace, T0) === "grace");
check("stored 'grace': premium allowed via grace", (() => { const r = checkEntitlement(acctStoredGrace, "multi_car", T0); return r.allowed && r.via === "grace"; })());

// ═══ strategy ════════════════════════════════════════════════════════════════

console.log("\n— strategy —");
const planRes = planRace({ race_duration_s: 1800, avg_lap_s: 36, tank_cc: 125, cc_per_lap: 4, pit_lane_loss_s: 10, fuel_reserve_cc: 5 });
if (!planRes.ok) fatal(`planRace rejected: ${planRes.reason}`);
const plan = planRes.plan;
check("planRace: laps estimate from duration", plan.laps_estimate === 50);
check("planRace: even 25/25 stints", plan.stints.length === 2 && plan.stints[0].start_lap === 1 && plan.stints[0].end_lap === 25 && plan.stints[1].end_lap === 50);
check("planRace: stint fuel includes the reserve", plan.stints[0].fuel_cc === 105 && plan.total_fuel_cc === 210);
check("planRace: one stop, at the right lap/time", plan.stops.length === 1 && plan.stops[0].lap === 25 && plan.stops[0].time_s === 900 && plan.stops[0].fuel_cc === 105);
check("planRace: margin = tank capacity beyond the longest stint", plan.margin_laps_per_stint === 6);
check("planRace: assumptions echo the inputs", plan.assumptions.length === 4 && plan.assumptions[0].includes("50 laps"));
check("planRace: plan frozen", throws(() => { (plan.stints as unknown as { push: (x: unknown) => void }).push({}); }));

const cliffPlanRes = planRace({ race_duration_s: 1800, avg_lap_s: 36, tank_cc: 125, cc_per_lap: 4, pit_lane_loss_s: 10, fuel_reserve_cc: 5, tyre_cliff_lap: 20 });
if (!cliffPlanRes.ok) fatal("planRace with cliff rejected");
const cliffPlan = cliffPlanRes.plan;
check("planRace: tyre cliff caps stints (3 x 17/17/16)", cliffPlan.stints.length === 3 && cliffPlan.stints.map((s) => s.end_lap - s.start_lap + 1).join(",") === "17,17,16");
check("planRace: second stop time includes prior pit loss", cliffPlan.stops[1].lap === 34 && cliffPlan.stops[1].time_s === 1234);
check("planRace: cliff noted in assumptions", cliffPlan.assumptions.some((a) => a.includes("tyre cliff")));
check("planRace rejects a too-small tank", (() => { const r = planRace({ race_duration_s: 1800, avg_lap_s: 36, tank_cc: 8, cc_per_lap: 4, pit_lane_loss_s: 10, fuel_reserve_cc: 5 }); return !r.ok && r.reason === "tank_too_small"; })());
check("planRace rejects a zero lap time", (() => { const r = planRace({ race_duration_s: 1800, avg_lap_s: 0, tank_cc: 125, cc_per_lap: 4, pit_lane_loss_s: 10 }); return !r.ok && r.reason === "invalid_input"; })());
check("planRace rejects NaN inputs", (() => { const r = planRace({ race_duration_s: 1800, avg_lap_s: 36, tank_cc: NaN, cc_per_lap: 4, pit_lane_loss_s: 10 }); return !r.ok && r.reason === "invalid_input"; })());
check("planRace rejects negative pit loss", (() => { const r = planRace({ race_duration_s: 1800, avg_lap_s: 36, tank_cc: 125, cc_per_lap: 4, pit_lane_loss_s: -1 }); return !r.ok && r.reason === "invalid_input"; })());
check("planRace rejects a fractional cliff lap", (() => { const r = planRace({ race_duration_s: 1800, avg_lap_s: 36, tank_cc: 125, cc_per_lap: 4, pit_lane_loss_s: 10, tyre_cliff_lap: 2.5 }); return !r.ok && r.reason === "invalid_input"; })());

const mkLaps = (times: number[]): LapTime[] => times.map((t, i) => ({ n: i + 1, t_s: t, source: "manual" as const }));
check("detectTyreCliff: flat run stays silent", (() => { const r = detectTyreCliff(mkLaps(Array(12).fill(30))); return !r.detected && r.evidence.length === 0 && r.confidence === "low"; })());
check("detectTyreCliff: too few laps stays silent (grounded or silent)", !detectTyreCliff(mkLaps([30, 30, 31, 31, 31])).detected);
{
  const r = detectTyreCliff(mkLaps([...Array(8).fill(30), ...Array(6).fill(31)]));
  check("detectTyreCliff: 1s sustained cliff detected at lap 9", r.detected && r.cliff_lap === 9);
  check("detectTyreCliff: strong cliff is high confidence", r.confidence === "high");
  check("detectTyreCliff: evidence rows carry deltas vs baseline", r.evidence.length === 6 && r.evidence[0].lap_n === 9 && r.evidence[0].delta_s === 1);
}
check("detectTyreCliff: mild cliff is medium confidence", (() => { const r = detectTyreCliff(mkLaps([...Array(8).fill(30), 30.6, 30.6, 30.6])); return r.detected && r.cliff_lap === 9 && r.confidence === "medium"; })());
check("detectTyreCliff: sub-threshold drift stays silent", !detectTyreCliff(mkLaps([...Array(8).fill(30), ...Array(6).fill(30.3)])).detected);
check("detectTyreCliff: a NaN lap stays silent (grounded or silent)", (() => { const laps = mkLaps(Array(12).fill(30)); laps[5] = { n: 6, t_s: NaN, source: "manual" }; const r = detectTyreCliff(laps); return !r.detected && r.evidence.length === 0; })());
check("detectTyreCliff: a zero lap stays silent", (() => { const laps = mkLaps([...Array(8).fill(30), 0, 31, 31, 31]); return !detectTyreCliff(laps).detected; })());
check("detectTyreCliff: whole-run-slow (suffixStart 0, bogus baseline) stays silent", !detectTyreCliff(mkLaps(Array(12).fill(30)), { threshold_s: 0 }).detected);
check("detectTyreCliff: lap exactly at baseline+threshold counts as slow", (() => { const r = detectTyreCliff(mkLaps([...Array(8).fill(30), 30.5, 30.5, 30.5])); return r.detected && r.cliff_lap === 9 && r.confidence === "medium"; })());
check("detectTyreCliff: custom window/threshold change detection as documented", (() => { const laps = mkLaps([...Array(6).fill(30), 31.2, 31.2]); const strict = detectTyreCliff(laps); const custom = detectTyreCliff(laps, { window: 2, threshold_s: 1 }); return !strict.detected && custom.detected && custom.cliff_lap === 7; })());
check("detectTyreCliff: custom min_laps gates the claim", (() => { const laps = mkLaps([30, 30, 30, 31, 31, 31]); const strict = detectTyreCliff(laps); const custom = detectTyreCliff(laps, { min_laps: 5 }); return !strict.detected && custom.detected && custom.cliff_lap === 4; })());
// Regression (baseline masking): window LARGER than floor(len/2). The old pool
// `Math.max(window, floor(len/2))` reached into the degraded second half and the
// best-`window` baseline got inflated (then divided by window even with fewer
// laps), masking a true cliff. Capping the pool to floor(len/2) and dividing by
// the actual count taken keeps the baseline clean → cliff is correctly DETECTED.
check("detectTyreCliff: large window vs short series no longer masks a real cliff", (() => {
  // len 9, window 5 (> floor(9/2)=4): clean first 4 @30, then a sustained +0.5s suffix.
  const laps = mkLaps([30, 30, 30, 30, 30.5, 30.5, 30.5, 30.5, 30.5]);
  const r = detectTyreCliff(laps, { window: 5 });
  return r.detected && r.cliff_lap === 5;
})());

// ═══ outbox ══════════════════════════════════════════════════════════════════

console.log("\n— outbox —");
let ob = initOutbox();
check("initOutbox: empty, seq starts at 1, frozen", ob.entries.length === 0 && ob.next_seq === 1 && Object.isFrozen(ob));
const payload = { id: car.id, name: "MP11 #1", nested: { laps: [1, 2, 3] } };
const a1 = appendOutbox(ob, { domain: "cars", op: "create", payload }, T0);
if (!a1.ok) fatal("appendOutbox rejected a clean payload");
const a2 = appendOutbox(a1.state, { domain: "runs", op: "create", payload: { id: run1.id } }, T1);
if (!a2.ok) fatal("appendOutbox second append rejected");
ob = a2.state;
check("appendOutbox: monotonic seq", a1.entry.seq === 1 && a2.entry.seq === 2 && ob.next_seq === 3);
check("appendOutbox: id uses ob- prefix + folded seq, ts = now", a1.entry.id.startsWith(`ob-${Date.parse(T0).toString(36)}s${(1).toString(36)}-`) && a1.entry.ts === T0);
check("appendOutbox: folded-seq id still passes isId('ob')", isId("ob", a1.entry.id) && isId("ob", a2.entry.id));
// Regression (id-collision): two appends at the SAME now with a DETERMINISTIC
// rand collide on the ms+rand halves; the folded monotonic seq makes them DISTINCT.
check("appendOutbox: distinct ids for same-now deterministic-rand appends (seq-folded)", (() => {
  const fixedRand = () => 0.5;
  const x = appendOutbox(initOutbox(), { domain: "runs", op: "create", payload: { id: "a" } }, T0, fixedRand);
  if (!x.ok) return false;
  const y = appendOutbox(x.state, { domain: "runs", op: "create", payload: { id: "b" } }, T0, fixedRand);
  if (!y.ok) return false;
  return x.entry.id !== y.entry.id && isId("ob", x.entry.id) && isId("ob", y.entry.id);
})());
check("appendOutbox: previous state untouched", a1.state.entries.length === 1 && ob.entries.length === 2);
check("appendOutbox: payload is JSON-cloned (caller detached)", (() => { (payload.nested.laps as number[])[0] = 99; return (a1.entry.payload as { nested: { laps: number[] } }).nested.laps[0] === 1; })());
check("appendOutbox: entry payload frozen", throws(() => { (a1.entry.payload as { name: string }).name = "x"; }));
check("appendOutbox rejects NaN deep in the payload", (() => { const r = appendOutbox(ob, { domain: "runs", op: "update", payload: { v: { deep: [1, NaN] } } }, T2); return !r.ok && r.reason === "non_finite_numeric"; })());
check("appendOutbox rejects Infinity in the payload", (() => { const r = appendOutbox(ob, { domain: "account", op: "update", payload: { v: Infinity } }, T2); return !r.ok; })());

// the document+outbox write loop: schema entities append WITHOUT casts
check("appendOutbox: a real RunEntry appends with no cast", (() => { const r = appendOutbox(initOutbox(), { domain: "runs", op: "create", payload: run1 }, T2); return r.ok && (r.entry.payload as { id: string }).id === run1.id; })());
check("appendOutbox: real Track and Car entities append with no cast", (() => { const a = appendOutbox(initOutbox(), { domain: "tracks", op: "create", payload: track2 }, T2); const b = appendOutbox(initOutbox(), { domain: "cars", op: "create", payload: car }, T2); return a.ok && b.ok; })());
check("appendOutbox: an OutcomeRecord appends with no cast", (() => { const r = appendOutbox(initOutbox(), { domain: "outcomes", op: "create", payload: oc1 }, T2); return r.ok; })());

// everything JSON would silently corrupt (or throw on) rejects, never crashes
check("appendOutbox rejects a function-valued prop", (() => { const r = appendOutbox(initOutbox(), { domain: "runs", op: "update", payload: { onPress: () => 1 } }, T2); return !r.ok && r.reason === "unserializable_payload"; })());
check("appendOutbox rejects a Set (non-plain object)", (() => { const r = appendOutbox(initOutbox(), { domain: "runs", op: "update", payload: { tags: new Set([1]) } }, T2); return !r.ok && r.reason === "unserializable_payload"; })());
check("appendOutbox rejects a Map (non-plain object)", (() => { const r = appendOutbox(initOutbox(), { domain: "runs", op: "update", payload: { m: new Map() } }, T2); return !r.ok && r.reason === "unserializable_payload"; })());
check("appendOutbox rejects a bigint", (() => { const r = appendOutbox(initOutbox(), { domain: "runs", op: "update", payload: { big: BigInt(1) } }, T2); return !r.ok && r.reason === "unserializable_payload"; })());
check("appendOutbox rejects undefined inside an array (stringify would null it)", (() => { const r = appendOutbox(initOutbox(), { domain: "runs", op: "update", payload: { xs: [1, undefined, 2] } }, T2); return !r.ok && r.reason === "unserializable_payload"; })());
check("appendOutbox rejects a circular payload with {ok:false}, never throws", (() => { const c: Record<string, unknown> = {}; c.self = c; const r = appendOutbox(initOutbox(), { domain: "runs", op: "update", payload: c }, T2); return !r.ok && r.reason === "unserializable_payload"; })());
check("appendOutbox: undefined-valued object prop drops the key like JSON does", (() => { const r = appendOutbox(initOutbox(), { domain: "runs", op: "update", payload: { a: 1, b: undefined } }, T2); return r.ok && !("b" in r.entry.payload) && (r.entry.payload as { a: number }).a === 1; })());
check("appendOutbox: shared (non-circular) references are fine", (() => { const shared = { x: 1 }; const r = appendOutbox(initOutbox(), { domain: "runs", op: "update", payload: { a: shared, b: shared } }, T2); return r.ok; })());
check("appendOutbox: reproducible id under an injected rand", (() => { const a = appendOutbox(initOutbox(), { domain: "runs", op: "create", payload: { x: 1 } }, T2, () => 0.5); const b = appendOutbox(initOutbox(), { domain: "runs", op: "create", payload: { x: 1 } }, T2, () => 0.5); return a.ok && b.ok && a.entry.id === b.entry.id; })());
check("entriesAfter: cursor read", entriesAfter(ob, 1).length === 1 && entriesAfter(ob, 1)[0].seq === 2 && entriesAfter(ob, 0).length === 2 && entriesAfter(ob, 5).length === 0);
const pruned = pruneOutbox(ob, 1);
check("pruneOutbox: drops acked entries, keeps next_seq", pruned.entries.length === 1 && pruned.entries[0].seq === 2 && pruned.next_seq === 3);
check("pruneOutbox: seq never reused after pruning", (() => { const r = appendOutbox(pruned, { domain: "sheets", op: "update", payload: {} }, T3); return r.ok && r.entry.seq === 3; })());

// ═══ parse (load-path validators) ════════════════════════════════════════════

console.log("\n— parse —");
{
  const json = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

  const pr = parseRunEntry(json(run1));
  check("parseRunEntry: round-trips a real stored run, frozen", pr.ok && pr.value.id === run1.id && pr.value.track.turns?.length === 3 && Object.isFrozen(pr.value) && Object.isFrozen(pr.value.conditions));
  check("parseRunEntry: catches the NaN→null corruption signature", (() => { const j = json(run1) as { conditions: { air_temp_c: unknown } }; j.conditions.air_temp_c = null; const r = parseRunEntry(j); return !r.ok && r.reason === "invalid:conditions.air_temp_c"; })());
  check("parseRunEntry: rejects a foreign-prefix id", (() => { const j = json(run1) as { id: string }; j.id = track2.id; const r = parseRunEntry(j); return !r.ok && r.reason === "invalid:id"; })());
  // P1-B8: surface is a free non-empty string (the app's 58 rcdata ids — clay_groomed,
  // decomposed_granite, …), NOT the 6-value legacy enum. parse accepts any real id and
  // rejects only a non-string / empty surface.
  check("parseRunEntry: accepts a real rcdata surface id (clay_groomed)", (() => { const j = json(run1) as { track: { surface: string } }; j.track.surface = "clay_groomed"; return parseRunEntry(j).ok; })());
  check("parseRunEntry: rejects an empty/non-string surface", (() => { const j = json(run1) as { track: { surface: unknown } }; j.track.surface = ""; const a = parseRunEntry(j); j.track.surface = 42; const b = parseRunEntry(j); return !a.ok && a.reason === "invalid:track.surface" && !b.ok && b.reason === "invalid:track.surface"; })());
  check("parseRunEntry: rejects a corrupted lap time", (() => { const j = json(run1) as { timing: { laps: { t_s: unknown }[] } }; j.timing.laps[1].t_s = null; const r = parseRunEntry(j); return !r.ok && r.reason === "invalid:timing.laps[1].t_s"; })());
  check("parseRunEntry: tolerates unknown extra keys (forward compat)", (() => { const j = json(run1) as Record<string, unknown>; j.future_field = "newer build"; return parseRunEntry(j).ok; })());

  check("parseTrack: round-trip + corrupted record rejects", (() => { const okR = parseTrack(json(track2)); const j = json(track2) as { records: { best_lap_s: unknown }[] }; j.records[0].best_lap_s = null; const bad = parseTrack(j); return okR.ok && !bad.ok && bad.reason === "invalid:records[0].best_lap_s"; })());
  check("parseCar: round-trip + power_type lie rejects", (() => { const okR = parseCar(json(car)); const j = json(car) as { power_type: string }; j.power_type = "steam"; const bad = parseCar(j); return okR.ok && okR.value.id === car.id && !bad.ok && bad.reason === "invalid:power_type"; })());
  check("parseOutcomeRecord: round-trips a real record (car_name required)", (() => { const r = parseOutcomeRecord(json(oc1)); const j = json(oc1) as Record<string, unknown>; delete j.car_name; return r.ok && r.value.car_name === "MP11 #1" && !parseOutcomeRecord(j).ok; })());
  check("parseAccountState: round-trip + status lie rejects", (() => { const okR = parseAccountState(json(acctActive)); const j = json(acctActive) as { subscription: { status: string } }; j.subscription.status = "vip"; return okR.ok && !parseAccountState(j).ok; })());
  check("parseWeatherObservation: offset-less timestamp rejects on load too", !parseWeatherObservation({ observed_at: "2026-06-11T09:00", source: "auto" }).ok);
  check("parseOutboxState: round-trip + foreign domain rejects", (() => { const okR = parseOutboxState(json(ob)); const j = json(ob) as { entries: { domain: string }[] }; j.entries[0].domain = "garbage"; return okR.ok && !parseOutboxState(j).ok; })());
  check("parse: not_an_object on scalar garbage", (() => { const a = parseRunEntry("nope"); const b = parseTrack(42); return !a.ok && a.reason === "not_an_object" && !b.ok && b.reason === "not_an_object"; })());
}

// ═══ verdict ═════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nSCHEMA: all checks passed" : `\nSCHEMA: ${failures} failures`);
if (failures > 0) process.exit(1);
