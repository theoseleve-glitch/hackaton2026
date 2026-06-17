/**
 * Branded ids — template-literal brands give a compile-time guard against
 * cross-entity id assignment at zero runtime cost. Generation mirrors the
 * packages/sessions contract: `${prefix}-${ts36}-${rand8}` with a FIXED-WIDTH
 * 8-char suffix (a bare Math.random().toString(36) can terminate early and
 * collapse the collision space).
 *
 * `makeId` takes `now_ms` (epoch milliseconds) AND an optional entropy source
 * from the CALLER so BOTH halves stay deterministic-testable — no Date.now()
 * and no unavoidable Math.random() in this package. The default preserves the
 * convenient API; injecting `rand` makes a constructor fully reproducible
 * (golden tests, crash-replay idempotency, bug repro from exported data).
 */

export type Id<P extends string> = `${P}-${string}`;
export type CarId = Id<"car">;
export type TrackId = Id<"trk">;
export type SessionId = Id<"ss">; // keeps packages/sessions prefix
export type RunId = Id<"run">; //   keeps packages/sessions prefix
export type OutcomeId = Id<"oc">; // keeps packages/sessions prefix
export type OutboxId = Id<"ob">;

export const ID_PREFIXES = ["car", "trk", "ss", "run", "oc", "ob"] as const;
export type IdPrefix = (typeof ID_PREFIXES)[number];

/** Build a fresh id. Throws on a non-finite/negative `now_ms` — an id with a
 *  NaN timestamp half is corruption, not data (same contract as sessions nextId).
 *  `rand` defaults to Math.random; inject a deterministic source to make the
 *  full id (and therefore whole constructed entities) reproducible. */
export function makeId<P extends IdPrefix>(
  prefix: P,
  now_ms: number,
  rand: () => number = Math.random,
): Id<P> {
  if (!Number.isFinite(now_ms) || now_ms < 0) {
    throw new Error(`makeId: invalid now_ms '${now_ms}'`);
  }
  return `${prefix}-${Math.floor(now_ms).toString(36)}-${randomSuffix(rand)}`;
}

/** Parse an ISO timestamp into epoch ms; throws on garbage (never NaN-poisons an id). */
export function isoToMs(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`isoToMs: invalid ISO timestamp '${iso}'`);
  return ms;
}

/** Runtime check matching the generated shape — brands are erased at runtime,
 *  so deserializers must validate prefixes for the brand to mean anything
 *  (the parse.ts load-path validators do exactly that on every entity load). */
export function isId<P extends IdPrefix>(prefix: P, value: string): value is Id<P> {
  return new RegExp(`^${prefix}-[0-9a-z]+-[0-9a-z]{8}$`).test(value);
}

/** Fixed-width 8-char base36 suffix from the injected entropy source.
 *  A rand that yields 0 contributes "0" (never loops forever). */
function randomSuffix(rand: () => number): string {
  let s = "";
  while (s.length < 8) {
    const part = rand().toString(36).slice(2);
    s += part === "" ? "0" : part;
  }
  return s.slice(0, 8);
}
