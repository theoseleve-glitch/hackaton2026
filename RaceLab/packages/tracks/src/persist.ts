import type { Track } from "../../schema/src/index";
import type { TracksState } from "./types";

/**
 * Versioned serialization for the in-memory tracks state. After the schema
 * cutover the app persists tracks through the storage repos (parse-on-read +
 * quarantine); this serializer is the legacy/in-memory path only. Never-wipe:
 * a format bump must NEVER read as corruption.
 *
 * Format 3 = schema-Track library (surface ∈ schema Surface, is_public, turns,
 * TrackRecord). Formats 1–2 were the pre-schema TrackEntity shape; the storage
 * migrate path owns reading them now, so this validator only accepts v3.
 */

export const TRACKS_FORMAT_VERSION = 3;

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

  let state: TracksState;
  switch (env.format) {
    case 3:
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

function isValidTrack(t: Track): boolean {
  return (
    typeof t === "object" &&
    t !== null &&
    typeof t.id === "string" &&
    typeof t.name === "string" &&
    typeof t.surface === "string" &&
    typeof t.indoor === "boolean" &&
    typeof t.is_public === "boolean" &&
    Array.isArray(t.records) &&
    t.records.every(
      (r) =>
        typeof r === "object" && r !== null && typeof r.class === "string" && typeof r.best_lap_s === "number",
    ) &&
    typeof t.created_at === "string"
  );
}
