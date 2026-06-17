/**
 * ── DEVICE-ONLY GLUE ─────────────────────────────────────────────────────────
 * Maps expo-sqlite's async API (SDK 56) onto the injected SqlExecutor shape.
 *
 * - NO expo dependency in this package: the database object is typed
 *   STRUCTURALLY (`ExpoSqliteDatabase` is the subset of expo-sqlite's
 *   SQLiteDatabase we touch) and passed in by the app:
 *
 *     import * as SQLite from "expo-sqlite";
 *     import { expoSqliteExecutor, openSqliteStorage } from "racelab-storage";
 *     const db = await SQLite.openDatabaseAsync("racelab.db");
 *     const opened = await openSqliteStorage(expoSqliteExecutor(db));
 *
 * - EXCLUDED FROM NODE TESTS: nothing in test-storage.ts imports this file;
 *   it only typechecks. The adapter logic it feeds (sqlite.ts) is fully
 *   covered by tests through fake executors.
 */

import type { SqlExecutor, SqlStatement, SqlValue } from "./interfaces";

/** Structural subset of expo-sqlite's SQLiteDatabase (SDK 56 async API). */
export interface ExpoSqliteDatabase {
  getAllAsync(source: string, params?: readonly SqlValue[]): Promise<unknown[]>;
  runAsync(source: string, params?: readonly SqlValue[]): Promise<unknown>;
  execAsync(source: string): Promise<void>;
  /** present on SDK 56 databases — used for the transactional batch */
  withTransactionAsync?(task: () => Promise<void>): Promise<void>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

const READ_RE = /^\s*select\b/i;

/** Wrap an opened expo-sqlite database as a SqlExecutor (with `batch`). */
export function expoSqliteExecutor(db: ExpoSqliteDatabase): SqlExecutor {
  return {
    async execute(sql, params) {
      if (READ_RE.test(sql)) {
        const rows = await db.getAllAsync(sql, params ?? []);
        return { rows: rows.filter(isRecord) };
      }
      await db.runAsync(sql, params ?? []);
      return { rows: [] };
    },
    async batch(statements: readonly SqlStatement[]) {
      if (db.withTransactionAsync !== undefined) {
        await db.withTransactionAsync(async () => {
          for (const s of statements) await db.runAsync(s.sql, s.params ?? []);
        });
        return;
      }
      await db.execAsync("BEGIN");
      try {
        for (const s of statements) await db.runAsync(s.sql, s.params ?? []);
        await db.execAsync("COMMIT");
      } catch (e) {
        try {
          await db.execAsync("ROLLBACK");
        } catch {
          /* connection dead — sqlite rolls back the open txn itself */
        }
        throw e;
      }
    },
  };
}
