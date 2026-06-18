import type { Track, TrackRecord } from "../../schema/src/index";
import type { TracksState } from "./types";

/**
 * In-memory tracks state ops over the schema `Track`. Ids are minted upstream
 * by schema `makeTrack` (the form/repo seam). These pure ops keep the
 * React-reducer "return a new state" contract; the app's `useTracks` backs the
 * state with the tracks repo.
 */

export function initTracks(): TracksState {
  return { tracks: [] };
}

/** Append an already-minted Track (id from schema makeTrack). */
export function addTrack(state: TracksState, track: Track): { state: TracksState; track: Track } {
  return { state: { tracks: [...state.tracks, track] }, track };
}

/** Patch a track in place. id/created_at are immutable; unknown ids are a no-op. */
export function updateTrack(
  state: TracksState,
  id: string,
  patch: Partial<Omit<Track, "id" | "created_at">>,
): TracksState {
  if (!state.tracks.some((t) => t.id === id)) return state;
  return {
    tracks: state.tracks.map((t) =>
      t.id === id ? { ...t, ...patch, id: t.id, created_at: t.created_at } : t,
    ),
  };
}

export function deleteTrack(state: TracksState, id: string): TracksState {
  const tracks = state.tracks.filter((t) => t.id !== id);
  return tracks.length === state.tracks.length ? state : { tracks };
}

export function getTrack(state: TracksState, id: string): Track | undefined {
  return state.tracks.find((t) => t.id === id);
}

/**
 * Auto-update a track record (schema TrackRecord) from a run result. Records
 * are keyed by class+conditions: absent key → record added; existing key →
 * replaced ONLY if the new lap is strictly faster (lower best_lap_s), else
 * no-op (same reference). Unknown track ids are a no-op.
 */
export function upsertRecord(state: TracksState, trackId: string, record: TrackRecord): TracksState {
  const track = getTrack(state, trackId);
  if (!track) return state;
  const i = track.records.findIndex(
    (r) => r.class === record.class && r.conditions === record.conditions,
  );
  if (i === -1) {
    return updateTrack(state, trackId, { records: [...track.records, record] });
  }
  if (record.best_lap_s >= track.records[i].best_lap_s) return state;
  return updateTrack(state, trackId, {
    records: track.records.map((r, j) => (j === i ? record : r)),
  });
}
