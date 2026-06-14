/**
 * racelab-speedhive test suite — assertion style mirrors packages/schema:
 * plain checks, console output, exit(1) on any failure. No real network, no
 * real timers: fetch and sleep are recording fakes (the whole adapter is
 * injection-driven, so the tests ARE the proof).
 */

import { DEFAULT_BASE_URLS, ENDPOINTS, HttpSpeedhiveClient } from "./client";
import type { FetchLike, HttpResponseLike, SpeedhiveResult, TokenStore } from "./client";
import { POLL_MIN_INTERVAL_FLOOR_MS, politePoll } from "./poll";
import {
  buildRunTiming,
  competitorLapchartPositions,
  findTransponderResults,
  fromEventLaps,
  fromPracticeSession,
  lapSeconds,
  normalizeTransponder,
  parseClockTime,
} from "./import";
import type { ImportMetaInput } from "./import";
import type { SHClassification, SHLap, SHLapchart, SHPracticeSession } from "./types";
import {
  effectiveTiming,
  isoToMs,
  makeId,
  makeRun,
  positionDeltas,
} from "../../schema/src/index";
import type { ImportedLaps, TrackSnapshot } from "../../schema/src/index";
import eventFx from "./fixtures/event-result.json";
import practiceFx from "./fixtures/practice-session.json";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── fakes ────────────────────────────────────────────────────────────────────

interface RecordedCall {
  url: string;
  headers: Record<string, string>;
}
type StubPlan = { status: number; body?: unknown; jsonThrows?: boolean } | "network";

function stubFetch(route: (url: string) => StubPlan): { fetchFn: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchFn: FetchLike = (url, init) => {
    calls.push({ url, headers: { ...init.headers } });
    const plan = route(url);
    if (plan === "network") return Promise.reject(new Error("ECONNREFUSED"));
    const res: HttpResponseLike = {
      status: plan.status,
      json: () =>
        plan.jsonThrows === true
          ? Promise.reject(new Error("Unexpected token < in JSON"))
          : Promise.resolve(plan.body),
    };
    return Promise.resolve(res);
  };
  return { fetchFn, calls };
}

function memTokens(initial: string | null): TokenStore {
  let t = initial;
  return {
    get: () => t,
    set: (v) => {
      t = v;
    },
    clear: () => {
      t = null;
    },
  };
}

const NEVER_FETCH: FetchLike = () => Promise.reject(new Error("fetch must not be called"));

const okBodies = (url: string): StubPlan => {
  if (url.includes("/training/sessions?")) return { status: 200, body: { sessions: [] } };
  if (url.includes("/training/sessions/")) return { status: 200, body: { id: 1, sessions: [] } };
  if (url.endsWith("/laps")) return { status: 200, body: { laps: [] } };
  if (url.endsWith("/classification")) return { status: 200, body: { rows: [] } };
  if (url.endsWith("/sessions")) return { status: 200, body: { sessions: [], groups: [] } };
  return { status: 200, body: { id: 1 } };
};

// ── 1. URL construction ──────────────────────────────────────────────────────

console.log("— URL construction —");
{
  const { fetchFn, calls } = stubFetch(okBodies);
  const api = HttpSpeedhiveClient(fetchFn, memTokens("tok-abc"));
  await api.getEvent(3550118);
  await api.getEventSessions(3550118);
  await api.getSessionClassification(12300978);
  await api.unverified.getCompetitorLaps(12300978, "7");
  await api.getPracticeSessions();
  await api.getPracticeSessionLaps(9105533);

  const er = DEFAULT_BASE_URLS.event_results;
  const pr = DEFAULT_BASE_URLS.practice;
  check("getEvent URL", calls[0].url === `${er}/eventresults/events/3550118`, calls[0].url);
  check("getEventSessions URL", calls[1].url === `${er}/eventresults/events/3550118/sessions`, calls[1].url);
  check(
    "getSessionClassification URL",
    calls[2].url === `${er}/eventresults/sessions/12300978/classification`,
    calls[2].url,
  );
  check(
    "getCompetitorLaps URL",
    calls[3].url === `${er}/eventresults/sessions/12300978/classification/7/laps`,
    calls[3].url,
  );
  check(
    "getPracticeSessions URL (default paging)",
    calls[4].url === `${pr}/api/v1/training/sessions?count=25&offset=0`,
    calls[4].url,
  );
  check(
    "getPracticeSessionLaps URL",
    calls[5].url === `${pr}/api/v1/training/sessions/9105533`,
    calls[5].url,
  );

  await api.unverified.getCompetitorLaps(12, "23 B");
  check(
    "path segments are URI-encoded",
    calls[6].url === `${er}/eventresults/sessions/12/classification/23%20B/laps`,
    calls[6].url,
  );
  await api.getPracticeSessions({ count: 5, offset: 10 });
  check(
    "practice paging query honored",
    calls[7].url === `${pr}/api/v1/training/sessions?count=5&offset=10`,
    calls[7].url,
  );
}
{
  const { fetchFn, calls } = stubFetch(okBodies);
  const api = HttpSpeedhiveClient(fetchFn, memTokens(null));
  await api.getSessionLapchart(12230620);
  const er = DEFAULT_BASE_URLS.event_results;
  check(
    "getSessionLapchart URL (VERIFIED endpoint)",
    calls[0].url === `${er}/eventresults/sessions/12230620/lapchart`,
    calls[0].url,
  );
}
{
  const { fetchFn, calls } = stubFetch(okBodies);
  const api = HttpSpeedhiveClient(fetchFn, memTokens("t"), {
    event_results: "https://proxy.example/sh",
    practice: "https://p.example",
  });
  await api.getEvent(5);
  await api.getPracticeSessionLaps(9);
  check("baseUrls override (event_results)", calls[0].url === "https://proxy.example/sh/eventresults/events/5", calls[0].url);
  check("baseUrls override (practice)", calls[1].url === "https://p.example/api/v1/training/sessions/9", calls[1].url);
  check(
    "ENDPOINTS map is the single URL source",
    ENDPOINTS.event("https://proxy.example/sh", "5") === calls[0].url,
  );
}

// ── 2. Auth header presence / absence ────────────────────────────────────────

console.log("— auth headers —");
{
  const { fetchFn, calls } = stubFetch(okBodies);
  const api = HttpSpeedhiveClient(fetchFn, memTokens("tok123"));
  await api.getEvent(1);
  check(
    "no bearer on public endpoints even when a token exists (cross-host leak guard)",
    !("Authorization" in calls[0].headers),
  );
  check("Accept header always sent", calls[0].headers["Accept"] === "application/json");
  await api.getPracticeSessions();
  check("bearer attached on practice host only", calls[1].headers["Authorization"] === "Bearer tok123");
}
{
  const { fetchFn, calls } = stubFetch(okBodies);
  const api = HttpSpeedhiveClient(fetchFn, memTokens(null));
  await api.getEvent(1);
  check("no Authorization header without token (public endpoint)", !("Authorization" in calls[0].headers));
}
{
  const { fetchFn, calls } = stubFetch(okBodies);
  const tokens = memTokens(null);
  const api = HttpSpeedhiveClient(fetchFn, tokens);
  const r1 = await api.getPracticeSessions();
  const r2 = await api.getPracticeSessionLaps(9);
  check("practice list without token → auth_required preflight", !r1.ok && r1.reason === "auth_required");
  check("practice detail without token → auth_required preflight", !r2.ok && r2.reason === "auth_required");
  check("no network call burned on missing token", calls.length === 0);
  tokens.set("fresh");
  const r3 = await api.getPracticeSessionLaps(9);
  check("token set later → call goes through", r3.ok && calls.length === 1);
  check("bearer uses the live store value", calls[0].headers["Authorization"] === "Bearer fresh");
}

// ── 3. Failure paths — discriminated, never thrown, never retried ────────────

console.log("— failure paths —");
{
  const { fetchFn, calls } = stubFetch(() => ({ status: 401, body: {} }));
  const api = HttpSpeedhiveClient(fetchFn, memTokens("expired"));
  const r = await api.getEvent(1);
  check("401 → auth_required", !r.ok && r.reason === "auth_required");
  check("401 → exactly one fetch (no retry loop)", calls.length === 1);
}
{
  const { fetchFn, calls } = stubFetch(() => ({ status: 403, body: {} }));
  const api = HttpSpeedhiveClient(fetchFn, memTokens("revoked"));
  const r = await api.getPracticeSessions();
  check("403 → auth_required (MYLAPS answers 403, probed live)", !r.ok && r.reason === "auth_required");
  check("403 → exactly one fetch (no retry loop)", calls.length === 1);
}
{
  const { fetchFn } = stubFetch(() => ({ status: 503, body: {} }));
  const api = HttpSpeedhiveClient(fetchFn, memTokens(null));
  const r = await api.getEvent(1);
  check("non-2xx → bad_status with status", !r.ok && r.reason === "bad_status" && r.status === 503);
}
{
  const { fetchFn } = stubFetch(() => "network");
  const api = HttpSpeedhiveClient(fetchFn, memTokens(null));
  const r = await api.getEvent(1);
  check("fetch throw → network_error", !r.ok && r.reason === "network_error");
}
{
  const { fetchFn } = stubFetch(() => ({ status: 200, jsonThrows: true }));
  const api = HttpSpeedhiveClient(fetchFn, memTokens(null));
  const r = await api.getEvent(1);
  check("non-JSON body → bad_payload", !r.ok && r.reason === "bad_payload");
}
{
  const api = (body: unknown) =>
    HttpSpeedhiveClient(stubFetch(() => ({ status: 200, body })).fetchFn, memTokens("t"));
  const r1 = await api(null).getEvent(1);
  check("event payload null → bad_payload", !r1.ok && r1.reason === "bad_payload");
  const r2 = await api({ name: "no id" }).getEvent(1);
  check("event without numeric id → bad_payload", !r2.ok && r2.reason === "bad_payload");
  const r3 = await api(42).unverified.getCompetitorLaps(1, "7");
  check("laps payload scalar → bad_payload", !r3.ok && r3.reason === "bad_payload");
  const r4 = await api({ rows: "nope" }).getSessionClassification(1);
  check("classification rows non-array → bad_payload", !r4.ok && r4.reason === "bad_payload");
  const r5 = await api([{ lapNr: 1, lapTime: "33.2" }]).unverified.getCompetitorLaps(1, "7");
  check(
    "bare lap array normalized into envelope",
    r5.ok && Array.isArray(r5.data.laps) && r5.data.laps.length === 1,
  );
  const r6 = await api([{ id: 9 }]).getPracticeSessions();
  check("bare practice array normalized into envelope", r6.ok && (r6.data.sessions ?? []).length === 1);
}

// ── 4. Time parsing ──────────────────────────────────────────────────────────

console.log("— time parsing —");
check('parseClockTime "33.512"', parseClockTime("33.512") === 33.512);
check('parseClockTime "01:29.215"', parseClockTime("01:29.215") === 89.215);
check('parseClockTime "1:02:03.5"', parseClockTime("1:02:03.5") === 3723.5);
check("parseClockTime trims", parseClockTime(" 34.1 ") === 34.1);
check('parseClockTime garbage → null', parseClockTime("garbage") === null);
check("parseClockTime empty → null", parseClockTime("") === null);
check("parseClockTime 4 parts → null", parseClockTime("1:2:3:4") === null);
check("parseClockTime zero → null", parseClockTime("00.000") === null);
check("parseClockTime negative → null", parseClockTime("-33.2") === null);
check("lapSeconds prefers clock string", lapSeconds({ lapTime: "1:02.345", duration: 99999 }) === 62.345);
check("lapSeconds numeric lapTime taken as seconds", lapSeconds({ lapTime: 33.5 }) === 33.5);
check("lapSeconds duration is milliseconds", lapSeconds({ duration: 33417 }) === 33.417);
check("lapSeconds nothing usable → null", lapSeconds({}) === null);
check("lapSeconds non-positive duration → null", lapSeconds({ duration: 0 }) === null);
// Fix 2: a blank/unparseable clock STRING must not discard a recoverable
// numeric duration on the same lap (it used to short-circuit to null).
check(
  "lapSeconds blank lapTime string falls through to duration",
  lapSeconds({ lapTime: "", duration: 33417 }) === 33.417,
);
check(
  "lapSeconds blank-whitespace lapTime string falls through to duration",
  lapSeconds({ lapTime: "   ", duration: 33417 }) === 33.417,
);
check(
  "lapSeconds unparseable lapTime string falls through to duration",
  lapSeconds({ lapTime: "DNF", duration: 33417 }) === 33.417,
);
check(
  "lapSeconds blank lapTime string with no numeric fallback → null",
  lapSeconds({ lapTime: "" }) === null,
);
// A parseable clock string still wins outright over a numeric field.
check(
  "lapSeconds parseable clock string still wins over duration",
  lapSeconds({ lapTime: "1:02.345", duration: 99999 }) === 62.345,
);
// Fix 1: a non-object lap element never throws — guards to null.
check("lapSeconds on null element → null (no throw)", lapSeconds(null as unknown as SHLap) === null);
check("lapSeconds on scalar element → null (no throw)", lapSeconds(42 as unknown as SHLap) === null);

// ── 5. fromEventLaps mapping ─────────────────────────────────────────────────

console.log("— fromEventLaps —");
const META: ImportMetaInput = {
  imported_at: "2026-06-06T16:00:00.000Z",
  speedhive_session_id: "12300978",
  event_name: "Spring GP - 1/8 Nitro Buggy Club Race",
  session_name: "Main Final",
  track_name: "Circuit du Soleil RC",
  driver_name: "William K.",
  transponder_id: "FX-48213",
};
const fxLaps: SHLap[] = eventFx.competitorLaps.laps;
{
  const r = fromEventLaps(fxLaps, META);
  check("fixture laps map ok", r.ok);
  if (r.ok) {
    check("wire lap numbers kept (already sequential)", !r.renumbered);
    check("lap count 8", r.imported.laps.length === 8);
    check("n sequence 1..8", eq(r.imported.laps.map((l) => l.n), [1, 2, 3, 4, 5, 6, 7, 8]));
    check("clock strings parsed (lap 1)", r.imported.laps[0].t_s === 35.812);
    check("mm:ss clock parsed (crash lap 5)", r.imported.laps[4].t_s === 62.345);
    check("positions carried", r.imported.laps[0].position_in_session === 3);
    check(
      "schema positionDeltas over mapped laps",
      eq(positionDeltas(r.imported.laps), [0, 1, 0, -2, 1, 1, 0]),
    );
    check("meta carried onto ImportedLaps", r.imported.event_name === META.event_name && r.imported.transponder_id === "FX-48213");
    check("source branded speedhive", r.imported.source === "speedhive");
  }
}
{
  const r = fromEventLaps(
    [{ lapTime: "35.1" }, { lapTime: "34.9" }, { lapTime: "34.7" }],
    { imported_at: META.imported_at },
  );
  check("missing wire numbers → renumbered 1..N", r.ok && r.renumbered && eq(r.imported.laps.map((l) => l.n), [1, 2, 3]));
}
{
  const r = fromEventLaps(
    [{ lapNr: 1, lapTime: "35.1" }, { lapNr: 1, lapTime: "34.9" }],
    { imported_at: META.imported_at },
  );
  check("duplicate wire numbers → renumbered, reported", r.ok && r.renumbered && eq(r.imported.laps.map((l) => l.n), [1, 2]));
}
{
  const r = fromEventLaps([{ lapNr: 1, lapTime: "35.1" }, { lapNr: 2, lapTime: "oops" }], {
    imported_at: META.imported_at,
  });
  check(
    "malformed lap time rejects whole import with index",
    !r.ok && r.reason === "bad_lap_time" && r.lap_index === 1,
  );
}
{
  const r = fromEventLaps([{ lapNr: 1, duration: -5 }], { imported_at: META.imported_at });
  check("negative duration rejects", !r.ok && r.reason === "bad_lap_time");
}
{
  const r = fromEventLaps([], { imported_at: META.imported_at });
  check("empty laps → no_laps", !r.ok && r.reason === "no_laps");
}

// ── 6. fromPracticeSession mapping ───────────────────────────────────────────

console.log("— fromPracticeSession —");
const practiceDetail: SHPracticeSession = practiceFx;
{
  const r = fromPracticeSession(practiceDetail, { imported_at: "2026-06-07T10:00:00.000Z" });
  check("practice sub-session 0 maps ok", r.ok);
  if (r.ok) {
    check("6 laps in first run", r.imported.laps.length === 6);
    check("ms durations become seconds", r.imported.laps[5].t_s === 33.417);
    check("wire nrs kept", !r.renumbered && r.imported.laps[5].n === 6);
    check("best lap matches intercepted stats.bestLap", Math.min(...r.imported.laps.map((l) => l.t_s)) === 33.417);
    check("speedhive_session_id defaults from detail.id", r.imported.speedhive_session_id === "9105533");
    check("track_name defaults from detail.location", r.imported.track_name === "Circuit du Soleil RC");
    check("transponder_id defaults from detail.chip.code", r.imported.transponder_id === "FX-48213");
  }
}
{
  const r = fromPracticeSession(
    practiceDetail,
    { imported_at: "2026-06-07T10:00:00.000Z", transponder_id: "OVERRIDE-1", track_name: "Elsewhere" },
    1,
  );
  check("sub-session 1 maps ok with 4 laps", r.ok && r.imported.laps.length === 4);
  if (r.ok) {
    check("caller meta beats detail defaults", r.imported.transponder_id === "OVERRIDE-1" && r.imported.track_name === "Elsewhere");
    check("sub-session 1 best", Math.min(...r.imported.laps.map((l) => l.t_s)) === 34.005);
  }
}
{
  const r = fromPracticeSession(practiceDetail, { imported_at: "2026-06-07T10:00:00.000Z" }, 5);
  check(
    "session_index out of range reports count",
    !r.ok && r.reason === "session_index_out_of_range" && r.session_count === 2,
  );
  const r2 = fromPracticeSession(practiceDetail, { imported_at: "2026-06-07T10:00:00.000Z" }, -1);
  check("negative session_index rejected", !r2.ok && r2.reason === "session_index_out_of_range");
}

// ── 7. findTransponderResults ────────────────────────────────────────────────

console.log("— findTransponderResults —");
const classification: SHClassification = eventFx.classification;
{
  const r = findTransponderResults(classification, "FX-48213");
  check("exact transponder match", r.ok && r.row.startNumber === "7" && r.row_index === 1);
  const r2 = findTransponderResults(classification, "fx 48213");
  check("normalized match (case/punctuation)", r2.ok && r2.row.startNumber === "7");
  const r3 = findTransponderResults(classification, "ZZ-0001");
  check("unknown transponder → not_found", !r3.ok && r3.reason === "not_found");
  const r4 = findTransponderResults({ rows: [] }, "FX-48213");
  check("empty rows → no_rows", !r4.ok && r4.reason === "no_rows");
  const r5 = findTransponderResults({}, "FX-48213");
  check("missing rows → no_rows", !r5.ok && r5.reason === "no_rows");
  check("normalizeTransponder strips noise", normalizeTransponder("fx-4 8.21_3") === "FX48213");
}

// ── 7b. competitorLapchartPositions (verified per-lap position source) ───────

console.log("— competitorLapchartPositions —");
{
  const chart: SHLapchart = {
    id: 12230620,
    numberOfLaps: 2,
    positionRows: [
      [
        { position: 1, startNumber: "7" },
        { position: 1, startNumber: "23B" },
        { position: 1, startNumber: "23B" },
      ],
      [
        { position: 2, startNumber: "23B" },
        { position: 2, startNumber: "7" },
        { position: 2, startNumber: "7" },
      ],
    ],
  };
  const pos = competitorLapchartPositions(chart, "7");
  check(
    "lapchart positions extracted (start grid + 2 laps)",
    eq(pos, [
      { lap: 0, position: 1 },
      { lap: 1, position: 2 },
      { lap: 2, position: 2 },
    ]),
    JSON.stringify(pos),
  );
  const tolerant = competitorLapchartPositions(chart, "23 b");
  check(
    "lapchart startNumber matching is tolerant",
    eq(tolerant, [
      { lap: 0, position: 2 },
      { lap: 1, position: 1 },
      { lap: 2, position: 1 },
    ]),
  );
  check("unknown startNumber → empty", competitorLapchartPositions(chart, "99").length === 0);
  check("empty startNumber → empty", competitorLapchartPositions(chart, " - ").length === 0);

  const retired: SHLapchart = {
    id: 1,
    positionRows: [
      [{ position: 1, startNumber: "7" }, { position: 1, startNumber: "7" }],
      [{ position: 2, startNumber: "9" }], // retired after the start column
      null,
    ],
  };
  const r9 = competitorLapchartPositions(retired, "9");
  check("retired car: truncated row yields only the columns it ran", eq(r9, [{ lap: 0, position: 2 }]));
  check("missing positionRows → empty", competitorLapchartPositions({ id: 1 }, "7").length === 0);
  // A matched cell with no valid integer position is OMITTED (the row index is
  // FINISHING order, not running position — back-filling it mislabeled data).
  const noPos = competitorLapchartPositions(
    { id: 1, positionRows: [[{ startNumber: "7" }]] },
    "7",
  );
  check("cell without valid position → column omitted (no finishing-order fallback)", eq(noPos, []));
  // Only the columns with a real position survive; the bad one is dropped, the
  // good ones keep their true column index (gaps, never invented positions).
  const mixedPos = competitorLapchartPositions(
    {
      id: 1,
      positionRows: [
        [
          { position: 1, startNumber: "7" },
          { startNumber: "7" }, // no position → omit this column
          { position: 1, startNumber: "7" },
          { position: 0, startNumber: "7" }, // non-positive → omit
          { position: 2.5, startNumber: "7" }, // non-integer → omit
        ],
      ],
    },
    "7",
  );
  check(
    "lapchart omits only the position-less columns",
    eq(mixedPos, [
      { lap: 0, position: 1 },
      { lap: 2, position: 1 },
    ]),
    JSON.stringify(mixedPos),
  );
}

// ── 7c. Fix 1: null / non-object wire elements never throw the boundary ──────

console.log("— element-guards (null / non-object wire elements) —");
function captured<T>(fn: () => T): { threw: boolean; value?: T } {
  try {
    return { threw: false, value: fn() };
  } catch {
    return { threw: true };
  }
}
{
  // fromEventLaps: null + scalar elements among the laps. Never-wipe: the whole
  // import is rejected (no silent drop), with the FIRST bad index reported —
  // and crucially the call does NOT throw.
  const dirty = [null, 42, "x", { lapNr: 1, lapTime: "35.1" }] as unknown as SHLap[];
  const c = captured(() => fromEventLaps(dirty, { imported_at: META.imported_at }));
  check("fromEventLaps: null/non-object element does not throw", !c.threw);
  check(
    "fromEventLaps: null/non-object element → bad_lap_time at its index (no silent drop)",
    !c.threw && c.value !== undefined && !c.value.ok && c.value.reason === "bad_lap_time" && c.value.lap_index === 0,
  );
  // A valid lap first, then a null element: index 1 is reported (proves the
  // guard maps the bad element to a null-time view rather than skipping it).
  const c2 = captured(() =>
    fromEventLaps([{ lapNr: 1, lapTime: "35.1" }, null] as unknown as SHLap[], { imported_at: META.imported_at }),
  );
  check(
    "fromEventLaps: trailing null reported at its true index",
    !c2.threw && c2.value !== undefined && !c2.value.ok && c2.value.reason === "bad_lap_time" && c2.value.lap_index === 1,
  );
}
{
  // fromPracticeSession: null + scalar laps inside the selected sub-session.
  const detail = {
    id: 9105533,
    sessions: [{ laps: [null, "x", { nr: 1, duration: 33000 }] }],
  } as unknown as SHPracticeSession;
  const c = captured(() => fromPracticeSession(detail, { imported_at: "2026-06-07T10:00:00.000Z" }, 0));
  check("fromPracticeSession: null/non-object lap does not throw", !c.threw);
  check(
    "fromPracticeSession: null/non-object lap → bad_lap_time at index 0",
    !c.threw && c.value !== undefined && !c.value.ok && c.value.reason === "bad_lap_time" && c.value.lap_index === 0,
  );
  // The selected SUB-SESSION itself is null/scalar → no `.laps` access throw;
  // empty laps surface as no_laps.
  const detail2 = { id: 1, sessions: [null] } as unknown as SHPracticeSession;
  const c2 = captured(() => fromPracticeSession(detail2, { imported_at: "2026-06-07T10:00:00.000Z" }, 0));
  check("fromPracticeSession: null sub-session does not throw", !c2.threw);
  check(
    "fromPracticeSession: null sub-session → no_laps",
    !c2.threw && c2.value !== undefined && !c2.value.ok && c2.value.reason === "no_laps",
  );
}
{
  // findTransponderResults: null + scalar rows must be skipped, match still found
  // at its true row_index (no compaction).
  const cls = {
    rows: [null, 42, "x", { transponder: "FX-48213", startNumber: "7", position: 2 }],
  } as unknown as SHClassification;
  const c = captured(() => findTransponderResults(cls, "FX-48213"));
  check("findTransponderResults: null/non-object row does not throw", !c.threw);
  check(
    "findTransponderResults: skips bad rows, matches at true index",
    !c.threw && c.value !== undefined && c.value.ok && c.value.row_index === 3 && c.value.row.startNumber === "7",
  );
  // All rows bad → not_found, never a throw.
  const c2 = captured(() =>
    findTransponderResults({ rows: [null, 7] } as unknown as SHClassification, "FX-48213"),
  );
  check(
    "findTransponderResults: all-bad rows → not_found (no throw)",
    !c2.threw && c2.value !== undefined && !c2.value.ok && c2.value.reason === "not_found",
  );
}
{
  // competitorLapchartPositions: null/scalar rows AND null/scalar cells.
  const chart = {
    id: 1,
    positionRows: [
      null,
      42,
      [null, "x", { position: 3, startNumber: "7" }],
    ],
  } as unknown as SHLapchart;
  const c = captured(() => competitorLapchartPositions(chart, "7"));
  check("competitorLapchartPositions: null/non-object row/cell does not throw", !c.threw);
  check(
    "competitorLapchartPositions: skips bad rows/cells, keeps the real match",
    !c.threw && c.value !== undefined && eq(c.value, [{ lap: 2, position: 3 }]),
    c.value !== undefined ? JSON.stringify(c.value) : "threw",
  );
}

// ── 8. buildRunTiming (schema bridge) ────────────────────────────────────────

console.log("— buildRunTiming —");
{
  const mapped = fromEventLaps(fxLaps, META);
  if (!mapped.ok) {
    check("precondition: fixture maps", false);
  } else {
    const r = buildRunTiming(mapped.imported);
    check("buildRunTiming ok", r.ok);
    if (r.ok) {
      check("timing kind is laps", r.timing.kind === "laps");
      if (r.timing.kind === "laps") {
        check("import meta survives into SpeedhiveImportMeta", r.timing.import?.speedhive_session_id === "12300978" && r.timing.import?.event_name === META.event_name);
        check("lap source branded speedhive", r.timing.laps.every((l) => l.source === "speedhive"));
      }
    }
  }
  const poisoned: ImportedLaps = {
    source: "speedhive",
    imported_at: "2026-06-06T16:00:00.000Z",
    laps: [{ n: 1, t_s: 0 }],
  };
  const bad = buildRunTiming(poisoned);
  check("schema guard rejects non-positive lap", !bad.ok && bad.reason === "bad_lap_sequence");
  const nan: ImportedLaps = {
    source: "speedhive",
    imported_at: "2026-06-06T16:00:00.000Z",
    laps: [{ n: 1, t_s: Number.NaN }],
  };
  const bad2 = buildRunTiming(nan);
  check("schema guard rejects NaN lap", !bad2.ok && bad2.reason === "non_finite_numeric");
}

// ── 9. politePoll ────────────────────────────────────────────────────────────

console.log("— politePoll —");
function fakeSleep(): { sleep: (ms: number) => Promise<void>; sleeps: number[] } {
  const sleeps: number[] = [];
  return {
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    sleeps,
  };
}
const okR = (n: number): SpeedhiveResult<number> => ({ ok: true, data: n });
const netR: SpeedhiveResult<number> = { ok: false, reason: "network_error" };
const authR: SpeedhiveResult<number> = { ok: false, reason: "auth_required" };
const statusR: SpeedhiveResult<number> = { ok: false, reason: "bad_status", status: 500 };
{
  const { sleep, sleeps } = fakeSleep();
  let n = 0;
  const out = await politePoll<number>(
    () => Promise.resolve(++n <= 2 ? netR : okR(n)),
    { min_interval_ms: 5_000, max_attempts: 3, sleep },
  );
  check("retries transient failures then succeeds", out.ok && out.attempts === 3);
  check("interval floored at 30s regardless of request", eq(sleeps, [30_000, 30_000]));
  check("floor constant exported", POLL_MIN_INTERVAL_FLOOR_MS === 30_000);
}
{
  const { sleep, sleeps } = fakeSleep();
  let n = 0;
  await politePoll<number>(() => Promise.resolve(++n === 1 ? netR : okR(n)), {
    min_interval_ms: 45_000,
    max_attempts: 2,
    sleep,
  });
  check("intervals above the floor are honored", eq(sleeps, [45_000]));
}
{
  const { sleep, sleeps } = fakeSleep();
  const out = await politePoll<number>(() => Promise.resolve(okR(1)), {
    min_interval_ms: Number.NaN,
    max_attempts: 1,
    sleep,
  });
  check("non-finite interval falls back to floor (no sleep needed here)", out.ok && sleeps.length === 0);
}
{
  const { sleep, sleeps } = fakeSleep();
  let calls = 0;
  const out = await politePoll<number>(
    () => {
      calls++;
      return Promise.resolve(authR);
    },
    { min_interval_ms: 30_000, max_attempts: 5, sleep },
  );
  check(
    "auth_required aborts immediately (never a retry loop)",
    !out.ok && out.reason === "auth_required" && out.attempts === 1 && calls === 1,
  );
  check("auth abort sleeps zero times", sleeps.length === 0);
}
{
  const { sleep, sleeps } = fakeSleep();
  const out = await politePoll<number>(() => Promise.resolve(okR(7)), {
    min_interval_ms: 30_000,
    max_attempts: 5,
    sleep,
  });
  check("no shouldStop → first ok result wins", out.ok && out.data === 7 && out.attempts === 1 && sleeps.length === 0);
}
{
  const { sleep, sleeps } = fakeSleep();
  let n = 0;
  const out = await politePoll<number>(() => Promise.resolve(okR(++n)), {
    min_interval_ms: 30_000,
    max_attempts: 5,
    sleep,
    shouldStop: (r, attempt) => attempt === 3,
  });
  check("live mode polls until shouldStop", out.ok && out.data === 3 && out.attempts === 3);
  check("live mode slept between attempts", eq(sleeps, [30_000, 30_000]));
}
{
  const { sleep } = fakeSleep();
  const out = await politePoll<number>(() => Promise.resolve(statusR), {
    min_interval_ms: 30_000,
    max_attempts: 5,
    sleep,
    shouldStop: (r) => !r.ok && r.reason === "bad_status",
  });
  check(
    "shouldStop on a failure → stopped with last result",
    !out.ok && out.reason === "stopped" && out.attempts === 1 && eq(out.last, statusR),
  );
}
{
  const { sleep, sleeps } = fakeSleep();
  const out = await politePoll<number>(() => Promise.resolve(netR), {
    min_interval_ms: 30_000,
    max_attempts: 3,
    sleep,
  });
  check(
    "attempts exhausted → max_attempts with last result",
    !out.ok && out.reason === "max_attempts" && out.attempts === 3 && eq(out.last, netR),
  );
  check("never sleeps after the final attempt", sleeps.length === 2);
}
{
  const { sleep } = fakeSleep();
  const o1 = await politePoll<number>(() => Promise.resolve(okR(1)), { min_interval_ms: 30_000, max_attempts: 0, sleep });
  const o2 = await politePoll<number>(() => Promise.resolve(okR(1)), { min_interval_ms: 30_000, max_attempts: 1.5, sleep });
  check("max_attempts 0 → bad_options", !o1.ok && o1.reason === "bad_options");
  check("fractional max_attempts → bad_options", !o2.ok && o2.reason === "bad_options");
}

// ── 10. End-to-end: fixtures → client → mapping → makeRun ────────────────────

console.log("— end-to-end —");
{
  const er = DEFAULT_BASE_URLS.event_results;
  const pr = DEFAULT_BASE_URLS.practice;
  const routes: Record<string, unknown> = {
    [`${er}/eventresults/events/3550118`]: eventFx.event,
    [`${er}/eventresults/events/3550118/sessions`]: eventFx.sessions,
    [`${er}/eventresults/sessions/12300978/classification`]: eventFx.classification,
    [`${er}/eventresults/sessions/12300978/classification/7/laps`]: eventFx.competitorLaps,
    [`${pr}/api/v1/training/sessions?count=25&offset=0`]: { sessions: [practiceFx] },
    [`${pr}/api/v1/training/sessions/9105533`]: practiceFx,
  };
  const { fetchFn } = stubFetch((url) =>
    url in routes ? { status: 200, body: routes[url] } : { status: 404, body: {} },
  );
  const api = HttpSpeedhiveClient(fetchFn, memTokens("tok-e2e"));

  const ev = await api.getEvent(3550118);
  check("e2e: event fetched", ev.ok && ev.data.name === "Spring GP - 1/8 Nitro Buggy Club Race");

  const sessions = await api.getEventSessions(3550118);
  let mainId: number | null = null;
  if (sessions.ok) {
    const group = (sessions.data.groups ?? [])[0];
    const main = (group?.sessions ?? []).find((s) => s.name === "Main Final");
    mainId = main?.id ?? null;
  }
  check("e2e: main final located in groups[].sessions", mainId === 12300978);

  const cls = await api.getSessionClassification(12300978);
  check("e2e: classification fetched", cls.ok && (cls.ok ? (cls.data.rows ?? []).length === 3 : false));
  let startNumber: string | null = null;
  if (cls.ok) {
    const match = findTransponderResults(cls.data, "FX-48213");
    check("e2e: our transponder found", match.ok && match.row.position === 2);
    startNumber = match.ok ? (match.row.startNumber ?? null) : null;
  }
  check("e2e: startNumber resolved", startNumber === "7");

  const laps = await api.unverified.getCompetitorLaps(12300978, startNumber ?? "");
  check("e2e: laps fetched", laps.ok && (laps.ok ? (laps.data.laps ?? []).length === 8 : false));

  const now = "2026-06-06T16:00:00.000Z";
  const rand = (): number => 0.5;
  const mapped = laps.ok ? fromEventLaps(laps.data.laps ?? [], META) : null;
  check("e2e: laps mapped", mapped !== null && mapped.ok);
  const timing = mapped !== null && mapped.ok ? buildRunTiming(mapped.imported) : null;
  check("e2e: timing built", timing !== null && timing.ok);

  if (timing !== null && timing.ok) {
    const track: TrackSnapshot = {
      track_id: makeId("trk", isoToMs(now), rand),
      name: "Circuit du Soleil RC",
      surface: "clay",
      indoor: false,
    };
    const made = makeRun(
      {
        type: "main",
        session_id: makeId("ss", isoToMs(now), rand),
        car_id: makeId("car", isoToMs(now), rand),
        car_name: "MP11 race car",
        car_template_id: "kyosho-inferno-mp11",
        setup_version_id: "sv-001",
        setup_name: "Race base",
        track,
        conditions: { grip: "medium", air_temp_c: 24 },
        timing: timing.timing,
        feedback: { tags: [] },
      },
      now,
      rand,
    );
    check("e2e: makeRun accepts the imported timing", made.ok);
    if (made.ok) {
      check("e2e: run stores the laps branch", made.run.timing?.kind === "laps");
      const stats = effectiveTiming(made.run);
      check(
        "e2e: derived stats match the classification row",
        stats?.lap_count === 8 && stats?.best_lap_s === 33.512,
      );
      check("e2e: run entity is frozen", Object.isFrozen(made.run) && Object.isFrozen(made.run.timing));
      if (made.run.timing?.kind === "laps") {
        check("e2e: import provenance frozen into the run", made.run.timing.import?.speedhive_session_id === "12300978");
      }
    }
  }

  // practice branch: list → detail → map → makeRun
  const list = await api.getPracticeSessions();
  check("e2e: practice list fetched", list.ok && (list.ok ? (list.data.sessions ?? []).length === 1 : false));
  const detail = await api.getPracticeSessionLaps(9105533);
  check("e2e: practice detail fetched", detail.ok && (detail.ok ? (detail.data.sessions ?? []).length === 2 : false));
  if (detail.ok) {
    const pm = fromPracticeSession(detail.data, { imported_at: "2026-06-07T10:00:00.000Z" });
    const pt = pm.ok ? buildRunTiming(pm.imported) : null;
    check("e2e: practice timing built", pt !== null && pt.ok);
    if (pt !== null && pt.ok) {
      const now2 = "2026-06-07T10:00:00.000Z";
      const rand2 = (): number => 0.25;
      const made = makeRun(
        {
          type: "practice",
          session_id: makeId("ss", isoToMs(now2), rand2),
          car_id: makeId("car", isoToMs(now2), rand2),
          car_template_id: "kyosho-inferno-mp11",
          setup_version_id: "sv-002",
          setup_name: "Practice base",
          track: {
            track_id: makeId("trk", isoToMs(now2), rand2),
            name: "Circuit du Soleil RC",
            surface: "clay",
            indoor: false,
          },
          conditions: { grip: "green", dusty: true },
          timing: pt.timing,
          feedback: { tags: [] },
        },
        now2,
        rand2,
      );
      check("e2e: practice run accepted by makeRun", made.ok);
      if (made.ok) {
        const stats = effectiveTiming(made.run);
        check("e2e: practice best lap matches intercepted bestLap (ms→s)", stats?.best_lap_s === 33.417 && stats?.lap_count === 6);
      }
    }
  }
}

// ── verdict ──────────────────────────────────────────────────────────────────

if (failures > 0) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall green");
