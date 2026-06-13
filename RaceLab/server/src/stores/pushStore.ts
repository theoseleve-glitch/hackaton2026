/**
 * PushStore — persistence seam for push-notification device tokens (P2).
 *
 * One row per (user_id, device_id): a user may register MANY devices, and each
 * device has exactly one current Expo push token + notification prefs. Register
 * is an UPSERT (re-registering a device rotates its token / updates prefs);
 * unregister deletes the device row and is idempotent.
 *
 * D29: subscriptions are web-Stripe only — this module never touches IAP. The
 * trial-ending nudge is the only MARKETING (GDPR) notification type and is
 * gated on prefs.marketing_consent at SEND time (a worker concern, not here);
 * the other three types (speedhive new-run, social-2) are service messages.
 *
 * No runtime dep is committed: makeSqlPushStore takes an injected QueryFn
 * (parameterized SQL, makeSqlDb style); the in-memory fake lives in the test.
 *
 * Notification types this token may receive (the SEND-side allow-list — the
 * worker honors these, stored here for documentation, not enforced on write):
 *   - "speedhive"  — a new lap/run was imported for the user (service)
 *   - "trial"      — trial-ending nudge (MARKETING -> gated on marketing_consent)
 *   - "social"     — a social interaction (comment/follow) on the user's content
 *   - "marketing"  — explicit marketing (gated on marketing_consent)
 */

import type { QueryFn } from "../db";

/** Per-device notification opt-ins. All optional; absent = worker default. */
export interface PushPrefs {
  /** Speedhive new-run imports (service). */
  speedhive?: boolean;
  /** Trial-ending nudge. MARKETING (GDPR) -> only sent when marketing_consent. */
  trial?: boolean;
  /** Social interactions (the 2 social notification types). */
  social?: boolean;
  /** GDPR marketing consent flag — the trial nudge is gated on this. */
  marketing_consent?: boolean;
}

export interface PushStore {
  /** Upsert the (user_id, device_id) row — rotates token + replaces prefs. */
  register(
    userId: string,
    deviceId: string,
    token: string,
    prefs: PushPrefs,
    atIso: string,
  ): Promise<void>;
  /** Delete this user's device row. Idempotent (no row -> no-op). */
  unregister(userId: string, deviceId: string): Promise<void>;
}

export function makeSqlPushStore(query: QueryFn): PushStore {
  return {
    async register(userId, deviceId, token, prefs, atIso) {
      await query(
        `INSERT INTO push_tokens (user_id, device_id, token, prefs, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)
         ON CONFLICT (user_id, device_id) DO UPDATE
           SET token = EXCLUDED.token,
               prefs = EXCLUDED.prefs,
               updated_at = EXCLUDED.updated_at`,
        [userId, deviceId, token, JSON.stringify(prefs), atIso],
      );
    },

    async unregister(userId, deviceId) {
      // owner-scoped: the user_id predicate makes cross-user deletes impossible
      await query(`DELETE FROM push_tokens WHERE user_id = $1 AND device_id = $2`, [
        userId,
        deviceId,
      ]);
    },
  };
}

// push_tokens: one row per (Clerk user, device). The Expo push token rotates,
// so re-registering a device UPSERTS (token + prefs replaced). prefs is the
// per-device opt-in set (speedhive/trial/social/marketing_consent); the
// trial-ending nudge is MARKETING and the worker gates it on
// prefs.marketing_consent at send time. Expo receipt processing +
// DeviceNotRegistered pruning are worker concerns (this table is the source of
// truth they prune against). ON DELETE CASCADE drops a user's tokens with them.
export const PUSH_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS push_tokens (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id  TEXT NOT NULL,                              -- client-stable install id
  token      TEXT NOT NULL,                              -- Expo push token (rotates)
  prefs      JSONB NOT NULL DEFAULT '{}'::jsonb,         -- per-device notification opt-ins
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);`;
