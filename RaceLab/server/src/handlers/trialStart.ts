/**
 * POST /api/trial/start — idempotent FIRST-SEEN trial registry.
 *
 * Body (optional): { trial_started_at?: ISO } — the device's local trial
 * start (it may have started offline days ago). Rules:
 *  - first claim wins: once users.trial_started_at is set it NEVER moves,
 *    so a reinstall or a second device cannot restart the 15-day clock;
 *  - future claims are clamped to server now (a client cannot push its own
 *    start forward to extend the trial);
 *  - no claim -> server now.
 * Response: { ok, trial_started_at: <stored first-seen>, server_time } — the
 * client adopts the stored value (packages/account reconcile).
 */

import type { HttpRequest, HttpResponse, ServerCtx } from "../types";
import { requireAuth } from "../auth";

export async function trialStart(ctx: ServerCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;
  const server_time = ctx.now();

  // Tombstone gate (audit HIGH): a deletions row survives the user wipe (GDPR
  // Art.17 record). If THIS id was deleted, it has already had its one free trial
  // — refuse a second one (409) rather than re-create the user + restart the
  // 15-day clock. (A genuinely new Clerk account gets a fresh id and is untouched
  // by this; only a re-claim of the same deleted id is blocked.)
  if (await ctx.db.isTombstoned(auth.user_id)) {
    return { status: 409, json: { error: "trial_unavailable_deleted", server_time } };
  }

  let claimed = server_time;
  const body = req.body;
  if (body !== undefined && body !== null) {
    if (typeof body !== "object" || Array.isArray(body)) {
      return { status: 400, json: { error: "bad_request" } };
    }
    const claim = (body as Record<string, unknown>).trial_started_at;
    if (claim !== undefined) {
      if (typeof claim !== "string" || Number.isNaN(Date.parse(claim))) {
        return { status: 400, json: { error: "invalid_trial_started_at" } };
      }
      claimed =
        Date.parse(claim) > Date.parse(server_time)
          ? server_time // clamp future claims
          : new Date(Date.parse(claim)).toISOString();
    }
  }

  // recordTrialStart materializes the users row itself (INSERT ... ON CONFLICT) under
  // a single-statement tombstone guard — so no separate ensureUser (which would be an
  // unguarded resurrection vector if a DELETE raced the pre-check above). A `undefined`
  // return means the id was tombstoned (the race the pre-check can't catch): refuse.
  const stored = await ctx.db.recordTrialStart(auth.user_id, claimed, server_time);
  if (stored === undefined) {
    return { status: 409, json: { error: "trial_unavailable_deleted", server_time } };
  }
  return { status: 200, json: { ok: true, trial_started_at: stored, server_time } };
}
