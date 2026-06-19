/**
 * racelab-weather — Open-Meteo weather module (B3, no API key, Tier B
 * enrichment only). Injected fetch/storage/clock, discriminated results,
 * stale-if-offline cache; every observation built through schema
 * makeWeatherObservation. The advisor never depends on this package (D18).
 */

// client — URL builders, injected-fetch wrappers, payload validation
export {
  FORECAST_BASE,
  ARCHIVE_BASE,
  FORECAST_HOURLY,
  ARCHIVE_HOURLY,
  HOURLY_NUMERIC_FIELDS,
  DEFAULT_WEATHER_BASE_URLS,
  DEFAULT_WEATHER_TIMEOUT_MS,
  buildForecastUrl,
  buildArchiveUrl,
  fetchOpenMeteo,
  fetchForecast,
  fetchArchive,
  validateOpenMeteoPayload,
  payloadHasData,
  payloadDayComplete,
} from "./client";
export type {
  ForecastOpts,
  IsoDateRange,
  WeatherBaseUrls,
  FetchWeatherConfig,
  FetchLike,
  FetchResponseLike,
  OpenMeteoHourly,
  OpenMeteoResponse,
  FetchFailure,
  FetchWeatherResult,
} from "./client";

// map — hourly arrays → WeatherObservation[], WMO sky derivation
export {
  mapOpenMeteoHourly,
  mapForecastResponse,
  mapArchiveResponse,
  skyFromWmoCode,
  deriveSkyForRow,
  offsetSuffix,
  payloadCoversInstant,
} from "./map";
export type { MapResult, MapRejectReason, RejectedRow } from "./map";

// cache — injected KV driver, TTL, stale-if-offline
export {
  fetchWithCache,
  forecastCacheKey,
  forecastLatestKey,
  archiveCacheKey,
  hourBucketUtc,
  INVALID_HOUR_BUCKET,
  roundCoord,
  DEFAULT_FORECAST_TTL_MS,
  DEFAULT_ARCHIVE_TTL_MS,
} from "./cache";
export type { KeyValueDriver, CacheEnvelope, CachedFetchDeps, CachedFetchResult } from "./cache";

// service — the app-facing calls
export {
  autoFillSession,
  backfillSession,
  pickConditions,
  applyManualOverride,
  forecastWindow,
  resolveConditions,
  weatherAtTime,
  MAX_AT_START_GAP_MS,
} from "./service";
export type {
  WeatherDeps,
  SessionWeather,
  SessionWeatherResult,
  WeatherFailure,
} from "./service";
