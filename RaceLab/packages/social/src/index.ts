/** RaceLab social — public API. Shareable setup snapshots (portable links),
 *  track candidacy state, fork lineage. Pure data + pure functions: no fs, no
 *  network, no node built-ins, no clock — bundles into the app unchanged and
 *  runs identically on node, RN/Hermes and the browser. */
export {
  buildSetupPayload,
  serializePayload,
  deserializePayload,
  payloadToLink,
  linkToPayload,
  IMPORT_LINK_BASE,
} from "./share";
export type { BuildPayloadInput, DeserializePayloadResult } from "./share";
export {
  initCandidacy,
  submitCandidacy,
  setCandidacyState,
  getCandidacy,
  serializeCandidacy,
  deserializeCandidacy,
  CANDIDACY_FORMAT_VERSION,
} from "./candidacy";
export type { DeserializeCandidacyResult } from "./candidacy";
export { forkProvenanceLine } from "./lineage";
export type { CandidacyData, CandidacyState, SharedPayload, TrackCandidacy } from "./types";
