import type { LogbookState, RunEntry } from "./types";

/** Versioned serialization for AsyncStorage — same discipline as
 *  packages/sheets/persist.ts: a format bump must NEVER read as corruption,
 *  so callers can stash unreadable blobs instead of wiping a season's log. */

export const LOGBOOK_FORMAT_VERSION = 2;

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

  // Migration switch — every future format bump adds an upgrade case here.
  let state: LogbookState;
  switch (env.format) {
    case 1:
      // v1 → v2 (D27) only ADDED optional fields: a v1 state IS a v2 state.
      state = env.state;
      break;
    case 2:
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
    typeof r.car_template_id === "string" &&
    typeof r.setup_version_id === "string" &&
    typeof r.setup_name === "string" &&
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
