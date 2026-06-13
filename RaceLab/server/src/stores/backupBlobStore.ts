/**
 * BlobBackupStore — the repository seam for the backup DOMAIN-BLOB surface
 * (D11: backup = whole-domain blob put/get, NOT entity-by-entity sync). One
 * row per (user_id, domain); the {format, state} envelope is stored VERBATIM
 * and OPAQUE — the server never reads, migrates, or validates state (D11: no
 * server-side migration). updated_at is the optimistic-concurrency token.
 *
 * Two implementations:
 *  - makeSqlBackupBlobStore(query): the real one, over an INJECTED QueryFn
 *    (no pg/neon dep committed — wired at deploy, mirrors src/db.ts style).
 *  - the in-memory fake in src/test-backupBlob.ts (handlers stay pure-function
 *    testable against it).
 *
 * SQL here mirrors BACKUP_BLOBS_SCHEMA_SQL below — change them together.
 */

import type { QueryFn } from "../db";

/** What lives in a row (the opaque client envelope + the server cursor). */
export interface BackupBlob {
  format: number;
  state: unknown;
  updated_at: string;
}

/** Result of an optimistic-concurrency put. */
export type BackupBlobPutResult =
  | { ok: true; updated_at: string }
  | { ok: false; reason: "conflict"; current_updated_at: string };

export interface BlobBackupStore {
  /** This user's blob for `domain`, or null if never written. OWNER-SCOPED. */
  get(userId: string, domain: string): Promise<BackupBlob | null>;
  /**
   * Upsert (user_id, domain) -> {format, state} with updated_at = updatedAt.
   * Optimistic concurrency: when a row already exists and `baseUpdatedAt` does
   * NOT equal the stored updated_at, the write is REJECTED as a conflict (the
   * caller is writing over a newer server copy). `baseUpdatedAt === undefined`
   * means "create if absent" — and is itself a conflict if a row already
   * exists (the client thought there was nothing to clobber). Same base ->
   * idempotent set.
   */
  put(
    userId: string,
    domain: string,
    format: number,
    state: unknown,
    updatedAt: string,
    baseUpdatedAt: string | undefined,
  ): Promise<BackupBlobPutResult>;
}

export function makeSqlBackupBlobStore(query: QueryFn): BlobBackupStore {
  return {
    async get(userId, domain) {
      const { rows } = await query(
        `SELECT format, state, updated_at
         FROM backup_blobs
         WHERE user_id = $1 AND domain = $2`,
        [userId, domain],
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        format: Number(r.format),
        state: r.state, // opaque — passed through verbatim (D11)
        updated_at: isoOf(r.updated_at),
      };
    },

    async put(userId, domain, format, state, updatedAt, baseUpdatedAt) {
      // Single conditional upsert. The INSERT path fires when no row exists;
      // ON CONFLICT updates ONLY when the stored updated_at matches the
      // client's base (so concurrent writers can't clobber a newer copy).
      // A no-op (conflict) returns zero rows, which we then disambiguate with
      // one read of the current cursor.
      const baseProvided = baseUpdatedAt !== undefined;
      const { rows } = await query(
        `INSERT INTO backup_blobs (user_id, domain, format, state, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)
         ON CONFLICT (user_id, domain) DO UPDATE
           SET format = EXCLUDED.format,
               state = EXCLUDED.state,
               updated_at = EXCLUDED.updated_at
           WHERE $6::boolean = true
             AND backup_blobs.updated_at = $7::timestamptz
         RETURNING updated_at`,
        [
          userId,
          domain,
          format,
          JSON.stringify(state ?? null),
          updatedAt,
          baseProvided,
          baseProvided ? baseUpdatedAt : updatedAt, // unused when baseProvided=false
        ],
      );
      if (rows.length > 0) {
        return { ok: true, updated_at: isoOf(rows[0].updated_at) };
      }
      // Zero rows -> a row already existed and the WHERE guard failed: conflict.
      // Read back the authoritative current cursor for the client to rebase on.
      const cur = await query(
        `SELECT updated_at FROM backup_blobs WHERE user_id = $1 AND domain = $2`,
        [userId, domain],
      );
      const current_updated_at = cur.rows.length > 0 ? isoOf(cur.rows[0].updated_at) : updatedAt;
      return { ok: false, reason: "conflict", current_updated_at };
    },
  };
}

/** Drivers return timestamptz as Date or string depending on config. neon
 *  returns timestamptz as pg TEXT ("2026-06-13 12:00:00+00"); normalize that to
 *  strict ISO so the wire output is always ISO-8601, never a raw pg string. */
function isoOf(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

// backup_blobs: one whole-domain snapshot per (user_id, domain). D11 — this is
// a backup blob, NOT an entity-sync table: {format, state} is the OPAQUE client
// envelope, stored verbatim, never read/migrated server-side. updated_at is the
// optimistic-concurrency token the client rebases on (server_newer -> 409).
// domain is a free string validated at the handler (garage|tracks|logbook|
// reports|account or sheets:<carId>).
export const BACKUP_BLOBS_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS backup_blobs (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain     TEXT NOT NULL,                                -- garage|tracks|logbook|reports|account|sheets:<carId>
  format     INT NOT NULL,                                 -- client envelope schema version (opaque to server)
  state      JSONB NOT NULL,                               -- whole-domain snapshot, stored VERBATIM (D11 — no server migration)
  updated_at TIMESTAMPTZ NOT NULL,                         -- optimistic-concurrency token (set to server now on each put)
  PRIMARY KEY (user_id, domain)
);`;
