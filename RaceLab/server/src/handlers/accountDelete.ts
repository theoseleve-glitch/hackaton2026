/**
 * DELETE /api/account — GDPR Art. 17 / Apple 5.1.1(v) server-side wipe.
 *
 * Removes the user row, subscription, and ALL backup entries in one atomic
 * statement, and writes a deletions tombstone (user_id + requested_at — the
 * legitimate-interest audit record that the request was honored; first
 * request wins). IDEMPOTENT: re-deleting an already-deleted account is 200,
 * so the client's tombstone retry queue can fire blind.
 *
 * CLERK IDENTITY (audit MED, Apple 5.1.1(v)): deletion must also remove the
 * IDENTITY, not just RaceLab's rows. `deleteClerkIdentity` is an injected seam
 * (deploy wires Clerk's backend SDK `users.deleteUser(id)`; absent = stubbed in
 * tests / an unconfigured deploy). We wipe OUR data FIRST (so the GDPR erasure +
 * tombstone always land even if Clerk is down), then best-effort delete the
 * identity. A Clerk failure does NOT fail the request — the data is already gone
 * and the tombstone gates any re-trial — but it IS reported as
 * clerk_identity:"failed" so a sweeper/support can finish the identity removal.
 */

import type { HttpRequest, HttpResponse, ServerCtx } from "../types";
import { requireAuth } from "../auth";

/** Clerk identity deletion seam. Deploy wires Clerk's backend SDK; absent =>
 *  the identity step is skipped (reported "skipped"). MUST resolve, never reject
 *  across this boundary (the handler wraps it defensively regardless). */
export interface ClerkIdentityDeleter {
  deleteIdentity(userId: string): Promise<void>;
}

/** accountDelete's ctx: the base server ctx plus the OPTIONAL Clerk deleter. */
export interface AccountDeleteCtx extends ServerCtx {
  deleteClerkIdentity?: ClerkIdentityDeleter;
}

export async function accountDelete(ctx: AccountDeleteCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;
  const server_time = ctx.now();

  // 1) OUR data + tombstone first — the GDPR erasure must always land.
  await ctx.db.deleteUserData(auth.user_id, server_time);

  // 2) The Clerk identity (Apple 5.1.1(v)). Best-effort: a failure is reported,
  //    not fatal — the data is gone and the tombstone blocks any re-trial.
  let clerk_identity: "deleted" | "failed" | "skipped" = "skipped";
  if (ctx.deleteClerkIdentity !== undefined) {
    try {
      await ctx.deleteClerkIdentity.deleteIdentity(auth.user_id);
      clerk_identity = "deleted";
    } catch {
      clerk_identity = "failed";
    }
  }

  return { status: 200, json: { ok: true, deleted: true, clerk_identity, server_time } };
}
