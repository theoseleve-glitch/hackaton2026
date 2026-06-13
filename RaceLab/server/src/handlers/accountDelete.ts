/**
 * DELETE /api/account — GDPR Art. 17 / Apple 5.1.1(v) server-side wipe.
 *
 * Removes the user row, subscription, and ALL backup entries in one atomic
 * statement, and writes a deletions tombstone (user_id + requested_at — the
 * legitimate-interest audit record that the request was honored; first
 * request wins). IDEMPOTENT: re-deleting an already-deleted account is 200,
 * so the client's tombstone retry queue can fire blind.
 *
 * Note: this deletes RaceLab's data. The Clerk identity itself is deleted by
 * the app layer via Clerk's own API/dashboard — out of scope for this tier.
 */

import type { HttpRequest, HttpResponse, ServerCtx } from "../types";
import { requireAuth } from "../auth";

export async function accountDelete(ctx: ServerCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;
  const server_time = ctx.now();

  await ctx.db.deleteUserData(auth.user_id, server_time);
  return { status: 200, json: { ok: true, deleted: true, server_time } };
}
