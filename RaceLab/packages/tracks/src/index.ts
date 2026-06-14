/** RaceLab tracks — public API (D25). Tracks as first-class entities:
 *  corners + traits + auto-updating lap records, plus the deterministic
 *  bridge from track facts to the engine taxonomy condition vocabulary.
 *  Pure data + pure functions: no fs, no network, no node built-ins —
 *  bundles into the app unchanged. */
export {
  initTracks,
  addTrack,
  updateTrack,
  deleteTrack,
  getTrack,
  upsertRecord,
} from "./tracks";
export { trackConditionTags, trackCharacterNotes } from "./conditions";
export {
  serializeTracks,
  deserializeTracks,
  TRACKS_FORMAT_VERSION,
} from "./persist";
export type { DeserializeTracksResult } from "./persist";
export { CORNER_FEATURES, TRACK_TRAITS } from "./types";
export type {
  CornerDirection,
  CornerFeature,
  CornerShape,
  CornerSpec,
  LapRecord,
  TrackEntity,
  TracksState,
  TrackTrait,
  TrackVisibility,
} from "./types";
