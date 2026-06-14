/**
 * Speedhive RAW WIRE TYPES + SHAPE GATES — UNOFFICIAL API, SH-prefixed, kept
 * strictly separate from racelab-schema types. Nothing in here is a domain
 * entity; import.ts is the only place that translates SH* into schema shapes.
 *
 * ISOLATION CONTRACT (B9): when MYLAPS shifts a payload, THIS file (and the
 * mapping it feeds in import.ts) is the blast radius — client.ts owns URLs
 * and never names a payload key: the runtime shape gates at the bottom of
 * this file are the ONLY place payload key-strings exist, right next to the
 * types they mirror. Everything downstream of import.ts only ever sees
 * schema types / mapped view models.
 *
 * Grounding:
 *  - Event-results shapes verified against live public endpoints on
 *    2026-06-12 (events list, event sessions groups, session classification
 *    + lapchart of event 3545938 / session 12230620). Classification rows
 *    are FLAT — name/startNumber/transponder sit on the row, not under a
 *    competitor object; times are clock strings ("10.728", "01:29.215").
 *  - Lapchart (per-lap positions) verified live 2026-06-12: positionRows is
 *    one row per finishing position, each row one cell per column where
 *    column 0 is the start grid (cell count = numberOfLaps + 1); retired
 *    cars' rows truncate early.
 *  - Practice shapes follow William's intercepted JSON: a session detail
 *    carries `stats` (with `bestLap`) and a `sessions` array whose entries
 *    each carry `laps`; durations are integer MILLISECONDS.
 *  - The per-competitor lap-TIMES payload is FICTION until intercepted: the
 *    candidate path 404'd live on 2026-06-12 even with a real startNumber.
 *    SHCompetitorLaps/SHLap stay (deliberately tolerant) but are served only
 *    through the client's `unverified` quarantine.
 *
 * Every field except primary ids is optional/nullable on purpose: an
 * unofficial API gets zero benefit of the doubt, and the load path re-guards
 * everything through import.ts + schema toLapSeries anyway.
 */

// ── Event-results API (eventresults-api.speedhive.com/api/v0.2.3) ───────────

export interface SHCountry {
  id?: number | null;
  name?: string | null;
  alpha2?: string | null;
}

export interface SHLocation {
  id?: number | null;
  name?: string | null;
  country?: SHCountry | null;
}

export interface SHOrganization {
  id?: number | null;
  name?: string | null;
  logo?: string | null;
  url?: string | null;
  city?: string | null;
  country?: SHCountry | null;
  sport?: string | null;
}

/** GET /eventresults/events/{id} — verified 2026-06-12. */
export interface SHEvent {
  id: number;
  name?: string | null;
  sport?: string | null;
  startDate?: string | null; // "YYYY-MM-DD"
  location?: SHLocation | null;
  organization?: SHOrganization | null;
}

/** One timed session inside an event group — verified 2026-06-12. */
export interface SHSession {
  id: number;
  name?: string | null;
  comment?: string | null;
  eventId?: number | null;
  type?: string | null; // observed: "practice" | "race" (qualifying likely a 3rd literal — keep open)
  startTime?: string | null; // ISO 8601, often a placeholder midnight
  groupName?: string | null;
  isMerge?: boolean | null;
  resultStatus?: string | null;
  participated?: number | null;
  eventRef?: string | null;
}

export interface SHSessionGroup {
  id?: number | null;
  name?: string | null;
  date?: string | null; // "YYYY-MM-DD"
  subGroups?: SHSessionGroup[] | null;
  sessions?: SHSession[] | null;
}

/** GET /eventresults/events/{id}/sessions — verified 2026-06-12.
 *  Top-level `sessions` was empty on probed events; the data lives in
 *  groups[].sessions (and possibly subGroups). */
export interface SHEventSessions {
  sessions?: SHSession[] | null;
  groups?: SHSessionGroup[] | null;
}

export interface SHDifference {
  lapsBehind?: number | null;
  timeDifference?: string | null; // "+2.533"
}

/** One classification row — verified 2026-06-12. FLAT shape (no nested
 *  competitor object); `transponder` is the timing-chip id we match cars on. */
export interface SHClassificationRow {
  position?: number | null;
  positionInClass?: number | null;
  name?: string | null;
  startNumber?: string | null;
  status?: string | null; // "Normal" | "DNF" | "DNS" observed
  numberOfLaps?: number | null;
  totalTime?: string | null; // clock string "05:01.404"
  bestTime?: string | null; // clock string "33.512"
  bestLap?: number | null; // lap NUMBER of the best time (not a time)
  bestSpeed?: number | null;
  difference?: SHDifference | null;
  diffClass?: SHDifference | null;
  isQualified?: boolean | null;
  transponder?: string | null;
  transponderCategory?: string | null;
  resultClass?: string | null;
  accountId?: number | string | null;
  user?: unknown; // mstUserId/chip/productCategory blob — never read by us
}

/** GET /eventresults/sessions/{id}/classification — verified 2026-06-12. */
export interface SHClassification {
  type?: string | null; // "Race" observed
  bestLaps?: unknown;
  bestLap?: unknown;
  classes?: unknown[] | null;
  rows?: SHClassificationRow[] | null;
}

/** One cell of the lapchart grid — verified 2026-06-12. Says which car held
 *  this row's position at this column's point in the race. */
export interface SHLapchartCell {
  position?: number | null;
  startNumber?: string | null;
  inLeaderLap?: boolean | null;
  inPit?: boolean | null;
  status?: string[] | null; // observed ["GREEN"]
}

/** Starting-grid entry of the lapchart — verified 2026-06-12. */
export interface SHLapchartStartPosition {
  name?: string | null;
  startNumber?: string | null;
}

/** GET /eventresults/sessions/{id}/lapchart — VERIFIED live 2026-06-12
 *  (session 12230620: 200 with positionRows + startPositions). positionRows
 *  is one row per position; each row has one cell per column, column 0 being
 *  the start grid (observed cell count = numberOfLaps + 1); rows of retired
 *  cars truncate early. This is the real public per-lap POSITION source —
 *  per-lap TIMES remain unverified (see SHCompetitorLaps). */
export interface SHLapchart {
  id: number;
  eventId?: number | null;
  numberOfLaps?: number | null;
  positionRows?: (SHLapchartCell[] | null)[] | null;
  startPositions?: SHLapchartStartPosition[] | null;
  eventRef?: string | null;
}

/** One lap of one competitor. Tolerant on purpose: the lap-times endpoint
 *  could not be probed publicly (the candidate path 404'd live 2026-06-12
 *  with a REAL startNumber — see client.ts quarantine), so both numbering
 *  conventions (lapNr/nr) and all three time encodings (clock string /
 *  seconds number / duration ms) map. */
export interface SHLap {
  lapNr?: number | null;
  nr?: number | null;
  lapTime?: string | number | null; // clock string "33.512" / "1:02.345", or seconds as number
  duration?: number | null; // integer MILLISECONDS (practice-API convention)
  position?: number | null; // running position after this lap, when present
  speed?: number | null;
  status?: string | null;
  dateTime?: string | null;
}

/** GET laps-per-competitor — QUARANTINED FICTION: the candidate path
 *  returned 404 live on 2026-06-12 with a real startNumber. Served only via
 *  `SpeedhiveApi.unverified` until a real app intercept lands. The gate
 *  normalizes a bare array payload into this envelope. */
export interface SHCompetitorLaps {
  sessionId?: number | null;
  startNumber?: string | null;
  name?: string | null;
  laps?: SHLap[] | null;
}

// ── Practice API (practice-api.speedhive.com, OAuth2 bearer) ────────────────

export interface SHBestLap {
  lapNr?: number | null;
  nr?: number | null;
  duration?: number | null; // ms
  dateTime?: string | null;
}

export interface SHPracticeStats {
  lapCount?: number | null;
  bestLap?: SHBestLap | null;
  averageLapDuration?: number | null; // ms
  totalTrainingDuration?: number | null; // ms
}

export interface SHPracticeLap {
  nr?: number | null;
  duration?: number | null; // integer MILLISECONDS
  dateTime?: string | null;
  status?: string | null;
}

/** One sub-session (one continuous run on track) inside a practice activity. */
export interface SHPracticeSubSession {
  id?: number | null;
  startTime?: string | null;
  stats?: SHPracticeStats | null;
  laps?: SHPracticeLap[] | null;
}

export interface SHChip {
  code?: string | null;
}

/** Practice session detail — the stats/bestLap/sessions.laps structure from
 *  William's intercepted JSON. One detail = one activity; sessions[] are the
 *  individual runs, each with its own laps. */
export interface SHPracticeSession {
  id: number;
  startTime?: string | null;
  sport?: string | null;
  location?: SHLocation | null;
  chip?: SHChip | null;
  stats?: SHPracticeStats | null;
  sessions?: SHPracticeSubSession[] | null;
}

/** Practice session list envelope. The gate normalizes a bare array payload
 *  into this envelope. */
export interface SHPracticeSessionList {
  sessions?: SHPracticeSession[] | null;
  count?: number | null;
  offset?: number | null;
}

// ── Shape gates — the ONLY runtime code that names payload keys ──────────────
// Each gate sits next to the type it mirrors so a payload rename touches this
// file (and import.ts mapping) ONLY — client.ts stays key-blind. Gates are
// cheap sanity checks (right container, right primary id), not full parsers:
// import.ts re-guards every value it actually uses.

export type ShapeGate<T> = { ok: true; data: T } | { ok: false; detail: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Field present but not an array (absent/null is fine — wire gets no benefit
 *  of the doubt, missing data is import.ts's problem). */
function badArrayField(v: unknown): boolean {
  return v !== undefined && v !== null && !Array.isArray(v);
}

export function gateEvent(v: unknown): ShapeGate<SHEvent> {
  if (!isRecord(v) || !isFiniteNumber(v["id"])) {
    return { ok: false, detail: "event: expected object with numeric id" };
  }
  return { ok: true, data: v as unknown as SHEvent };
}

export function gateEventSessions(v: unknown): ShapeGate<SHEventSessions> {
  if (!isRecord(v)) return { ok: false, detail: "sessions: expected object" };
  if (badArrayField(v["groups"])) return { ok: false, detail: "sessions: groups is not an array" };
  return { ok: true, data: v as unknown as SHEventSessions };
}

export function gateClassification(v: unknown): ShapeGate<SHClassification> {
  if (!isRecord(v)) return { ok: false, detail: "classification: expected object" };
  if (badArrayField(v["rows"])) return { ok: false, detail: "classification: rows is not an array" };
  return { ok: true, data: v as unknown as SHClassification };
}

export function gateLapchart(v: unknown): ShapeGate<SHLapchart> {
  if (!isRecord(v) || !isFiniteNumber(v["id"])) {
    return { ok: false, detail: "lapchart: expected object with numeric id" };
  }
  if (badArrayField(v["positionRows"])) {
    return { ok: false, detail: "lapchart: positionRows is not an array" };
  }
  if (badArrayField(v["startPositions"])) {
    return { ok: false, detail: "lapchart: startPositions is not an array" };
  }
  return { ok: true, data: v as unknown as SHLapchart };
}

/** Accepts the envelope OR a bare lap array (unverified endpoint — either
 *  convention normalizes; import.ts re-guards every lap anyway). */
export function gateCompetitorLaps(v: unknown): ShapeGate<SHCompetitorLaps> {
  if (Array.isArray(v)) return { ok: true, data: { laps: v as SHLap[] } };
  if (isRecord(v)) {
    if (badArrayField(v["laps"])) return { ok: false, detail: "laps: laps is not an array" };
    return { ok: true, data: v as unknown as SHCompetitorLaps };
  }
  return { ok: false, detail: "laps: expected object or array" };
}

/** Accepts the envelope OR a bare session array. */
export function gatePracticeList(v: unknown): ShapeGate<SHPracticeSessionList> {
  if (Array.isArray(v)) return { ok: true, data: { sessions: v as SHPracticeSession[] } };
  if (isRecord(v)) {
    if (badArrayField(v["sessions"])) {
      return { ok: false, detail: "practice list: sessions is not an array" };
    }
    return { ok: true, data: v as unknown as SHPracticeSessionList };
  }
  return { ok: false, detail: "practice list: expected object or array" };
}

export function gatePracticeDetail(v: unknown): ShapeGate<SHPracticeSession> {
  if (!isRecord(v) || !isFiniteNumber(v["id"])) {
    return { ok: false, detail: "practice detail: expected object with numeric id" };
  }
  if (badArrayField(v["sessions"])) {
    return { ok: false, detail: "practice detail: sessions is not an array" };
  }
  return { ok: true, data: v as unknown as SHPracticeSession };
}
