/**
 * entitlement store — read-only seams for GET /api/entitlement.
 *
 * Decisions honored:
 *  - D29: web Stripe only, no IAP. The trial clock is SERVER-OWNED
 *    (users.trial_started_at, first-seen) and TRIAL_DAYS = 15 mirrors
 *    packages/account TRIAL_DAYS — change them together.
 *  - D18/D20: the entitlement only ever gates PRO. The advisor / engine /
 *    planner / strategy stay 100% free and on-device — nothing here is on the
 *    advice path.
 *
 * Two seams live in this module:
 *  - EntitlementReader: reads the EXISTING users + stripe_subscriptions tables
 *    (no new table). getSubscription reads stripe_subscriptions.current_period_end
 *    directly — this is the table the Stripe webhook (source of truth, D29) writes
 *    (status + current_period_end). The legacy `subscriptions` table is NOT
 *    written by the webhook and must not be read here, or paying users read null
 *    and PRO is never granted.
 *  - JwtSigner: the offline-token mint, abstracted (EdDSA at deploy, fake in
 *    tests). The store ships no signer — the handler injects one.
 *
 * No new schema: ENTITLEMENT_SCHEMA_SQL is intentionally empty (see below).
 */

import type { QueryFn } from "../db";
import { isoOf } from "../sqlUtil";

/** TRIAL_DAYS mirrors packages/account TRIAL_DAYS (D29). The server owns the
 *  trial clock; the client adopts trial_ends_at from the signed token. */
export const TRIAL_DAYS = 15;

/** Raw subscription fact as read from the EXISTING stripe_subscriptions row
 *  (the table the Stripe webhook writes — the source of truth, D29).
 *  status is the platform fact; current_period_end is the paid-through instant
 *  (null = lifetime/manual / no expiry asserted). */
export interface SubscriptionFact {
  status: "active" | "canceled" | "expired";
  current_period_end: string | null;
}

/** Read-only repository for entitlement computation. Reads existing tables
 *  (users.trial_started_at + stripe_subscriptions) — never writes. */
export interface EntitlementReader {
  /** The user's subscription fact, or null when no subscription row exists
   *  (never paid). */
  getSubscription(userId: string): Promise<SubscriptionFact | null>;
  /** First-seen trial start (users.trial_started_at), or null when the user
   *  has no row / never claimed a trial. */
  getTrialStart(userId: string): Promise<string | null>;
}

/** JWT minting seam. At deploy: jose SignJWT with EdDSA (key pinned in the app
 *  at build). Fake in tests. The signer is opaque to this tier — claims in,
 *  compact token out. */
export interface JwtSigner {
  sign(claims: Record<string, unknown>): Promise<string>;
}

/** Real reader over an INJECTED query fn (no pg/neon dependency committed —
 *  wired at deploy, see src/db.ts / src/deploy.ts). PARAMETERIZED SQL only. */
export function makeSqlEntitlementReader(query: QueryFn): EntitlementReader {
  return {
    async getSubscription(userId) {
      // Read stripe_subscriptions — the table the Stripe webhook writes (D29,
      // source of truth: status + current_period_end). The legacy `subscriptions`
      // table is never written by the webhook, so reading it returns null for
      // every paying user and PRO is never granted. If this table is ever
      // renamed, the column-assertion test below fails loudly so the rename
      // can't silently re-break Pro.
      const { rows } = await query(
        `SELECT status, current_period_end FROM stripe_subscriptions WHERE user_id = $1`,
        [userId],
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      const status = String(r.status);
      const normalized: SubscriptionFact["status"] =
        status === "active" || status === "canceled" || status === "expired" ? status : "expired";
      return {
        status: normalized,
        current_period_end:
          r.current_period_end === null || r.current_period_end === undefined
            ? null
            : isoOf(r.current_period_end),
      };
    },

    async getTrialStart(userId) {
      const { rows } = await query(
        `SELECT trial_started_at FROM users WHERE id = $1`,
        [userId],
      );
      if (rows.length === 0) return null;
      const v = rows[0]?.trial_started_at;
      return v === null || v === undefined ? null : isoOf(v);
    },
  };
}


/**
 * No new table for this module — entitlement is computed at read time from the
 * EXISTING users (trial_started_at) and stripe_subscriptions (status,
 * current_period_end) tables. stripe_subscriptions is OWNED + created by the
 * stripe-webhook module (STRIPE_WEBHOOK_SCHEMA_SQL); we only read it here.
 * Emitted empty so the integrator can splice every module's *_SCHEMA_SQL
 * uniformly without a special case.
 */
export const ENTITLEMENT_SCHEMA_SQL = "";
