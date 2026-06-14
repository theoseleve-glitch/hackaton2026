/**
 * Speedhive → schema mapping. The ONLY file that turns SH* wire shapes into
 * racelab-schema shapes; everything downstream of here speaks schema.
 *
 * Pipeline:  SHLap[] / SHPracticeSession
 *              → fromEventLaps / fromPracticeSession   (ImportedLaps)
 *              → buildRunTiming                        (RunTimingInput kind:"laps",
 *                 via schema toLapSeries — same guards as makeRun)
 *              → makeRun({ ..., timing })              (app layer)
 *
 * MANUAL FALLBACK (documented contract): when there is no Speedhive data, the
 * app skips this package entirely and hands makeRun a
 * `{ kind: "summary", result: { best_lap_s, laps, position, ... } }` timing —
 * the schema's summary branch IS the manual path; this adapter only ever
 * produces the `{ kind: "laps" }` branch.
 *
 * Never-wipe: a malformed lap (unparseable/non-positive time) rejects the
 * WHOLE import with the offending index reported — we never silently drop a
 * lap and let a hole masquerade as official timing. Lap renumbering (when the
 * wire numbers are missing/broken) is surfaced via `renumbered: true`, never
 * silent.
 *
 * `imported_at` is INJECTED by the caller — nothing here calls Date.now().
 */

import type { ImportedLap, ImportedLaps, IsoDateTime, RunRejectReason, RunTimingInput } from "../../schema/src/index";
import { toLapSeries } from "../../schema/src/index";
import type { SHClassification, SHClassificationRow, SHLap, SHLapchart, SHPracticeSession } from "./types";

// ── Result shapes ────────────────────────────────────────────────────────────

export type MapLapsFailure =
  | { ok: false; reason: "no_laps" }
  | { ok: false; reason: "bad_lap_time"; lap_index: number; detail?: string }
  | { ok: false; reason: "session_index_out_of_range"; session_count: number };

export type MapLapsResult =
  | { ok: true; imported: ImportedLaps; renumbered: boolean }
  | MapLapsFailure;

/** Caller-supplied provenance for an import. `imported_at` is required and
 *  injected (no clock in this package); the rest is denormalized display
 *  metadata carried into SpeedhiveImportMeta / ImportedLaps. */
export interface ImportMetaInput {
  imported_at: IsoDateTime;
  speedhive_session_id?: string;
  event_name?: string;
  session_name?: string;
  track_name?: string;
  driver_name?: string;
  transponder_id?: string;
}

// ── Time parsing ─────────────────────────────────────────────────────────────

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** True only for a plain non-null, non-array object. Every wire-array element
 *  is guarded with this BEFORE any property access: an unofficial API can ship
 *  a `null` or a scalar in any array, and `null.foo` / reading a key off a
 *  primitive would throw across our public boundary. House rule: never throw —
 *  a non-object element is treated as missing data (skipped or, for laps where
 *  never-wipe forbids a silent drop, surfaced as a null-time view that rejects
 *  the whole import with its index). */
function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Parse a Speedhive clock string into seconds: "33.512" → 33.512,
 *  "01:29.215" → 89.215, "1:02:03.5" → 3723.5. Garbage / non-positive → null. */
export function parseClockTime(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  const parts = s.split(":");
  if (parts.length > 3) return null;
  let total = 0;
  for (const part of parts) {
    if (!/^\d+(\.\d+)?$/.test(part)) return null;
    total = total * 60 + Number(part);
  }
  return Number.isFinite(total) && total > 0 ? round3(total) : null;
}

/** Seconds from a tolerant SHLap, in priority order:
 *  lapTime string (clock) → lapTime number (taken as seconds) → duration (ms).
 *  Anything non-positive/non-finite → null.
 *
 *  A NON-EMPTY clock string that parses wins outright. But a blank/unparseable
 *  lapTime string must NOT short-circuit and discard a perfectly good numeric
 *  `duration` on the same lap — the string branch only commits when
 *  parseClockTime actually yields a time; otherwise we fall through to the
 *  numeric fields. (A non-record element guards to null — never throws.) */
export function lapSeconds(raw: SHLap): number | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.lapTime === "string") {
    const fromClock = parseClockTime(raw.lapTime);
    if (fromClock !== null) return fromClock;
    // blank / unparseable string: fall through to the numeric fields below.
  } else if (isFiniteNumber(raw.lapTime) && raw.lapTime > 0) {
    return round3(raw.lapTime);
  }
  if (isFiniteNumber(raw.duration) && raw.duration > 0) return round3(raw.duration / 1000);
  return null;
}

// ── Core mapping ─────────────────────────────────────────────────────────────

interface RawLapView {
  n: number | null; // wire lap number, when usable
  t_s: number | null;
  position: number | null;
}

function buildImportedLaps(
  views: readonly RawLapView[],
  meta: ImportMetaInput,
): { ok: true; imported: ImportedLaps; renumbered: boolean } | MapLapsFailure {
  if (views.length === 0) return { ok: false, reason: "no_laps" };

  for (let i = 0; i < views.length; i++) {
    if (views[i].t_s === null) {
      return { ok: false, reason: "bad_lap_time", lap_index: i, detail: "unparseable or non-positive lap time" };
    }
  }

  // Keep wire lap numbers only when they already form a strictly increasing
  // positive-integer sequence (schema's bar); otherwise renumber 1..N in
  // arrival order and SAY SO — sequential numbering is guaranteed either way.
  let useWire = true;
  let prev = 0;
  for (const v of views) {
    if (v.n === null || !Number.isInteger(v.n) || v.n <= prev) {
      useWire = false;
      break;
    }
    prev = v.n;
  }

  const laps: ImportedLap[] = views.map((v, i) => ({
    n: useWire ? (v.n as number) : i + 1,
    t_s: v.t_s as number,
    ...(v.position !== null ? { position_in_session: v.position } : {}),
  }));

  const imported: ImportedLaps = {
    source: "speedhive",
    imported_at: meta.imported_at,
    laps,
    ...(meta.speedhive_session_id !== undefined ? { speedhive_session_id: meta.speedhive_session_id } : {}),
    ...(meta.event_name !== undefined ? { event_name: meta.event_name } : {}),
    ...(meta.session_name !== undefined ? { session_name: meta.session_name } : {}),
    ...(meta.track_name !== undefined ? { track_name: meta.track_name } : {}),
    ...(meta.driver_name !== undefined ? { driver_name: meta.driver_name } : {}),
    ...(meta.transponder_id !== undefined ? { transponder_id: meta.transponder_id } : {}),
  };
  return { ok: true, imported, renumbered: !useWire };
}

/** Map one competitor's event laps (getCompetitorLaps payload `.laps`) into
 *  schema ImportedLaps. Times come from lapTime/duration (see lapSeconds);
 *  running positions are carried when present (positive integers only —
 *  schema positionDeltas then derives gains/losses). */
export function fromEventLaps(laps: readonly SHLap[], meta: ImportMetaInput): MapLapsResult {
  // Element-guard: a null/scalar element has no usable time → null-time view,
  // which buildImportedLaps rejects with its index (never-wipe: no silent
  // drop, no throw).
  const views: RawLapView[] = laps.map((l) =>
    isRecord(l)
      ? {
          n: isFiniteNumber(l.lapNr) ? l.lapNr : isFiniteNumber(l.nr) ? l.nr : null,
          t_s: lapSeconds(l),
          position:
            isFiniteNumber(l.position) && Number.isInteger(l.position) && l.position >= 1 ? l.position : null,
        }
      : { n: null, t_s: null, position: null },
  );
  return buildImportedLaps(views, meta);
}

/** Map ONE sub-session (one continuous run) of a practice activity. A
 *  Speedhive practice detail bundles the whole outing; one RunEntry = one
 *  sub-session, picked by `session_index` (default 0). Durations are ms.
 *  Defaults pulled from the detail when meta omits them: speedhive_session_id
 *  ← detail.id, track_name ← detail.location.name, transponder_id ←
 *  detail.chip.code. Practice laps carry no positions. */
export function fromPracticeSession(
  detail: SHPracticeSession,
  meta: ImportMetaInput,
  session_index = 0,
): MapLapsResult {
  const subs = detail.sessions ?? [];
  if (!Number.isInteger(session_index) || session_index < 0 || session_index >= subs.length) {
    return { ok: false, reason: "session_index_out_of_range", session_count: subs.length };
  }
  // The sub-session itself may be a null/scalar wire element (the type says
  // SHPracticeSubSession, but the unofficial API gets no benefit of the doubt)
  // — guard before reading `.laps`, else `.laps` throws across the boundary.
  const sub = subs[session_index] as unknown;
  const laps: readonly SHLap[] = isRecord(sub) && Array.isArray(sub["laps"]) ? (sub["laps"] as SHLap[]) : [];
  // Element-guard each lap: a null/scalar lap → null-time view (rejected with
  // its index by buildImportedLaps; never-wipe, never thrown).
  const views: RawLapView[] = laps.map((l) =>
    isRecord(l)
      ? {
          n: isFiniteNumber(l.nr) ? l.nr : null,
          t_s: isFiniteNumber(l.duration) && l.duration > 0 ? round3(l.duration / 1000) : null,
          position: null,
        }
      : { n: null, t_s: null, position: null },
  );

  const chipCode = detail.chip?.code;
  const locationName = detail.location?.name;
  const enriched: ImportMetaInput = {
    ...meta,
    ...(meta.speedhive_session_id === undefined ? { speedhive_session_id: String(detail.id) } : {}),
    ...(meta.track_name === undefined && typeof locationName === "string" ? { track_name: locationName } : {}),
    ...(meta.transponder_id === undefined && typeof chipCode === "string" ? { transponder_id: chipCode } : {}),
  };
  return buildImportedLaps(views, enriched);
}

// ── Transponder matching ─────────────────────────────────────────────────────

/** Normalize a transponder id for comparison: uppercase, alphanumerics only —
 *  "fx-48213", "FX 48213" and "FX48213" all match. */
export function normalizeTransponder(s: string): string {
  return s.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export type TransponderMatch =
  | { ok: true; row: SHClassificationRow; row_index: number }
  | { ok: false; reason: "no_rows" | "not_found" };

/** Find OUR car in a classification by transponder id (Car.transponder_id).
 *  First match wins (one chip should appear once per session). */
export function findTransponderResults(
  classification: SHClassification,
  transponder_id: string,
): TransponderMatch {
  const rows = classification.rows ?? [];
  if (rows.length === 0) return { ok: false, reason: "no_rows" };
  const want = normalizeTransponder(transponder_id);
  if (want === "") return { ok: false, reason: "not_found" };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Element-guard: a null/scalar row would throw on `.transponder`. Skip it
    // (row_index stays the true position in the array — we don't compact).
    if (!isRecord(row)) continue;
    const t = row.transponder;
    if (typeof t === "string" && normalizeTransponder(t) === want) {
      return { ok: true, row: row as SHClassificationRow, row_index: i };
    }
  }
  return { ok: false, reason: "not_found" };
}

// ── Lapchart positions (VERIFIED public per-lap source) ─────────────────────

/** One car's position at each lapchart column. Column 0 is the start grid,
 *  column N is after lap N. */
export interface LapchartPosition {
  lap: number;
  position: number;
}

/** Extract one car's per-lap positions from a VERIFIED /lapchart payload
 *  (the real public per-lap source — per-lap TIMES stay quarantined, see
 *  client.ts). positionRows is one row per position, one cell per column;
 *  a retired car's row truncates early, so columns where the car is absent
 *  are skipped (never invented). startNumber matching is tolerant the same
 *  way transponder matching is ("23 B" matches "23b").
 *
 *  A cell whose `position` is not a valid positive integer is OMITTED (the
 *  column is left out) rather than back-filled with the row index. The row
 *  index is FINISHING order, not the running position at that column, so the
 *  old fallback silently mislabeled data — same posture as a truncated row:
 *  when we don't have the real position, we don't invent one. */
export function competitorLapchartPositions(
  chart: SHLapchart,
  start_number: string,
): LapchartPosition[] {
  const rows = chart.positionRows ?? [];
  const want = normalizeTransponder(start_number);
  if (want === "") return [];

  let columns = 0;
  for (const row of rows) {
    // Only arrays contribute columns; a null/scalar row has no `.length` we
    // trust (reading it off a primitive would be undefined, off null throws).
    if (Array.isArray(row) && row.length > columns) columns = row.length;
  }

  const out: LapchartPosition[] = [];
  for (let col = 0; col < columns; col++) {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      const cell = row[col];
      // Element-guard the cell: skip a null/scalar cell before reading keys.
      if (!isRecord(cell)) continue;
      const sn = cell.startNumber;
      if (typeof sn === "string" && normalizeTransponder(sn) === want) {
        const p = cell.position;
        // No valid running position → omit the column entirely. The row index
        // is finishing order, not running position; back-filling it lied.
        if (isFiniteNumber(p) && Number.isInteger(p) && p >= 1) {
          out.push({ lap: col, position: p });
        }
        break;
      }
    }
  }
  return out;
}

// ── RunTiming bridge ─────────────────────────────────────────────────────────

/** ImportedLaps → the `timing` input makeRun wants, via schema toLapSeries
 *  (which re-applies makeRun's own lap guards — a flaky payload can never
 *  become official-looking timing). Manual entry does NOT pass through here:
 *  it is the schema's `{ kind: "summary", result }` branch, built by the app. */
export function buildRunTiming(
  imported: ImportedLaps,
): { ok: true; timing: RunTimingInput } | { ok: false; reason: RunRejectReason } {
  const r = toLapSeries(imported);
  if (!r.ok) return r;
  return {
    ok: true,
    timing: {
      kind: "laps",
      laps: r.series.laps,
      ...(r.series.import !== undefined ? { import: r.series.import } : {}),
    },
  };
}
