/**
 * Outbox — append-only mutation journal (D4 offline-first). A future sync
 * layer replays entries in `seq` order; `id` is the idempotency key for the
 * eventual endpoint. Payloads are JSON-cloned at append time (the journal
 * stores exactly what would sync) and scanned for non-finite numerics FIRST —
 * JSON.stringify silently turns NaN into null, which would corrupt the
 * journal without the scan.
 */

import type { IsoDateTime } from "./vocab";
import { deepFreeze } from "./vocab";
import type { OutboxId } from "./ids";
import { isoToMs, makeId } from "./ids";

export const OUTBOX_DOMAINS = [
  "cars",
  "tracks",
  "sessions",
  "runs",
  "outcomes",
  "sheets",
  "account",
  "profile",
] as const;
export type OutboxDomain = (typeof OUTBOX_DOMAINS)[number];

export const OUTBOX_OPS = ["create", "update", "delete"] as const;
export type OutboxOp = (typeof OUTBOX_OPS)[number];

export interface OutboxEntry {
  seq: number; // local monotonic sequence — replay order
  id: OutboxId; // idempotency key for the eventual sync endpoint
  ts: IsoDateTime;
  domain: OutboxDomain;
  op: OutboxOp;
  payload: Readonly<Record<string, unknown>>; // full entity or patch; entity id inside payload
}

export interface OutboxState {
  entries: readonly OutboxEntry[];
  next_seq: number; // never reused, even after pruning
}

export function initOutbox(): OutboxState {
  return deepFreeze({ entries: [], next_seq: 1 });
}

export type OutboxRejectReason = "non_finite_numeric" | "unserializable_payload";

/** Append a journal entry. Generic over the payload so every schema entity
 *  (RunEntry, Track, Car… — declared as interfaces, no index signature) is
 *  directly appendable WITHOUT casts; the journal stores the JSON clone.
 *  The payload is deep-scanned FIRST: NaN/Infinity reject (never-wipe
 *  guarantee — JSON.stringify silently turns NaN into null), and anything
 *  JSON would corrupt silently (functions, bigints, Map/Set/class instances,
 *  undefined inside arrays) or throw on (circular refs) rejects as
 *  "unserializable_payload". Failure keeps the caller's previous reference. */
export function appendOutbox<T extends object>(
  state: OutboxState,
  input: { domain: OutboxDomain; op: OutboxOp; payload: T },
  now: IsoDateTime,
  rand?: () => number,
): { ok: true; state: OutboxState; entry: OutboxEntry } | { ok: false; reason: OutboxRejectReason } {
  const bad = payloadReject(input.payload);
  if (bad !== null) return { ok: false, reason: bad };
  let cloned: Record<string, unknown>;
  try {
    cloned = JSON.parse(JSON.stringify(input.payload)) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "unserializable_payload" }; // circular refs
  }
  const entry: OutboxEntry = deepFreeze({
    seq: state.next_seq,
    id: makeId("ob", isoToMs(now), rand),
    ts: now,
    domain: input.domain,
    op: input.op,
    payload: cloned,
  });
  const next: OutboxState = deepFreeze({
    entries: [...state.entries, entry],
    next_seq: state.next_seq + 1,
  });
  return { ok: true, state: next, entry };
}

/** Sync cursor read: entries with seq > after_seq, in order. */
export function entriesAfter(state: OutboxState, after_seq: number): readonly OutboxEntry[] {
  return Object.freeze(state.entries.filter((e) => e.seq > after_seq));
}

/** Compaction after an acked sync — drops entries with seq <= upto_seq,
 *  never reorders, never reuses seq numbers. */
export function pruneOutbox(state: OutboxState, upto_seq: number): OutboxState {
  return deepFreeze({
    entries: state.entries.filter((e) => e.seq > upto_seq),
    next_seq: state.next_seq,
  });
}

/** Deep pre-scan mirroring the JSON failure modes:
 *  - non-finite number → "non_finite_numeric" (stringify would null it)
 *  - function / bigint / symbol, undefined INSIDE an array (stringify → null),
 *    or a non-plain object (Map/Set/Date/class instance — stringify lies about
 *    them) → "unserializable_payload"
 *  undefined-valued object props are fine: stringify drops the key, which is
 *  identical to the constructors' own absent-field convention. */
function payloadReject(v: unknown, seen: WeakSet<object> = new WeakSet()): OutboxRejectReason | null {
  if (typeof v === "number") return Number.isFinite(v) ? null : "non_finite_numeric";
  if (typeof v === "function" || typeof v === "bigint" || typeof v === "symbol") {
    return "unserializable_payload";
  }
  if (Array.isArray(v)) {
    if (seen.has(v)) return "unserializable_payload"; // circular (on the current path)
    seen.add(v);
    for (const x of v) {
      if (x === undefined) return "unserializable_payload";
      const bad = payloadReject(x, seen);
      if (bad !== null) return bad;
    }
    seen.delete(v); // path-tracking only — shared non-circular refs are legal JSON
    return null;
  }
  if (v !== null && typeof v === "object") {
    if (seen.has(v)) return "unserializable_payload"; // circular (on the current path)
    seen.add(v);
    const proto = Object.getPrototypeOf(v) as object | null;
    if (proto !== null && proto !== Object.prototype) return "unserializable_payload";
    for (const x of Object.values(v)) {
      if (x === undefined) continue; // dropped key — same as absent
      const bad = payloadReject(x, seen);
      if (bad !== null) return bad;
    }
    seen.delete(v);
    return null;
  }
  return null; // string | boolean | null | undefined
}
