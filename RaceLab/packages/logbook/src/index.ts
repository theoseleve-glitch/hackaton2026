/** RaceLab logbook — public API (D22). Layer 1 (run log) + Layer 2 (run
 *  comparison) + the bridge that turns a logged run into an engine context
 *  bundle. Pure data + pure functions: no fs, no network, no node built-ins —
 *  bundles into the app unchanged. */
export {
  initLogbook,
  addRun,
  updateRun,
  deleteRun,
  rateRun,
  getRun,
  lastRun,
  previousRun,
  similarRuns,
} from "./logbook";
export { compareRuns } from "./compare";
export type { RunComparison, ResolveSetup } from "./compare";
export { carStatus, seasonStats } from "./insights";
export type { CarStatus, SeasonStats } from "./insights";
export { bundleFromRun, conditionTags, historyFromRuns } from "./bundle";
export {
  serializeLogbook,
  deserializeLogbook,
  LOGBOOK_FORMAT_VERSION,
} from "./persist";
export type { DeserializeLogbookResult } from "./persist";
export type {
  Bumpiness,
  Grip,
  LogbookState,
  Outcome,
  RunConditions,
  RunEntry,
  RunFeedback,
  RunResult,
  RunType,
  Sky,
  TrackEvolution,
  TrackInfo,
  Traffic,
  TyreSet,
  TyreWear,
} from "./types";
