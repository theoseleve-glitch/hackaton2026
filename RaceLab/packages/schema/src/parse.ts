/**
 * Load-path validators — the other half of the never-wipe story. Every
 * write-time guard in this package protects only the writes of THIS process;
 * a JSON.parse from AsyncStorage/sqlite bypasses all of it (NaN serialized to
 * null, foreign-prefix ids, surface "dirt" typed as Surface). Storage adapters
 * are CONTRACTUALLY required to route every load through these parsers before
 * handing data to typed code — ids.ts and vocab.ts promised these validators;
 * this file is where they live.
 *
 * Shape: `parseX(value: unknown) → { ok: true; value: X } | { ok: false; reason }`.
 * Reasons are stable strings: "not_an_object", "non_finite_numeric", or
 * "invalid:<field path>" for a field that is missing, mistyped, out of its
 * enum, or carrying a wrong id prefix. Unknown extra keys are TOLERATED
 * (forward compatibility — an older app build must load a newer blob's rows).
 * Validated values are deep-frozen in place (parse output is owned data).
 */

import {
  BUMPINESS_LEVELS,
  GRIPS,
  OUTCOMES,
  POWER_TYPES,
  RUN_TYPES,
  SKIES,
  SURFACES,
  TRACK_EVOLUTIONS,
  TRAFFIC_LEVELS,
  TYRE_WEARS,
  deepFreeze,
  deepNumbersFinite,
  isFiniteNum,
} from "./vocab";
import type { IdPrefix } from "./ids";
import { isId } from "./ids";
import type { Car } from "./cars";
import { LAP_SOURCES } from "./runs";
import type { OutcomeRecord, RunEntry } from "./runs";
import {
  BANKINGS,
  CORNER_TYPES,
  TRACK_RECORD_SOURCES,
  TURN_DIRECTIONS,
  turnsReject,
} from "./tracks";
import type { Track, TrackTurn } from "./tracks";
import { WEATHER_DERIVED_FIELDS, WEATHER_NUMERIC_FIELDS, WEATHER_SOURCES, hasExplicitOffset } from "./weather";
import type { WeatherObservation } from "./weather";
import { OUTBOX_DOMAINS, OUTBOX_OPS } from "./outbox";
import type { OutboxState } from "./outbox";
import { SUBSCRIPTION_STATUSES } from "./account";
import type { AccountState } from "./account";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

// ── primitive checkers (return true when the field is acceptable) ───────────

type Rec = Record<string, unknown>;

function isRecord(v: unknown): v is Rec {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function no(field: string): { ok: false; reason: string } {
  return { ok: false, reason: `invalid:${field}` };
}
function str(v: unknown): v is string {
  return typeof v === "string";
}
function nonEmptyStr(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}
function bool(v: unknown): v is boolean {
  return typeof v === "boolean";
}
function intGte(v: unknown, lo: number): v is number {
  return isFiniteNum(v) && Number.isInteger(v) && v >= lo;
}
function inEnum(arr: readonly string[], v: unknown): boolean {
  return typeof v === "string" && arr.includes(v);
}
function isoDateTime(v: unknown): v is string {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}
function idOk(prefix: IdPrefix, v: unknown): boolean {
  return typeof v === "string" && isId(prefix, v);
}
/** undefined passes; present values must satisfy the check. */
function opt(v: unknown, check: (x: unknown) => boolean): boolean {
  return v === undefined || check(v);
}

// ── shared sub-structures ────────────────────────────────────────────────────

/** null on success, offending field path on failure. */
function turnsBad(v: unknown, path: string): string | null {
  if (!Array.isArray(v)) return path;
  for (let i = 0; i < v.length; i++) {
    const t: unknown = v[i];
    if (!isRecord(t)) return `${path}[${i}]`;
    if (!inEnum(TURN_DIRECTIONS, t.direction)) return `${path}[${i}].direction`;
    if (!inEnum(CORNER_TYPES, t.corner_type)) return `${path}[${i}].corner_type`;
    if (!opt(t.bumps, (x) => inEnum(BUMPINESS_LEVELS, x))) return `${path}[${i}].bumps`;
    if (!opt(t.banking, (x) => inEnum(BANKINGS, x))) return `${path}[${i}].banking`;
    if (!opt(t.surface_override, (x) => inEnum(SURFACES, x))) return `${path}[${i}].surface_override`;
    if (!opt(t.notes, str)) return `${path}[${i}].notes`;
  }
  if (turnsReject(v as readonly TrackTurn[]) !== null) return `${path}.n`;
  return null;
}

function snapshotBad(v: unknown, path: string): string | null {
  if (!isRecord(v)) return path;
  if (!idOk("trk", v.track_id)) return `${path}.track_id`;
  if (!nonEmptyStr(v.name)) return `${path}.name`;
  if (!inEnum(SURFACES, v.surface)) return `${path}.surface`;
  if (!bool(v.indoor)) return `${path}.indoor`;
  if (!opt(v.layout, str)) return `${path}.layout`;
  if (v.turns !== undefined) {
    const bad = turnsBad(v.turns, `${path}.turns`);
    if (bad !== null) return bad;
  }
  return null;
}

function conditionsBad(v: unknown, path: string): string | null {
  if (!isRecord(v)) return path;
  if (!inEnum(GRIPS, v.grip)) return `${path}.grip`;
  if (!opt(v.bumpiness, (x) => inEnum(BUMPINESS_LEVELS, x))) return `${path}.bumpiness`;
  if (!opt(v.dusty, bool)) return `${path}.dusty`;
  if (!opt(v.sky, (x) => inEnum(SKIES, x))) return `${path}.sky`;
  if (!opt(v.evolution, (x) => inEnum(TRACK_EVOLUTIONS, x))) return `${path}.evolution`;
  for (const f of ["air_temp_c", "track_temp_c", "humidity_pct"] as const) {
    if (!opt(v[f], isFiniteNum)) return `${path}.${f}`;
  }
  return null;
}

function weatherBad(v: unknown, path: string): string | null {
  if (!isRecord(v)) return path;
  if (!isoDateTime(v.observed_at) || !hasExplicitOffset(v.observed_at as string)) {
    return `${path}.observed_at`;
  }
  if (!inEnum(WEATHER_SOURCES, v.source)) return `${path}.source`;
  for (const f of WEATHER_NUMERIC_FIELDS) {
    if (!opt(v[f], isFiniteNum)) return `${path}.${f}`;
  }
  if (!opt(v.sky, (x) => inEnum(SKIES, x))) return `${path}.sky`;
  return null;
}

function feedbackTagsBad(v: unknown, path: string): string | null {
  if (!Array.isArray(v)) return path;
  for (let i = 0; i < v.length; i++) {
    const t: unknown = v[i];
    if (!isRecord(t) || !nonEmptyStr(t.symptom)) return `${path}[${i}].symptom`;
    if (!opt(t.phase, str)) return `${path}[${i}].phase`;
    if (!opt(t.evolution, str)) return `${path}[${i}].evolution`;
  }
  return null;
}

// ── entities ─────────────────────────────────────────────────────────────────

export function parseCar(value: unknown): ParseResult<Car> {
  if (!isRecord(value)) return { ok: false, reason: "not_an_object" };
  if (!deepNumbersFinite(value)) return { ok: false, reason: "non_finite_numeric" };
  if (!idOk("car", value.id)) return no("id");
  if (!nonEmptyStr(value.name)) return no("name");
  if (!nonEmptyStr(value.chassis_id)) return no("chassis_id");
  if (!inEnum(POWER_TYPES, value.power_type)) return no("power_type");
  if (!opt(value.transponder_id, str)) return no("transponder_id");
  if (!opt(value.photo_uri, str)) return no("photo_uri");
  if (!opt(value.notes, str)) return no("notes");
  if (!isoDateTime(value.created_at)) return no("created_at");
  return { ok: true, value: deepFreeze(value) as unknown as Car };
}

export function parseTrack(value: unknown): ParseResult<Track> {
  if (!isRecord(value)) return { ok: false, reason: "not_an_object" };
  if (!deepNumbersFinite(value)) return { ok: false, reason: "non_finite_numeric" };
  if (!idOk("trk", value.id)) return no("id");
  if (!nonEmptyStr(value.name)) return no("name");
  if (!inEnum(SURFACES, value.surface)) return no("surface");
  if (!bool(value.indoor)) return no("indoor");
  if (!bool(value.is_public)) return no("is_public");
  if (value.gps !== undefined) {
    const g = value.gps;
    if (!isRecord(g) || !isFiniteNum(g.lat) || !isFiniteNum(g.lon)) return no("gps");
    if (g.lat < -90 || g.lat > 90 || g.lon < -180 || g.lon > 180) return no("gps");
  }
  if (!opt(value.layout, str)) return no("layout");
  if (value.turns !== undefined) {
    const bad = turnsBad(value.turns, "turns");
    if (bad !== null) return no(bad);
  }
  if (!Array.isArray(value.records)) return no("records");
  for (let i = 0; i < value.records.length; i++) {
    const r: unknown = value.records[i];
    if (!isRecord(r)) return no(`records[${i}]`);
    if (!nonEmptyStr(r.class)) return no(`records[${i}].class`);
    if (!isFiniteNum(r.best_lap_s) || r.best_lap_s <= 0) return no(`records[${i}].best_lap_s`);
    if (!inEnum(TRACK_RECORD_SOURCES, r.source)) return no(`records[${i}].source`);
    if (!opt(r.holder, str)) return no(`records[${i}].holder`);
    if (!opt(r.date, str)) return no(`records[${i}].date`);
  }
  if (value.photos !== undefined && !(Array.isArray(value.photos) && value.photos.every(str))) {
    return no("photos");
  }
  if (!opt(value.notes, str)) return no("notes");
  if (!isoDateTime(value.created_at)) return no("created_at");
  return { ok: true, value: deepFreeze(value) as unknown as Track };
}

export function parseWeatherObservation(value: unknown): ParseResult<WeatherObservation> {
  if (!isRecord(value)) return { ok: false, reason: "not_an_object" };
  if (!deepNumbersFinite(value)) return { ok: false, reason: "non_finite_numeric" };
  const bad = weatherBad(value, "weather");
  if (bad !== null) return no(bad);
  return { ok: true, value: deepFreeze(value) as unknown as WeatherObservation };
}

export function parseRunEntry(value: unknown): ParseResult<RunEntry> {
  if (!isRecord(value)) return { ok: false, reason: "not_an_object" };
  if (!deepNumbersFinite(value)) return { ok: false, reason: "non_finite_numeric" };
  if (!idOk("run", value.id)) return no("id");
  // created_at is intentionally NOT offset-required here (weather.observed_at IS):
  // lifted-legacy rows may carry offset-less ISO and rejecting them would wipe
  // valid history. The skew this could cause at the weather join is neutralized
  // at the seam — weatherAtTime() reads an offset-less timestamp as UTC, never
  // device-local — so an offset-less created_at can never silently misjoin.
  if (!isoDateTime(value.created_at)) return no("created_at");
  if (!inEnum(RUN_TYPES, value.type)) return no("type");
  if (!idOk("ss", value.session_id)) return no("session_id");
  if (!idOk("car", value.car_id)) return no("car_id");
  if (!opt(value.car_name, str)) return no("car_name");
  if (!nonEmptyStr(value.car_template_id)) return no("car_template_id");
  if (!nonEmptyStr(value.setup_version_id)) return no("setup_version_id");
  if (!str(value.setup_name)) return no("setup_name");
  if (!idOk("trk", value.track_id)) return no("track_id");
  {
    const bad = snapshotBad(value.track, "track");
    if (bad !== null) return no(bad);
  }
  {
    const bad = conditionsBad(value.conditions, "conditions");
    if (bad !== null) return no(bad);
  }
  if (value.conditions_provenance !== undefined) {
    const p = value.conditions_provenance;
    const fieldList = (x: unknown): boolean =>
      Array.isArray(x) && x.every((f) => inEnum(WEATHER_DERIVED_FIELDS, f));
    if (!isRecord(p) || !fieldList(p.auto_filled) || !fieldList(p.overridden)) {
      return no("conditions_provenance");
    }
  }
  if (value.weather !== undefined) {
    const bad = weatherBad(value.weather, "weather");
    if (bad !== null) return no(bad);
  }
  if (value.tyres !== undefined) {
    const t = value.tyres;
    if (!isRecord(t)) return no("tyres");
    for (const f of ["brand", "compound", "insert", "sauce"] as const) {
      if (!opt(t[f], str)) return no(`tyres.${f}`);
    }
    if (!opt(t.wear, (x) => inEnum(TYRE_WEARS, x))) return no("tyres.wear");
    if (!opt(t.run_count, (x) => intGte(x, 0))) return no("tyres.run_count");
  }
  if (value.fuel !== undefined) {
    const f = value.fuel;
    if (!isRecord(f) || !opt(f.tank_cc, isFiniteNum) || !opt(f.consumed_cc, isFiniteNum)) {
      return no("fuel");
    }
  }
  if (value.timing !== undefined) {
    const t = value.timing;
    if (!isRecord(t)) return no("timing");
    if (t.kind === "summary") {
      if (!isRecord(t.result)) return no("timing.result");
      const r = t.result;
      for (const f of ["best_lap_s", "avg_lap_s", "consistency_pct"] as const) {
        if (!opt(r[f], isFiniteNum)) return no(`timing.result.${f}`);
      }
      if (!opt(r.laps, (x) => intGte(x, 1))) return no("timing.result.laps");
      if (!opt(r.position, (x) => intGte(x, 1))) return no("timing.result.position");
      if (!opt(r.mistakes, (x) => intGte(x, 0))) return no("timing.result.mistakes");
      if (!opt(r.traffic, (x) => inEnum(TRAFFIC_LEVELS, x))) return no("timing.result.traffic");
      if (!opt(r.tyre_state_after, (x) => inEnum(TYRE_WEARS, x))) return no("timing.result.tyre_state_after");
    } else if (t.kind === "laps") {
      if (!Array.isArray(t.laps) || t.laps.length === 0) return no("timing.laps");
      let prev = 0;
      for (let i = 0; i < t.laps.length; i++) {
        const l: unknown = t.laps[i];
        if (!isRecord(l)) return no(`timing.laps[${i}]`);
        if (!intGte(l.n, 1) || (l.n as number) <= prev) return no(`timing.laps[${i}].n`);
        if (!isFiniteNum(l.t_s) || l.t_s <= 0) return no(`timing.laps[${i}].t_s`);
        if (!inEnum(LAP_SOURCES, l.source)) return no(`timing.laps[${i}].source`);
        prev = l.n as number;
      }
      if (t.import !== undefined && (!isRecord(t.import) || !isoDateTime(t.import.imported_at))) {
        return no("timing.import");
      }
    } else {
      return no("timing.kind");
    }
  }
  if (!isRecord(value.feedback)) return no("feedback");
  {
    const bad = feedbackTagsBad(value.feedback.tags, "feedback.tags");
    if (bad !== null) return no(bad);
    if (!opt(value.feedback.text, str)) return no("feedback.text");
    if (value.feedback.turns !== undefined) {
      const turns = value.feedback.turns;
      if (!Array.isArray(turns)) return no("feedback.turns");
      for (let i = 0; i < turns.length; i++) {
        const tf: unknown = turns[i];
        if (!isRecord(tf) || !intGte(tf.turn_n, 1)) return no(`feedback.turns[${i}].turn_n`);
        if (tf.tags !== undefined) {
          const tbad = feedbackTagsBad(tf.tags, `feedback.turns[${i}].tags`);
          if (tbad !== null) return no(tbad);
        }
        if (!opt(tf.text, str)) return no(`feedback.turns[${i}].text`);
      }
    }
  }
  if (value.driver !== undefined) {
    const d = value.driver;
    if (!isRecord(d)) return no("driver");
    if (!opt(d.feeling_1to10, (x) => intGte(x, 1) && (x as number) <= 10)) return no("driver.feeling_1to10");
    if (!opt(d.fatigue_1to5, (x) => intGte(x, 1) && (x as number) <= 5)) return no("driver.fatigue_1to5");
    if (!opt(d.confidence_1to5, (x) => intGte(x, 1) && (x as number) <= 5)) return no("driver.confidence_1to5");
  }
  if (!opt(value.outcome, (x) => inEnum(OUTCOMES, x))) return no("outcome");
  if (!opt(value.note, str)) return no("note");
  return { ok: true, value: deepFreeze(value) as unknown as RunEntry };
}

export function parseOutcomeRecord(value: unknown): ParseResult<OutcomeRecord> {
  if (!isRecord(value)) return { ok: false, reason: "not_an_object" };
  if (!deepNumbersFinite(value)) return { ok: false, reason: "non_finite_numeric" };
  if (!idOk("oc", value.id)) return no("id");
  if (!isoDateTime(value.created_at)) return no("created_at");
  if (!idOk("ss", value.session_id)) return no("session_id");
  if (!idOk("car", value.car_id)) return no("car_id");
  if (!nonEmptyStr(value.car_name)) return no("car_name");
  if (!nonEmptyStr(value.setting)) return no("setting");
  if (!nonEmptyStr(value.change)) return no("change");
  if (!(Array.isArray(value.citations) && value.citations.every(str))) return no("citations");
  if (!inEnum(OUTCOMES, value.outcome)) return no("outcome");
  if (!nonEmptyStr(value.setup_version_id)) return no("setup_version_id");
  if (!str(value.setup_name)) return no("setup_name");
  if (!idOk("trk", value.track_id)) return no("track_id");
  {
    const bad = snapshotBad(value.track, "track");
    if (bad !== null) return no(bad);
  }
  {
    const bad = conditionsBad(value.conditions, "conditions");
    if (bad !== null) return no(bad);
  }
  if (!opt(value.run_id, (x) => idOk("run", x))) return no("run_id");
  if (!opt(value.note, str)) return no("note");
  return { ok: true, value: deepFreeze(value) as unknown as OutcomeRecord };
}

export function parseAccountState(value: unknown): ParseResult<AccountState> {
  if (!isRecord(value)) return { ok: false, reason: "not_an_object" };
  if (!deepNumbersFinite(value)) return { ok: false, reason: "non_finite_numeric" };
  if (!opt(value.user_id, str)) return no("user_id");
  if (!opt(value.trial_started_at, isoDateTime)) return no("trial_started_at");
  if (!opt(value.trial_ends_at, isoDateTime)) return no("trial_ends_at");
  const s = value.subscription;
  if (!isRecord(s)) return no("subscription");
  if (!inEnum(SUBSCRIPTION_STATUSES, s.status)) return no("subscription.status");
  if (s.source !== "web") return no("subscription.source");
  if (!opt(s.validated_at, isoDateTime)) return no("subscription.validated_at");
  if (!opt(s.expires_at, isoDateTime)) return no("subscription.expires_at");
  return { ok: true, value: deepFreeze(value) as unknown as AccountState };
}

export function parseOutboxState(value: unknown): ParseResult<OutboxState> {
  if (!isRecord(value)) return { ok: false, reason: "not_an_object" };
  if (!deepNumbersFinite(value)) return { ok: false, reason: "non_finite_numeric" };
  if (!intGte(value.next_seq, 1)) return no("next_seq");
  if (!Array.isArray(value.entries)) return no("entries");
  let prev = 0;
  for (let i = 0; i < value.entries.length; i++) {
    const e: unknown = value.entries[i];
    if (!isRecord(e)) return no(`entries[${i}]`);
    if (!intGte(e.seq, 1) || (e.seq as number) <= prev) return no(`entries[${i}].seq`);
    if ((e.seq as number) >= (value.next_seq as number)) return no(`entries[${i}].seq`);
    if (!idOk("ob", e.id)) return no(`entries[${i}].id`);
    if (!isoDateTime(e.ts)) return no(`entries[${i}].ts`);
    if (!inEnum(OUTBOX_DOMAINS, e.domain)) return no(`entries[${i}].domain`);
    if (!inEnum(OUTBOX_OPS, e.op)) return no(`entries[${i}].op`);
    if (!isRecord(e.payload)) return no(`entries[${i}].payload`);
    prev = e.seq as number;
  }
  return { ok: true, value: deepFreeze(value) as unknown as OutboxState };
}
