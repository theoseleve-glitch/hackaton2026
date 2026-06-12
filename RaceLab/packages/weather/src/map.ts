/**
 * Open-Meteo hourly arrays → schema WeatherObservation[].
 *
 * Every observation is built through schema makeWeatherObservation (clamps +
 * non-finite rejection + explicit-offset requirement); rows that fail are
 * REPORTED in `rejected`, never silently dropped.
 *
 * Timestamp contract: we request `timezone=UTC`, so hourly `time` strings are
 * offset-LESS UTC wall-clock ("2026-06-11T09:00"). Schema rejects offset-less
 * timestamps (Date.parse would read them device-locally and skew weatherAtTime
 * by hours), so this mapper appends the explicit designator — "Z" for offset 0,
 * "±hh:mm" if the payload ever carries a non-zero utc_offset_seconds.
 *
 * surface_pressure → pressure_hpa: station-level pressure at the track's own
 * elevation, i.e. the local barometric Patm a trackside weather station shows —
 * exactly the number nitro racers reference for needle settings. (NOT the
 * sea-level-reduced pressure_msl, which we deliberately do not request.)
 *
 * Sky derivation (documented rule, source-stamped per observation):
 *   1. WMO weather_code in a precipitation class            → "raining"
 *      (drizzle 51–57, rain 61–67, snow 71–77, showers 80–86, thunder 95–99)
 *   2. WMO weather_code is fog (45, 48)                     → "cloudy"
 *   3. otherwise schema deriveSky on the row's numerics:
 *        precipitation_mm > 0                               → "raining"
 *        precipitation_probability ≥ RAIN_RISK_THRESHOLD_PCT→ "rain_risk"
 *        cloud_cover known: ≥ CLOUDY_THRESHOLD_PCT ? "cloudy" : "sunny"
 *   4. numerics inconclusive → fall back to the code itself:
 *        0/1/2 (clear / mainly clear / partly cloudy)       → "sunny"
 *        3 (overcast)                                       → "cloudy"
 *   5. nothing applies → sky stays undefined.
 *   Steps 3–4 keep cloud_cover authoritative over the 0–3 codes (same
 *   semantics + thresholds as schema deriveSky); the code only ADDS the
 *   definite-precipitation and fog signals numerics cannot express.
 */

import type { Sky, WeatherObservation, WeatherRejectReason, WeatherSource } from "../../schema/src/index";
import { deriveSky, hasExplicitOffset, makeWeatherObservation } from "../../schema/src/index";
import type { OpenMeteoResponse } from "./client";

// ── WMO 4677 code classes (Open-Meteo subset) ────────────────────────────────

function isPrecipCode(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 71 && code <= 77) || (code >= 80 && code <= 86) || (code >= 95 && code <= 99);
}
function isFogCode(code: number): boolean {
  return code === 45 || code === 48;
}

/** Pure WMO code → Sky (the fallback half of the documented rule). */
export function skyFromWmoCode(code: number): Sky | undefined {
  if (isPrecipCode(code)) return "raining";
  if (isFogCode(code)) return "cloudy";
  if (code === 0 || code === 1 || code === 2) return "sunny";
  if (code === 3) return "cloudy";
  return undefined;
}

/** Full documented derivation: code precip/fog first, then schema deriveSky
 *  on the row numerics, then the code-class fallback. */
export function deriveSkyForRow(
  weatherCode: number | undefined,
  row: WeatherObservation,
): Sky | undefined {
  if (weatherCode !== undefined && Number.isFinite(weatherCode)) {
    if (isPrecipCode(weatherCode)) return "raining";
    if (isFogCode(weatherCode)) return "cloudy";
  }
  const fromNumerics = deriveSky(row);
  if (fromNumerics !== undefined) return fromNumerics;
  if (weatherCode !== undefined && Number.isFinite(weatherCode)) return skyFromWmoCode(weatherCode);
  return undefined;
}

// ── offset suffix ────────────────────────────────────────────────────────────

/** "Z" for offset 0, otherwise "±hh:mm" — makes Open-Meteo's offset-less
 *  hourly times satisfy schema's explicit-offset requirement. */
export function offsetSuffix(utcOffsetSeconds: number): string {
  if (!Number.isFinite(utcOffsetSeconds) || utcOffsetSeconds === 0) return "Z";
  const sign = utcOffsetSeconds < 0 ? "-" : "+";
  const abs = Math.abs(Math.round(utcOffsetSeconds));
  const hh = String(Math.floor(abs / 3600)).padStart(2, "0");
  const mm = String(Math.floor((abs % 3600) / 60)).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

// ── window coverage ──────────────────────────────────────────────────────────

/** True iff the payload's hourly window spans `instant_ms`:
 *  first hourly time <= instant <= last hourly time (bounds inclusive).
 *  This is the cache-serving guard (CachedFetchDeps.covers): the forecast cache
 *  key carries no request window, so a narrow payload cached minutes ago must
 *  not silently answer a wider backdated request — coverage, not key identity,
 *  decides whether a hit can serve. Empty or unparseable bounds → false. */
export function payloadCoversInstant(resp: OpenMeteoResponse, instant_ms: number): boolean {
  if (!Number.isFinite(instant_ms)) return false;
  const times = resp.hourly.time;
  if (times.length === 0) return false;
  const suffix = offsetSuffix(resp.utc_offset_seconds);
  const explicit = (t: string) => (hasExplicitOffset(t) ? t : t + suffix);
  const first = Date.parse(explicit(times[0]));
  const last = Date.parse(explicit(times[times.length - 1]));
  if (Number.isNaN(first) || Number.isNaN(last)) return false;
  return first <= instant_ms && instant_ms <= last;
}

// ── mapping ──────────────────────────────────────────────────────────────────

export type MapRejectReason = WeatherRejectReason | "empty_row";

export interface RejectedRow {
  index: number;
  time: string; // raw payload time string, for diagnostics
  reason: MapRejectReason;
}

export interface MapResult {
  observations: readonly WeatherObservation[];
  /** Rows that could not become observations — reported, never silently dropped.
   *  "empty_row": valid timestamp but every variable null/absent (typical for
   *  archive hours not yet published) — zero information, nothing to keep. */
  rejected: readonly RejectedRow[];
}

function at(arr: readonly (number | null)[] | undefined, i: number): number | undefined {
  const v = arr?.[i];
  return v === null || v === undefined ? undefined : v;
}

export function mapOpenMeteoHourly(resp: OpenMeteoResponse, source: WeatherSource): MapResult {
  const h = resp.hourly;
  const suffix = offsetSuffix(resp.utc_offset_seconds);
  const observations: WeatherObservation[] = [];
  const rejected: RejectedRow[] = [];

  for (let i = 0; i < h.time.length; i++) {
    const rawTime = h.time[i];
    // Defensive: if a payload ever carried explicit offsets already, keep them.
    const observed_at = hasExplicitOffset(rawTime) ? rawTime : rawTime + suffix;

    const candidate: WeatherObservation = {
      observed_at,
      source,
      air_temp_c: at(h.temperature_2m, i),
      humidity_pct: at(h.relative_humidity_2m, i),
      wind_speed_kmh: at(h.wind_speed_10m, i),
      wind_dir_deg: at(h.wind_direction_10m, i),
      pressure_hpa: at(h.surface_pressure, i),
      precipitation_mm: at(h.precipitation, i),
      precipitation_probability_pct: at(h.precipitation_probability, i),
      cloud_cover_pct: at(h.cloud_cover, i),
    };
    const code = at(h.weather_code, i);
    const sky = deriveSkyForRow(code, candidate);
    if (sky !== undefined) candidate.sky = sky;

    const hasAnyData =
      candidate.air_temp_c !== undefined ||
      candidate.humidity_pct !== undefined ||
      candidate.wind_speed_kmh !== undefined ||
      candidate.wind_dir_deg !== undefined ||
      candidate.pressure_hpa !== undefined ||
      candidate.precipitation_mm !== undefined ||
      candidate.precipitation_probability_pct !== undefined ||
      candidate.cloud_cover_pct !== undefined ||
      candidate.sky !== undefined;
    if (!hasAnyData) {
      rejected.push({ index: i, time: rawTime, reason: "empty_row" });
      continue;
    }

    const made = makeWeatherObservation(candidate);
    if (made.ok) {
      observations.push(made.observation);
    } else {
      rejected.push({ index: i, time: rawTime, reason: made.reason });
    }
  }

  return { observations, rejected };
}

/** Forecast rows are live auto-fill → source "auto". */
export function mapForecastResponse(resp: OpenMeteoResponse): MapResult {
  return mapOpenMeteoHourly(resp, "auto");
}

/** Archive rows reconstruct conditions after the fact → source "backfill". */
export function mapArchiveResponse(resp: OpenMeteoResponse): MapResult {
  return mapOpenMeteoHourly(resp, "backfill");
}
