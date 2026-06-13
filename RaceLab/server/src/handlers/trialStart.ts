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

  await ctx.db.ensureUser(auth.user_id, server_time);
  const stored = await ctx.db.recordTrialStart(auth.user_id, claimed, server_time);
  return { status: 200, json: { ok: true, trial_started_at: stored, server_time } };
}
