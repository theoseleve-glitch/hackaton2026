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
  stripe_customer_id: string | null; // for the Customer Portal lookup
}

export interface Db {
  /** Upsert the user row (no-op when it exists). */
  ensureUser(user_id: string, now_iso: string): Promise<void>;
  /** FIRST-SEEN trial start: sets it only when null, always returns the stored
   *  value — later device claims can never move it. */
  recordTrialStart(user_id: string, started_at_iso: string, now_iso: string): Promise<string>;
  getSubscription(user_id: string): Promise<SubscriptionRow | null>;
  /** Upsert the subscription row from a verified Stripe webhook (the only
   *  writer). expires_at null = lifetime/manual; stripe_customer_id null keeps
   *  any existing value (so an event without a customer never erases it).
   *  event_at is the Stripe event.created watermark: a strictly-OLDER event is
   *  ignored (no-op) so an out-of-order / replayed delivery can never regress a
   *  paying user. null event_at applies unconditionally. */
  upsertSubscription(
    user_id: string,
    status: "active" | "canceled" | "expired",
    expires_at: string | null,
    stripe_customer_id: string | null,
    event_at: string | null,
    updated_at_iso: string,
  ): Promise<void>;
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
      const { rows } = await query(
        `SELECT status, expires_at, stripe_customer_id FROM subscriptions WHERE user_id = $1`,
        [user_id],
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        status: String(r.status),
        expires_at: r.expires_at === null || r.expires_at === undefined ? null : isoOf(r.expires_at),
        stripe_customer_id:
          r.stripe_customer_id === null || r.stripe_customer_id === undefined
            ? null
            : String(r.stripe_customer_id),
      };
    },

    async upsertSubscription(user_id, status, expires_at, stripe_customer_id, event_at, updated_at_iso) {
      await query(
        `INSERT INTO subscriptions (user_id, status, expires_at, stripe_customer_id, last_event_at, source, updated_at)
         VALUES ($1, $2, $3::timestamptz, $4, $5::timestamptz, 'web', $6::timestamptz)
         ON CONFLICT (user_id) DO UPDATE
           SET status = EXCLUDED.status,
               expires_at = EXCLUDED.expires_at,
               -- never erase a known customer with a null from a later event
               stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, subscriptions.stripe_customer_id),
               last_event_at = COALESCE(EXCLUDED.last_event_at, subscriptions.last_event_at),
               updated_at = EXCLUDED.updated_at
           -- monotonic: skip strictly-older (out-of-order / replayed) deliveries
           WHERE subscriptions.last_event_at IS NULL
              OR EXCLUDED.last_event_at IS NULL
              OR EXCLUDED.last_event_at >= subscriptions.last_event_at`,
        [user_id, status, expires_at, stripe_customer_id, event_at, updated_at_iso],
      );
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
      // single atomic statement: wipe everything, tombstone the request
      // (ON CONFLICT DO NOTHING keeps the FIRST requested_at — idempotent)
      await query(
        `WITH del_backup AS (DELETE FROM backup_entries WHERE user_id = $1),
              del_sub    AS (DELETE FROM subscriptions  WHERE user_id = $1),
              del_user   AS (DELETE FROM users          WHERE id      = $1)
         INSERT INTO deletions (user_id, requested_at)
         VALUES ($1, $2::timestamptz)
         ON CONFLICT (user_id) DO NOTHING`,
        [user_id, requested_at_iso],
      );
    },
  };
}

/** Drivers return timestamptz as Date or string depending on config. */
function isoOf(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
