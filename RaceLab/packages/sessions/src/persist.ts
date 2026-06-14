import { freezeSession } from "./sessions";
import type {
  Grip,
  Outcome,
  OutcomeRecord,
  Run,
  RunType,
  Session,
  SessionsState,
  Surface,
  TrackInfo,
} from "./sessions";

/** Versioned serialization for AsyncStorage (or any string store).
 *
 *  Same contract as racelab-sheets: a format bump must NEVER read as
 *  corruption — the result is discriminated so callers can stash unreadable
 *  blobs instead of silently wiping a user's session history. */

export const FORMAT_VERSION = 1;

interface Envelope {
  format: number;
  state: SessionsState;
}

export type DeserializeResult =
  | { ok: true; state: SessionsState }
  | { ok: false; reason: "corrupt" | "unknown_format" };

export function serialize(state: SessionsState): string {
  return JSON.stringify({ format: FORMAT_VERSION, state } satisfies Envelope);
}

export function deserialize(raw: string): DeserializeResult {
  let env: Envelope;
  try {
    env = JSON.parse(raw) as Envelope;
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  if (typeof env !== "object" || env === null || typeof env.format !== "number") {
    return { ok: false, reason: "corrupt" };
  }

  // Migration switch — every future format bump adds a case here that
  // upgrades in place. An unknown (newer) format is preserved, not wiped.
  let state: SessionsState;
  switch (env.format) {
    case 1:
      state = env.state;
      break;
    default:
      return { ok: false, reason: "unknown_format" };
  }

  if (!isValidState(state)) return { ok: false, reason: "corrupt" };
  // JSON.parse returns plain mutable objects — re-freeze so the package's
  // immutability invariant survives a reload, not just the first process.
  for (const session of state.sessions) {
    for (const r of session.runs) {
      Object.freeze(r.track.conditions);
      Object.freeze(r.track);
      Object.freeze(r);
    }
    for (const o of session.outcomes) {
      Object.freeze(o.track.conditions);
      Object.freeze(o.track);
      Object.freeze(o.citations);
      Object.freeze(o);
    }
    freezeSession(session);
  }
  return { ok: true, state };
}

const SURFACES: readonly Surface[] = ["clay", "hard-packed", "loam", "astro", "carpet", "grass"];
const GRIPS: readonly Grip[] = ["green", "medium", "high", "blue_groove"];
const RUN_TYPES: readonly RunType[] = ["practice", "qualifier", "main"];
const OUTCOMES: readonly Outcome[] = ["better", "same", "worse"];

function isValidState(s: SessionsState): boolean {
  if (
    typeof s !== "object" ||
    s === null ||
    !Array.isArray(s.sessions) ||
    !s.sessions.every(isValidSession) ||
    !(s.active_session_id === null || typeof s.active_session_id === "string")
  ) {
    return false;
  }
  if (s.active_session_id !== null) {
    // The active pointer must reference a real, still-open session.
    const active = s.sessions.find((x) => x.id === s.active_session_id);
    if (!active || active.ended_at !== undefined) return false;
  }
  // Duplicate session ids make withActive() write divergent history into
  // multiple sessions at once — reject outright.
  if (new Set(s.sessions.map((x) => x.id)).size !== s.sessions.length) return false;
  // Every session except the active one must be closed: an orphaned open
  // session can never be ended (endSession only targets the active one).
  for (const session of s.sessions) {
    if (session.ended_at === undefined && session.id !== s.active_session_id) return false;
  }
  return true;
}

function isValidSession(s: Session): boolean {
  return (
    typeof s === "object" &&
    s !== null &&
    typeof s.id === "string" &&
    typeof s.started_at === "string" &&
    (s.ended_at === undefined || typeof s.ended_at === "string") &&
    isValidTrack(s.track) &&
    Array.isArray(s.runs) &&
    s.runs.every(isValidRun) &&
    Array.isArray(s.outcomes) &&
    s.outcomes.every(isValidOutcome)
  );
}

function isValidTrack(t: TrackInfo): boolean {
  return (
    typeof t === "object" &&
    t !== null &&
    typeof t.name === "string" &&
    SURFACES.includes(t.surface) &&
    GRIPS.includes(t.grip) &&
    Array.isArray(t.conditions) &&
    t.conditions.every((c) => typeof c === "string")
  );
}

function isValidRun(r: Run): boolean {
  return (
    typeof r === "object" &&
    r !== null &&
    typeof r.id === "string" &&
    typeof r.at === "string" &&
    RUN_TYPES.includes(r.type) &&
    typeof r.setup_version_id === "string" &&
    r.setup_version_id.length > 0 &&
    typeof r.setup_name === "string" &&
    isValidTrack(r.track) &&
    (r.best_lap_s === undefined || Number.isFinite(r.best_lap_s)) &&
    (r.lap_count === undefined || Number.isFinite(r.lap_count)) &&
    (r.feedback_text === undefined || typeof r.feedback_text === "string")
  );
}

function isValidOutcome(o: OutcomeRecord): boolean {
  return (
    typeof o === "object" &&
    o !== null &&
    typeof o.id === "string" &&
    typeof o.at === "string" &&
    typeof o.setting === "string" &&
    typeof o.change === "string" &&
    Array.isArray(o.citations) &&
    o.citations.every((c) => typeof c === "string") &&
    OUTCOMES.includes(o.outcome) &&
    typeof o.setup_version_id === "string" &&
    typeof o.setup_name === "string" &&
    isValidTrack(o.track) &&
    (o.note === undefined || typeof o.note === "string")
  );
}
