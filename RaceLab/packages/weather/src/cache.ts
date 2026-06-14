/**
 * Weather payload cache — injected key-value driver (AsyncStorage-shaped),
 * injected clock, injected TTL. Stores VALIDATED raw Open-Meteo payloads
 * (observations themselves are never persisted by this package — they are
 * rebuilt through schema makeWeatherObservation on every map).
 *
 * Key scheme (entry identity = rounded gps + hour bucket, per spec):
 *   forecast entry   weather:fc:{lat2dp},{lon2dp}:{YYYY-MM-DDTHH}
 *   forecast pointer weather:fc:{lat2dp},{lon2dp}:latest   → most recent entry key
 *   archive entry    weather:ar:{lat2dp},{lon2dp}:{start}..{end}
 *
 * The forecast key deliberately omits the requested past/forecast window, so
 * the SAME bucket can hold payloads of different widths. The injected `covers`
 * predicate (CachedFetchDeps.covers) is what keeps that safe: a cached payload
 * that cannot answer the current request (e.g. a narrow window cached minutes
 * ago shadowing a backdated session three weeks back) is treated as a miss —
 * fresh AND stale serving both require coverage.
 *
 * The forecast pointer exists because the bucketed key rotates every hour:
 * after a long offline stretch the current bucket is empty, but the pointer
 * still reaches the last good payload — that is what stale-if-offline returns
 * (expired data with stale:true beats no data trackside).
 *
 * Read path is paranoid (cache is storage → same trust level as parse.ts
 * contract): JSON.parse failures, bad envelopes and payloads failing
 * validateOpenMeteoPayload are treated as misses and REPORTED via
 * cache_corrupt — never deleted; the next successful fetch overwrites the
 * slot, which is normal cache turnover, not data loss (never-wipe applies to
 * user data; this slot only ever holds re-fetchable API payloads).
 *
 * 2-decimal gps rounding ≈ 1.1 km cells — same club track, same cache cell,
 * regardless of which corner of the parking lot the phone gps reports.
 */

import type { Gps } from "../../schema/src/index";
import type { FetchFailure, FetchWeatherResult, OpenMeteoResponse } from "./client";
import { validateOpenMeteoPayload } from "./client";
import type { IsoDateRange } from "./client";

// ── injected storage driver (AsyncStorage-compatible subset) ─────────────────

export interface KeyValueDriver {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

// ── TTL defaults (callers may inject their own) ──────────────────────────────

/** Forecasts move hourly; refresh every 30 min when online. */
export const DEFAULT_FORECAST_TTL_MS = 30 * 60_000;
/** Archive reanalysis of a past day is effectively immutable; 30 days. */
export const DEFAULT_ARCHIVE_TTL_MS = 30 * 86_400_000;

// ── keys ─────────────────────────────────────────────────────────────────────

/** Round to 2 decimals; normalizes -0 so "-0.00" can never split a cache cell. */
export function roundCoord(v: number): string {
  const r = Math.round(v * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toFixed(2);
}

/** Sentinel hour bucket for a non-finite clock — never a valid ISO prefix, so a
 *  key built from it is a guaranteed cache miss (no real payload ever lands in
 *  this slot) rather than a thrown RangeError. */
export const INVALID_HOUR_BUCKET = "invalid";

/** UTC hour bucket from an injected clock, e.g. "2026-06-12T14".
 *  Exported helper → must never throw: `new Date(NaN).toISOString()` raises a
 *  RangeError, so a non-finite now_ms yields the harmless sentinel bucket (a
 *  cache miss) instead. The service rejects non-finite now_ms up front; this is
 *  defense in depth for any direct caller of the key builders. */
export function hourBucketUtc(now_ms: number): string {
  if (!Number.isFinite(now_ms)) return INVALID_HOUR_BUCKET;
  return new Date(now_ms).toISOString().slice(0, 13);
}

function gpsCell(gps: Gps): string {
  return `${roundCoord(gps.lat)},${roundCoord(gps.lon)}`;
}

export function forecastCacheKey(gps: Gps, now_ms: number): string {
  return `weather:fc:${gpsCell(gps)}:${hourBucketUtc(now_ms)}`;
}

export function forecastLatestKey(gps: Gps): string {
  return `weather:fc:${gpsCell(gps)}:latest`;
}

export function archiveCacheKey(gps: Gps, range: IsoDateRange): string {
  return `weather:ar:${gpsCell(gps)}:${range.start_date}..${range.end_date}`;
}

// ── envelope ─────────────────────────────────────────────────────────────────

export interface CacheEnvelope {
  stored_at_ms: number;
  payload: OpenMeteoResponse;
}

type ReadEntry =
  | { hit: true; env: CacheEnvelope }
  | { hit: false; corrupt: boolean };

async function readEntry(driver: KeyValueDriver, key: string): Promise<ReadEntry> {
  let raw: string | null;
  try {
    raw = await driver.getItem(key);
  } catch {
    return { hit: false, corrupt: false }; // driver hiccup → plain miss
  }
  if (raw === null) return { hit: false, corrupt: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { hit: false, corrupt: true };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { hit: false, corrupt: true };
  }
  const env = parsed as Record<string, unknown>;
  if (typeof env.stored_at_ms !== "number" || !Number.isFinite(env.stored_at_ms)) {
    return { hit: false, corrupt: true };
  }
  const payload = validateOpenMeteoPayload(env.payload);
  if (!payload.ok) return { hit: false, corrupt: true };
  return { hit: true, env: { stored_at_ms: env.stored_at_ms, payload: payload.data } };
}

// ── cached fetch ─────────────────────────────────────────────────────────────

export interface CachedFetchDeps {
  driver: KeyValueDriver;
  now_ms: number; // injected clock — nothing in src/ calls Date.now()
  ttl_ms: number;
  /** Optional gate on caching a SUCCESSFUL fetch (default: cache everything).
   *  backfillSession passes payloadHasData so an all-null not-yet-published
   *  archive day is returned but never cached — the next attempt refetches
   *  instead of being pinned to "no data" for the whole archive TTL. */
  should_cache?: (data: OpenMeteoResponse) => boolean;
  /** Optional gate on SERVING a cached payload (default: serve every hit).
   *  Returns false when the cached data cannot answer the CURRENT request —
   *  e.g. its hourly window does not span the session start being asked about.
   *  A non-covering hit is treated as a miss for BOTH the fresh path (falls
   *  through to the network) and the stale-if-offline path (a payload that
   *  cannot answer the question is not "better than nothing" — it is nothing
   *  dressed up as a healthy result). autoFillSession passes
   *  payloadCoversInstant(_, sessionStart). */
  covers?: (data: OpenMeteoResponse) => boolean;
}

export type CachedFetchResult =
  | { ok: true; data: OpenMeteoResponse; from: "network"; stale: false; cache_write_failed?: boolean; cache_corrupt?: true }
  | { ok: true; data: OpenMeteoResponse; from: "cache"; stale: false; age_ms: number; cache_corrupt?: true }
  | {
      ok: true;
      data: OpenMeteoResponse;
      from: "cache";
      stale: true; // expired entry served because the network failed — better than nothing
      age_ms: number;
      fetch_failure: FetchFailure;
      cache_corrupt?: true;
    }
  | ({ ok: false; cache_corrupt?: true } & FetchFailure);

/**
 * Cache-first fetch with stale-if-offline.
 *   1. read `entryKey`; on miss follow `latestKey` pointer (if given) to the
 *      most recent bucket — a COVERING hit (deps.covers) within TTL is served
 *      with NO network call; a hit that cannot answer the current request is
 *      a miss, never a silent shadow.
 *   2. otherwise run `doFetch`; success writes entry + pointer and returns.
 *   3. fetch failed but an EXPIRED covering entry exists → serve it with
 *      stale:true plus the fetch failure (caller surfaces "older weather").
 *   4. nothing cached → propagate the failure (offline is a normal result).
 */
export async function fetchWithCache(
  deps: CachedFetchDeps,
  entryKey: string,
  latestKey: string | undefined,
  doFetch: () => Promise<FetchWeatherResult>,
): Promise<CachedFetchResult> {
  const { driver, now_ms, ttl_ms } = deps;

  // A hit whose payload cannot answer the current request is a miss (the data
  // is not corrupt — it is just the wrong window; normal turnover overwrites it).
  const accept = (entry: ReadEntry): ReadEntry =>
    entry.hit && deps.covers !== undefined && !deps.covers(entry.env.payload)
      ? { hit: false, corrupt: false }
      : entry;

  let corruptSeen = false;
  let cached = accept(await readEntry(driver, entryKey));
  if (!cached.hit) {
    if (cached.corrupt) corruptSeen = true;
    if (latestKey !== undefined) {
      let pointed: string | null = null;
      try {
        pointed = await driver.getItem(latestKey);
      } catch {
        pointed = null;
      }
      if (typeof pointed === "string" && pointed !== "" && pointed !== entryKey) {
        cached = accept(await readEntry(driver, pointed));
        if (!cached.hit && cached.corrupt) corruptSeen = true;
      }
    }
  }

  // never-wipe visibility: a corrupt slot seen on ANY read this call is surfaced
  // on EVERY return path (success included), even when the pointer or a fresh
  // fetch rescues the read — silent rescue would hide repeating corruption.
  const corrupt = corruptSeen ? ({ cache_corrupt: true } as const) : ({} as const);

  if (cached.hit) {
    const age_ms = Math.max(0, now_ms - cached.env.stored_at_ms);
    if (age_ms <= ttl_ms) {
      return { ok: true, data: cached.env.payload, from: "cache", stale: false, age_ms, ...corrupt };
    }
  }

  const fetched = await doFetch();
  if (fetched.ok) {
    let cache_write_failed = false;
    if (deps.should_cache === undefined || deps.should_cache(fetched.data)) {
      try {
        const env: CacheEnvelope = { stored_at_ms: now_ms, payload: fetched.data };
        await driver.setItem(entryKey, JSON.stringify(env));
        if (latestKey !== undefined) await driver.setItem(latestKey, entryKey);
      } catch {
        cache_write_failed = true; // cache failure must never fail the fetch
      }
    }
    return cache_write_failed
      ? { ok: true, data: fetched.data, from: "network", stale: false, cache_write_failed: true, ...corrupt }
      : { ok: true, data: fetched.data, from: "network", stale: false, ...corrupt };
  }

  if (cached.hit) {
    const age_ms = Math.max(0, now_ms - cached.env.stored_at_ms);
    const { ok: _ok, ...failure } = fetched;
    return { ok: true, data: cached.env.payload, from: "cache", stale: true, age_ms, fetch_failure: failure, ...corrupt };
  }

  const { ok: _ok, ...failure } = fetched;
  return corruptSeen ? { ok: false, cache_corrupt: true, ...failure } : { ok: false, ...failure };
}
