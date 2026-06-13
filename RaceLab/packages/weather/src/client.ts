/**
 * Open-Meteo client — URL builders + fetch wrappers. NO API key, free tier,
 * be polite (the cache layer exists so we never hammer the endpoints).
 *
 * Everything here is injection-first: `fetchFn` is a parameter, never the
 * global. Offline / airplane-mode at the track is a NORMAL case — every
 * failure is a discriminated result ({ok:false, reason}), nothing throws
 * across the package boundary.
 *
 * Endpoints:
 *   forecast  https://api.open-meteo.com/v1/forecast       (≈past 92 days → +16 days)
 *   archive   https://archive-api.open-meteo.com/v1/archive (historical reanalysis,
 *              ~5-day publication delay; has NO precipitation_probability — that is
 *              a forecast-only variable, so the archive hourly list omits it and
 *              the mapper tolerates its absence)
 *
 * Both are requested with `timezone=UTC`, which makes the offset-less hourly
 * `time` strings ("2026-06-11T09:00") UTC wall-clock — map.ts appends the
 * explicit offset designator that schema makeWeatherObservation requires.
 */

import type { Gps, IsoDate } from "../../schema/src/index";

// ── URL construction ─────────────────────────────────────────────────────────

export const FORECAST_BASE = "https://api.open-meteo.com/v1/forecast";
export const ARCHIVE_BASE = "https://archive-api.open-meteo.com/v1/archive";

/** Forecast hourly variable list (order is part of the URL contract — tested). */
export const FORECAST_HOURLY =
  "temperature_2m,relative_humidity_2m,surface_pressure,precipitation,precipitation_probability,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code";

/** Archive hourly variable list — identical minus precipitation_probability
 *  (the archive API does not serve it; it would return all-null anyway). */
export const ARCHIVE_HOURLY =
  "temperature_2m,relative_humidity_2m,surface_pressure,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code";

export interface ForecastOpts {
  /** How many past days to include (API range 0–92). Lets a session that
   *  started earlier today / yesterday still resolve hourly observations. */
  past_days?: number;
  /** How many forecast days (API range 1–16, API default 7). */
  forecast_days?: number;
}

export interface IsoDateRange {
  start_date: IsoDate; // "YYYY-MM-DD", inclusive
  end_date: IsoDate; //   "YYYY-MM-DD", inclusive
}

export function buildForecastUrl(gps: Gps, opts?: ForecastOpts): string {
  let url =
    `${FORECAST_BASE}?latitude=${String(gps.lat)}&longitude=${String(gps.lon)}` +
    `&hourly=${FORECAST_HOURLY}&timezone=UTC`;
  if (opts?.past_days !== undefined) url += `&past_days=${String(opts.past_days)}`;
  if (opts?.forecast_days !== undefined) url += `&forecast_days=${String(opts.forecast_days)}`;
  return url;
}

export function buildArchiveUrl(gps: Gps, range: IsoDateRange): string {
  return (
    `${ARCHIVE_BASE}?latitude=${String(gps.lat)}&longitude=${String(gps.lon)}` +
    `&start_date=${range.start_date}&end_date=${range.end_date}` +
    `&hourly=${ARCHIVE_HOURLY}&timezone=UTC`
  );
}

// ── injected fetch (minimal structural type — works for RN fetch, undici, fakes) ──

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (url: string) => Promise<FetchResponseLike>;

// ── response shape ───────────────────────────────────────────────────────────

/** Open-Meteo hourly block: `time` plus parallel same-length arrays. Archive
 *  fills gaps with null; recent not-yet-published archive hours are all-null. */
export interface OpenMeteoHourly {
  time: readonly string[]; // offset-less ISO, UTC wall-clock (we request timezone=UTC)
  temperature_2m?: readonly (number | null)[]; // °C
  relative_humidity_2m?: readonly (number | null)[]; // %
  /** Station-level pressure in hPa AT THE TRACK'S ELEVATION — this IS the Patm
   *  a trackside weather station reads and the number nitro racers tune needles
   *  against. Deliberately NOT pressure_msl (sea-level reduced), which would
   *  read ~25 hPa high at a 220 m track. */
  surface_pressure?: readonly (number | null)[];
  precipitation?: readonly (number | null)[]; // mm
  precipitation_probability?: readonly (number | null)[]; // % — forecast only
  cloud_cover?: readonly (number | null)[]; // %
  wind_speed_10m?: readonly (number | null)[]; // km/h (Open-Meteo default unit)
  wind_direction_10m?: readonly (number | null)[]; // ° meteorological
  weather_code?: readonly (number | null)[]; // WMO 4677 — see map.ts table
}

export const HOURLY_NUMERIC_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "surface_pressure",
  "precipitation",
  "precipitation_probability",
  "cloud_cover",
  "wind_speed_10m",
  "wind_direction_10m",
  "weather_code",
] as const;

export interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  /** 0 when timezone=UTC was requested; map.ts still honors a non-zero value
   *  defensively when building the explicit offset suffix. */
  utc_offset_seconds: number;
  hourly: OpenMeteoHourly;
}

// ── payload validation (also reused by cache.ts on every cache read) ─────────

/** Structural validation of an unknown JSON payload against OpenMeteoHourly.
 *  Tolerates unknown extra keys (forward compatibility) and missing variable
 *  arrays (archive has no precipitation_probability). NaN entries PASS here —
 *  JSON.parse can never produce them, hand-built fakes can, and the per-row
 *  makeWeatherObservation guard rejects them with row-level granularity. */
export function validateOpenMeteoPayload(
  v: unknown,
): { ok: true; data: OpenMeteoResponse } | { ok: false; detail: string } {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    return { ok: false, detail: "payload is not an object" };
  }
  const o = v as Record<string, unknown>;
  const hourly = o.hourly;
  if (hourly === null || typeof hourly !== "object" || Array.isArray(hourly)) {
    return { ok: false, detail: "missing hourly block" };
  }
  const h = hourly as Record<string, unknown>;
  const time = h.time;
  if (!Array.isArray(time) || !time.every((t) => typeof t === "string")) {
    return { ok: false, detail: "hourly.time is not a string array" };
  }
  for (const f of HOURLY_NUMERIC_FIELDS) {
    const arr = h[f];
    if (arr === undefined) continue; // absent variable is fine (archive)
    if (!Array.isArray(arr)) return { ok: false, detail: `hourly.${f} is not an array` };
    if (arr.length !== time.length) {
      return { ok: false, detail: `hourly.${f} length ${arr.length} != time length ${time.length}` };
    }
    if (!arr.every((x) => x === null || typeof x === "number")) {
      return { ok: false, detail: `hourly.${f} has a non-numeric, non-null entry` };
    }
  }
  const offset = o.utc_offset_seconds;
  const utc_offset_seconds = typeof offset === "number" && Number.isFinite(offset) ? offset : 0;
  const lat = typeof o.latitude === "number" ? o.latitude : 0;
  const lon = typeof o.longitude === "number" ? o.longitude : 0;
  return {
    ok: true,
    data: { latitude: lat, longitude: lon, utc_offset_seconds, hourly: hourly as OpenMeteoHourly },
  };
}

/** True iff at least one hourly variable holds at least one non-null value.
 *  An archive request for a not-yet-published day (≈5-day delay) succeeds with
 *  all-null arrays — callers use this to avoid caching a dataless payload. */
export function payloadHasData(data: OpenMeteoResponse): boolean {
  const h = data.hourly as unknown as Record<string, readonly (number | null)[] | undefined>;
  return HOURLY_NUMERIC_FIELDS.some((f) => h[f]?.some((v) => v !== null) ?? false);
}

// ── fetch wrappers (discriminated, never throw) ──────────────────────────────

export type FetchFailure =
  | { reason: "network_error"; detail: string } // offline / DNS / timeout — NORMAL trackside
  | { reason: "bad_status"; status: number } //    HTTP-level failure (429, 5xx, …)
  | { reason: "bad_payload"; detail: string }; //  2xx but unparseable / wrong shape

export type FetchWeatherResult = { ok: true; data: OpenMeteoResponse } | ({ ok: false } & FetchFailure);

/** Shared GET → validate pipeline for both endpoints. */
export async function fetchOpenMeteo(fetchFn: FetchLike, url: string): Promise<FetchWeatherResult> {
  let res: FetchResponseLike;
  try {
    res = await fetchFn(url);
  } catch (e) {
    return { ok: false, reason: "network_error", detail: e instanceof Error ? e.message : String(e) };
  }
  if (!res.ok) return { ok: false, reason: "bad_status", status: res.status };
  let payload: unknown;
  try {
    payload = await res.json();
  } catch (e) {
    return { ok: false, reason: "bad_payload", detail: e instanceof Error ? e.message : "unparseable json" };
  }
  const checked = validateOpenMeteoPayload(payload);
  if (!checked.ok) return { ok: false, reason: "bad_payload", detail: checked.detail };
  return { ok: true, data: checked.data };
}

export function fetchForecast(
  fetchFn: FetchLike,
  gps: Gps,
  opts?: ForecastOpts,
): Promise<FetchWeatherResult> {
  return fetchOpenMeteo(fetchFn, buildForecastUrl(gps, opts));
}

export function fetchArchive(
  fetchFn: FetchLike,
  gps: Gps,
  range: IsoDateRange,
): Promise<FetchWeatherResult> {
  return fetchOpenMeteo(fetchFn, buildArchiveUrl(gps, range));
}
