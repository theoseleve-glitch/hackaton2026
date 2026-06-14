import type { FollowData } from "./types";

/**
 * Follow graph (local side) — the set of handles the user follows, as an
 * order-preserving list. Same contract as the other social stores: every
 * mutation returns a NEW state for React reducers, while a no-op (following an
 * already-followed handle, or unfollowing one that isn't followed) returns the
 * SAME reference so consumers can bail out cheaply. The backend owns the real
 * graph; this is the optimistic local mirror.
 */

export function initFollows(): FollowData {
  return { handles: [] };
}

/** Follow a handle. Appends if absent (NEW ref); already present → no-op (SAME ref). */
export function follow(state: FollowData, handle: string): FollowData {
  if (state.handles.includes(handle)) return state;
  return { handles: [...state.handles, handle] };
}

/** Unfollow a handle. Removes if present (NEW ref); absent → no-op (SAME ref). */
export function unfollow(state: FollowData, handle: string): FollowData {
  if (!state.handles.includes(handle)) return state;
  return { handles: state.handles.filter((h) => h !== handle) };
}

export function isFollowing(state: FollowData, handle: string): boolean {
  return state.handles.includes(handle);
}

/** Versioned serialization for AsyncStorage — same discipline as
 *  packages/social/candidacy.ts: a format bump must NEVER read as corruption. */
export const FOLLOWS_FORMAT_VERSION = 1;

interface Envelope {
  format: number;
  state: FollowData;
}

export type DeserializeFollowsResult =
  | { ok: true; state: FollowData }
  | { ok: false; reason: "bad_json" | "unknown_format" | "corrupt" };

export function serializeFollows(state: FollowData): string {
  return JSON.stringify({ format: FOLLOWS_FORMAT_VERSION, state } satisfies Envelope);
}

export function deserializeFollows(raw: string): DeserializeFollowsResult {
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
  let state: FollowData;
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

function isValidState(s: FollowData): boolean {
  return (
    typeof s === "object" &&
    s !== null &&
    Array.isArray(s.handles) &&
    s.handles.every((h) => typeof h === "string")
  );
}
