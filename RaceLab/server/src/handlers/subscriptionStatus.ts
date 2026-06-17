/**
 * GET /api/subscription/status — bearer -> { status, expires_at?, server_time }.
 *
 * status is COMPUTED at read time against expires_at (the subscriptions row is
 * the raw web-platform fact): "none" (never paid), "active" (paid through now),
 * "expired" (paid, lapsed). "grace" is deliberately a CLIENT concept (schema
 * GRACE_DAYS over the cached expires_at) — the server never asserts it.
 *
 * RECONCILED with /api/entitlement (audit MED): a stored status of 'canceled'
 * (or 'expired') is NEVER active here, even with a future expires_at. Stripe
 * keeps a cancel-at-period-end subscription at status 'active' until the period
 * actually ends and only then sends customer.subscription.deleted (-> we store
 * 'canceled'); so a stored 'canceled' means access SHOULD have ended. Treating
 * canceled-but-paid-through as active (the old behaviour) diverged from the
 * entitlement token, which only grants PRO on status==='active' — letting a
 * canceled sub keep PRO for up to a full period. One rule now: active iff the
 * raw status is 'active' AND still in period.
 */

import type { HttpRequest, HttpResponse, ServerCtx } from "../types";
import { requireAuth } from "../auth";

export async function subscriptionStatus(ctx: ServerCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;
  const server_time = ctx.now();

  const row = await ctx.db.getSubscription(auth.user_id);
  if (row === null) return { status: 200, json: { status: "none", server_time } };

  // Active iff the raw platform status is 'active' AND (no expiry OR still in
  // period). A 'canceled'/'expired' raw status is always 'expired' here — same
  // rule the entitlement endpoint applies, so the two never disagree.
  let status: "active" | "expired";
  if (row.status !== "active") {
    status = "expired";
  } else if (row.expires_at === null) {
    status = "active";
  } else {
    status = Date.parse(server_time) <= Date.parse(row.expires_at) ? "active" : "expired";
  }
  return {
    status: 200,
    json: {
      status,
      ...(row.expires_at !== null ? { expires_at: row.expires_at } : {}),
      server_time,
    },
  };
}
