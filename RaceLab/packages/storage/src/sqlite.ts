/**
 * SQLite adapter — DocStore + AppendLog + transactional commit over an
 * injected SqlExecutor. Pure SQL strings, always parameterized; the exact
 * statements are exported (`SQL`) so tests can fake the executor by matching
 * them and device code can inspect what will run.
 *
 * Tables:
 *   docs(collection TEXT, id TEXT, json TEXT, PK(collection, id))
 *   log (seq INTEGER PRIMARY KEY, json TEXT)         — outbox journal
 *   meta(key TEXT PRIMARY KEY, value TEXT)           — 'last_seq' high-water
 *                                                       mark (survives prune)
 *
 * Transactions: multi-step writes go through the driver's `batch` when it
 * exists (all-or-nothing by contract), otherwise BEGIN/COMMIT with a
 * best-effort ROLLBACK on failure. Real SQLite rolls an uncommitted
 * transaction back when the process dies — a kill mid-write is therefore
 * never partially visible on the next open (the kill-mid-write test emulates
 * exactly that recovery).
 *
 * Single-writer assumption: one logical writer at a time (the app's store) —
 * transactions are not nested.
 */

import type {
  DocGetAllResult,
  DocGetResult,
  LastSeqResult,
  LogReadResult,
  PutResult,
  SqlExecutor,
  SqlStatement,
  StorageAdapter,
} from "./interfaces";

export const SQL = {
  createDocs:
    "CREATE TABLE IF NOT EXISTS docs (collection TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (collection, id))",
  createLog: "CREATE TABLE IF NOT EXISTS log (seq INTEGER PRIMARY KEY, json TEXT NOT NULL)",
  createMeta: "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  putDoc: "INSERT OR REPLACE INTO docs (collection, id, json) VALUES (?, ?, ?)",
  getDoc: "SELECT json FROM docs WHERE collection = ? AND id = ?",
  getAllDocs: "SELECT id, json FROM docs WHERE collection = ? ORDER BY id",
  removeDoc: "DELETE FROM docs WHERE collection = ? AND id = ?",
  appendLog: "INSERT INTO log (seq, json) VALUES (?, ?)",
  seqExists: "SELECT 1 AS x FROM log WHERE seq = ? LIMIT 1",
  readLogFrom: "SELECT seq, json FROM log WHERE seq > ? ORDER BY seq",
  pruneLog: "DELETE FROM log WHERE seq <= ?",
  maxLogSeq: "SELECT MAX(seq) AS max_seq FROM log",
  setMeta: "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
  getMeta: "SELECT value FROM meta WHERE key = ?",
  begin: "BEGIN",
  commit: "COMMIT",
  rollback: "ROLLBACK",
} as const;

const LAST_SEQ_KEY = "last_seq";

function parseCell(raw: unknown): { ok: true; value: unknown } | { ok: false; raw: string } {
  const s = typeof raw === "string" ? raw : String(raw);
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false, raw: s };
  }
}

function jsonOf(doc: object): { ok: true; json: string } | { ok: false } {
  try {
    const json = JSON.stringify(doc);
    if (typeof json !== "string") return { ok: false };
    return { ok: true, json };
  } catch {
    return { ok: false };
  }
}

export async function openSqliteStorage(
  executor: SqlExecutor,
): Promise<{ ok: true; storage: StorageAdapter } | { ok: false; reason: string }> {
  try {
    await executor.execute(SQL.createDocs);
    await executor.execute(SQL.createLog);
    await executor.execute(SQL.createMeta);
  } catch {
    return { ok: false, reason: "driver_error" };
  }

  /** Run statements all-or-nothing. */
  async function transact(stmts: readonly SqlStatement[]): Promise<PutResult> {
    if (stmts.length === 0) return { ok: true };
    if (stmts.length === 1) {
      // a single statement is atomic in SQLite on its own
      try {
        await executor.execute(stmts[0].sql, stmts[0].params);
        return { ok: true };
      } catch {
        return { ok: false, reason: "driver_error" };
      }
    }
    if (executor.batch !== undefined) {
      try {
        await executor.batch(stmts);
        return { ok: true };
      } catch {
        return { ok: false, reason: "driver_error" };
      }
    }
    try {
      await executor.execute(SQL.begin);
    } catch {
      return { ok: false, reason: "driver_error" };
    }
    try {
      for (const s of stmts) await executor.execute(s.sql, s.params);
      await executor.execute(SQL.commit);
      return { ok: true };
    } catch {
      try {
        await executor.execute(SQL.rollback);
      } catch {
        // driver dead mid-transaction: SQLite itself rolls the open
        // transaction back when the connection/process dies — recovery
        // happens at the next open, nothing partial survives.
      }
      return { ok: false, reason: "driver_error" };
    }
  }

  const storage: StorageAdapter = {
    docs: {
      async put(collection, id, doc): Promise<PutResult> {
        const j = jsonOf(doc);
        if (!j.ok) return { ok: false, reason: "unserializable_doc" };
        return transact([{ sql: SQL.putDoc, params: [collection, id, j.json] }]);
      },
      async get(collection, id): Promise<DocGetResult> {
        try {
          const { rows } = await executor.execute(SQL.getDoc, [collection, id]);
          if (rows.length === 0) return { ok: true, doc: null };
          const p = parseCell(rows[0].json);
          if (!p.ok) return { ok: false, reason: "invalid_json", raw: p.raw };
          return { ok: true, doc: p.value };
        } catch {
          return { ok: false, reason: "driver_error" };
        }
      },
      async getAll(collection): Promise<DocGetAllResult> {
        try {
          const { rows } = await executor.execute(SQL.getAllDocs, [collection]);
          const docs: { id: string; doc: unknown }[] = [];
          const invalid: { id: string; raw: string }[] = [];
          for (const row of rows) {
            const id = String(row.id);
            const p = parseCell(row.json);
            if (p.ok) docs.push({ id, doc: p.value });
            else invalid.push({ id, raw: p.raw });
          }
          return { ok: true, docs, invalid };
        } catch {
          return { ok: false, reason: "driver_error" };
        }
      },
      async remove(collection, id): Promise<PutResult> {
        return transact([{ sql: SQL.removeDoc, params: [collection, id] }]);
      },
    },
    log: {
      async append(entry): Promise<PutResult> {
        const j = jsonOf(entry);
        if (!j.ok) return { ok: false, reason: "unserializable_doc" };
        const r = await transact([
          { sql: SQL.appendLog, params: [entry.seq, j.json] },
          { sql: SQL.setMeta, params: [LAST_SEQ_KEY, String(entry.seq)] },
        ]);
        // Match memory/kv: a PRIMARY KEY collision on seq is a DUPLICATE append,
        // not a generic fault. Disambiguate ONLY on the failure path (the seq
        // already exists) — no read on the hot success path. A real driver fault
        // leaves the seq absent and stays driver_error.
        if (!r.ok && r.reason === "driver_error") {
          try {
            const { rows } = await executor.execute(SQL.seqExists, [entry.seq]);
            if (rows.length > 0) return { ok: false, reason: "duplicate_seq" };
          } catch {
            // fall through to the original driver_error
          }
        }
        return r;
      },
      async readFrom(after_seq): Promise<LogReadResult> {
        try {
          const { rows } = await executor.execute(SQL.readLogFrom, [after_seq]);
          const entries = rows.map((row) => {
            const seq = Number(row.seq);
            const p = parseCell(row.json);
            return { seq, entry: p.ok ? p.value : p.raw };
          });
          return { ok: true, entries };
        } catch {
          return { ok: false, reason: "driver_error" };
        }
      },
      async prune(upto_seq): Promise<PutResult> {
        return transact([{ sql: SQL.pruneLog, params: [upto_seq] }]);
      },
      async lastSeq(): Promise<LastSeqResult> {
        try {
          const meta = await executor.execute(SQL.getMeta, [LAST_SEQ_KEY]);
          const fromMeta = meta.rows.length > 0 ? Number(meta.rows[0].value) : 0;
          const max = await executor.execute(SQL.maxLogSeq);
          const v = max.rows.length > 0 ? max.rows[0].max_seq : null;
          const fromLog = typeof v === "number" && Number.isFinite(v) ? v : 0;
          const seq = Math.max(
            Number.isFinite(fromMeta) ? fromMeta : 0,
            fromLog,
          );
          return { ok: true, seq };
        } catch {
          return { ok: false, reason: "driver_error" };
        }
      },
    },
    async commit(ops, entry): Promise<PutResult> {
      const stmts: SqlStatement[] = [];
      for (const op of ops) {
        if (op.type === "put") {
          const j = jsonOf(op.doc);
          if (!j.ok) return { ok: false, reason: "unserializable_doc" };
          stmts.push({ sql: SQL.putDoc, params: [op.collection, op.id, j.json] });
        } else {
          stmts.push({ sql: SQL.removeDoc, params: [op.collection, op.id] });
        }
      }
      if (entry !== undefined) {
        const j = jsonOf(entry);
        if (!j.ok) return { ok: false, reason: "unserializable_doc" };
        stmts.push({ sql: SQL.appendLog, params: [entry.seq, j.json] });
        stmts.push({ sql: SQL.setMeta, params: [LAST_SEQ_KEY, String(entry.seq)] });
      }
      const r = await transact(stmts);
      // Match log.append()/memory/kv: a seq PRIMARY KEY collision is a DUPLICATE,
      // not a generic fault. commit() is the path mutate() actually calls, so
      // without this it reported a recoverable seq desync as an indistinguishable-
      // from-transient driver_error, breaking the cross-adapter contract (and any
      // caller's retry-on-driver_error would loop forever). Disambiguate ONLY on
      // the failure path (no hot-path read); a real fault leaves the seq absent.
      if (entry !== undefined && !r.ok && r.reason === "driver_error") {
        try {
          const { rows } = await executor.execute(SQL.seqExists, [entry.seq]);
          if (rows.length > 0) return { ok: false, reason: "duplicate_seq" };
        } catch {
          // fall through to the original driver_error
        }
      }
      return r;
    },
  };
  return { ok: true, storage };
}
