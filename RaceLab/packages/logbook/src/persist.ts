import type { LogbookState, RunEntry } from "./types";

/**
 * Versioned serialization for the in-memory logbook. After the schema cutover
 * the app persists runs through the storage repos (parse-on-read + quarantine);
 * this serializer is the legacy/in-memory path only. Never-wipe: a format bump
 * must NEVER read as corruption.
 *
 * Format 3 = schema RunEntry (session_id/car_id/track_id, timing union, driver
 * state). Formats 1–2 were the pre-schema RunEntry shape; the storage migrate
 * path owns reading those now, so this validator only accepts v3.
 */

export const LOGBOOK_FORMAT_VERSION = 3;

interface Envelope {
  format: number;
  state: LogbookState;
}

export type DeserializeLogbookResult =
  | { ok: true; state: LogbookState }
  | { ok: false; reason: "corrupt" | "unknown_format" };

export function serializeLogbook(state: LogbookState): string {
  return JSON.stringify({ format: LOGBOOK_FORMAT_VERSION, state } satisfies Envelope);
}

export function deserializeLogbook(raw: string): DeserializeLogbookResult {
  let env: Envelope;
  try {
    env = JSON.parse(raw) as Envelope;
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  if (typeof env !== "object" || env === null || typeof env.format !== "number") {
    return { ok: false, reason: "corrupt" };
  }

  let state: LogbookState;
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

function isValidState(s: LogbookState): boolean {
  return typeof s === "object" && s !== null && Array.isArray(s.runs) && s.runs.every(isValidRun);
}

function isValidRun(r: RunEntry): boolean {
  return (
    typeof r === "object" &&
    r !== null &&
    typeof r.id === "string" &&
    typeof r.created_at === "string" &&
    typeof r.type === "string" &&
    typeof r.session_id === "string" &&
    typeof r.car_id === "string" &&
    typeof r.car_template_id === "string" &&
    typeof r.setup_version_id === "string" &&
    typeof r.setup_name === "string" &&
    typeof r.track_id === "string" &&
    typeof r.track === "object" &&
    r.track !== null &&
    typeof r.track.name === "string" &&
    typeof r.track.surface === "string" &&
    typeof r.conditions === "object" &&
    r.conditions !== null &&
    typeof r.conditions.grip === "string" &&
    typeof r.feedback === "object" &&
    r.feedback !== null &&
    Array.isArray(r.feedback.tags)
  );
}
