import type { LapRecord, TrackEntity, TracksState } from "./types";

/**
 * State operations — same contract as packages/sheets and packages/logbook:
 * every operation returns a new state, safe for React reducers. Unknown ids
 * are refused (state returned unchanged, SAME reference).
 */

export function initTracks(): TracksState {
  return { tracks: [] };
}

/** Append a track. The caller provides everything except id. */
export function addTrack(
  state: TracksState,
  track: Omit<TrackEntity, "id">,
  now: string,
): { state: TracksState; track: TrackEntity } {
  const entity: TrackEntity = { ...track, id: nextId(now) };
  return { state: { tracks: [...state.tracks, entity] }, track: entity };
}

/** Patch a track in place. id/created_at are immutable; unknown ids are a no-op. */
export function updateTrack(
  state: TracksState,
  id: string,
  patch: Partial<Omit<TrackEntity, "id" | "created_at">>,
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

export function getTrack(state: TracksState, id: string): TrackEntity | undefined {
  return state.tracks.find((t) => t.id === id);
}

/**
 * Auto-update a track record from a run result. Records are keyed by
 * category+conditions: absent key → record added; existing key → replaced
 * ONLY if the new lap is strictly faster (lower lap_s), else no-op (same
 * reference). Unknown track ids are a no-op.
 */
export function upsertRecord(state: TracksState, trackId: string, record: LapRecord): TracksState {
  const track = getTrack(state, trackId);
  if (!track) return state;
  // Reject a non-finite/non-positive lap at WRITE time (mirrors sessions.addRun). A NaN
  // lap_s makes the `>=` guard below false, so without this it would OVERWRITE a valid
  // record with NaN; NaN then serializes to JSON null and fails isValidTrack on reload,
  // quarantining the user's ENTIRE track library over one bad lap (never-wipe defeated).
  if (!(Number.isFinite(record.lap_s) && record.lap_s > 0)) return state;
  const i = track.records.findIndex(
    (r) => r.category === record.category && r.conditions === record.conditions,
  );
  if (i === -1) {
    return updateTrack(state, trackId, { records: [...track.records, record] });
  }
  if (record.lap_s >= track.records[i].lap_s) return state;
  return updateTrack(state, trackId, {
    records: track.records.map((r, j) => (j === i ? record : r)),
  });
}

function nextId(now: string): string {
  // mirror the sessions discipline: throw on an unparseable clock (else Date.parse -> NaN
  // mints colliding `track-NaN-…` ids), and build a guaranteed-8-char suffix (a bare
  // Math.random().toString(36).slice(2,10) can terminate early and collapse the space).
  const ts = Date.parse(now);
  if (Number.isNaN(ts)) throw new Error(`nextId: invalid ISO timestamp '${now}'`);
  let rand = "";
  while (rand.length < 8) rand += Math.random().toString(36).slice(2);
  return `track-${ts.toString(36)}-${rand.slice(0, 8)}`;
}
