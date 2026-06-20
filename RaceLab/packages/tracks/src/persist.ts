import type { TrackEntity, TracksState } from "./types";

/** Versioned serialization for AsyncStorage — same discipline as
 *  packages/sheets/persist.ts: a format bump must NEVER read as corruption,
 *  so callers can stash unreadable blobs instead of wiping a track library. */

export const TRACKS_FORMAT_VERSION = 2;

interface Envelope {
  format: number;
  state: TracksState;
}

export type DeserializeTracksResult =
  | { ok: true; state: TracksState }
  | { ok: false; reason: "corrupt" | "unknown_format" };

export function serializeTracks(state: TracksState): string {
  return JSON.stringify({ format: TRACKS_FORMAT_VERSION, state } satisfies Envelope);
}

export function deserializeTracks(raw: string): DeserializeTracksResult {
  let env: Envelope;
  try {
    env = JSON.parse(raw) as Envelope;
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  if (typeof env !== "object" || env === null || typeof env.format !== "number") {
    return { ok: false, reason: "corrupt" };
  }

  // Migration switch — every future format bump adds an upgrade case here.
  let state: TracksState;
  switch (env.format) {
    case 1: {
      // v1 → v2 added `surfaces` (multi-surface tracks): a v1 track gets
      // surfaces defaulted to [surface], keeping `surface` the primary.
      const v1 = env.state;
      if (typeof v1 !== "object" || v1 === null || !Array.isArray(v1.tracks)) {
        return { ok: false, reason: "corrupt" };
      }
      state = { tracks: v1.tracks.map(migrateTrackV1) };
      break;
    }
    case 2:
      state = env.state;
      break;
    default:
      return { ok: false, reason: "unknown_format" };
  }

  if (!isValidState(state)) return { ok: false, reason: "corrupt" };
  return { ok: true, state };
}

/** v1 → v2: default surfaces to [surface]. Malformed entries pass through
 *  untouched so the shape validation below reports them as corrupt. */
function migrateTrackV1(t: TrackEntity): TrackEntity {
  if (typeof t !== "object" || t === null || t.surfaces !== undefined) return t;
  return { ...t, surfaces: [t.surface] };
}

function isValidState(s: TracksState): boolean {
  return typeof s === "object" && s !== null && Array.isArray(s.tracks) && s.tracks.every(isValidTrack);
}

function isValidTrack(t: TrackEntity): boolean {
  return (
    typeof t === "object" &&
    t !== null &&
    typeof t.id === "string" &&
    typeof t.name === "string" &&
    typeof t.surface === "string" &&
    (t.surfaces === undefined ||
      (Array.isArray(t.surfaces) && t.surfaces.every((x) => typeof x === "string"))) &&
    typeof t.indoor === "boolean" &&
    typeof t.visibility === "string" &&
    Array.isArray(t.traits) &&
    Array.isArray(t.corners) &&
    t.corners.every(
      (c) => typeof c === "object" && c !== null && typeof c.n === "number" && Array.isArray(c.features),
    ) &&
    Array.isArray(t.records) &&
    t.records.every(
      (r) =>
        typeof r === "object" && r !== null && typeof r.category === "string" && Number.isFinite(r.lap_s),
    ) &&
    typeof t.created_at === "string"
  );
}
