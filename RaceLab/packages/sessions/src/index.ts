/** RaceLab sessions — public API. Pure data + pure functions: one active
 *  session at a time, append-only runs and outcome records, versioned
 *  persistence with discriminated failure reasons. */
export {
  initSessions,
  startSession,
  endSession,
  updateTrack,
  addRun,
  recordOutcome,
  getActiveSession,
} from "./sessions";
export { serialize, deserialize, FORMAT_VERSION } from "./persist";
export type {
  RunType,
  Outcome,
  Surface,
  Grip,
  TrackInfo,
  Run,
  OutcomeRecord,
  Session,
  SessionsState,
} from "./sessions";
export type { DeserializeResult } from "./persist";
