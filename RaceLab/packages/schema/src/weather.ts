/**
 * Weather — immutable observations (the Open-Meteo adapter target; the adapter
 * itself lives OUTSIDE domain packages and maps API json → WeatherObservation
 * with source "auto") plus the pure, provenance-carrying condition resolution.
 *
 * Only air_temp_c / humidity_pct / sky can ever be auto-filled from weather:
 * grip, bumpiness, dusty, evolution and track_temp_c are DRIVER-OBSERVED facts
 * (IR gun, eyes on the track) and are never synthesized from an API.
 * pressure_hpa (Patm) stays on the observation — nitro needle context.
 */

import type { IsoDateTime, Sky } from "./vocab";
import { clampNum, deepFreeze, isFiniteNum } from "./vocab";
import type { RunConditions } from "./runs"; // type-only — no runtime cycle

export const WEATHER_SOURCES = ["auto", "manual", "backfill"] as const;
export type WeatherSource = (typeof WEATHER_SOURCES)[number];

export interface WeatherObservation {
  /** MUST carry an explicit offset ("Z" or ±hh:mm). Open-Meteo hourly `time`
   *  is offset-LESS local ISO ("2026-06-11T09:00") and Date.parse reads that
   *  as device-local time — the adapter must request `timezone=UTC` and append
   *  "Z" before constructing an observation, or makeWeatherObservation rejects. */
  observed_at: IsoDateTime;
  source: WeatherSource;
  air_temp_c?: number;
  humidity_pct?: number; // clamped to [0, 100]
  wind_speed_kmh?: number; // clamped to >= 0
  wind_dir_deg?: number; // normalized to [0, 360), meteorological
  pressure_hpa?: number; // Patm — nitro tuning cares
  precipitation_mm?: number; // clamped to >= 0
  /** Forecast rain probability (Open-Meteo `precipitation_probability`), clamped
   *  to [0, 100]. The ONLY stored basis for sky "rain_risk" / engine rain_risk_pct —
   *  observed precipitation_mm is 0 until it is already raining. */
  precipitation_probability_pct?: number;
  cloud_cover_pct?: number; // clamped to [0, 100]
  sky?: Sky;
}

export type WeatherRejectReason = "invalid_timestamp" | "non_finite_numeric";

export const WEATHER_NUMERIC_FIELDS = [
  "air_temp_c",
  "humidity_pct",
  "wind_speed_kmh",
  "wind_dir_deg",
  "pressure_hpa",
  "precipitation_mm",
  "precipitation_probability_pct",
  "cloud_cover_pct",
] as const;

/** True iff the ISO timestamp carries an explicit UTC designator or offset
 *  ("...Z", "...+02:00", "...-0700"). Offset-less date-times are interpreted
 *  DEVICE-LOCALLY by Date.parse and would skew weatherAtTime by hours. */
export function hasExplicitOffset(iso: string): boolean {
  return /(?:Z|z|[+-]\d{2}:?\d{2})$/.test(iso);
}

/** Build a frozen observation. NaN/Infinity reject; documented ranges CLAMP
 *  (humidity/cloud/probability 0–100, wind/precipitation >= 0, wind_dir mod 360).
 *  Timestamps without an explicit offset reject — see WeatherObservation.observed_at. */
export function makeWeatherObservation(
  input: WeatherObservation,
): { ok: true; observation: WeatherObservation } | { ok: false; reason: WeatherRejectReason } {
  if (Number.isNaN(Date.parse(input.observed_at)) || !hasExplicitOffset(input.observed_at)) {
    return { ok: false, reason: "invalid_timestamp" };
  }
  for (const f of WEATHER_NUMERIC_FIELDS) {
    const v = input[f];
    if (v !== undefined && !isFiniteNum(v)) return { ok: false, reason: "non_finite_numeric" };
  }
  const obs: WeatherObservation = deepFreeze({
    observed_at: input.observed_at,
    source: input.source,
    ...(input.air_temp_c !== undefined ? { air_temp_c: input.air_temp_c } : {}),
    ...(input.humidity_pct !== undefined ? { humidity_pct: clampNum(input.humidity_pct, 0, 100) } : {}),
    ...(input.wind_speed_kmh !== undefined ? { wind_speed_kmh: Math.max(0, input.wind_speed_kmh) } : {}),
    ...(input.wind_dir_deg !== undefined
      ? { wind_dir_deg: ((input.wind_dir_deg % 360) + 360) % 360 }
      : {}),
    ...(input.pressure_hpa !== undefined ? { pressure_hpa: input.pressure_hpa } : {}),
    ...(input.precipitation_mm !== undefined
      ? { precipitation_mm: Math.max(0, input.precipitation_mm) }
      : {}),
    ...(input.precipitation_probability_pct !== undefined
      ? { precipitation_probability_pct: clampNum(input.precipitation_probability_pct, 0, 100) }
      : {}),
    ...(input.cloud_cover_pct !== undefined
      ? { cloud_cover_pct: clampNum(input.cloud_cover_pct, 0, 100) }
      : {}),
    ...(input.sky !== undefined ? { sky: input.sky } : {}),
  });
  return { ok: true, observation: obs };
}

/** Sky "rain_risk" derives from forecast probability at-or-above this threshold. */
export const RAIN_RISK_THRESHOLD_PCT = 30;
/** Cloud cover at-or-above this reads "cloudy", below it "sunny". */
export const CLOUDY_THRESHOLD_PCT = 60;

/** THE documented derivation rule for Sky from an observation (deterministic,
 *  for the adapter — never overrides a driver-entered sky):
 *  precipitation_mm > 0 → "raining"; else probability >= RAIN_RISK_THRESHOLD_PCT
 *  → "rain_risk"; else cloud_cover >= CLOUDY_THRESHOLD_PCT → "cloudy"; else
 *  "sunny" when cloud cover is known; undefined when nothing applies. */
export function deriveSky(obs: WeatherObservation): Sky | undefined {
  if (isFiniteNum(obs.precipitation_mm) && obs.precipitation_mm > 0) return "raining";
  if (
    isFiniteNum(obs.precipitation_probability_pct) &&
    obs.precipitation_probability_pct >= RAIN_RISK_THRESHOLD_PCT
  ) {
    return "rain_risk";
  }
  if (isFiniteNum(obs.cloud_cover_pct)) {
    return obs.cloud_cover_pct >= CLOUDY_THRESHOLD_PCT ? "cloudy" : "sunny";
  }
  return undefined;
}

// ── Condition resolution (manual wins per-field, provenance recorded) ────────

export const WEATHER_DERIVED_FIELDS = ["air_temp_c", "humidity_pct", "sky"] as const;
export type WeatherDerivedField = (typeof WEATHER_DERIVED_FIELDS)[number];

export interface ConditionsProvenance {
  /** Fields filled from the auto observation because the driver left them blank. */
  auto_filled: readonly WeatherDerivedField[];
  /** Fields where the driver's value WON over an available auto value. */
  overridden: readonly WeatherDerivedField[];
}

export interface ResolvedRunConditions {
  conditions: RunConditions;
  provenance: ConditionsProvenance;
}

/** Pure merge: manual wins per-field; blank manual weather-fields are filled
 *  from `auto`; provenance records both directions. Driver-observed fields
 *  (grip, bumpiness, dusty, evolution, track_temp_c) pass through untouched. */
export function resolveConditions(
  auto: WeatherObservation | undefined,
  manual: RunConditions,
): ResolvedRunConditions {
  const conditions: RunConditions = { ...manual };
  const auto_filled: WeatherDerivedField[] = [];
  const overridden: WeatherDerivedField[] = [];

  if (auto !== undefined) {
    if (auto.air_temp_c !== undefined) {
      if (manual.air_temp_c === undefined) {
        conditions.air_temp_c = auto.air_temp_c;
        auto_filled.push("air_temp_c");
      } else {
        overridden.push("air_temp_c");
      }
    }
    if (auto.humidity_pct !== undefined) {
      if (manual.humidity_pct === undefined) {
        conditions.humidity_pct = auto.humidity_pct;
        auto_filled.push("humidity_pct");
      } else {
        overridden.push("humidity_pct");
      }
    }
    if (auto.sky !== undefined) {
      if (manual.sky === undefined) {
        conditions.sky = auto.sky;
        auto_filled.push("sky");
      } else {
        overridden.push("sky");
      }
    }
  }

  return deepFreeze({ conditions, provenance: { auto_filled, overridden } });
}

/** Parse an ISO timestamp to epoch ms, interpreting an OFFSET-LESS string as
 *  UTC (append "Z") rather than letting Date.parse read it device-locally.
 *  observed_at is offset-required, but an entity timestamp arriving at the join
 *  (RunEntry/OutcomeRecord.created_at) is only offset-CHECKED on the load path —
 *  a write-path or lifted-legacy timestamp can still be offset-less. Without
 *  this normalization the cutoff and the log would be compared on different time
 *  bases and weatherAtTime would skew by the device's UTC offset (hours). NaN
 *  on unparseable input is handled by the caller's Number.isNaN guard. */
function isoToMsUtc(iso: string): number {
  return Date.parse(hasExplicitOffset(iso) ? iso : `${iso}Z`);
}

/** Latest observation at-or-before `at` (ties: the LAST matching entry wins).
 *  Observations are immutable facts, so this lookup can never retro-falsify a
 *  run — full atmosphere (pressure_hpa for nitro) is resolved here. Both the
 *  cutoff and every observed_at are parsed UTC-consistently (see isoToMsUtc):
 *  an offset-less `at` (e.g. a lifted-legacy created_at) is read as UTC, never
 *  device-local, so the join is deterministic regardless of device timezone. */
export function weatherAtTime(
  log: readonly WeatherObservation[] | undefined,
  at: IsoDateTime,
): WeatherObservation | undefined {
  const cutoff = isoToMsUtc(at);
  if (Number.isNaN(cutoff)) return undefined;
  let found: WeatherObservation | undefined;
  let foundMs = -Infinity;
  for (const obs of log ?? []) {
    const t = isoToMsUtc(obs.observed_at);
    if (!Number.isNaN(t) && t <= cutoff) {
      if (found === undefined || t >= foundMs) {
        found = obs;
        foundMs = t;
      }
    }
  }
  return found;
}
