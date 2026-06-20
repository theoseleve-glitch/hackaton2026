/**
 * StripeWebhookStore — the persistence + signature seams for POST
 * /api/webhooks/stripe (D29: web Stripe only, NO IAP — this module OWNS
 * subscription truth post-Stripe; entitlement reads stripe_subscriptions).
 *
 * Two seams live here, both interface-only (ZERO committed runtime deps; the
 * real `stripe` SDK and the pg query fn are injected at deploy, fakes in the
 * test file):
 *  - StripeVerifier: wraps `stripe.webhooks.constructEvent` — turns the raw
 *    request body + the "stripe-signature" header into a typed event, or
 *    rejects a forged/replayed signature.
 *  - StripeWebhookStore: idempotency ledger (processed_stripe_events) +
 *    subscription upsert with an out-of-order guard (event_created watermark).
 *
 * Real wiring (runtime deps installed at deploy time ONLY — see src/deploy.ts):
 *
 *   npm i stripe @neondatabase/serverless
 *
 *   import Stripe from "stripe";
 *   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
 *   const verify: StripeVerifier = {
 *     verify(rawBody, sigHeader) {
 *       try {
 *         const event = stripe.webhooks.constructEvent(
 *           rawBody, sigHeader ?? "", process.env.STRIPE_WEBHOOK_SECRET!,
 *         ) as unknown as StripeEvent;
 *         return { ok: true, event };
 *       } catch {
 *         return { ok: false };
 *       }
 *     },
 *   };
 *
 *   import { neon } from "@neondatabase/serverless";
 *   const sql = neon(process.env.DATABASE_URL!);
 *   const store = makeSqlStripeWebhookStore(async (text, params) => ({
 *     rows: (await sql.query(text, params)) as Record<string, unknown>[],
 *   }));
 *
 * IMPORTANT (raw body): Stripe signs the EXACT bytes of the request body, so
 * the deploy adapter MUST pass the unparsed body string to this route (do NOT
 * JSON.parse it first). See notes.
 *
 * SQL here mirrors db/schema.sql style — change them together (these tables
 * are NOT yet in db/schema.sql; the integrator folds STRIPE_WEBHOOK_SCHEMA_SQL
 * in, hence IF NOT EXISTS).
 */

import type { QueryFn } from "../db";

/** Minimal shape of a Stripe event the handler relies on (constructEvent
 *  returns the full object; we only type what we read). */
export interface StripeEvent {
  id: string;
  type: string;
  created: number; // unix seconds
  data: { object: Record<string, unknown> };
}

/** Signature boundary: verifies the raw body against the "stripe-signature"
 *  header. A forged, malformed, or replayed-outside-tolerance signature is a
 *  clean { ok: false } — never a throw across the handler boundary. */
export interface StripeVerifier {
  verify(
    rawBody: string,
    sigHeader: string | undefined,
  ): { ok: true; event: StripeEvent } | { ok: false };
}

/** The canonical subscription status this module commits (post-Stripe truth).
 *  Distinct from the read-time active/expired the status endpoint computes. */
export type StripeSubStatus = "active" | "canceled" | "expired";

export interface StripeSubscriptionUpsert {
  status: StripeSubStatus;
  current_period_end: string | null; // ISO, or null = no expiry asserted
  event_created: number; // unix seconds — the out-of-order watermark
  /** Server RECEIPT time (ctx.now() ISO) — what updated_at is set to. NOT the
   *  Stripe event epoch: a delayed redelivery would otherwise stamp updated_at
   *  in the past and a freshness/"updated_at-receipt" check would mis-fire. */
  received_at: string;
}

export interface StripeWebhookStore {
  /** Has this event.id already been committed? Stripe redelivers on any
   *  non-2xx (and sometimes on 2xx); processing must be idempotent on it. */
  isProcessed(eventId: string): Promise<boolean>;
  /** Mark an event.id done so redelivery is a no-op. Idempotent itself. */
  markProcessed(eventId: string, atIso: string): Promise<void>;
  /** The event_created watermark of the row currently stored for this user
   *  (null when there's no subscription row yet). Used to drop stale events. */
  getEventCreated(userId: string): Promise<number | null>;
  /** Upsert the user's subscription truth. Caller has already confirmed this
   *  event is NEWER than the stored watermark (out-of-order guard). */
  upsertSubscription(userId: string, s: StripeSubscriptionUpsert): Promise<void>;
  /** True if this user id has a GDPR-erasure tombstone (deletions row). The
   *  webhook MUST NOT resurrect an erased id — upsertSubscription ensureUser's
   *  the users row, so a redelivery / trailing event after an Art.17 delete
   *  would re-create erased identity + a ghost subscription. */
  isTombstoned(userId: string): Promise<boolean>;
}

export function makeSqlStripeWebhookStore(query: QueryFn): StripeWebhookStore {
  return {
    async isProcessed(eventId) {
      const { rows } = await query(
        `SELECT 1 FROM processed_stripe_events WHERE event_id = $1`,
        [eventId],
      );
      return rows.length > 0;
    },

    async markProcessed(eventId, atIso) {
      await query(
        `INSERT INTO processed_stripe_events (event_id, processed_at)
         VALUES ($1, $2::timestamptz)
         ON CONFLICT (event_id) DO NOTHING`,
        [eventId, atIso],
      );
    },

    async getEventCreated(userId) {
      const { rows } = await query(
        `SELECT event_created FROM stripe_subscriptions WHERE user_id = $1`,
        [userId],
      );
      if (rows.length === 0) return null;
      const v = rows[0].event_created;
      return v === null || v === undefined ? null : Number(v);
    },

    async isTombstoned(userId) {
      const { rows } = await query(
        `SELECT 1 FROM deletions WHERE user_id = $1`,
        [userId],
      );
      return rows.length > 0;
    },

    async upsertSubscription(userId, s) {
      // FK SAFETY: stripe_subscriptions.user_id now REFERENCES users(id) (so a
      // user wipe cascades the billing row). A checkout can complete BEFORE the
      // user ever hit /trial/start (which is the only other ensureUser caller),
      // so the users row may not exist yet — materialize it first (idempotent
      // no-op when present) or the subscription upsert would FK-fail and Stripe
      // would retry forever. updated_at-as-created_at is fine for a row Stripe
      // is introducing.
      await query(
        `INSERT INTO users (id, created_at) VALUES ($1, $2::timestamptz)
         ON CONFLICT (id) DO NOTHING`,
        [userId, s.received_at],
      );
      // ON CONFLICT updates in place; the event_created guard is enforced by
      // the handler (it only calls this for a strictly newer event), but the
      // WHERE on the update is a belt-and-suspenders against a racing replay.
      //
      // STRICT guard ( > , not >= ): two DISTINCT events can share the same
      // `created` second (Stripe stamps to whole seconds), e.g. a
      // subscription.deleted and a subscription.updated emitted in the same
      // tick. With >= the LATER-arriving of the two would overwrite the
      // earlier, so a stray 'active' (updated) could clobber a 'canceled'
      // (deleted) for the SAME second. We therefore require a strictly newer
      // event to win — PLUS a terminal-status tiebreaker: on an equal second,
      // a 'canceled' is allowed to land over a non-terminal status so a
      // delete is never lost to a same-second update, regardless of arrival
      // order. (active-then-deleted: delete wins via the tiebreaker;
      // deleted-then-active: active is blocked by the strict guard.)
      await query(
        `INSERT INTO stripe_subscriptions
           (user_id, status, current_period_end, event_created, updated_at)
         VALUES ($1, $2, $3::timestamptz, $4, $5::timestamptz)
         ON CONFLICT (user_id) DO UPDATE
           SET status             = EXCLUDED.status,
               -- COALESCE: checkout.session.completed grants status with a NULL
               -- period end (the session has none); never let that null clobber a
               -- known current_period_end set by a subscription.created/updated.
               current_period_end = COALESCE(EXCLUDED.current_period_end, stripe_subscriptions.current_period_end),
               event_created      = EXCLUDED.event_created,
               updated_at         = EXCLUDED.updated_at
           WHERE EXCLUDED.event_created > stripe_subscriptions.event_created
              OR (EXCLUDED.event_created = stripe_subscriptions.event_created
                  AND EXCLUDED.status = 'canceled')`,
        [
          userId,
          s.status,
          s.current_period_end,
          s.event_created,
          // updated_at = server RECEIPT time, NOT the Stripe event epoch (a stale
          // redelivery must not stamp updated_at in the past).
          s.received_at,
        ],
      );
    },
  };
}

// ── schema (Postgres; mirror db/schema.sql style) ────────────────────────────
// processed_stripe_events: the idempotency ledger. Stripe redelivers a webhook
// on any non-2xx response (and may redeliver on 2xx), so every event.id is
// recorded the first time it is fully handled; a redelivery short-circuits to
// {received:true, duplicate:true}. event_id is Stripe's "evt_..." id.
//
// stripe_subscriptions: this module OWNS subscription truth derived from Stripe
// (D29 — external web checkout, no IAP). One row per user. event_created is the
// unix-second watermark of the LAST event applied: an event with an older or
// equal created timestamp is dropped so a late-arriving "subscription.updated"
// can never downgrade a "deleted", or vice-versa, when Stripe delivers out of
// order. current_period_end mirrors the Stripe object's current_period_end (the
// paid-through instant); null = no expiry asserted (e.g. payment_failed leaves
// it untouched / a status-only event).
export const STRIPE_WEBHOOK_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS processed_stripe_events (
  event_id     TEXT PRIMARY KEY,                         -- Stripe event id ("evt_...")
  processed_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, -- Clerk user id ("user_..."); FK matches db/schema.sql
  status             TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'expired')),
  current_period_end TIMESTAMPTZ,                         -- paid-through; null = no expiry asserted
  event_created      BIGINT NOT NULL,                     -- unix s of last applied event (out-of-order watermark)
  updated_at         TIMESTAMPTZ NOT NULL
);
`;
