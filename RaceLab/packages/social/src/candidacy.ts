import type { CandidacyData, CandidacyState, TrackCandidacy } from "./types";

/**
 * Track-candidacy state — same contract as the other packages: every operation
 * returns a new state, safe for React reducers; unknown ids in read ops return
 * undefined. The backend owns the official/rejected verdict; this client store
 * is the optimistic mirror so the UI can show "submitted" before the server
 * answers, and reflect the verdict when it does.
 */

export function initCandidacy(): CandidacyData {
  return { items: [] };
}

/** Nominate a track. Upserts to "candidate" with submitted_at = now. Already
 *  "candidate" or "official" → no-op (SAME reference): you can't re-nominate a
 *  pending or accepted track. "none"/"rejected" can be (re)submitted. */
export function submitCandidacy(state: CandidacyData, trackId: string, now: string): CandidacyData {
  const existing = state.items.find((c) => c.track_id === trackId);
  if (existing && (existing.state === "candidate" || existing.state === "official")) return state;
  const next: TrackCandidacy = { track_id: trackId, state: "candidate", submitted_at: now };
  return upsert(state, next);
}

/** Reflect a backend verdict (or any explicit state). Upserts if absent so a
 *  server push can create the record the client never submitted locally. */
export function setCandidacyState(state: CandidacyData, trackId: string, next: CandidacyState): CandidacyData {
  const existing = state.items.find((c) => c.track_id === trackId);
  const updated: TrackCandidacy = existing
    ? { ...existing, state: next }
    : { track_id: trackId, state: next };
  return upsert(state, updated);
}

export function getCandidacy(state: CandidacyData, trackId: string): TrackCandidacy | undefined {
  return state.items.find((c) => c.track_id === trackId);
}

function upsert(state: CandidacyData, entry: TrackCandidacy): CandidacyData {
  const i = state.items.findIndex((c) => c.track_id === entry.track_id);
  if (i === -1) return { items: [...state.items, entry] };
  return { items: state.items.map((c) => (c.track_id === entry.track_id ? entry : c)) };
}

/** Versioned serialization for AsyncStorage — same discipline as
 *  packages/logbook/persist.ts: a format bump must NEVER read as corruption. */
export const CANDIDACY_FORMAT_VERSION = 1;

interface Envelope {
  format: number;
  state: CandidacyData;
}

export type DeserializeCandidacyResult =
  | { ok: true; state: CandidacyData }
  | { ok: false; reason: "bad_json" | "unknown_format" | "corrupt" };

export function serializeCandidacy(state: CandidacyData): string {
  return JSON.stringify({ format: CANDIDACY_FORMAT_VERSION, state } satisfies Envelope);
}

export function deserializeCandidacy(raw: string): DeserializeCandidacyResult {
  let env: Envelope;
  try {
    env = JSON.parse(raw) as Envelope;
  } catch {
    return { ok: false, reason: "bad_json" };
  }
  if (typeof env !== "object" || env === null || typeof env.format !== "number") {
    return { ok: false, reason: "corrupt" };
  }

  // Migration switch — every future format bump adds an upgrade case here.
  let state: CandidacyData;
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

function isValidState(s: CandidacyData): boolean {
  return typeof s === "object" && s !== null && Array.isArray(s.items) && s.items.every(isValidItem);
}

function isValidItem(c: TrackCandidacy): boolean {
  return (
    typeof c === "object" &&
    c !== null &&
    typeof c.track_id === "string" &&
    (c.state === "none" || c.state === "candidate" || c.state === "official" || c.state === "rejected")
  );
}
