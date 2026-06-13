/**
 * Speedhive HTTP client — UNOFFICIAL API (B9).
 *
 * ISOLATION CONTRACT: every URL this adapter ever touches is built in the
 * ENDPOINTS map below and NOWHERE else — and this file never names a payload
 * key: response shapes are checked by the gates in types.ts. When MYLAPS
 * moves a path, this file changes; when they move a payload, types.ts (+ the
 * import.ts mapping) changes; nothing outside packages/speedhive changes,
 * ever.
 *
 * D18 posture: this is Tier-B enrichment ONLY. Nothing on the advice path
 * imports this package; the app works fully with every endpoint down — any
 * failure is a discriminated result the UI can shrug at.
 *
 * Capabilities are INJECTED: fetch comes in as FetchLike, the bearer token
 * lives in a caller-owned TokenStore (persistence is the app's problem).
 * The client only ever READS the store — on an auth failure it returns
 * `auth_required` and lets the app decide whether to clear/refresh; it never
 * retries, never loops, never mutates the token.
 *
 * AUTH SCOPE: the bearer is attached to practice-api requests ONLY. Public
 * event-results calls never carry Authorization — the token must never leak
 * to a host that doesn't need it, and a dead stored token must never be able
 * to poison the public import path.
 */

import type {
  SHClassification,
  SHCompetitorLaps,
  SHEvent,
  SHEventSessions,
  SHLapchart,
  SHPracticeSession,
  SHPracticeSessionList,
  ShapeGate,
} from "./types";
import {
  gateClassification,
  gateCompetitorLaps,
  gateEvent,
  gateEventSessions,
  gateLapchart,
  gatePracticeDetail,
  gatePracticeList,
} from "./types";

// ── Injected capabilities ────────────────────────────────────────────────────

/** Caller-owned token storage (e.g. SecureStore in the app). The client only
 *  calls get(); set/clear exist for the app's login/logout flow so the whole
 *  auth lifecycle shares one interface. */
export interface TokenStore {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

/** Minimal structural slice of a fetch Response — keeps this package free of
 *  DOM/undici type dependencies and trivially fakeable in tests. */
export interface HttpResponseLike {
  status: number;
  json(): Promise<unknown>;
}

export interface HttpRequestInit {
  method: "GET";
  headers: Record<string, string>;
}

/** Injected fetch. The app passes the React Native / browser fetch; tests
 *  pass a recording stub. Nothing in src/ ever touches a global. */
export type FetchLike = (url: string, init: HttpRequestInit) => Promise<HttpResponseLike>;

// ── Discriminated results ────────────────────────────────────────────────────

export type SpeedhiveFailure =
  | { ok: false; reason: "network_error"; detail?: string } // fetch threw (offline, DNS, abort)
  | { ok: false; reason: "bad_status"; status: number } // non-2xx other than 401/403
  | { ok: false; reason: "bad_payload"; detail?: string } // non-JSON body or shape gate failed
  | { ok: false; reason: "auth_required" }; // 401/403, or personal endpoint with no token

export type SpeedhiveResult<T> = { ok: true; data: T } | SpeedhiveFailure;

// ── Endpoints — THE single source of every URL (unofficial-API blast radius) ─

export interface SpeedhiveBaseUrls {
  /** Public event results. Default verified live 2026-06-12. */
  event_results: string;
  /** Personal practice data (OAuth2 bearer). */
  practice: string;
}

export const DEFAULT_BASE_URLS: SpeedhiveBaseUrls = {
  event_results: "https://eventresults-api.speedhive.com/api/v0.2.3",
  practice: "https://practice-api.speedhive.com",
};

/**
 * URL builders, annotated with verification status:
 *  - event / eventSessions / sessionClassification / lapchart: VERIFIED live
 *    2026-06-12 (event 3545938, session 12230620 — lapchart returned 200
 *    with positionRows + startPositions).
 *  - competitorLaps: FICTION until intercepted — probed live 2026-06-12 with
 *    a REAL startNumber (23B, confirmed in that session's own data) → 404,
 *    as did `/sessions/{id}/laps`, `/laptimes` and `/laptimes/{nr}`. The
 *    builder stays so the quarantined method keeps one URL home; do NOT
 *    build UI on it before a real Speedhive app/web intercept.
 *  - practiceSessions / practiceSessionLaps: paths UNVERIFIED (OAuth-gated;
 *    the host hides existence — unauthenticated probes get 403/404, never
 *    401); payload shapes follow William's intercepted JSON (types.ts).
 */
export const ENDPOINTS = {
  event: (base: string, event_id: string): string => `${base}/eventresults/events/${event_id}`,
  eventSessions: (base: string, event_id: string): string =>
    `${base}/eventresults/events/${event_id}/sessions`,
  sessionClassification: (base: string, session_id: string): string =>
    `${base}/eventresults/sessions/${session_id}/classification`,
  lapchart: (base: string, session_id: string): string =>
    `${base}/eventresults/sessions/${session_id}/lapchart`,
  competitorLaps: (base: string, session_id: string, competitor_id: string): string =>
    `${base}/eventresults/sessions/${session_id}/classification/${competitor_id}/laps`,
  practiceSessions: (base: string, count: number, offset: number): string =>
    `${base}/api/v1/training/sessions?count=${count}&offset=${offset}`,
  practiceSessionLaps: (base: string, practice_session_id: string): string =>
    `${base}/api/v1/training/sessions/${practice_session_id}`,
} as const;

// ── API surface ──────────────────────────────────────────────────────────────

export interface PracticeListQuery {
  count?: number; // default 25
  offset?: number; // default 0
}

/** Endpoints whose path could NOT be verified against the live API. Walled
 *  off so a call site can't depend on them without saying so in code:
 *  `api.unverified.getCompetitorLaps(...)` reads as the risk it is. */
export interface SpeedhiveUnverifiedApi {
  /** Per-lap TIMES of one competitor — the path is a best guess that 404'd
   *  live on 2026-06-12 with a real startNumber. Expect `bad_status` 404
   *  until a real app intercept replaces the ENDPOINTS builder. The verified
   *  per-lap POSITION source is getSessionLapchart. */
  getCompetitorLaps(
    session_id: number | string,
    competitor_id: number | string,
  ): Promise<SpeedhiveResult<SHCompetitorLaps>>;
}

export interface SpeedhiveApi {
  /** Public — event header (name, date, location). */
  getEvent(event_id: number | string): Promise<SpeedhiveResult<SHEvent>>;
  /** Public — the event's session groups (heats, mains live in groups[].sessions). */
  getEventSessions(event_id: number | string): Promise<SpeedhiveResult<SHEventSessions>>;
  /** Public — final classification rows of one session (transponder lives here). */
  getSessionClassification(session_id: number | string): Promise<SpeedhiveResult<SHClassification>>;
  /** Public — per-lap running positions of the whole field (VERIFIED live
   *  2026-06-12). Map one car out of it with competitorLapchartPositions. */
  getSessionLapchart(session_id: number | string): Promise<SpeedhiveResult<SHLapchart>>;
  /** Personal (bearer) — practice activity list. No token → auth_required
   *  WITHOUT a network call. */
  getPracticeSessions(query?: PracticeListQuery): Promise<SpeedhiveResult<SHPracticeSessionList>>;
  /** Personal (bearer) — one practice activity detail incl. sessions[].laps. */
  getPracticeSessionLaps(
    practice_session_id: number | string,
  ): Promise<SpeedhiveResult<SHPracticeSession>>;
  /** Quarantine for path-unverified endpoints — see SpeedhiveUnverifiedApi. */
  unverified: SpeedhiveUnverifiedApi;
}

// ── Implementation ───────────────────────────────────────────────────────────

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Factory (call without `new`). All I/O injected; the returned object holds
 *  no state beyond its constructor arguments. */
export function HttpSpeedhiveClient(
  fetchFn: FetchLike,
  tokenStore: TokenStore,
  baseUrls?: Partial<SpeedhiveBaseUrls>,
): SpeedhiveApi {
  const bases: SpeedhiveBaseUrls = { ...DEFAULT_BASE_URLS, ...(baseUrls ?? {}) };
  const seg = (v: number | string): string => encodeURIComponent(String(v));

  /** One GET. `authed` scopes the bearer: ONLY practice-api requests carry
   *  Authorization — the token never travels to the public host. An authed
   *  request with no token fails fast (auth_required) with ZERO network. */
  async function requestJson(url: string, authed: boolean): Promise<SpeedhiveResult<unknown>> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (authed) {
      const token = tokenStore.get();
      if (token === null || token === "") return { ok: false, reason: "auth_required" };
      headers["Authorization"] = `Bearer ${token}`;
    }

    let res: HttpResponseLike;
    try {
      res = await fetchFn(url, { method: "GET", headers });
    } catch (e) {
      return { ok: false, reason: "network_error", detail: String(e) };
    }
    // 401 AND 403 are terminal auth failures for this call: MYLAPS hosts
    // demonstrably answer 403 (practice-api root, probed 2026-06-12) rather
    // than a clean 401. Surface auth_required, NEVER retry here (politePoll
    // also bails immediately on it — no token, no loop).
    if (res.status === 401 || res.status === 403) return { ok: false, reason: "auth_required" };
    if (res.status < 200 || res.status >= 300) return { ok: false, reason: "bad_status", status: res.status };
    let payload: unknown;
    try {
      payload = await res.json();
    } catch (e) {
      return { ok: false, reason: "bad_payload", detail: `non-JSON body: ${String(e)}` };
    }
    return { ok: true, data: payload };
  }

  /** Fetch + shape-gate one resource. The gate (types.ts) is the only code
   *  that knows payload keys. */
  async function getGated<T>(
    url: string,
    authed: boolean,
    gate: (v: unknown) => ShapeGate<T>,
  ): Promise<SpeedhiveResult<T>> {
    const r = await requestJson(url, authed);
    if (!r.ok) return r;
    const g = gate(r.data);
    if (!g.ok) return { ok: false, reason: "bad_payload", detail: g.detail };
    return { ok: true, data: g.data };
  }

  return {
    getEvent: (event_id) =>
      getGated(ENDPOINTS.event(bases.event_results, seg(event_id)), false, gateEvent),

    getEventSessions: (event_id) =>
      getGated(ENDPOINTS.eventSessions(bases.event_results, seg(event_id)), false, gateEventSessions),

    getSessionClassification: (session_id) =>
      getGated(
        ENDPOINTS.sessionClassification(bases.event_results, seg(session_id)),
        false,
        gateClassification,
      ),

    getSessionLapchart: (session_id) =>
      getGated(ENDPOINTS.lapchart(bases.event_results, seg(session_id)), false, gateLapchart),

    getPracticeSessions: (query) => {
      const count =
        query !== undefined && isFiniteNumber(query.count) && Number.isInteger(query.count) && query.count >= 1
          ? query.count
          : 25;
      const offset =
        query !== undefined && isFiniteNumber(query.offset) && Number.isInteger(query.offset) && query.offset >= 0
          ? query.offset
          : 0;
      return getGated(ENDPOINTS.practiceSessions(bases.practice, count, offset), true, gatePracticeList);
    },

    getPracticeSessionLaps: (practice_session_id) =>
      getGated(
        ENDPOINTS.practiceSessionLaps(bases.practice, seg(practice_session_id)),
        true,
        gatePracticeDetail,
      ),

    unverified: {
      getCompetitorLaps: (session_id, competitor_id) =>
        getGated(
          ENDPOINTS.competitorLaps(bases.event_results, seg(session_id), seg(competitor_id)),
          false,
          gateCompetitorLaps,
        ),
    },
  };
}
