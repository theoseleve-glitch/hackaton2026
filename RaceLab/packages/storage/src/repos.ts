/**
 * Typed repositories over a StorageAdapter (D11: local store is the only
 * source of truth).
 *
 * Contract:
 *  - EVERY mutation appends a schema OutboxEntry ({ domain, op, payload }) via
 *    schema appendOutbox semantics, committed in the SAME logical transaction
 *    as the doc write (StorageAdapter.commit). A failed commit advances
 *    nothing — in-memory outbox state and store stay consistent.
 *  - ALL reads route through packages/schema parse.ts validators (plus local
 *    validators for the two doc kinds schema has no parser for: reports and
 *    the driver profile). A corrupt doc is STASHED into the "quarantine"
 *    collection and reported as a discriminated result — never deleted, never
 *    thrown, and the original cell is left in place.
 *  - Writes are also parse-guarded (reject before persisting) — NaN or a
 *    hand-built invalid entity never reaches the store.
 *
 * Outbox domain note: schema OUTBOX_DOMAINS (frozen) has no "weather"/
 * "reports" domain yet. Those session-day artifacts journal under the
 * "sessions" domain with an explicit envelope payload
 * { collection, id, doc } so a future sync layer can route them; logged as a
 * doc-delta for the next schema unfreeze.
 *
 * Single-writer assumption: one Repos instance mutating at a time (the app's
 * store) — mutations await completion before the next begins.
 */

import type {
  AccountState,
  Car,
  DriverLevel,
  DriverProfile,
  IsoDateTime,
  OutboxDomain,
  OutboxEntry,
  OutboxOp,
  OutboxState,
  OutcomeRecord,
  ParseResult,
  RunEntry,
  Track,
  WeatherObservation,
} from "../../schema/src/index";
import {
  DRIVER_LEVELS,
  appendOutbox,
  entriesAfter,
  makeDriverProfile,
  parseAccountState,
  parseCar,
  parseOutboxState,
  parseOutcomeRecord,
  parseRunEntry,
  parseTrack,
  parseWeatherObservation,
  pruneOutbox,
} from "../../schema/src/index";
import type { StorageAdapter } from "./interfaces";

// ── collections ──────────────────────────────────────────────────────────────

export const COLLECTIONS = {
  cars: "cars",
  tracks: "tracks",
  runs: "runs",
  outcomes: "outcomes",
  weather_logs: "weather_logs",
  reports: "reports",
  profile: "profile",
  account: "account",
  quarantine: "quarantine",
} as const;

const SINGLETON_ID = "singleton";

// ── results ──────────────────────────────────────────────────────────────────

export type MutResult = { ok: true } | { ok: false; reason: string };
export type GetOneResult<T> =
  | { ok: true; value: T | null }
  | { ok: false; reason: string; quarantined: boolean };
export type GetAllResult<T> =
  | { ok: true; values: readonly T[]; corrupt: readonly { id: string; reason: string }[] }
  | { ok: false; reason: string };

// ── repo shapes ──────────────────────────────────────────────────────────────

/** Entities that carry their own id (cars/tracks/runs/outcomes/reports). */
export interface EntityRepo<T> {
  put(value: T, now: IsoDateTime): Promise<MutResult>;
  get(id: string): Promise<GetOneResult<T>>;
  getAll(): Promise<GetAllResult<T>>;
  remove(id: string, now: IsoDateTime): Promise<MutResult>;
}

/** Docs keyed by a caller-supplied id (weather observations have no id field). */
export interface KeyedDocRepo<T> {
  put(id: string, value: T, now: IsoDateTime): Promise<MutResult>;
  get(id: string): Promise<GetOneResult<T>>;
  getAll(): Promise<GetAllResult<T>>;
  remove(id: string, now: IsoDateTime): Promise<MutResult>;
}

export interface SingletonRepo<T> {
  put(value: T, now: IsoDateTime): Promise<MutResult>;
  get(): Promise<GetOneResult<T>>;
}

export interface OutboxView {
  state(): OutboxState;
  entriesAfter(after_seq: number): readonly OutboxEntry[];
  /** compaction after an acked backup — persisted AND in-memory */
  prune(upto_seq: number): Promise<MutResult>;
}

/** Opaque report doc — the only structural requirements are id + created_at. */
export interface ReportDoc {
  id: string;
  created_at: IsoDateTime;
  [k: string]: unknown;
}

export interface Repos {
  cars: EntityRepo<Car>;
  tracks: EntityRepo<Track>;
  runs: EntityRepo<RunEntry>;
  outcomes: EntityRepo<OutcomeRecord>;
  weather_logs: KeyedDocRepo<WeatherObservation>;
  reports: EntityRepo<ReportDoc>;
  profile: SingletonRepo<DriverProfile>;
  account: SingletonRepo<AccountState>;
  outbox: OutboxView;
  quarantine: { getAll(): Promise<GetAllResult<Record<string, unknown>>> };
}

// ── local validators (schema parse.ts has no parser for these two) ──────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepFinite(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(deepFinite);
  if (v !== null && typeof v === "object") return Object.values(v).every(deepFinite);
  return true;
}

export function parseReport(value: unknown): ParseResult<ReportDoc> {
  if (!isRecord(value)) return { ok: false, reason: "not_an_object" };
  if (!deepFinite(value)) return { ok: false, reason: "non_finite_numeric" };
  if (typeof value.id !== "string" || value.id.trim() === "") return { ok: false, reason: "invalid:id" };
  if (typeof value.created_at !== "string" || Number.isNaN(Date.parse(value.created_at))) {
    return { ok: false, reason: "invalid:created_at" };
  }
  return { ok: true, value: value as ReportDoc };
}

export function parseDriverProfile(value: unknown): ParseResult<DriverProfile> {
  if (!isRecord(value)) return { ok: false, reason: "not_an_object" };
  if (!deepFinite(value)) return { ok: false, reason: "non_finite_numeric" };
  if (typeof value.level !== "string" || !(DRIVER_LEVELS as readonly string[]).includes(value.level)) {
    return { ok: false, reason: "invalid:level" };
  }
  if (value.age !== undefined && typeof value.age !== "number") return { ok: false, reason: "invalid:age" };
  if (value.country !== undefined && typeof value.country !== "string") {
    return { ok: false, reason: "invalid:country" };
  }
  const made = makeDriverProfile({
    level: value.level as DriverLevel,
    ...(value.age !== undefined ? { age: value.age } : {}),
    ...(value.country !== undefined ? { country: value.country } : {}),
  });
  if (!made.ok) return { ok: false, reason: `invalid:${made.reason}` };
  return { ok: true, value: made.profile };
}

// ── open ─────────────────────────────────────────────────────────────────────

export async function openRepos(
  storage: StorageAdapter,
  opts?: { rand?: () => number },
): Promise<{ ok: true; repos: Repos; warnings: readonly string[] } | { ok: false; reason: string }> {
  const warnings: string[] = [];
  const rand = opts?.rand;

  /** Quarantine stash — direct doc write, no outbox (local diagnostics).
   *  Deterministic id ⇒ re-stashing the same corruption is idempotent. */
  async function stash(collection: string, id: string, raw: unknown, reason: string): Promise<boolean> {
    const doc = {
      collection,
      id,
      reason,
      raw: typeof raw === "string" ? raw : (raw ?? null),
    };
    const r = await storage.docs.put(COLLECTIONS.quarantine, `${collection}/${id}`, doc);
    return r.ok;
  }

  // ── rebuild the outbox state from the journal (parse-validated) ───────────
  let outboxState: OutboxState;
  try {
    const last = await storage.log.lastSeq();
    const lastSeqVal = last.ok ? last.seq : 0;
    if (!last.ok) warnings.push(`outbox high-water mark unreadable (${last.reason})`);

    const read = await storage.log.readFrom(0);
    let rawEntries: readonly { seq: number; entry: unknown }[] = [];
    if (read.ok) {
      rawEntries = read.entries;
    } else {
      warnings.push(`outbox journal unreadable (${read.reason}) — quarantined, starting a fresh journal`);
      await stash("outbox", "__journal", read.raw ?? read.reason, read.reason);
    }

    const kept: OutboxEntry[] = [];
    let prev = 0;
    let maxSeen = 0;
    for (const { seq, entry } of rawEntries) {
      const claimed =
        isRecord(entry) && typeof entry.seq === "number" && Number.isInteger(entry.seq) && entry.seq >= 1
          ? entry.seq
          : null;
      const single =
        claimed !== null
          ? parseOutboxState({ entries: [entry], next_seq: claimed + 1 })
          : ({ ok: false, reason: "invalid:seq" } as const);
      if (single.ok && claimed !== null && claimed > prev) {
        kept.push(single.value.entries[0]);
        prev = claimed;
        if (claimed > maxSeen) maxSeen = claimed;
      } else {
        const reason = single.ok ? "out_of_order_seq" : single.reason;
        await stash("outbox", String(claimed ?? seq), entry, reason);
        warnings.push(`outbox entry ${claimed ?? seq} quarantined (${reason})`);
      }
    }

    const next_seq = Math.max(lastSeqVal, maxSeen) + 1;
    const final = parseOutboxState({ entries: kept, next_seq });
    if (final.ok) {
      outboxState = final.value;
    } else {
      warnings.push(`outbox state rebuilt empty (${final.reason})`);
      outboxState = Object.freeze({ entries: Object.freeze([]) as readonly OutboxEntry[], next_seq });
    }
  } catch {
    return { ok: false, reason: "driver_error" };
  }

  const box = { state: outboxState };

  // ── shared read/write plumbing ─────────────────────────────────────────────

  async function readOne<T>(
    collection: string,
    id: string,
    parse: (v: unknown) => ParseResult<T>,
  ): Promise<GetOneResult<T>> {
    const r = await storage.docs.get(collection, id);
    if (!r.ok) {
      if (r.raw !== undefined) {
        const stashed = await stash(collection, id, r.raw, r.reason);
        return { ok: false, reason: `corrupt:${r.reason}`, quarantined: stashed };
      }
      return { ok: false, reason: r.reason, quarantined: false };
    }
    if (r.doc === null) return { ok: true, value: null };
    const p = parse(r.doc);
    if (!p.ok) {
      const stashed = await stash(collection, id, r.doc, p.reason);
      return { ok: false, reason: `corrupt:${p.reason}`, quarantined: stashed };
    }
    return { ok: true, value: p.value };
  }

  async function readAll<T>(
    collection: string,
    parse: (v: unknown) => ParseResult<T>,
  ): Promise<GetAllResult<T>> {
    const r = await storage.docs.getAll(collection);
    if (!r.ok) {
      if (r.raw !== undefined) await stash(collection, "__collection_blob", r.raw, r.reason);
      return { ok: false, reason: `corrupt:${r.reason}` };
    }
    const values: T[] = [];
    const corrupt: { id: string; reason: string }[] = [];
    for (const { id, raw } of r.invalid) {
      await stash(collection, id, raw, "invalid_json");
      corrupt.push({ id, reason: "invalid_json" });
    }
    for (const { id, doc } of r.docs) {
      const p = parse(doc);
      if (p.ok) {
        values.push(p.value);
      } else {
        await stash(collection, id, doc, p.reason);
        corrupt.push({ id, reason: p.reason });
      }
    }
    return { ok: true, values, corrupt };
  }

  /** One mutation = outbox append + doc op in one commit. On failure the
   *  in-memory outbox state does NOT advance (entry id/seq are reusable). */
  async function mutate(
    domain: OutboxDomain,
    op: OutboxOp,
    payload: object,
    docOp:
      | { type: "put"; collection: string; id: string; doc: object }
      | { type: "remove"; collection: string; id: string },
    now: IsoDateTime,
  ): Promise<MutResult> {
    // schema id minting throws on an unparseable timestamp — guard here so
    // nothing ever throws across the package boundary
    if (typeof now !== "string" || Number.isNaN(Date.parse(now))) {
      return { ok: false, reason: "invalid_timestamp" };
    }
    const ob = appendOutbox(box.state, { domain, op, payload }, now, rand);
    if (!ob.ok) return { ok: false, reason: `outbox_${ob.reason}` };
    const res = await storage.commit([docOp], ob.entry);
    if (!res.ok) return { ok: false, reason: res.reason };
    box.state = ob.state;
    return { ok: true };
  }

  /** create vs update: presence (even unreadable presence) means update. */
  async function opFor(collection: string, id: string): Promise<OutboxOp> {
    const existing = await storage.docs.get(collection, id);
    return !existing.ok || existing.doc !== null ? "update" : "create";
  }

  /** Quarantine whatever sits at (collection, id) if it is unreadable —
   *  called before an explicit remove so corrupt bytes survive the delete. */
  async function stashIfCorrupt<T>(
    collection: string,
    id: string,
    parse: (v: unknown) => ParseResult<T>,
  ): Promise<{ present: boolean }> {
    const existing = await storage.docs.get(collection, id);
    if (!existing.ok) {
      if (existing.raw !== undefined) await stash(collection, id, existing.raw, existing.reason);
      return { present: true };
    }
    if (existing.doc === null) return { present: false };
    const p = parse(existing.doc);
    if (!p.ok) await stash(collection, id, existing.doc, p.reason);
    return { present: true };
  }

  // ── repo factories ───────────────────────────────────────────────────────

  function entityRepo<T extends object>(
    collection: string,
    domain: OutboxDomain,
    parse: (v: unknown) => ParseResult<T>,
    idOf: (value: T) => string,
    payloadFor: (op: OutboxOp, id: string, value: T | null) => object,
  ): EntityRepo<T> {
    return {
      async put(value, now) {
        const p = parse(value);
        if (!p.ok) return { ok: false, reason: `invalid_input:${p.reason}` };
        const id = idOf(p.value);
        const op = await opFor(collection, id);
        return mutate(
          domain,
          op,
          payloadFor(op, id, p.value),
          { type: "put", collection, id, doc: p.value },
          now,
        );
      },
      get: (id) => readOne(collection, id, parse),
      getAll: () => readAll(collection, parse),
      async remove(id, now) {
        const { present } = await stashIfCorrupt(collection, id, parse);
        if (!present) return { ok: true }; // idempotent — no journal noise
        return mutate(domain, "delete", payloadFor("delete", id, null), { type: "remove", collection, id }, now);
      },
    };
  }

  const identityPayload = <T extends object>(op: OutboxOp, id: string, value: T | null): object =>
    op === "delete" || value === null ? { id } : value;

  /** Envelope payload for collections without their own outbox domain (see
   *  header note): { collection, id, doc } under the "sessions" domain. */
  const envelopePayload =
    (collection: string) =>
    <T extends object>(op: OutboxOp, id: string, value: T | null): object =>
      op === "delete" || value === null ? { collection, id } : { collection, id, doc: value };

  function keyedRepo<T extends object>(
    collection: string,
    domain: OutboxDomain,
    parse: (v: unknown) => ParseResult<T>,
  ): KeyedDocRepo<T> {
    const payloadFor = envelopePayload(collection);
    return {
      async put(id, value, now) {
        if (typeof id !== "string" || id.trim() === "") return { ok: false, reason: "invalid_input:empty_id" };
        const p = parse(value);
        if (!p.ok) return { ok: false, reason: `invalid_input:${p.reason}` };
        const op = await opFor(collection, id);
        return mutate(domain, op, payloadFor(op, id, p.value), { type: "put", collection, id, doc: p.value }, now);
      },
      get: (id) => readOne(collection, id, parse),
      getAll: () => readAll(collection, parse),
      async remove(id, now) {
        const { present } = await stashIfCorrupt(collection, id, parse);
        if (!present) return { ok: true };
        return mutate(domain, "delete", payloadFor("delete", id, null), { type: "remove", collection, id }, now);
      },
    };
  }

  function singletonRepo<T extends object>(
    collection: string,
    domain: OutboxDomain,
    parse: (v: unknown) => ParseResult<T>,
  ): SingletonRepo<T> {
    return {
      async put(value, now) {
        const p = parse(value);
        if (!p.ok) return { ok: false, reason: `invalid_input:${p.reason}` };
        const op = await opFor(collection, SINGLETON_ID);
        return mutate(domain, op, p.value, { type: "put", collection, id: SINGLETON_ID, doc: p.value }, now);
      },
      get: () => readOne(collection, SINGLETON_ID, parse),
    };
  }

  const repos: Repos = {
    cars: entityRepo(COLLECTIONS.cars, "cars", parseCar, (c) => c.id, identityPayload),
    tracks: entityRepo(COLLECTIONS.tracks, "tracks", parseTrack, (t) => t.id, identityPayload),
    runs: entityRepo(COLLECTIONS.runs, "runs", parseRunEntry, (r) => r.id, identityPayload),
    outcomes: entityRepo(COLLECTIONS.outcomes, "outcomes", parseOutcomeRecord, (o) => o.id, identityPayload),
    weather_logs: keyedRepo(COLLECTIONS.weather_logs, "sessions", parseWeatherObservation),
    reports: entityRepo(
      COLLECTIONS.reports,
      "sessions",
      parseReport,
      (r) => r.id,
      envelopePayload(COLLECTIONS.reports),
    ),
    profile: singletonRepo(COLLECTIONS.profile, "profile", parseDriverProfile),
    account: singletonRepo(COLLECTIONS.account, "account", parseAccountState),
    outbox: {
      state: () => box.state,
      entriesAfter: (after_seq) => entriesAfter(box.state, after_seq),
      async prune(upto_seq) {
        const res = await storage.log.prune(upto_seq);
        if (!res.ok) return { ok: false, reason: res.reason };
        box.state = pruneOutbox(box.state, upto_seq);
        return { ok: true };
      },
    },
    quarantine: {
      getAll: () =>
        readAll<Record<string, unknown>>(COLLECTIONS.quarantine, (v) =>
          isRecord(v) ? { ok: true, value: v } : { ok: false, reason: "not_an_object" },
        ),
    },
  };

  return { ok: true, repos, warnings };
}
