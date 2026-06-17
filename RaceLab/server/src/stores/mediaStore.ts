/**
 * MediaStore + BlobStore seams for POST /api/media/upload-url.
 *
 * D11: backup is a whole-domain blob put/get, NOT entity sync — this module is
 * the OTHER kind of blob: per-photo/PDF binaries that live OUTSIDE the domain
 * journal. The upload handler hands out a short-lived presigned PUT and records
 * an accounting row (for the per-user quota); the bytes themselves never touch
 * this server (BlobStore -> Supabase Storage / S3 presigned PUT at deploy).
 * D10: share artifacts reference media by id — see EXIF note in the handler.
 *
 * Two seams, both interfaces (zero committed runtime deps):
 *  - BlobStore: presign a PUT for an owner-scoped key (provider-agnostic).
 *  - MediaStore: the accounting repo — makeSqlMediaStore(query) is the real one,
 *    the in-memory fake lives in src/test-media.ts.
 *
 * SQL here mirrors db/schema.sql style — change them together.
 */

import type { QueryFn } from "../db";

/** Presigned blob PUT capability (Supabase Storage / S3 at deploy). The bytes
 *  are uploaded by the client DIRECTLY to the blob provider, never via us. */
export interface BlobStore {
  presignPut(
    key: string,
    mime: string,
    maxBytes: number,
  ): Promise<{ url: string; headers?: Record<string, string>; expires_at: string }>;
}

/** Per-user media accounting (the quota ledger). Bytes are the declared upload
 *  size; the row is owner-scoped by userId.
 *
 *  The quota decision lives INSIDE the store as ONE atomic conditional insert
 *  (no read-then-write TOCTOU): two concurrent requests that would jointly
 *  exceed QUOTA can never both succeed — the SUM is re-evaluated against the
 *  committed table at insert time, so at most the one that keeps the running
 *  total within QUOTA inserts. The handler presigns ONLY after a confirmed
 *  insert. */
export interface MediaStore {
  /** Atomically reserve `bytes` of `userId`'s quota by inserting the accounting
   *  row IFF (already-used + bytes) <= quotaBytes. Returns true when the row was
   *  inserted (quota reserved), false when it would have exceeded the quota (or
   *  the media_id already exists — idempotent no-op). No separate read step, so
   *  concurrent callers can't both blow past the cap. */
  tryRecord(
    userId: string,
    mediaId: string,
    mime: string,
    bytes: number,
    quotaBytes: number,
    atIso: string,
  ): Promise<boolean>;
  /** Mark the user's reserved row `confirmed` once the client's PUT is verified.
   *  Owner-scoped (keyed on user_id AND media_id, so one user can never confirm
   *  another's reservation). Returns true when a matching unconfirmed row was
   *  flipped, false when there was nothing to confirm (unknown/foreign id, or it
   *  was already confirmed — idempotent). A row stays UNconfirmed (and is
   *  therefore swept by the presign cron) until this lands. */
  confirm(userId: string, mediaId: string): Promise<boolean>;
}

export function makeSqlMediaStore(query: QueryFn): MediaStore {
  return {
    async tryRecord(userId, mediaId, mime, bytes, quotaBytes, atIso) {
      // ONE atomic statement: the SUM sub-select is evaluated against the
      // committed media table inside the same insert, so the quota gate and the
      // write are indivisible — no usedBytes()-then-record() window for a
      // concurrent request to slip through and overshoot QUOTA.
      const { rows } = await query(
        `INSERT INTO media (media_id, user_id, mime, bytes, created_at)
         SELECT $1, $2, $3, $4::bigint, $6::timestamptz
         WHERE (SELECT COALESCE(SUM(bytes), 0) FROM media WHERE user_id = $2) + $4::bigint <= $5::bigint
         ON CONFLICT (media_id) DO NOTHING
         RETURNING media_id`,
        [mediaId, userId, mime, bytes, quotaBytes, atIso],
      );
      return rows.length > 0;
    },

    async confirm(userId, mediaId) {
      // Owner-scoped flip: both user_id AND media_id in the predicate so a foreign
      // media_id matches zero rows (no IDOR). DISTINCT FROM true makes it
      // idempotent — re-confirming an already-confirmed row is a no-op (0 rows).
      const { rows } = await query(
        `UPDATE media SET confirmed = true
         WHERE user_id = $1 AND media_id = $2 AND confirmed IS DISTINCT FROM true
         RETURNING media_id`,
        [userId, mediaId],
      );
      return rows.length > 0;
    },
  };
}

// media: per-user binary accounting for presigned uploads (photos / setup PDFs).
// media_id is server-generated and embeds the owner in the blob key
// (u/<user_id>/<media_id>); bytes is the DECLARED upload size and drives the
// per-user quota, which is enforced by an atomic conditional INSERT (the SUM is
// checked against this table inside the same statement — no read-then-write
// TOCTOU). The blob bytes live in object storage (Supabase/S3), NOT here.
// Cascades with the user wipe (account deletion) like every other owned row.
export const MEDIA_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS media (
  media_id   TEXT PRIMARY KEY,                          -- server-generated, embedded in the blob key
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime       TEXT NOT NULL,                             -- allowlisted at upload time
  bytes      BIGINT NOT NULL,                           -- declared upload size (quota accounting)
  confirmed  BOOLEAN NOT NULL DEFAULT false,            -- true once the upload PUT is verified (else swept)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_user ON media (user_id);`;
