/**
 * Shared vocabulary — Theo's run-schema unions absorbed VERBATIM (same names,
 * same literals) so his branch merges by re-pointing imports, never renaming.
 *
 * Every union derives from an exported `as const` array: ONE source for the
 * type, the load-path validators (parse.ts), and UI pickers (promotes the
 * persist.ts SURFACES pattern from packages/sessions).
 *
 * Also hosts the package-internal guard/clamp/freeze helpers — pure, zero I/O.
 */

/** ISO-8601 datetime string, e.g. "2026-06-11T14:03:00.000Z". The ONLY time format in the package. */
export type IsoDateTime = string;
/** ISO-8601 date string "YYYY-MM-DD" (track records, profile facts). */
export type IsoDate = string;

export type Rating1to5 = 1 | 2 | 3 | 4 | 5;
export type Rating1to10 = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** Same literal union as packages/engine Confidence — declared locally so schema has zero deps. */
export type Confidence = "high" | "medium" | "low";

// ── Theo's vocabulary, verbatim ──────────────────────────────────────────────

// SURFACES is the original 6-value legacy/seed vocab (kept for the bridge's
// legacy-narrowing). It is NOT the validation set: the app's real surface ids
// live in apps/mobile/src/rcdata.json (58 ids — clay_groomed, astroturf,
// asphalt_high_grip, decomposed_granite, …), so `Surface` is a free string and
// parse.ts validates surface as a non-empty string. Widening from the union was
// the P1-B8 fix — a narrow union would reject every real rcdata surface on load,
// silently losing all non-"grass" track/run history the moment storage is wired.
// Surface meaning → engine condition tags is reconciled by surfaceToTags (runs.ts).
export const SURFACES = ["clay", "hard-packed", "loam", "astro", "carpet", "grass"] as const;
export type Surface = string;

export const GRIPS = ["green", "medium", "high", "blue_groove"] as const;
export type Grip = (typeof GRIPS)[number];

export const BUMPINESS_LEVELS = ["smooth", "medium", "rough"] as const;
export type Bumpiness = (typeof BUMPINESS_LEVELS)[number];

export const TRACK_EVOLUTIONS = ["improving", "stable", "degrading"] as const;
export type TrackEvolution = (typeof TRACK_EVOLUTIONS)[number];

export const SKIES = ["sunny", "cloudy", "rain_risk", "raining"] as const;
export type Sky = (typeof SKIES)[number];

export const TYRE_WEARS = ["new", "light", "medium", "worn"] as const;
export type TyreWear = (typeof TYRE_WEARS)[number];

export const RUN_TYPES = ["practice", "qualifier", "main"] as const;
export type RunType = (typeof RUN_TYPES)[number];

export const OUTCOMES = ["better", "same", "worse"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const TRAFFIC_LEVELS = ["clear", "some", "heavy"] as const;
export type Traffic = (typeof TRAFFIC_LEVELS)[number];

export const POWER_TYPES = ["nitro", "brushless"] as const;
export type PowerType = (typeof POWER_TYPES)[number];

// ── Internal guard/clamp/freeze helpers (pure) ──────────────────────────────

/** True iff v is a real, finite number (NaN/±Infinity survive serialize but poison deserialize). */
export function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Round to integer then clamp into [lo, hi]. Caller must pre-reject non-finite. */
export function clampInt(v: number, lo: number, hi: number): number {
  const r = Math.round(v);
  return r < lo ? lo : r > hi ? hi : r;
}

export function clampRating5(v: number): Rating1to5 {
  return clampInt(v, 1, 5) as Rating1to5;
}

export function clampRating10(v: number): Rating1to10 {
  return clampInt(v, 1, 10) as Rating1to10;
}

/** Clamp a number into [lo, hi] without rounding (e.g. humidity 0–100). */
export function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Round to `digits` decimal places — derived stats stay stable across platforms. */
export function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Deep scan: every number reachable through arrays/objects is finite.
 *  Shared by the outbox pre-scan and the load-path validators (parse.ts) —
 *  NaN serializes to null and a hand-edited blob can hold anything. */
export function deepNumbersFinite(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(deepNumbersFinite);
  if (v !== null && typeof v === "object") return Object.values(v).every(deepNumbersFinite);
  return true;
}

/** Recursively Object.freeze a freshly built value (plain objects/arrays, no cycles).
 *  Skips already-frozen nodes — construction always freezes fresh copies top-down. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
