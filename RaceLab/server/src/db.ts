/**
 * Db — the repository interface every handler consumes. Two implementations:
 *  - makeSqlDb(query): the real one, over an INJECTED query fn (no pg/neon
 *    dependency committed — wired at deploy, see below and src/deploy.ts).
 *  - the in-memory fake in src/test-server.ts (handlers are pure-function
 *    testable against it).
 *
 * Deploy wiring (the one-liner, runtime dep installed at deploy time only):
 *
 *   npm i @neondatabase/serverless
 *
 *   import { neon } from "@neondatabase/serverless";
 *   const sql = neon(process.env.DATABASE_URL!);
 *   const db = makeSqlDb(async (text, params) => ({
 *     rows: (await sql.query(text, params)) as Record<string, unknown>[],
 *   }));
 *
 * SQL here mirrors db/schema.sql — change them together.
 */

export type QueryFn = (
  sql: string,
  params?: readonly unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

export interface BackupEntryInput {
  entry_id: string; // client OutboxEntry.id ("ob-...") — the idempotency key
  ts: string;
  domain: string;
  op: string;
  payload: Record<string, unknown>;
}

export interface BackupRow extends BackupEntryInput {
  seq: number; // server-assigned restore cursor
  received_at: string;
}

export interface SubscriptionRow {
  status: string; // raw platform fact: 'active' | 'canceled' | 'expired'
  expires_at: string | null;
}

export interface Db {
  /** Upsert the user row (no-op when it exists). */
  ensureUser(user_id: string, now_iso: string): Promise<void>;
  /** FIRST-SEEN trial start: sets it only when null, always returns the stored
   *  value — later device claims can never move it. */
  recordTrialStart(user_id: string, started_at_iso: string, now_iso: string): Promise<string>;
  getSubscription(user_id: string): Promise<SubscriptionRow | null>;
  /** Idempotent on (user_id, entry_id): duplicates count as skipped. */
  insertBackupEntries(
    user_id: string,
    entries: readonly BackupEntryInput[],
    received_at_iso: string,
  ): Promise<{ inserted: number; skipped: number }>;
  /** Entries with seq > after_seq for THIS user only, seq ascending. */
  listBackupEntries(user_id: string, after_seq: number, limit: number): Promise<BackupRow[]>;
  /** Wipes users + subscriptions + backup_entries, writes the deletions
   *  tombstone (first requested_at wins). Idempotent. */
  deleteUserData(user_id: string, requested_at_iso: string): Promise<void>;
}

export function makeSqlDb(query: QueryFn): Db {
  return {
    async ensureUser(user_id, now_iso) {
      await query(
        `INSERT INTO users (id, created_at) VALUES ($1, $2::timestamptz)
         ON CONFLICT (id) DO NOTHING`,
        [user_id, now_iso],
      );
    },

    async recordTrialStart(user_id, started_at_iso, now_iso) {
      const { rows } = await query(
        `INSERT INTO users (id, created_at, trial_started_at)
         VALUES ($1, $3::timestamptz, $2::timestamptz)
         ON CONFLICT (id) DO UPDATE
           SET trial_started_at = COALESCE(users.trial_started_at, EXCLUDED.trial_started_at)
         RETURNING trial_started_at`,
        [user_id, started_at_iso, now_iso],
      );
      return isoOf(rows[0]?.trial_started_at);
    },

    async getSubscription(user_id) {
      // Post-B0 the Stripe webhook owns subscription truth in stripe_subscriptions
      // (current_period_end is the paid-through instant); the legacy `subscriptions`
      // table is superseded. Aliased to expires_at so SubscriptionRow + the
      // active/expired computation in subscriptionStatus stay unchanged. Both this
      // endpoint and /api/entitlement now read the same source.
      const { rows } = await query(
        `SELECT status, current_period_end AS expires_at FROM stripe_subscriptions WHERE user_id = $1`,
        [user_id],
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        status: String(r.status),
        expires_at: r.expires_at === null || r.expires_at === undefined ? null : isoOf(r.expires_at),
      };
    },

    async insertBackupEntries(user_id, entries, received_at_iso) {
      let inserted = 0;
      for (const e of entries) {
        const { rows } = await query(
          `INSERT INTO backup_entries (user_id, entry_id, ts, domain, op, payload, received_at)
           VALUES ($1, $2, $3::timestamptz, $4, $5, $6::jsonb, $7::timestamptz)
           ON CONFLICT (user_id, entry_id) DO NOTHING
           RETURNING seq`,
          [user_id, e.entry_id, e.ts, e.domain, e.op, JSON.stringify(e.payload), received_at_iso],
        );
        inserted += rows.length;
      }
      return { inserted, skipped: entries.length - inserted };
    },

    async listBackupEntries(user_id, after_seq, limit) {
      const { rows } = await query(
        `SELECT seq, entry_id, ts, domain, op, payload, received_at
         FROM backup_entries
         WHERE user_id = $1 AND seq > $2
         ORDER BY seq ASC
         LIMIT $3`,
        [user_id, after_seq, limit],
      );
      return rows.map((r) => ({
        seq: Number(r.seq),
        entry_id: String(r.entry_id),
        ts: isoOf(r.ts),
        domain: String(r.domain),
        op: String(r.op),
        payload: (r.payload ?? {}) as Record<string, unknown>,
        received_at: isoOf(r.received_at),
      }));
    },

    async deleteUserData(user_id, requested_at_iso) {
      // single atomic statement: wipe EVERY user-owned table (GDPR Art.17),
      // tombstone the request (ON CONFLICT DO NOTHING keeps the FIRST
      // requested_at — idempotent). stripe_subscriptions is the live billing
      // truth (NOT the dropped legacy `subscriptions`); share_* hold the
      // publisher's Clerk id. Deletes are explicit even where a users FK would
      // cascade — belt-and-suspenders, and correct before the FK migration runs.
      await query(
        `WITH del_backup AS (DELETE FROM backup_entries      WHERE user_id = $1),
              del_blobs  AS (DELETE FROM backup_blobs        WHERE user_id = $1),
              del_media  AS (DELETE FROM media               WHERE user_id = $1),
              del_export AS (DELETE FROM export_jobs         WHERE user_id = $1),
              del_push   AS (DELETE FROM push_tokens         WHERE user_id = $1),
              del_sub    AS (DELETE FROM stripe_subscriptions WHERE user_id = $1),
              del_snap   AS (DELETE FROM share_snapshots     WHERE owner_user_id = $1),
              del_imp    AS (DELETE FROM share_imports       WHERE user_id = $1),
              del_user   AS (DELETE FROM users               WHERE id      = $1)
         INSERT INTO deletions (user_id, requested_at)
         VALUES ($1, $2::timestamptz)
         ON CONFLICT (user_id) DO NOTHING`,
        [user_id, requested_at_iso],
      );
    },
  };
}

/** Normalize a driver timestamptz to strict ISO. Drivers return it as a Date OR
 *  as pg TEXT ("2026-06-13 12:00:00+00", neon's HTTP driver) depending on config;
 *  a bare String(v) would leak the non-ISO text onto the wire (breaking the
 *  contract + downstream Date.parse compares), so coerce strings through Date too. */
function isoOf(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}
