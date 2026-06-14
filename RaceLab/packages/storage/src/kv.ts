/**
 * KeyValue adapter — DocStore + AppendLog + transactional commit over an
 * injected KeyValueDriver (AsyncStorage-shaped).
 *
 * Layout (namespace `ns`, default "racelab-store"):
 *   <ns>:docs:<collection>  → JSON object map { [id]: doc }
 *   <ns>:log                → JSON { last_seq, entries: OutboxEntry[] }
 *   <ns>:undo               → JSON { writes: [{ key, prev: string|null }] }
 *
 * Atomicity = WRITE-THEN-SWAP with an undo record (assumes per-key atomic
 * setItem, which AsyncStorage guarantees):
 *   1. read prev values of every key the commit touches
 *   2. write the undo record (single key — atomic)
 *   3. apply the new values key by key
 *   4. remove the undo record
 * A kill anywhere in 3–4 leaves the undo record behind; `openKvStorage` rolls
 * the interrupted write back before serving anything, so a commit that was
 * reported failed is NEVER partially visible after the next open. A transient
 * (non-fatal) failure additionally triggers an immediate best-effort rollback.
 *
 * Never-wipe: a corrupt collection/log blob REFUSES writes ({ ok:false } with
 * the raw bytes attached for quarantining) — this adapter never overwrites
 * data it cannot read. A corrupt undo record is stashed aside, never deleted.
 *
 * Single-writer assumption: one logical writer at a time (the app's store).
 * Whole-blob-per-collection writes are O(collection) — fine at MVP scale
 * (hundreds of runs); the sqlite adapter is the volume path.
 */

import type {
  DocGetAllResult,
  DocGetResult,
  KeyValueDriver,
  LastSeqResult,
  LogReadResult,
  PutResult,
  StorageAdapter,
} from "./interfaces";

interface LogBlob {
  last_seq: number;
  entries: unknown[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function seqOf(entry: unknown): number | null {
  if (!isRecord(entry)) return null;
  const s = entry.seq;
  return typeof s === "number" && Number.isFinite(s) ? s : null;
}

export async function openKvStorage(
  kv: KeyValueDriver,
  namespace = "racelab-store",
): Promise<{ ok: true; storage: StorageAdapter; warnings: readonly string[] } | { ok: false; reason: string }> {
  const docsKey = (collection: string): string => `${namespace}:docs:${collection}`;
  const logKey = `${namespace}:log`;
  const undoKey = `${namespace}:undo`;
  const corruptUndoKey = `${namespace}:undo:corrupt`;
  const warnings: string[] = [];

  // ── recovery: roll back any interrupted write-then-swap ───────────────────
  try {
    const raw = await kv.getItem(undoKey);
    if (raw !== null) {
      let undo: unknown;
      try {
        undo = JSON.parse(raw);
      } catch {
        undo = null;
      }
      let writes: { key: string; prev: string | null }[] | null = null;
      if (isRecord(undo) && Array.isArray(undo.writes)) {
        const wellFormed = undo.writes.every(
          (w): w is { key: string; prev: string | null } =>
            isRecord(w) && typeof w.key === "string" && (w.prev === null || typeof w.prev === "string"),
        );
        if (wellFormed) writes = undo.writes as { key: string; prev: string | null }[];
      }
      if (writes !== null) {
        for (const w of writes) {
          if (w.prev === null) await kv.removeItem(w.key);
          else await kv.setItem(w.key, w.prev);
        }
        await kv.removeItem(undoKey);
        warnings.push("rolled_back_interrupted_write");
      } else {
        // unreadable undo record: stash it (never delete data), then clear
        await kv.setItem(corruptUndoKey, raw);
        await kv.removeItem(undoKey);
        warnings.push("corrupt_undo_record_stashed");
      }
    }
  } catch {
    return { ok: false, reason: "driver_error" };
  }

  // ── blob readers (corrupt blob → refusal with raw bytes, never a wipe) ────

  async function readMap(
    collection: string,
  ): Promise<{ ok: true; map: Record<string, unknown> } | { ok: false; reason: string; raw?: string }> {
    let raw: string | null;
    try {
      raw = await kv.getItem(docsKey(collection));
    } catch {
      return { ok: false, reason: "driver_error" };
    }
    if (raw === null) return { ok: true, map: {} };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) return { ok: false, reason: "corrupt_collection_blob", raw };
      return { ok: true, map: parsed };
    } catch {
      return { ok: false, reason: "corrupt_collection_blob", raw };
    }
  }

  async function readLog(): Promise<{ ok: true; blob: LogBlob } | { ok: false; reason: string; raw?: string }> {
    let raw: string | null;
    try {
      raw = await kv.getItem(logKey);
    } catch {
      return { ok: false, reason: "driver_error" };
    }
    if (raw === null) return { ok: true, blob: { last_seq: 0, entries: [] } };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        !isRecord(parsed) ||
        typeof parsed.last_seq !== "number" ||
        !Number.isFinite(parsed.last_seq) ||
        !Array.isArray(parsed.entries)
      ) {
        return { ok: false, reason: "corrupt_log_blob", raw };
      }
      return { ok: true, blob: { last_seq: parsed.last_seq, entries: parsed.entries } };
    } catch {
      return { ok: false, reason: "corrupt_log_blob", raw };
    }
  }

  // ── write-then-swap ────────────────────────────────────────────────────────

  async function safeApply(writes: readonly { key: string; value: string | null }[]): Promise<PutResult> {
    if (writes.length === 0) return { ok: true };
    const undo: { key: string; prev: string | null }[] = [];
    try {
      for (const w of writes) undo.push({ key: w.key, prev: await kv.getItem(w.key) });
      await kv.setItem(undoKey, JSON.stringify({ writes: undo }));
    } catch {
      return { ok: false, reason: "driver_error" }; // nothing applied yet
    }
    try {
      for (const w of writes) {
        if (w.value === null) await kv.removeItem(w.key);
        else await kv.setItem(w.key, w.value);
      }
      await kv.removeItem(undoKey);
      return { ok: true };
    } catch {
      // immediate best-effort rollback; if the driver is dead the undo record
      // stays behind and openKvStorage rolls back on the next open.
      try {
        for (const u of undo) {
          if (u.prev === null) await kv.removeItem(u.key);
          else await kv.setItem(u.key, u.prev);
        }
        await kv.removeItem(undoKey);
      } catch {
        /* recovery deferred to next open */
      }
      return { ok: false, reason: "driver_error" };
    }
  }

  const storage: StorageAdapter = {
    docs: {
      async put(collection, id, doc): Promise<PutResult> {
        return storage.commit([{ type: "put", collection, id, doc }]);
      },
      async get(collection, id): Promise<DocGetResult> {
        const r = await readMap(collection);
        if (!r.ok) return r.raw !== undefined ? { ok: false, reason: r.reason, raw: r.raw } : { ok: false, reason: r.reason };
        const doc = r.map[id];
        return { ok: true, doc: doc === undefined ? null : doc };
      },
      async getAll(collection): Promise<DocGetAllResult> {
        const r = await readMap(collection);
        if (!r.ok) return r.raw !== undefined ? { ok: false, reason: r.reason, raw: r.raw } : { ok: false, reason: r.reason };
        const docs = Object.keys(r.map)
          .sort()
          .map((id) => ({ id, doc: r.map[id] }));
        return { ok: true, docs, invalid: [] }; // blob-level corruption is all-or-nothing here
      },
      async remove(collection, id): Promise<PutResult> {
        return storage.commit([{ type: "remove", collection, id }]);
      },
    },
    log: {
      async append(entry): Promise<PutResult> {
        return storage.commit([], entry);
      },
      async readFrom(after_seq): Promise<LogReadResult> {
        const r = await readLog();
        if (!r.ok) return r.raw !== undefined ? { ok: false, reason: r.reason, raw: r.raw } : { ok: false, reason: r.reason };
        const entries: { seq: number; entry: unknown }[] = [];
        for (const e of r.blob.entries) {
          const seq = seqOf(e);
          if (seq !== null && seq > after_seq) entries.push({ seq, entry: e });
          // garbage entries (no numeric seq) only surface on a full scan so
          // the caller can quarantine them — never silently dropped
          else if (seq === null && after_seq <= 0) entries.push({ seq: 0, entry: e });
        }
        entries.sort((a, b) => a.seq - b.seq);
        return { ok: true, entries };
      },
      async prune(upto_seq): Promise<PutResult> {
        const r = await readLog();
        if (!r.ok) return { ok: false, reason: r.reason };
        // entries without a numeric seq are KEPT (they are corrupt data —
        // quarantined by the repos on open, never deleted here)
        const kept = r.blob.entries.filter((e) => {
          const seq = seqOf(e);
          return seq === null || seq > upto_seq;
        });
        return safeApply([
          { key: logKey, value: JSON.stringify({ last_seq: r.blob.last_seq, entries: kept }) },
        ]);
      },
      async lastSeq(): Promise<LastSeqResult> {
        const r = await readLog();
        if (!r.ok) return { ok: false, reason: r.reason };
        let max = r.blob.last_seq;
        for (const e of r.blob.entries) {
          const seq = seqOf(e);
          if (seq !== null && seq > max) max = seq;
        }
        return { ok: true, seq: max };
      },
    },
    async commit(ops, entry): Promise<PutResult> {
      // group doc ops per collection, apply onto fresh copies of the blobs
      const order: string[] = [];
      const maps = new Map<string, Record<string, unknown>>();
      for (const op of ops) {
        if (!maps.has(op.collection)) {
          const r = await readMap(op.collection);
          if (!r.ok) return { ok: false, reason: r.reason, ...(r.raw !== undefined ? { raw: r.raw } : {}) };
          maps.set(op.collection, { ...r.map });
          order.push(op.collection);
        }
        const m = maps.get(op.collection) as Record<string, unknown>;
        if (op.type === "put") m[op.id] = op.doc;
        else delete m[op.id];
      }
      const writes: { key: string; value: string | null }[] = [];
      try {
        for (const collection of order) {
          writes.push({ key: docsKey(collection), value: JSON.stringify(maps.get(collection)) });
        }
        if (entry !== undefined) {
          const r = await readLog();
          if (!r.ok) return { ok: false, reason: r.reason, ...(r.raw !== undefined ? { raw: r.raw } : {}) };
          for (const e of r.blob.entries) {
            if (seqOf(e) === entry.seq) return { ok: false, reason: "duplicate_seq" };
          }
          const blob: LogBlob = {
            last_seq: Math.max(r.blob.last_seq, entry.seq),
            entries: [...r.blob.entries, entry],
          };
          writes.push({ key: logKey, value: JSON.stringify(blob) });
        }
      } catch {
        return { ok: false, reason: "unserializable_doc" };
      }
      return safeApply(writes);
    },
  };

  return { ok: true, storage, warnings };
}
