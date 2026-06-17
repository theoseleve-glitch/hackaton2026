/**
 * racelab-weather test suite — assertion style mirrors packages/schema:
 * plain checks, console output, exit(1) on any failure.
 *
 * Fixtures are REAL Open-Meteo responses (one polite call per endpoint,
 * recorded 2026-06-11Z, Grenoble 45.18/5.72): 72 forecast hours with codes
 * 0/1/2/3/80, 24 archive hours (2026-06-01) with codes 0/1/2/3/51/53 and a
 * drizzly morning — every network test runs against a fake fetch.
 */

import {
  ARCHIVE_HOURLY,
  FORECAST_HOURLY,
  buildArchiveUrl,
  buildForecastUrl,
  fetchArchive,
  fetchForecast,
  fetchOpenMeteo,
  payloadHasData,
  payloadDayComplete,
  validateOpenMeteoPayload,
} from "./client";
import type { FetchLike, OpenMeteoResponse } from "./client";
import {
  deriveSkyForRow,
  mapArchiveResponse,
  mapForecastResponse,
  mapOpenMeteoHourly,
  offsetSuffix,
  payloadCoversInstant,
  skyFromWmoCode,
} from "./map";
import {
  DEFAULT_FORECAST_TTL_MS,
  archiveCacheKey,
  fetchWithCache,
  forecastCacheKey,
  forecastLatestKey,
  hourBucketUtc,
  INVALID_HOUR_BUCKET,
  roundCoord,
} from "./cache";
import type { KeyValueDriver } from "./cache";
import {
  MAX_AT_START_GAP_MS,
  applyManualOverride,
  autoFillSession,
  backfillSession,
  forecastWindow,
  pickConditions,
} from "./service";
import { hasExplicitOffset } from "../../schema/src/index";
import type { Gps, RunConditions, WeatherObservation } from "../../schema/src/index";
import forecastFixtureJson from "./fixtures/forecast-grenoble.json";
import archiveFixtureJson from "./fixtures/archive-grenoble.json";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function fatal(label: string): never {
  console.log(`✗ FATAL: ${label}`);
  process.exit(1);
}

const GPS: Gps = { lat: 45.18, lon: 5.72 };
const DAY = 86_400_000;
const MIN = 60_000;

// ── fakes ────────────────────────────────────────────────────────────────────

function memDriver(seed?: Record<string, string>): { driver: KeyValueDriver; store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    store,
    driver: {
      getItem: async (k) => store.get(k) ?? null,
      setItem: async (k, v) => {
        store.set(k, v);
      },
    },
  };
}

function countingFetch(payload: unknown): { fn: FetchLike; state: { calls: number; urls: string[] } } {
  const state = { calls: 0, urls: [] as string[] };
  const fn: FetchLike = async (url) => {
    state.calls++;
    state.urls.push(url);
    return { ok: true, status: 200, json: async () => payload };
  };
  return { fn, state };
}

const offlineFetch: FetchLike = async () => {
  throw new Error("ENETUNREACH");
};
const statusFetch = (status: number): FetchLike => async () => ({ ok: false, status, json: async () => ({}) });
const garbageJsonFetch: FetchLike = async () => ({
  ok: true,
  status: 200,
  json: async () => {
    throw new Error("invalid json");
  },
});

function synth(hourly: Record<string, unknown>, utc_offset_seconds = 0): OpenMeteoResponse {
  return { latitude: 45, longitude: 5, utc_offset_seconds, hourly } as unknown as OpenMeteoResponse;
}

// ═══ URL construction (exact-match contract) ═════════════════════════════════

console.log("\n— client: URL construction —");
{
  check(
    "buildForecastUrl with opts is the exact documented URL",
    buildForecastUrl(GPS, { past_days: 1, forecast_days: 2 }) ===
      "https://api.open-meteo.com/v1/forecast?latitude=45.18&longitude=5.72&hourly=temperature_2m,relative_humidity_2m,surface_pressure,precipitation,precipitation_probability,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code&timezone=UTC&past_days=1&forecast_days=2",
    buildForecastUrl(GPS, { past_days: 1, forecast_days: 2 }),
  );
  check(
    "buildForecastUrl without opts omits day params",
    buildForecastUrl(GPS) ===
      "https://api.open-meteo.com/v1/forecast?latitude=45.18&longitude=5.72&hourly=temperature_2m,relative_humidity_2m,surface_pressure,precipitation,precipitation_probability,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code&timezone=UTC",
  );
  check(
    "buildArchiveUrl is the exact documented URL",
    buildArchiveUrl(GPS, { start_date: "2026-06-01", end_date: "2026-06-01" }) ===
      "https://archive-api.open-meteo.com/v1/archive?latitude=45.18&longitude=5.72&start_date=2026-06-01&end_date=2026-06-01&hourly=temperature_2m,relative_humidity_2m,surface_pressure,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code&timezone=UTC",
    buildArchiveUrl(GPS, { start_date: "2026-06-01", end_date: "2026-06-01" }),
  );
  check("forecast hourly list includes precipitation_probability", FORECAST_HOURLY.includes("precipitation_probability"));
  check("archive hourly list EXCLUDES precipitation_probability", !ARCHIVE_HOURLY.includes("precipitation_probability"));
}

// ═══ payload validation ══════════════════════════════════════════════════════

console.log("\n— client: payload validation —");
const forecastChecked = validateOpenMeteoPayload(forecastFixtureJson);
const archiveChecked = validateOpenMeteoPayload(archiveFixtureJson);
if (!forecastChecked.ok || !archiveChecked.ok) fatal("real fixtures must validate");
const forecastFixture = forecastChecked.data;
const archiveFixture = archiveChecked.data;
{
  check("real forecast fixture validates (72 hourly rows)", forecastFixture.hourly.time.length === 72);
  check("real archive fixture validates (24 hourly rows)", archiveFixture.hourly.time.length === 24);
  check("non-object payload rejects", !validateOpenMeteoPayload("nope").ok);
  check("missing hourly block rejects", !validateOpenMeteoPayload({ latitude: 1 }).ok);
  check(
    "length mismatch rejects",
    !validateOpenMeteoPayload(synth({ time: ["2026-06-01T00:00"], temperature_2m: [1, 2] })).ok,
  );
  check(
    "string entry in a numeric array rejects",
    !validateOpenMeteoPayload(synth({ time: ["2026-06-01T00:00"], temperature_2m: ["warm"] })).ok,
  );
  check(
    "absent variable arrays are tolerated (archive has no probability)",
    validateOpenMeteoPayload(synth({ time: ["2026-06-01T00:00"], temperature_2m: [12] })).ok,
  );
  check(
    "NaN passes payload validation (typeof number) — row guard owns it",
    validateOpenMeteoPayload(synth({ time: ["2026-06-01T00:00"], temperature_2m: [NaN] })).ok,
  );
}

// ═══ fetch wrappers (discriminated, never throw) ═════════════════════════════

console.log("\n— client: fetch wrappers —");
{
  const { fn } = countingFetch(forecastFixtureJson);
  const ok = await fetchForecast(fn, GPS, { past_days: 1, forecast_days: 2 });
  check("fetchForecast happy path", ok.ok && ok.data.hourly.time.length === 72);
  const off = await fetchForecast(offlineFetch, GPS);
  check("offline → {ok:false, network_error} (normal case, no throw)", !off.ok && off.reason === "network_error");
  const st = await fetchOpenMeteo(statusFetch(429), "http://x");
  check("HTTP 429 → bad_status with status", !st.ok && st.reason === "bad_status" && st.status === 429);
  const gj = await fetchOpenMeteo(garbageJsonFetch, "http://x");
  check("unparseable json → bad_payload", !gj.ok && gj.reason === "bad_payload");
  const shape = await fetchOpenMeteo((async () => ({ ok: true, status: 200, json: async () => ({ nope: 1 }) })) as FetchLike, "http://x");
  check("wrong shape → bad_payload", !shape.ok && shape.reason === "bad_payload");
  // P2: a hung upstream must bound to network_error, not block the caller forever.
  const hangingFetch: FetchLike = () => new Promise(() => {});
  const to = await fetchOpenMeteo(hangingFetch, "http://x", 20);
  check("hung upstream → network_error within the timeout (no indefinite block)", !to.ok && to.reason === "network_error" && to.detail.includes("timed out"));
  const { fn: afn } = countingFetch(archiveFixtureJson);
  const aok = await fetchArchive(afn, GPS, { start_date: "2026-06-01", end_date: "2026-06-01" });
  check("fetchArchive happy path", aok.ok && aok.data.hourly.time.length === 24);
}

// ═══ WMO sky mapping ═════════════════════════════════════════════════════════

console.log("\n— map: WMO code → sky table —");
{
  const table: [number, string | undefined][] = [
    [0, "sunny"],
    [1, "sunny"],
    [2, "sunny"],
    [3, "cloudy"],
    [45, "cloudy"],
    [48, "cloudy"],
    [51, "raining"],
    [55, "raining"],
    [61, "raining"],
    [65, "raining"],
    [67, "raining"],
    [71, "raining"],
    [77, "raining"],
    [80, "raining"],
    [82, "raining"],
    [85, "raining"],
    [86, "raining"],
    [95, "raining"],
    [96, "raining"],
    [99, "raining"],
    [30, undefined], // sand/dust — not in Open-Meteo's set, maps to nothing
  ];
  for (const [code, want] of table) {
    check(`skyFromWmoCode(${code}) = ${String(want)}`, skyFromWmoCode(code) === want);
  }
  const base = { observed_at: "2026-06-01T10:00Z", source: "auto" as const };
  check("code 61 + 0 mm → raining (definite-precip code wins)", deriveSkyForRow(61, { ...base, precipitation_mm: 0 }) === "raining");
  check("precip 0.4 mm + clear-ish code 2 → raining (schema mm rule)", deriveSkyForRow(2, { ...base, precipitation_mm: 0.4 }) === "raining");
  check("probability 45% + code 1 → rain_risk (schema threshold)", deriveSkyForRow(1, { ...base, precipitation_mm: 0, precipitation_probability_pct: 45 }) === "rain_risk");
  check("cloud 80% beats clear code 1 → cloudy (cloud_cover authoritative)", deriveSkyForRow(1, { ...base, precipitation_mm: 0, cloud_cover_pct: 80 }) === "cloudy");
  check("no code + cloud 10% → sunny", deriveSkyForRow(undefined, { ...base, cloud_cover_pct: 10 }) === "sunny");
  check("code 3 + no numerics → cloudy (code fallback)", deriveSkyForRow(3, base) === "cloudy");
  check("fog 45 + cloud 10% → cloudy (fog code wins over numerics)", deriveSkyForRow(45, { ...base, cloud_cover_pct: 10 }) === "cloudy");
  check("nothing at all → undefined", deriveSkyForRow(undefined, base) === undefined);
}

// ═══ mapping: offsets ════════════════════════════════════════════════════════

console.log("\n— map: explicit-offset handling —");
{
  check("offsetSuffix(0) = Z", offsetSuffix(0) === "Z");
  check("offsetSuffix(7200) = +02:00", offsetSuffix(7200) === "+02:00");
  check("offsetSuffix(-12600) = -03:30", offsetSuffix(-12600) === "-03:30");

  const plus2 = mapOpenMeteoHourly(synth({ time: ["2026-06-01T12:00"], temperature_2m: [20] }, 7200), "auto");
  check("non-zero payload offset appended as +02:00", plus2.observations[0]?.observed_at === "2026-06-01T12:00+02:00");
  check(
    "+02:00 wall-clock parses to the right UTC instant",
    Date.parse(plus2.observations[0]?.observed_at ?? "") === Date.parse("2026-06-01T10:00:00.000Z"),
  );
  const utc = mapOpenMeteoHourly(synth({ time: ["2026-06-01T12:00"], temperature_2m: [20] }), "auto");
  check("UTC payload gets Z appended", utc.observations[0]?.observed_at === "2026-06-01T12:00Z");
  check("mapped observed_at satisfies schema hasExplicitOffset", hasExplicitOffset(utc.observations[0]?.observed_at ?? ""));
  const pre = mapOpenMeteoHourly(synth({ time: ["2026-06-01T12:00Z"], temperature_2m: [20] }), "auto");
  check("already-explicit time is kept verbatim", pre.observations[0]?.observed_at === "2026-06-01T12:00Z");
}

// ═══ mapping: rows, rejection, clamps ════════════════════════════════════════

console.log("\n— map: row mapping + rejection —");
{
  const nan = mapOpenMeteoHourly(
    synth({ time: ["2026-06-01T00:00", "2026-06-01T01:00"], temperature_2m: [15, NaN] }),
    "auto",
  );
  check("NaN row is rejected with non_finite_numeric", nan.rejected.length === 1 && nan.rejected[0].reason === "non_finite_numeric");
  check("NaN rejection carries the row index + raw time", nan.rejected[0].index === 1 && nan.rejected[0].time === "2026-06-01T01:00");
  check("sibling row still maps", nan.observations.length === 1 && nan.observations[0].air_temp_c === 15);

  const badTime = mapOpenMeteoHourly(synth({ time: ["not-a-time"], temperature_2m: [10] }), "auto");
  check("garbage time row → invalid_timestamp", badTime.rejected[0]?.reason === "invalid_timestamp" && badTime.observations.length === 0);

  const nulls = mapOpenMeteoHourly(
    synth({ time: ["2026-06-01T00:00"], temperature_2m: [null], cloud_cover: [50] }),
    "auto",
  );
  check("null field is omitted, not zeroed", nulls.observations[0]?.air_temp_c === undefined);
  check("non-null sibling fields survive", nulls.observations[0]?.cloud_cover_pct === 50 && nulls.observations[0]?.sky === "sunny");

  const empty = mapOpenMeteoHourly(
    synth({ time: ["2026-06-01T00:00"], temperature_2m: [null], weather_code: [null] }),
    "backfill",
  );
  check("all-null archive hour → empty_row rejection (reported, not dropped)", empty.rejected[0]?.reason === "empty_row" && empty.observations.length === 0);

  const codeOnly = mapOpenMeteoHourly(synth({ time: ["2026-06-01T00:00"], weather_code: [3] }), "backfill");
  check("weather_code-only row still yields a sky observation", codeOnly.observations[0]?.sky === "cloudy");

  const clamp = mapOpenMeteoHourly(
    synth({
      time: ["2026-06-01T00:00"],
      relative_humidity_2m: [150],
      wind_speed_10m: [-5],
      wind_direction_10m: [450],
    }),
    "auto",
  );
  const c0 = clamp.observations[0];
  check("schema clamps apply: humidity 150→100, wind -5→0, dir 450→90", c0?.humidity_pct === 100 && c0?.wind_speed_kmh === 0 && c0?.wind_dir_deg === 90);
  check("mapped observations are frozen", Object.isFrozen(c0));
}

console.log("\n— map: real fixtures —");
{
  const fc = mapForecastResponse(forecastFixture);
  check("forecast fixture: 72 observations, 0 rejected", fc.observations.length === 72 && fc.rejected.length === 0);
  check("forecast source is auto on every row", fc.observations.every((o) => o.source === "auto"));
  check("first observed_at = 2026-06-10T00:00Z", fc.observations[0].observed_at === "2026-06-10T00:00Z");
  const o12 = fc.observations[12]; // 2026-06-10T12:00 — 21°C / 33% / 992.3 hPa / wind 19.1 @ 314 / cloud 87 / code 2
  check(
    "row 12 maps every field (incl. surface_pressure→pressure_hpa, the station-level Patm)",
    o12.air_temp_c === 21 &&
      o12.humidity_pct === 33 &&
      o12.pressure_hpa === 992.3 &&
      o12.wind_speed_kmh === 19.1 &&
      o12.wind_dir_deg === 314 &&
      o12.precipitation_mm === 0 &&
      o12.precipitation_probability_pct === 0 &&
      o12.cloud_cover_pct === 87,
  );
  check("row 12: cloud 87% beats partly-cloudy code 2 → cloudy", o12.sky === "cloudy");
  check("row 1: shower code 80 → raining despite 0 mm", fc.observations[1].sky === "raining");
  check("row 0: overcast code 3 + cloud 100 → cloudy", fc.observations[0].sky === "cloudy");

  const ar = mapArchiveResponse(archiveFixture);
  check("archive fixture: 24 observations, 0 rejected", ar.observations.length === 24 && ar.rejected.length === 0);
  check("archive source is backfill on every row", ar.observations.every((o) => o.source === "backfill"));
  check("archive has NO precipitation_probability anywhere (forecast-only variable)", ar.observations.every((o) => o.precipitation_probability_pct === undefined));
  check("archive 00:00: drizzle code 51 + 0.1 mm → raining", ar.observations[0].sky === "raining");
  check("archive 13:00: code 1 + cloud 40 → sunny", ar.observations[13].sky === "sunny" && ar.observations[13].air_temp_c === 27);
}

// ═══ window coverage (the cache-serving guard) ═══════════════════════════════

console.log("\n— map: payloadCoversInstant —");
{
  // forecast fixture spans 2026-06-10T00:00Z .. 2026-06-12T23:00Z (72 hourly rows)
  check("instant inside the window → true", payloadCoversInstant(forecastFixture, Date.parse("2026-06-11T10:30:00Z")));
  check("instant before the first row → false", !payloadCoversInstant(forecastFixture, Date.parse("2026-06-09T23:59:00Z")));
  check("instant after the last row → false", !payloadCoversInstant(forecastFixture, Date.parse("2026-06-13T00:00:00Z")));
  check(
    "bounds are inclusive",
    payloadCoversInstant(forecastFixture, Date.parse("2026-06-10T00:00:00Z")) &&
      payloadCoversInstant(forecastFixture, Date.parse("2026-06-12T23:00:00Z")),
  );
  check(
    "non-zero payload offset is honored (+02:00 wall-clock = 10:00Z)",
    payloadCoversInstant(synth({ time: ["2026-06-01T12:00"], temperature_2m: [20] }, 7200), Date.parse("2026-06-01T10:00:00Z")) &&
      !payloadCoversInstant(synth({ time: ["2026-06-01T12:00"], temperature_2m: [20] }, 7200), Date.parse("2026-06-01T12:00:00Z")),
  );
  check("empty hourly window → false", !payloadCoversInstant(synth({ time: [] }), Date.parse("2026-06-11T10:30:00Z")));
  check("unparseable time bounds → false", !payloadCoversInstant(synth({ time: ["not-a-time"], temperature_2m: [1] }), Date.parse("2026-06-11T10:30:00Z")));
  check("non-finite instant → false", !payloadCoversInstant(forecastFixture, NaN));
}

// ═══ cache ═══════════════════════════════════════════════════════════════════

console.log("\n— cache: keys —");
const T_NOW = Date.parse("2026-06-11T10:30:00.000Z");
{
  check("roundCoord 2dp", roundCoord(45.18444) === "45.18" && roundCoord(5.726) === "5.73");
  check("roundCoord normalizes -0", roundCoord(-0.004) === "0.00");
  check("hourBucketUtc", hourBucketUtc(T_NOW) === "2026-06-11T10");
  // FIX 3: hourBucketUtc is an exported helper — new Date(NaN).toISOString()
  // throws RangeError, which would violate never-throw across the boundary.
  // A non-finite clock must yield a harmless sentinel (cache miss), not a throw.
  {
    let threwNaN = false;
    let bucketNaN = "";
    try {
      bucketNaN = hourBucketUtc(NaN);
    } catch {
      threwNaN = true;
    }
    check("hourBucketUtc(NaN) does not throw and returns the sentinel", !threwNaN && bucketNaN === INVALID_HOUR_BUCKET);
    let threwInf = false;
    try {
      check("hourBucketUtc(Infinity) → sentinel", hourBucketUtc(Infinity) === INVALID_HOUR_BUCKET);
      check("hourBucketUtc(-Infinity) → sentinel", hourBucketUtc(-Infinity) === INVALID_HOUR_BUCKET);
    } catch {
      threwInf = true;
    }
    check("hourBucketUtc(±Infinity) never throws", !threwInf);
    // the sentinel key is a guaranteed miss — no real payload ever lands there
    check("forecastCacheKey on a non-finite clock is the sentinel-bucket miss key", forecastCacheKey(GPS, NaN) === "weather:fc:45.18,5.72:invalid");
  }
  check("forecastCacheKey = rounded gps + hour bucket", forecastCacheKey(GPS, T_NOW) === "weather:fc:45.18,5.72:2026-06-11T10");
  check("forecastLatestKey is stable per cell", forecastLatestKey(GPS) === "weather:fc:45.18,5.72:latest");
  check(
    "archiveCacheKey = rounded gps + date range",
    archiveCacheKey(GPS, { start_date: "2026-06-01", end_date: "2026-06-01" }) === "weather:ar:45.18,5.72:2026-06-01..2026-06-01",
  );
}

console.log("\n— cache: TTL + stale-if-offline —");
{
  const { driver, store } = memDriver();
  const { fn, state } = countingFetch(forecastFixtureJson);
  const ttl = DEFAULT_FORECAST_TTL_MS; // 30 min
  const key = (ms: number) => forecastCacheKey(GPS, ms);
  const latest = forecastLatestKey(GPS);
  const doFetch = (f: FetchLike) => () => fetchOpenMeteo(f, buildForecastUrl(GPS));

  const r1 = await fetchWithCache({ driver, now_ms: T_NOW, ttl_ms: ttl }, key(T_NOW), latest, doFetch(fn));
  check("cold cache → network", r1.ok && r1.from === "network" && state.calls === 1);
  check("entry + latest pointer written", store.has(key(T_NOW)) && store.get(latest) === key(T_NOW));

  const r2 = await fetchWithCache({ driver, now_ms: T_NOW + 5 * MIN, ttl_ms: ttl }, key(T_NOW + 5 * MIN), latest, doFetch(fn));
  check("5 min later (same bucket) → fresh cache, NO network call", r2.ok && r2.from === "cache" && !r2.stale && state.calls === 1);

  const r3 = await fetchWithCache({ driver, now_ms: T_NOW + 45 * MIN, ttl_ms: 60 * MIN }, key(T_NOW + 45 * MIN), latest, doFetch(fn));
  check(
    "45 min later, NEXT hour bucket, 60-min TTL → pointer chase finds fresh entry, no network",
    r3.ok && r3.from === "cache" && !r3.stale && (r3.from === "cache" ? r3.age_ms === 45 * MIN : false) && state.calls === 1,
  );

  const r4 = await fetchWithCache({ driver, now_ms: T_NOW + 31 * MIN, ttl_ms: ttl }, key(T_NOW + 31 * MIN), latest, doFetch(fn));
  check("31 min later (> TTL) and online → refetch", r4.ok && r4.from === "network" && state.calls === 2);
  check("refetch rewrote entry + pointer to the new bucket", store.get(latest) === key(T_NOW + 31 * MIN));

  const t5 = T_NOW + 5 * 60 * MIN;
  const r5 = await fetchWithCache({ driver, now_ms: t5, ttl_ms: ttl }, key(t5), latest, doFetch(offlineFetch));
  check(
    "5 h later OFFLINE → expired entry served stale (stale-if-offline beats nothing trackside)",
    r5.ok && r5.from === "cache" && r5.stale === true,
  );
  check(
    "stale result reports age + the fetch failure",
    r5.ok && r5.from === "cache" && r5.stale && r5.age_ms === t5 - (T_NOW + 31 * MIN) && r5.fetch_failure.reason === "network_error",
  );

  const empty = memDriver();
  const r6 = await fetchWithCache({ driver: empty.driver, now_ms: T_NOW, ttl_ms: ttl }, key(T_NOW), latest, doFetch(offlineFetch));
  check("no cache + offline → {ok:false, network_error}", !r6.ok && r6.reason === "network_error");

  const corrupt = memDriver({ [key(T_NOW)]: "{not json" });
  const r7 = await fetchWithCache({ driver: corrupt.driver, now_ms: T_NOW, ttl_ms: ttl }, key(T_NOW), latest, doFetch(offlineFetch));
  check("corrupt entry + offline → failure flags cache_corrupt (reported, never deleted)", !r7.ok && r7.cache_corrupt === true && corrupt.store.get(key(T_NOW)) === "{not json");
  const { fn: fn2 } = countingFetch(forecastFixtureJson);
  const r8 = await fetchWithCache({ driver: corrupt.driver, now_ms: T_NOW, ttl_ms: ttl }, key(T_NOW), latest, doFetch(fn2));
  check("corrupt entry + online → network result, slot healed by overwrite", r8.ok && r8.from === "network" && corrupt.store.get(key(T_NOW)) !== "{not json");

  const badDriver: KeyValueDriver = {
    getItem: async () => null,
    setItem: async () => {
      throw new Error("disk full");
    },
  };
  const { fn: fn3 } = countingFetch(forecastFixtureJson);
  const r9 = await fetchWithCache({ driver: badDriver, now_ms: T_NOW, ttl_ms: ttl }, key(T_NOW), latest, doFetch(fn3));
  check("cache write failure never fails the fetch", r9.ok && r9.from === "network" && r9.stale === false && r9.cache_write_failed === true);

  // FIX 2: a corrupt PRIMARY entry rescued by the pointer (or a fresh fetch) was
  // silently swallowed — the {ok:true} result dropped corruptSeen, hiding the
  // unreadable slot. cache_corrupt must now ride EVERY return path (never-wipe
  // visibility). Set up: valid envelope at an OLD bucket the pointer references,
  // corrupt blob at the CURRENT bucket that the read tries first.
  {
    // old entry sits in the PREVIOUS hour bucket (≠ current key, so the pointer
    // chase actually runs); a 60-min TTL keeps the 40-min-old entry fresh.
    const ptrTtl = 60 * MIN;
    const oldMs = T_NOW - 40 * MIN;
    const oldKey = key(oldMs);
    check("pointer-rescue setup: old bucket differs from the current bucket", oldKey !== key(T_NOW));
    const goodEnv = JSON.stringify({ stored_at_ms: oldMs, payload: forecastFixtureJson });
    const seeded = memDriver({ [oldKey]: goodEnv, [latest]: oldKey, [key(T_NOW)]: "{not json" });
    const rPtr = await fetchWithCache({ driver: seeded.driver, now_ms: T_NOW, ttl_ms: ptrTtl }, key(T_NOW), latest, doFetch(offlineFetch));
    check(
      "corrupt primary rescued by pointer still flags cache_corrupt on the {ok:true} cache hit",
      rPtr.ok && rPtr.from === "cache" && !rPtr.stale && rPtr.cache_corrupt === true,
    );
    check("corrupt primary slot is preserved, never deleted (never-wipe)", seeded.store.get(key(T_NOW)) === "{not json");

    // corrupt primary + NO covering pointer + online → fresh fetch rescues, but
    // the {ok:true} network result must still surface that the slot was corrupt.
    const seeded2 = memDriver({ [key(T_NOW)]: "{not json" });
    const { fn: fnFix } = countingFetch(forecastFixtureJson);
    const rNet = await fetchWithCache({ driver: seeded2.driver, now_ms: T_NOW, ttl_ms: ttl }, key(T_NOW), latest, doFetch(fnFix));
    check(
      "corrupt primary rescued by a fresh fetch still flags cache_corrupt on the network result",
      rNet.ok && rNet.from === "network" && rNet.cache_corrupt === true,
    );

    // sanity: a clean read carries NO cache_corrupt flag (no false positives)
    const cleanSeed = memDriver({ [oldKey]: goodEnv, [latest]: oldKey });
    const rClean = await fetchWithCache({ driver: cleanSeed.driver, now_ms: T_NOW, ttl_ms: ptrTtl }, key(T_NOW), latest, doFetch(offlineFetch));
    check("clean pointer hit has no cache_corrupt flag (no false positive)", rClean.ok && rClean.from === "cache" && !rClean.stale && rClean.cache_corrupt === undefined);
  }
}

console.log("\n— cache: covers predicate (request-window guard) —");
{
  const { driver } = memDriver();
  const { fn, state } = countingFetch(forecastFixtureJson);
  const ttl = DEFAULT_FORECAST_TTL_MS;
  const key = forecastCacheKey(GPS, T_NOW);
  const latest = forecastLatestKey(GPS);
  const doFetch = (f: FetchLike) => () => fetchOpenMeteo(f, buildForecastUrl(GPS));

  const warm = await fetchWithCache({ driver, now_ms: T_NOW, ttl_ms: ttl }, key, latest, doFetch(fn));
  check("warm-up writes the entry", warm.ok && warm.from === "network" && state.calls === 1);

  const hit = await fetchWithCache({ driver, now_ms: T_NOW + MIN, ttl_ms: ttl, covers: () => true }, key, latest, doFetch(fn));
  check("covering fresh entry serves from cache", hit.ok && hit.from === "cache" && !hit.stale && state.calls === 1);

  const miss = await fetchWithCache({ driver, now_ms: T_NOW + MIN, ttl_ms: ttl, covers: () => false }, key, latest, doFetch(fn));
  check("non-covering fresh entry is a MISS → network refetch", miss.ok && miss.from === "network" && state.calls === 2);

  const offline = await fetchWithCache({ driver, now_ms: T_NOW + MIN, ttl_ms: ttl, covers: () => false }, key, latest, doFetch(offlineFetch));
  check(
    "non-covering entry never serves stale either → failure propagates (no healthy-looking wrong-window data)",
    !offline.ok && offline.reason === "network_error",
  );

  const staleCovered = await fetchWithCache({ driver, now_ms: T_NOW + 5 * 60 * MIN, ttl_ms: ttl, covers: () => true }, forecastCacheKey(GPS, T_NOW + 5 * 60 * MIN), latest, doFetch(offlineFetch));
  check("covering expired entry still serves stale-if-offline", staleCovered.ok && staleCovered.from === "cache" && staleCovered.stale === true);
}

// ═══ service: autoFillSession ════════════════════════════════════════════════

console.log("\n— service: autoFillSession —");
{
  const { driver, store } = memDriver();
  const { fn, state } = countingFetch(forecastFixtureJson);
  const deps = { fetchFn: fn, driver, now_ms: T_NOW };
  const sessionStart = "2026-06-11T09:30:00.000Z";

  const r = await autoFillSession(deps, GPS, sessionStart);
  if (!r.ok) fatal("autoFillSession happy path failed");
  check("happy path: 72 observations, none rejected, from network", r.observations.length === 72 && r.rejected_rows.length === 0 && r.from === "network");
  check("requested window: past_days=1&forecast_days=2 for a start 1 h ago", state.urls[0].includes("&past_days=1&forecast_days=2"));
  check("at_start = hourly observation at-or-before 09:30 → 09:00Z", r.at_start?.observed_at === "2026-06-11T09:00Z");
  check(
    "at_start carries the full atmosphere (19.7°C / 38% / 996.5 hPa Patm / cloudy)",
    r.at_start?.air_temp_c === 19.7 && r.at_start?.humidity_pct === 38 && r.at_start?.pressure_hpa === 996.5 && r.at_start?.sky === "cloudy",
  );
  check("at_start.source is auto", r.at_start?.source === "auto");

  const r2 = await autoFillSession(deps, GPS, sessionStart);
  check("second call inside TTL → cache, no second network call", r2.ok && r2.from === "cache" && !r2.stale && state.calls === 1);
  check("fresh cache hit reports its age (age_ms = 0 at the same instant)", r2.ok && r2.age_ms === 0 && r2.fetch_failure === undefined);

  const later = { fetchFn: offlineFetch, driver, now_ms: T_NOW + 2 * 60 * MIN };
  const r3 = await autoFillSession(later, GPS, "2026-06-11T11:30:00.000Z");
  if (!r3.ok) fatal("stale-if-offline through the service failed");
  check("2 h later offline → stale cache served end-to-end", r3.from === "cache" && r3.stale === true);
  check("stale data still resolves at_start for a later run (11:00Z)", r3.at_start?.observed_at === "2026-06-11T11:00Z" && r3.at_start?.air_temp_c === 22.2);
  check(
    "stale result surfaces age_ms + the fetch failure (app can size the lie: '2 h old, offline')",
    r3.age_ms === 2 * 60 * MIN && r3.fetch_failure?.reason === "network_error",
  );

  const fresh = memDriver();
  const r4 = await autoFillSession({ fetchFn: offlineFetch, driver: fresh.driver, now_ms: T_NOW }, GPS, sessionStart);
  check("offline, nothing cached → {ok:false, network_error} (log conditions by hand)", !r4.ok && r4.reason === "network_error");

  const r5 = await autoFillSession(deps, { lat: 123, lon: 5 }, sessionStart);
  check("gps out of range → invalid_input", !r5.ok && r5.reason === "invalid_input");
  const r6 = await autoFillSession(deps, GPS, "yesterday-ish");
  check("unparseable session start → invalid_input", !r6.ok && r6.reason === "invalid_input");
  const r7 = await autoFillSession({ fetchFn: fn, driver, now_ms: NaN }, GPS, sessionStart);
  check("NaN now_ms → invalid_input, never a raw throw", !r7.ok && r7.reason === "invalid_input");
  const r8 = await autoFillSession({ fetchFn: fn, driver, now_ms: Infinity }, GPS, sessionStart);
  check("Infinity now_ms → invalid_input", !r8.ok && r8.reason === "invalid_input");

  check("forecastWindow: start 3 days back → past_days 3", forecastWindow(T_NOW, T_NOW - 3 * DAY).past_days === 3);
  check("forecastWindow: start 5 days ahead → forecast_days 6", forecastWindow(T_NOW, T_NOW + 5 * DAY).forecast_days === 6);
  check("forecastWindow: start ≈ now → {1, 2}", forecastWindow(T_NOW, T_NOW).past_days === 1 && forecastWindow(T_NOW, T_NOW).forecast_days === 2);
  check("forecastWindow caps at API limits (92 / 16)", forecastWindow(T_NOW, T_NOW - 500 * DAY).past_days === 92 && forecastWindow(T_NOW, T_NOW + 500 * DAY).forecast_days === 16);
  void store;
}

// ═══ service: a narrow cached window must never shadow a backdated request ════

console.log("\n— service: cache coverage vs backdated sessions —");
{
  const { driver } = memDriver();
  const { fn, state } = countingFetch(forecastFixtureJson);

  // 1) narrow warm-up: session 1 h ago → past_days=1 payload lands in the bucket
  const r1 = await autoFillSession({ fetchFn: fn, driver, now_ms: T_NOW }, GPS, "2026-06-11T09:30:00.000Z");
  check("narrow warm-up: network with past_days=1", r1.ok && r1.from === "network" && state.calls === 1 && state.urls[0].includes("&past_days=1&"));

  // wide payload the API would return for a 3-weeks-back request:
  // hourly rows 2026-05-21T00:00 .. 2026-06-11T23:00 (22 days)
  const wideTimes: string[] = [];
  const wideTemps: number[] = [];
  const wideStart = Date.parse("2026-05-21T00:00:00Z");
  for (let i = 0; i < 22 * 24; i++) {
    wideTimes.push(new Date(wideStart + i * 60 * MIN).toISOString().slice(0, 16));
    wideTemps.push(15);
  }
  const widePayload = synth({ time: wideTimes, temperature_2m: wideTemps });
  const { fn: wideFn, state: wideState } = countingFetch(widePayload);

  // 2) one minute later, SAME hour bucket: session 3 weeks back. Before the
  //    coverage guard this returned the narrow cache (from:"cache", no at_start,
  //    zero network calls) — a healthy-looking answer to a different question.
  const r2 = await autoFillSession({ fetchFn: wideFn, driver, now_ms: T_NOW + MIN }, GPS, "2026-05-22T09:30:00.000Z");
  if (!r2.ok) fatal("backdated auto-fill failed");
  check("backdated session in the same bucket → NETWORK, not the narrow cache", r2.from === "network" && wideState.calls === 1);
  check("backdated request actually asks for the wide window (past_days=21)", wideState.urls[0].includes("&past_days=21&"));
  check("at_start resolves inside the wide payload (2026-05-22T09:00Z)", r2.at_start?.observed_at === "2026-05-22T09:00Z" && r2.at_start?.air_temp_c === 15);

  // 3) the wide payload overwrote the bucket and COVERS the narrow question →
  //    a repeat of the narrow request now serves from cache, even offline
  const r3 = await autoFillSession({ fetchFn: offlineFetch, driver, now_ms: T_NOW + 2 * MIN }, GPS, "2026-06-11T09:30:00.000Z");
  check("wide cached payload still answers the narrow request from cache", r3.ok && r3.from === "cache" && !r3.stale && r3.at_start?.observed_at === "2026-06-11T09:00Z");

  // 4) offline + cached payload that does NOT cover the asked start → honest
  //    failure instead of wrong-window data served as stale-but-ok
  const r4 = await autoFillSession({ fetchFn: offlineFetch, driver, now_ms: T_NOW + 3 * MIN }, GPS, "2026-04-01T10:00:00.000Z");
  check("offline + non-covering cache → {ok:false, network_error} (no fake coverage)", !r4.ok && r4.reason === "network_error");
}

// ═══ service: at_start max-gap guard ══════════════════════════════════════════

console.log("\n— service: at_start gap guard —");
{
  check("MAX_AT_START_GAP_MS is 3 h (hourly data + a little slack)", MAX_AT_START_GAP_MS === 3 * 60 * MIN);

  // payload COVERS the start (03:00 .. 12:00) but the rows around the start are
  // dataless → nearest at-or-before observation is 6.5 h old: not "at start".
  const gappy = synth({
    time: ["2026-06-11T03:00", "2026-06-11T09:00", "2026-06-11T12:00"],
    temperature_2m: [10, null, 12],
  });
  const { driver } = memDriver();
  const { fn } = countingFetch(gappy);
  const r = await autoFillSession({ fetchFn: fn, driver, now_ms: T_NOW }, GPS, "2026-06-11T09:30:00.000Z");
  if (!r.ok) fatal("gap-guard auto-fill failed");
  check("observation 6.5 h before the start is NOT presented as at_start", r.at_start === undefined);
  check(
    "observations + empty-row rejection still fully reported",
    r.observations.length === 2 && r.rejected_rows.length === 1 && r.rejected_rows[0].reason === "empty_row",
  );
  check("pickConditions itself stays schema at-or-before (the guard is service-level)", pickConditions(r.observations, "2026-06-11T09:30:00.000Z")?.observed_at === "2026-06-11T03:00Z");
}

// ═══ service: backfillSession (offline-logged session, archive after the fact) ═

console.log("\n— service: backfillSession —");
{
  const { driver } = memDriver();
  const { fn, state } = countingFetch(archiveFixtureJson);
  const deps = { fetchFn: fn, driver, now_ms: T_NOW };

  const r = await backfillSession(deps, GPS, "2026-06-01");
  if (!r.ok) fatal("backfillSession happy path failed");
  check("happy path: 24 archive observations, none rejected", r.observations.length === 24 && r.rejected_rows.length === 0);
  check("requested URL is the archive endpoint with the day range", state.urls[0].startsWith("https://archive-api.open-meteo.com/v1/archive?") && state.urls[0].includes("&start_date=2026-06-01&end_date=2026-06-01"));
  check("every backfilled observation is source backfill", r.observations.every((o) => o.source === "backfill"));

  const at = pickConditions(r.observations, "2026-06-01T13:37:00.000Z");
  check("pickConditions(13:37) → 13:00Z row (schema weatherAtTime)", at?.observed_at === "2026-06-01T13:00Z");
  check("backfilled run gets 27°C / 989.7 hPa / sunny", at?.air_temp_c === 27 && at?.pressure_hpa === 989.7 && at?.sky === "sunny");
  check("pickConditions before the first row → undefined (no fabrication)", pickConditions(r.observations, "2026-05-31T23:59:00.000Z") === undefined);
  check("drizzly 00:00 row reads raining", pickConditions(r.observations, "2026-06-01T00:10:00.000Z")?.sky === "raining");

  const r2 = await backfillSession(deps, GPS, "2026-06-01");
  check("same-day backfill is cached (archive is immutable)", r2.ok && r2.from === "cache" && state.calls === 1);

  const r3 = await backfillSession(deps, GPS, "06/01/2026");
  check("non-ISO date → invalid_input", !r3.ok && r3.reason === "invalid_input");

  // archive ~5-day publication delay: an all-null day must come back empty but NEVER be cached
  const nullDay = synth({
    time: Array.from({ length: 24 }, (_, i) => `2026-06-10T${String(i).padStart(2, "0")}:00`),
    temperature_2m: Array.from({ length: 24 }, () => null),
    weather_code: Array.from({ length: 24 }, () => null),
  });
  check("payloadHasData: false for an all-null day, true for the real archive", !payloadHasData(nullDay) && payloadHasData(archiveFixture));
  const nd = memDriver();
  const { fn: nfn, state: nstate } = countingFetch(nullDay);
  const r4 = await backfillSession({ fetchFn: nfn, driver: nd.driver, now_ms: T_NOW }, GPS, "2026-06-10");
  check(
    "not-yet-published day → ok with 0 observations, 24 empty_row rejections",
    r4.ok && r4.observations.length === 0 && r4.rejected_rows.length === 24 && r4.rejected_rows.every((x) => x.reason === "empty_row"),
  );
  check("dataless day is NOT cached (no 30-day 'no data' pin)", nd.store.size === 0);
  const r5 = await backfillSession({ fetchFn: nfn, driver: nd.driver, now_ms: T_NOW + 2 * DAY }, GPS, "2026-06-10");
  check("retry later refetches instead of hitting a poisoned cache", r5.ok && nstate.calls === 2);

  // FIX 1: a PARTIALLY-published day (the archive fills hour-by-hour at the ~5-day
  // boundary) — first 12 hours have data, last 12 are still null. payloadHasData
  // is TRUE for this block, so the old gate cached it for the 30-day archive TTL
  // and PERMANENTLY lost the 12 hours that publish a day later. The complete-day
  // gate must return the partial day to the caller but refuse to cache it, then
  // cache it for good once the whole block is published.
  const partialDay = synth({
    time: Array.from({ length: 24 }, (_, i) => `2026-06-09T${String(i).padStart(2, "0")}:00`),
    temperature_2m: Array.from({ length: 24 }, (_, i) => (i < 12 ? 18 + i * 0.1 : null)),
    weather_code: Array.from({ length: 24 }, (_, i) => (i < 12 ? 1 : null)),
  });
  check("payloadHasData TRUE but payloadDayComplete FALSE for a half-published day", payloadHasData(partialDay) && !payloadDayComplete(partialDay));
  check("payloadDayComplete TRUE for a gap-free real archive day", payloadDayComplete(archiveFixture));
  const pd = memDriver();
  const { fn: pfn, state: pstate } = countingFetch(partialDay);
  const rp = await backfillSession({ fetchFn: pfn, driver: pd.driver, now_ms: T_NOW }, GPS, "2026-06-09");
  check(
    "partial day → ok, 12 observations returned, 12 empty_row rejections (data still surfaced)",
    rp.ok && rp.observations.length === 12 && rp.rejected_rows.length === 12 && rp.rejected_rows.every((x) => x.reason === "empty_row"),
  );
  check("partial day is NOT cached (would permanently lose the unpublished hours)", pd.store.size === 0);
  const rp2 = await backfillSession({ fetchFn: pfn, driver: pd.driver, now_ms: T_NOW + DAY }, GPS, "2026-06-09");
  check("once-partial day re-fetches on retry rather than serving the gappy cache", rp2.ok && pstate.calls === 2);

  // and once the full day publishes, it IS cached for good
  const cd = memDriver();
  const { fn: cfn, state: cstate } = countingFetch(archiveFixtureJson);
  const rc1 = await backfillSession({ fetchFn: cfn, driver: cd.driver, now_ms: T_NOW }, GPS, "2026-06-01");
  check("complete day → cached", rc1.ok && cd.store.size === 1);
  const rc2 = await backfillSession({ fetchFn: cfn, driver: cd.driver, now_ms: T_NOW + DAY }, GPS, "2026-06-01");
  check("complete day served from cache on retry (no refetch)", rc2.ok && rc2.from === "cache" && cstate.calls === 1);
}

// ═══ service: manual override (schema resolveConditions wiring) ══════════════

console.log("\n— service: applyManualOverride —");
{
  const auto: WeatherObservation = {
    observed_at: "2026-06-11T09:00Z",
    source: "auto",
    air_temp_c: 19.7,
    humidity_pct: 38,
    sky: "cloudy",
    pressure_hpa: 996.5,
  };
  const manual: RunConditions = { grip: "medium", sky: "sunny", track_temp_c: 41 };
  const resolved = applyManualOverride(auto, manual);
  check("driver's sky WINS over auto", resolved.conditions.sky === "sunny");
  check("blank temp + humidity auto-fill from the observation", resolved.conditions.air_temp_c === 19.7 && resolved.conditions.humidity_pct === 38);
  check("driver-observed fields pass through untouched", resolved.conditions.grip === "medium" && resolved.conditions.track_temp_c === 41);
  check(
    "provenance: auto_filled = [air_temp_c, humidity_pct], overridden = [sky]",
    resolved.provenance.auto_filled.length === 2 &&
      resolved.provenance.auto_filled.includes("air_temp_c") &&
      resolved.provenance.auto_filled.includes("humidity_pct") &&
      resolved.provenance.overridden.length === 1 &&
      resolved.provenance.overridden[0] === "sky",
  );
  const noAuto = applyManualOverride(undefined, manual);
  check(
    "no observation → manual passthrough, empty provenance",
    noAuto.conditions.sky === "sunny" && noAuto.provenance.auto_filled.length === 0 && noAuto.provenance.overridden.length === 0,
  );
}

// ═══ verdict ═════════════════════════════════════════════════════════════════

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("all weather checks passed");
