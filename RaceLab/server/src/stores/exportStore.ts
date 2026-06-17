/**
 * ExportStore — the repository seam for GDPR data-export jobs (P2, D17:
 * store-side of the legal blocker). One implementation here over an INJECTED
 * QueryFn (no pg/neon dependency committed — wired at deploy, same style as
 * src/db.ts makeSqlDb); the in-memory fake lives in src/test-export.ts only.
 *
 * Export is a TWO-PHASE async right (GDPR Art. 20 portability, pairs with the
 * Art. 17 erasure of DELETE /api/account):
 *   1. POST creates a 'pending' job row (this store);
 *   2. an out-of-band WORKER assembles the archive (all domain blobs + media
 *      refs + billing history), uploads it, and flips the row to
 *      'ready' + url (or 'failed'). The worker is a DEPLOY concern and is NOT
 *      part of this module — this store only owns the job ledger the API
 *      reads/writes.
 *
 * OWNER-SCOPED: every read is keyed on (user_id, job_id); a job_id is never
 * sufficient on its own to reach a row, so one user can never see another
 * user's job (or its url). No body-supplied id is ever trusted for ownership.
 *
 * SQL here mirrors EXPORT_SCHEMA_SQL below — change them together.
 */

import type { QueryFn } from "../db";

export type ExportJobStatus = "pending" | "ready" | "failed";

/** The repository interface the export handler consumes. */
export interface ExportStore {
  /** Create a fresh export job for this user, returning its id + 'pending'
   *  status. The id is SERVER-generated — clients never supply it. */
  createJob(userId: string, atIso: string): Promise<{ job_id: string; status: "pending" }>;
  /** Owner-scoped fetch: returns the job ONLY when it belongs to userId, else
   *  null (a foreign or missing job_id is indistinguishable — both 404 at the
   *  handler, so existence of another user's job never leaks). url is non-null
   *  only once the worker has flipped status to 'ready'. */
  getJob(
    userId: string,
    jobId: string,
  ): Promise<{ status: ExportJobStatus; url: string | null } | null>;
}

export function makeSqlExportStore(query: QueryFn): ExportStore {
  return {
    async createJob(userId, atIso) {
      const { rows } = await query(
        `INSERT INTO export_jobs (job_id, user_id, status, url, created_at)
         VALUES ($1, $2, 'pending', NULL, $3::timestamptz)
         RETURNING job_id, status`,
        [genJobId(), userId, atIso],
      );
      const r = rows[0];
      return { job_id: String(r.job_id), status: "pending" };
    },

    async getJob(userId, jobId) {
      // BOTH user_id AND job_id in the predicate — ownership is enforced in the
      // query, not after it. A foreign job_id matches zero rows -> null -> 404.
      const { rows } = await query(
        `SELECT status, url FROM export_jobs
         WHERE user_id = $1 AND job_id = $2`,
        [userId, jobId],
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        status: String(r.status) as ExportJobStatus,
        url: r.url === null || r.url === undefined ? null : String(r.url),
      };
    },
  };
}

/** Server-generated, UNGUESSABLE job id ("exp-..."). REQUIRES crypto.randomUUID
 *  (Node 18+ / the edge runtime) — and FAILS LOUDLY if it is absent rather than
 *  falling back to Date.now()+Math.random() (audit MED): a guessable job id is an
 *  IDOR lever (a job_id is the only thing besides the owner predicate gating an
 *  export archive's signed url). A throw here surfaces as the route's 500 instead
 *  of silently minting predictable ids. */
function genJobId(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("export_job_id_unavailable: crypto.randomUUID is required (no guessable fallback)");
  }
  return `exp-${globalThis.crypto.randomUUID()}`;
}

// ── schema (mirrors db/schema.sql style; applied alongside it) ────────────────

/**
 * export_jobs: the GDPR data-export job ledger (Art. 20 portability). One row
 * per requested archive. status is the worker-owned lifecycle fact
 * (pending -> ready | failed); url is the signed download location the worker
 * writes when the archive is uploaded (null until then). Rows are PER-USER and
 * read owner-scoped — a job_id alone never reaches a row.
 *
 * Wiped by DELETE /api/account's user cascade (ON DELETE CASCADE) so an erased
 * user leaves no export artifacts behind.
 */
export const EXPORT_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS export_jobs (
  job_id     TEXT PRIMARY KEY,                                  -- server-generated ("exp-...")
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'ready', 'failed')),
  url        TEXT,                                              -- signed archive url, null until worker readies it
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS export_jobs_user ON export_jobs (user_id, created_at);`;
