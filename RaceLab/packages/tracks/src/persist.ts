import type { TrackEntity, TracksState } from "./types";

/** Versioned serialization for AsyncStorage — same discipline as
 *  packages/sheets/persist.ts: a format bump must NEVER read as corruption,
 *  so callers can stash unreadable blobs instead of wiping a track library. */

export const TRACKS_FORMAT_VERSION = 1;

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
    case 1:
      state = env.state;
      break;
    default:
      return { ok: false, reason: "unknown_format" };
  }

  if (!isValidState(state)) return { ok: false, reason: "corrupt" };
  return { ok: true, state };
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
        typeof r === "object" && r !== null && typeof r.category === "string" && typeof r.lap_s === "number",
    ) &&
    typeof t.created_at === "string"
  );
}
