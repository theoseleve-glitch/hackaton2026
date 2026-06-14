/**
 * Weather service — the surface the app calls. Wires client → cache → map and
 * hands back schema WeatherObservations plus the schema-pure pick/merge
 * helpers. All capabilities injected through WeatherDeps; nothing here (or
 * anywhere in src/) touches Date.now(), Math.random() or a global fetch.
 *
 * Tier B discipline: this package ENRICHES a session. Every result is
 * discriminated; { ok: false } means "log conditions by hand like always" —
 * the app and the advisor keep working with every endpoint down (D18).
 */

import type { Gps, IsoDate, IsoDateTime, RunConditions, ResolvedRunConditions, WeatherObservation } from "../../schema/src/index";
import { resolveConditions, weatherAtTime } from "../../schema/src/index";
import type { FetchFailure, FetchLike, OpenMeteoResponse } from "./client";
import { buildArchiveUrl, buildForecastUrl, fetchOpenMeteo, payloadDayComplete } from "./client";
import type { KeyValueDriver } from "./cache";
import {
  DEFAULT_ARCHIVE_TTL_MS,
  DEFAULT_FORECAST_TTL_MS,
  archiveCacheKey,
  fetchWithCache,
  forecastCacheKey,
  forecastLatestKey,
} from "./cache";
import type { MapResult, RejectedRow } from "./map";
import { mapArchiveResponse, mapForecastResponse, payloadCoversInstant } from "./map";

// ── deps ─────────────────────────────────────────────────────────────────────

export interface WeatherDeps {
  fetchFn: FetchLike;
  driver: KeyValueDriver;
  /** Injected clock (epoch ms) — drives cache buckets, TTL math and past/future
   *  day-window computation. */
  now_ms: number;
  forecast_ttl_ms?: number; // default DEFAULT_FORECAST_TTL_MS (30 min)
  archive_ttl_ms?: number; //  default DEFAULT_ARCHIVE_TTL_MS (30 days)
}

// ── results ──────────────────────────────────────────────────────────────────

export interface SessionWeather {
  ok: true;
  /** Hourly observations covering the requested window, chronological,
   *  every one built through schema makeWeatherObservation. */
  observations: readonly WeatherObservation[];
  /** Rows the mapper refused (NaN, bad time, all-null archive hours) — reported,
   *  never silently dropped. */
  rejected_rows: readonly RejectedRow[];
  /** autoFillSession only: weatherAtTime(observations, sessionStartIso), and
   *  only when that observation falls within MAX_AT_START_GAP_MS before the
   *  start — an hours-stale "latest at-or-before" row is a different weather
   *  story, not "conditions at start", so it is omitted rather than presented. */
  at_start?: WeatherObservation;
  from: "network" | "cache";
  /** true = expired cache served because the network failed (stale-if-offline). */
  stale: boolean;
  /** from "cache" only: payload age (now - stored_at) — lets the app size the
   *  truth ("25 min old" vs "3 days old") instead of a bare stale flag. */
  age_ms?: number;
  /** stale only: the fetch failure that forced serving expired cache
   *  ("offline" vs "HTTP 500" are different stories for the user). */
  fetch_failure?: FetchFailure;
  /** true when a corrupt cache slot was seen on this read but the result was
   *  rescued (pointer chase or fresh fetch). Never-wipe visibility: a healthy
   *  result must still report that something in storage was unreadable. */
  cache_corrupt?: true;
}

export type WeatherFailure =
  | ({ ok: false; cache_corrupt?: true } & FetchFailure)
  | { ok: false; reason: "invalid_input"; detail: string };

export type SessionWeatherResult = SessionWeather | WeatherFailure;

// ── helpers ──────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** Max distance BEFORE the session start an observation may sit and still be
 *  reported as `at_start`. Open-Meteo data is hourly, so anything beyond a few
 *  hours means the rows around the start were missing/rejected — refusing to
 *  call a 6-hour-old row "conditions at start" beats quietly presenting it. */
export const MAX_AT_START_GAP_MS = 3 * 3_600_000;

function validGps(gps: Gps): boolean {
  return (
    Number.isFinite(gps.lat) &&
    Number.isFinite(gps.lon) &&
    gps.lat >= -90 &&
    gps.lat <= 90 &&
    gps.lon >= -180 &&
    gps.lon <= 180
  );
}

function clampInt(v: number, lo: number, hi: number): number {
  const r = Math.ceil(v);
  return r < lo ? lo : r > hi ? hi : r;
}

/** Forecast-window sizing so the session start is always inside the payload:
 *  past_days covers a start earlier than now (≥1 so "earlier today" always
 *  resolves, API cap 92), forecast_days covers a future start (≥2 = today +
 *  tomorrow, API cap 16). */
export function forecastWindow(now_ms: number, start_ms: number): { past_days: number; forecast_days: number } {
  const diff = now_ms - start_ms;
  const past_days = clampInt(diff > 0 ? diff / DAY_MS : 1, 1, 92);
  const forecast_days = clampInt(diff < 0 ? -diff / DAY_MS + 1 : 2, 2, 16);
  return { past_days, forecast_days };
}

/** Latest observation at-or-before `atIso` — schema weatherAtTime, re-named to
 *  the service vocabulary ("which conditions apply to this run"). */
export function pickConditions(
  observations: readonly WeatherObservation[] | undefined,
  atIso: IsoDateTime,
): WeatherObservation | undefined {
  return weatherAtTime(observations, atIso);
}

/** Pure merge of an auto observation into driver-entered conditions — schema
 *  resolveConditions verbatim: manual wins per-field, blanks auto-fill, both
 *  directions recorded in provenance. Driver-observed facts (grip, bumpiness,
 *  dusty, evolution, track_temp_c) are never synthesized. */
export function applyManualOverride(
  auto: WeatherObservation | undefined,
  manual: RunConditions,
): ResolvedRunConditions {
  return resolveConditions(auto, manual);
}

// shared tail: cached-fetch result + mapper → SessionWeatherResult
type Cached = Awaited<ReturnType<typeof fetchWithCache>>;
function finish(
  res: Cached,
  mapFn: (data: OpenMeteoResponse) => MapResult,
  atStartIso?: IsoDateTime,
): SessionWeatherResult {
  if (!res.ok) return res;
  const mapped = mapFn(res.data);
  const base: SessionWeather = {
    ok: true,
    observations: mapped.observations,
    rejected_rows: mapped.rejected,
    from: res.from,
    stale: res.from === "cache" ? res.stale : false,
  };
  if (res.from === "cache") {
    base.age_ms = res.age_ms;
    if (res.stale) base.fetch_failure = res.fetch_failure;
  }
  // surface a corrupt-slot sighting on the healthy result too (never-wipe)
  if (res.cache_corrupt === true) base.cache_corrupt = true;
  if (atStartIso !== undefined) {
    const at_start = pickConditions(mapped.observations, atStartIso);
    if (at_start !== undefined) {
      // Gap guard: at-or-before semantics with hourly data should land within
      // the hour; anything beyond MAX_AT_START_GAP_MS is NOT "at start".
      const gap = Date.parse(atStartIso) - Date.parse(at_start.observed_at);
      if (gap <= MAX_AT_START_GAP_MS) return { ...base, at_start };
    }
  }
  return base;
}

// ── service calls ────────────────────────────────────────────────────────────

/**
 * Live auto-fill for a session: forecast endpoint (includes past_days so a
 * session that started hours ago still resolves), source "auto", cache-first
 * with stale-if-offline. `at_start` is the observation governing the session
 * start; pickConditions(observations, runStartIso) resolves later runs as the
 * day goes on without another network call.
 */
export async function autoFillSession(
  deps: WeatherDeps,
  gps: Gps,
  sessionStartIso: IsoDateTime,
): Promise<SessionWeatherResult> {
  if (!Number.isFinite(deps.now_ms)) {
    return { ok: false, reason: "invalid_input", detail: `non-finite now_ms: ${String(deps.now_ms)}` };
  }
  if (!validGps(gps)) {
    return { ok: false, reason: "invalid_input", detail: `gps out of range: ${gps.lat},${gps.lon}` };
  }
  const start_ms = Date.parse(sessionStartIso);
  if (Number.isNaN(start_ms)) {
    return { ok: false, reason: "invalid_input", detail: `unparseable sessionStartIso '${sessionStartIso}'` };
  }
  const url = buildForecastUrl(gps, forecastWindow(deps.now_ms, start_ms));
  const res = await fetchWithCache(
    {
      driver: deps.driver,
      now_ms: deps.now_ms,
      ttl_ms: deps.forecast_ttl_ms ?? DEFAULT_FORECAST_TTL_MS,
      // The forecast cache key has no request window, so a cached payload only
      // serves (fresh OR stale) when its hourly window actually spans the
      // session start — a narrow payload must never shadow a backdated request.
      covers: (data) => payloadCoversInstant(data, start_ms),
    },
    forecastCacheKey(gps, deps.now_ms),
    forecastLatestKey(gps),
    () => fetchOpenMeteo(deps.fetchFn, url),
  );
  return finish(res, mapForecastResponse, sessionStartIso);
}

/**
 * After-the-fact backfill for a session logged offline: archive endpoint for
 * the given day (UTC), source "backfill". Note the archive publishes with a
 * ~5-day delay — a too-recent date yields all-null hours, which come back as
 * "empty_row" rejections rather than observations; callers should retry later
 * (the day's cache entry only forms once a fetch succeeds with data).
 */
export async function backfillSession(
  deps: WeatherDeps,
  gps: Gps,
  dateIso: IsoDate,
): Promise<SessionWeatherResult> {
  if (!Number.isFinite(deps.now_ms)) {
    return { ok: false, reason: "invalid_input", detail: `non-finite now_ms: ${String(deps.now_ms)}` };
  }
  if (!validGps(gps)) {
    return { ok: false, reason: "invalid_input", detail: `gps out of range: ${gps.lat},${gps.lon}` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso) || Number.isNaN(Date.parse(dateIso))) {
    return { ok: false, reason: "invalid_input", detail: `dateIso must be YYYY-MM-DD, got '${dateIso}'` };
  }
  const range = { start_date: dateIso, end_date: dateIso };
  const url = buildArchiveUrl(gps, range);
  const res = await fetchWithCache(
    {
      driver: deps.driver,
      now_ms: deps.now_ms,
      ttl_ms: deps.archive_ttl_ms ?? DEFAULT_ARCHIVE_TTL_MS,
      // archive publishes ~5 days behind, hour-by-hour at the boundary: only a
      // COMPLETE (gap-free) day is cached for the 30-day archive TTL. An all-null
      // day OR a half-published day (some hours still null) is returned to the
      // caller but never cached — caching either would pin missing hours we can
      // never refetch. The day re-fetches cheaply until it is whole.
      should_cache: payloadDayComplete,
    },
    archiveCacheKey(gps, range),
    undefined, // range IS the identity — no rotating bucket, no pointer needed
    () => fetchOpenMeteo(deps.fetchFn, url),
  );
  return finish(res, mapArchiveResponse);
}

// schema pass-throughs the app will want next to these calls
export { resolveConditions, weatherAtTime };
