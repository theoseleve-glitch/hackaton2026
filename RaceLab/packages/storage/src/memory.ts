/**
 * In-memory adapter — the reference implementation of DocStore + AppendLog +
 * commit, used by tests and as the executable spec for the sqlite/kv adapters.
 *
 * Values are stored as JSON STRINGS (exactly like the device adapters) so
 * everything round-trips through JSON here too — a doc that would corrupt on
 * device corrupts here, in a unit test.
 *
 * Also hosts `memoryKeyValueDriver`, an AsyncStorage-shaped in-memory driver
 * for kv-adapter and migration tests.
 */

import type {
  DocGetAllResult,
  DocGetResult,
  DocOp,
  KeyValueDriver,
  LastSeqResult,
  LogReadResult,
  PutResult,
  StorageAdapter,
} from "./interfaces";
import type { OutboxEntry } from "../../schema/src/index";

export interface MemoryStorage extends StorageAdapter {
  /** TEST HOOK: overwrite a doc cell with arbitrary bytes (corruption injection). */
  pokeDoc(collection: string, id: string, raw: string): void;
  /** TEST HOOK: overwrite a log cell with arbitrary bytes (corruption injection). */
  pokeLog(seq: number, raw: string): void;
}

function stringify(value: unknown): { ok: true; json: string } | { ok: false } {
  try {
    const json = JSON.stringify(value);
    if (typeof json !== "string") return { ok: false };
    return { ok: true, json };
  } catch {
    return { ok: false };
  }
}

function parseCell(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

export function memoryStorage(): MemoryStorage {
  const docs = new Map<string, Map<string, string>>(); // collection -> id -> json
  const log = new Map<number, string>(); // seq -> json
  let lastSeq = 0; // high-water mark — survives pruning

  function coll(name: string): Map<string, string> {
    let m = docs.get(name);
    if (m === undefined) {
      m = new Map();
      docs.set(name, m);
    }
    return m;
  }

  function applyOps(ops: readonly DocOp[], entry?: OutboxEntry): PutResult {
    // stage 1: serialize everything BEFORE touching state (all-or-nothing)
    const staged: { collection: string; id: string; json: string | null }[] = [];
    for (const op of ops) {
      if (op.type === "put") {
        const s = stringify(op.doc);
        if (!s.ok) return { ok: false, reason: "unserializable_doc" };
        staged.push({ collection: op.collection, id: op.id, json: s.json });
      } else {
        staged.push({ collection: op.collection, id: op.id, json: null });
      }
    }
    let entryJson: string | null = null;
    if (entry !== undefined) {
      if (log.has(entry.seq)) return { ok: false, reason: "duplicate_seq" };
      const s = stringify(entry);
      if (!s.ok) return { ok: false, reason: "unserializable_doc" };
      entryJson = s.json;
    }
    // stage 2: apply synchronously (no interleaving point — atomic)
    for (const w of staged) {
      if (w.json === null) coll(w.collection).delete(w.id);
      else coll(w.collection).set(w.id, w.json);
    }
    if (entry !== undefined && entryJson !== null) {
      log.set(entry.seq, entryJson);
      if (entry.seq > lastSeq) lastSeq = entry.seq;
    }
    return { ok: true };
  }

  return {
    docs: {
      async put(collection, id, doc): Promise<PutResult> {
        return applyOps([{ type: "put", collection, id, doc }]);
      },
      async get(collection, id): Promise<DocGetResult> {
        const raw = coll(collection).get(id);
        if (raw === undefined) return { ok: true, doc: null };
        const p = parseCell(raw);
        if (!p.ok) return { ok: false, reason: "invalid_json", raw };
        return { ok: true, doc: p.value };
      },
      async getAll(collection): Promise<DocGetAllResult> {
        const out: { id: string; doc: unknown }[] = [];
        const invalid: { id: string; raw: string }[] = [];
        const ids = [...coll(collection).keys()].sort();
        for (const id of ids) {
          const raw = coll(collection).get(id) as string;
          const p = parseCell(raw);
          if (p.ok) out.push({ id, doc: p.value });
          else invalid.push({ id, raw });
        }
        return { ok: true, docs: out, invalid };
      },
      async remove(collection, id): Promise<PutResult> {
        return applyOps([{ type: "remove", collection, id }]);
      },
    },
    log: {
      async append(entry): Promise<PutResult> {
        return applyOps([], entry);
      },
      async readFrom(after_seq): Promise<LogReadResult> {
        const seqs = [...log.keys()].sort((a, b) => a - b);
        const entries: { seq: number; entry: unknown }[] = [];
        for (const seq of seqs) {
          if (seq <= after_seq) continue;
          const raw = log.get(seq) as string;
          const p = parseCell(raw);
          entries.push({ seq, entry: p.ok ? p.value : raw });
        }
        return { ok: true, entries };
      },
      async prune(upto_seq): Promise<PutResult> {
        for (const seq of [...log.keys()]) {
          if (seq <= upto_seq) log.delete(seq);
        }
        return { ok: true };
      },
      async lastSeq(): Promise<LastSeqResult> {
        return { ok: true, seq: lastSeq };
      },
    },
    async commit(ops, entry): Promise<PutResult> {
      return applyOps(ops, entry);
    },
    pokeDoc(collection, id, raw) {
      coll(collection).set(id, raw);
    },
    pokeLog(seq, raw) {
      log.set(seq, raw);
      if (seq > lastSeq) lastSeq = seq;
    },
  };
}

/** AsyncStorage-shaped in-memory driver (per-key atomic, like the real thing). */
export function memoryKeyValueDriver(
  initial?: Readonly<Record<string, string>>,
): KeyValueDriver & { snapshot(): Record<string, string> } {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    async getItem(key) {
      const v = map.get(key);
      return v === undefined ? null : v;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
    async getAllKeys() {
      return [...map.keys()];
    },
    snapshot() {
      return Object.fromEntries(map.entries());
    },
  };
}
