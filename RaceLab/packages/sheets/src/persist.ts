import { freezeHistory, kitVersionId } from "./sheets";
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
  // JSON.parse returns fully-mutable objects: re-establish the in-memory
  // invariant that saved versions (and the locked kit baseline) are immutable.
  return { ok: true, state: freezeHistory(state) };
}

function isValidState(s: SheetsState): boolean {
  if (
    !(
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
    )
  ) {
    return false;
  }
  // Ids must be unique — a duplicate id makes getVersion/diff ambiguous and lets
  // a forged version shadow the real one.
  if (new Set(s.versions.map((v) => v.id)).size !== s.versions.length) return false;
  // Kit-root invariant: exactly the version diffVsKit() and lineage assume must
  // exist — a locked, parent-less root whose id is the template's kit id. Without
  // this a kit-less blob passes validation, then diffVsKit() throws an uncaught
  // Error across the boundary on first use.
  const kitId = kitVersionId(s.template_id);
  if (!s.versions.some((v) => v.id === kitId && v.parent_id === null && v.locked === true)) {
    return false;
  }
  return true;
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
