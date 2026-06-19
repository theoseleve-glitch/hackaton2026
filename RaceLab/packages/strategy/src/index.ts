/** RaceLab strategy — public API (D30). Deterministic race/pit strategy
 *  math: fuel-window stint caps, RC timed-race lap counts, even stint
 *  distribution, tyre-cliff detection, stop-saving stretch options. Pure
 *  data + pure functions: no fs, no network, no node built-ins — bundles
 *  into the app unchanged. */
export { computePitPlan, stretchOptions } from "./strategy";
export type { FuelSpec, PitPlan, Stint, StrategyInputs } from "./strategy";
export { detectTyreCliff } from "./cliff";
export type { TyreCliffResult } from "./cliff";
