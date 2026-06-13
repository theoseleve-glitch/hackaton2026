/**
 * racelab-storage — injected driver interfaces + the repository-facing
 * storage abstraction (D11: the local store is the ONLY source of truth;
 * the outbox is an append-only mutation journal; cloud backup is NOT sync).
 *
 * Two layers:
 *  - DRIVERS (caller-provided, the only things that actually do I/O):
 *    KeyValueDriver (AsyncStorage-shaped) and SqlExecutor (expo-sqlite-shaped).
 *    Nothing in this package calls Date.now()/Math.random()/fetch or any node
 *    built-in — every capability is injected (D18 culture, deterministic tests).
 *  - REPOSITORY-FACING ABSTRACTION (adapter-provided): DocStore + AppendLog,
 *    bundled with `commit` — the explicit transactional batch that writes doc
 *    mutations and the matching outbox entry in ONE logical transaction where
 *    the driver supports it (sqlite transaction / kv write-then-swap undo log).
 *
 * Everything that can fail returns a discriminated result. Adapters NEVER
 * throw across the package boundary: driver throws/rejections are caught and
 * converted to { ok: false }. Corrupt stored bytes are surfaced (with `raw`
 * where available) so callers can quarantine them — never silently dropped,
 * never deleted.
 */

import type { OutboxEntry } from "../../schema/src/index";

// ── drivers (injected) ───────────────────────────────────────────────────────

/** AsyncStorage-shaped string store. Assumption the kv adapter builds on:
 *  each individual setItem/removeItem is atomic (true for AsyncStorage);
 *  atomicity ACROSS keys is the adapter's job (undo-log write-then-swap). */
export interface KeyValueDriver {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
}

export type SqlValue = string | number | null;

export interface SqlStatement {
  sql: string;
  params?: readonly SqlValue[];
}

/** Minimal SQL driver. `batch` is the OPTIONAL but EXPLICIT transactional
 *  primitive: all statements commit or none (must reject on failure leaving
 *  the database untouched). Without it the sqlite adapter emulates
 *  transactions with BEGIN/COMMIT/ROLLBACK through `execute`. */
export interface SqlExecutor {
  execute(sql: string, params?: readonly SqlValue[]): Promise<{ rows: readonly Record<string, unknown>[] }>;
  batch?(statements: readonly SqlStatement[]): Promise<void>;
}

// ── discriminated results ────────────────────────────────────────────────────

/** `raw` carries the unreadable stored bytes when available so the caller can
 *  quarantine them (never-wipe: corrupt input is stashed, never deleted). */
export type StoreFail = { ok: false; reason: string; raw?: string };

export type PutResult = { ok: true } | StoreFail;

export type DocGetResult = { ok: true; doc: unknown | null } | StoreFail;

export type DocGetAllResult =
  | {
      ok: true;
      docs: readonly { id: string; doc: unknown }[];
      /** cells whose stored bytes did not parse as JSON — caller quarantines */
      invalid: readonly { id: string; raw: string }[];
    }
  | StoreFail;

export type LogReadResult =
  | { ok: true; entries: readonly { seq: number; entry: unknown }[] }
  | StoreFail;

export type LastSeqResult = { ok: true; seq: number } | StoreFail;

// ── repository-facing abstraction ────────────────────────────────────────────

/** Document store: opaque JSON docs in named collections. Values round-trip
 *  through JSON (adapters store strings) — what you get back is plain data. */
export interface DocStore {
  put(collection: string, id: string, doc: object): Promise<PutResult>;
  get(collection: string, id: string): Promise<DocGetResult>;
  getAll(collection: string): Promise<DocGetAllResult>;
  remove(collection: string, id: string): Promise<PutResult>;
}

/** Append-only journal persistence for schema OutboxEntry values. The CALLER
 *  assigns `seq` (schema appendOutbox owns the monotonic counter); the log
 *  persists (seq, json) pairs plus a high-water mark that SURVIVES pruning —
 *  seq numbers are never reused, even after compaction (schema contract). */
export interface AppendLog {
  append(entry: OutboxEntry): Promise<PutResult>;
  /** entries with seq > after_seq, in seq order. A full scan (after_seq = 0)
   *  also returns entries whose stored bytes are unreadable (entry = raw
   *  string / garbage value) so the caller can quarantine them. */
  readFrom(after_seq: number): Promise<LogReadResult>;
  /** drops entries with seq <= upto_seq; the high-water mark is untouched. */
  prune(upto_seq: number): Promise<PutResult>;
  /** highest seq ever appended (0 when none) — survives pruning. */
  lastSeq(): Promise<LastSeqResult>;
}

export type DocOp =
  | { type: "put"; collection: string; id: string; doc: object }
  | { type: "remove"; collection: string; id: string };

/** What an adapter hands the repos: the read surfaces plus ONE transactional
 *  write path. `commit` applies the doc ops and (when given) the outbox entry
 *  append atomically where the driver supports it:
 *   - memory: synchronous all-or-nothing
 *   - sqlite: driver `batch` or emulated BEGIN/COMMIT/ROLLBACK
 *   - kv: undo-log write-then-swap (interrupted writes roll back on next open)
 *  On { ok: false } the store is left (or recovers to) its pre-commit state —
 *  a failed commit is never partially visible after the next open. */
export interface StorageAdapter {
  docs: DocStore;
  log: AppendLog;
  commit(ops: readonly DocOp[], entry?: OutboxEntry): Promise<PutResult>;
}
