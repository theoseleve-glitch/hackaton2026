import type { SetupVersion, SheetsState } from "./sheets";

/** Versioned serialization for AsyncStorage (or any string store).
 *
 *  Reviewer finding ⛔1: a format bump must NEVER read as corruption — the
 *  result is discriminated so callers can stash unreadable blobs instead of
 *  silently wiping a user's history. */

export const FORMAT_VERSION = 1;

interface Envelope {
  format: number;
  state: SheetsState;
}

export type DeserializeResult =
  | { ok: true; state: SheetsState }
  | { ok: false; reason: "corrupt" | "unknown_format" | "wrong_template" };

export function serialize(state: SheetsState): string {
  return JSON.stringify({ format: FORMAT_VERSION, state } satisfies Envelope);
}

export function deserialize(raw: string, expectedTemplateId: string): DeserializeResult {
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
  let state: SheetsState;
  switch (env.format) {
    case 1:
      state = env.state;
      break;
    default:
      return { ok: false, reason: "unknown_format" };
  }

  if (!isValidState(state)) return { ok: false, reason: "corrupt" };
  if (state.template_id !== expectedTemplateId) return { ok: false, reason: "wrong_template" };
  return { ok: true, state };
}

function isValidState(s: SheetsState): boolean {
  return (
    typeof s === "object" &&
    s !== null &&
    typeof s.template_id === "string" &&
    Array.isArray(s.versions) &&
    s.versions.length > 0 &&
    s.versions.every(isValidVersion) &&
    typeof s.draft === "object" &&
    s.draft !== null &&
    typeof s.draft_base_id === "string" &&
    s.versions.some((v) => v.id === s.draft_base_id) &&
    typeof s.draft_name === "string" &&
    Array.isArray(s.starred) &&
    s.starred.every((f) => typeof f === "string")
  );
}

function isValidVersion(v: SetupVersion): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    (v.parent_id === null || typeof v.parent_id === "string") &&
    typeof v.values === "object" &&
    v.values !== null &&
    typeof v.created_at === "string" &&
    typeof v.locked === "boolean"
  );
}
