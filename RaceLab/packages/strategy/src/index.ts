/** RaceLab strategy — public API (D30 v2, time-first). Deterministic
 *  race/pit strategy math in SECONDS: measured tank autonomy minus a safety
 *  margin caps every stint, cumulative race-clock pit moments, tyre-cliff
 *  detection, stop-saving stretch options. Pure data + pure functions: no
 *  fs, no network, no node built-ins — bundles into the app unchanged. */
export { computePitPlan, stretchOptions } from "./strategy";
export type { PitPlan, Stint, StrategyInputs } from "./strategy";
export { detectTyreCliff } from "./cliff";
export type { TyreCliffResult } from "./cliff";
