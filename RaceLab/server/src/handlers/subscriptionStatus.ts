/**
 * GET /api/subscription/status — bearer -> { status, expires_at?, server_time }.
 *
 * status is COMPUTED at read time against expires_at (the subscriptions row is
 * the raw web-platform fact): "none" (never paid), "active" (paid through
 * now — includes canceled-but-not-yet-expired), "expired" (paid, lapsed).
 * "grace" is deliberately a CLIENT concept (schema GRACE_DAYS over the cached
 * expires_at) — the server never asserts it.
 */

import type { HttpRequest, HttpResponse, ServerCtx } from "../types";
import { requireAuth } from "../auth";

export async function subscriptionStatus(ctx: ServerCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;
  const server_time = ctx.now();

  const row = await ctx.db.getSubscription(auth.user_id);
  if (row === null) return { status: 200, json: { status: "none", server_time } };

  let status: "active" | "expired";
  if (row.expires_at === null) {
    status = row.status === "active" ? "active" : "expired";
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
