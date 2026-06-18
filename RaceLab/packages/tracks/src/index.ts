/** RaceLab tracks — public API (D25), now schema-backed. Tracks as first-class
 *  entities over the canonical schema `Track`: corners (⇄ Track.turns), traits,
 *  auto-updating lap records (TrackRecord), plus the deterministic bridge from
 *  track facts to the engine taxonomy condition vocabulary. Pure data + pure
 *  functions: no fs, no network, no node built-ins. */
export {
  initTracks,
  addTrack,
  updateTrack,
  deleteTrack,
  getTrack,
  upsertRecord,
} from "./tracks";
export {
  trackConditionTags,
  trackCharacterNotes,
  cornersOf,
  cornerFromTurn,
  turnFromCorner,
  toSchemaSurface,
} from "./conditions";
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
// Re-export the schema Track + maker so consumers have one import site.
export type { Track, TrackRecord, TrackTurn, MakeTrackInput, TrackSnapshot } from "../../schema/src/index";
export { makeTrack, snapshotTrack, addTrackRecord, bestRecord } from "../../schema/src/index";
