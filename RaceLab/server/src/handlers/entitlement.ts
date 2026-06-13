/**
 * GET /api/entitlement — bearer -> a SIGNED, OFFLINE entitlement token (P0).
 *
 * The SERVER owns the trial clock (D29; TRIAL_DAYS = 15, mirrors
 * packages/account TRIAL_DAYS). It computes one of four states and mints a
 * short-lived signed token the app caches and verifies offline against a pinned
 * public key — so PRO stays gated even with the network down, without trusting
 * client-side dates.
 *
 * status, computed in order:
 *  - "active": a subscription row with status==='active' AND still in period
 *    (current_period_end===null  OR  Date.parse(cpe) > Date.parse(now)).
 *    (web Stripe only — D29, no IAP.)
 *  - "trial":  not active, trial started, and now < trial_started_at + 15d.
 *  - "expired": not active, not in trial, but a subscription row EXISTS
 *    (was paid, now lapsed).
 *  - "none":   none of the above (never paid, trial over or never started).
 *
 * GATES PRO ONLY. The advisor / engine / planner / strategy are ALWAYS free and
 * on-device (D18/D20) — this endpoint never appears on the advice path and
 * never withholds tuning advice. It only flips paid-feature access.
 *
 * The token is opaque to the client beyond its claims; signing is an injected
 * seam (EdDSA via jose at deploy, fake in tests). Never throws across the
 * boundary — a signer failure surfaces as the router's 500, auth failures as
 * 401, all owner-scoped to the verified user_id (no id is read from the body).
 */

import type { HttpRequest, HttpResponse } from "../types";
import type { TokenVerifier } from "../auth";
import { requireAuth } from "../auth";
import type { EntitlementReader, JwtSigner } from "../stores/entitlementStore";
import { TRIAL_DAYS } from "../stores/entitlementStore";

const DAY_MS = 86_400_000;
// 24h — short enough to re-check, long enough for a race weekend offline.
// ACCEPTED TRADEOFF: because the signed token is valid offline for up to 24h,
// a subscription that lapses (or is canceled via the Stripe webhook) keeps PRO
// for at most 24h after the change until the app re-fetches and re-mints. We
// accept this bounded over-grant; PRO is a paid convenience, not a security
// boundary, and the advice path is always free + on-device (D18/D20) anyway.
const TOKEN_TTL_S = 86_400;

/** Minimal seams this handler consumes (zero committed runtime deps). */
export interface EntitlementCtx {
  now: () => string;
  verifier: TokenVerifier;
  sign: JwtSigner;
  store: EntitlementReader;
}

type EntStatus = "active" | "trial" | "expired" | "none";

export async function entitlement(ctx: EntitlementCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;
  const server_time = ctx.now();
  const nowMs = Date.parse(server_time);
  const user_id = auth.user_id; // owner-scoped: every read is keyed to this id

  const sub = await ctx.store.getSubscription(user_id);
  const trialStart = await ctx.store.getTrialStart(user_id);

  // trial_ends_at is derived from the server-owned first-seen trial start.
  const trial_ends_at: string | null =
    trialStart !== null && !Number.isNaN(Date.parse(trialStart))
      ? new Date(Date.parse(trialStart) + TRIAL_DAYS * DAY_MS).toISOString()
      : null;

  const current_period_end: string | null = sub?.current_period_end ?? null;

  let status: EntStatus;
  if (
    sub !== null &&
    sub.status === "active" &&
    (current_period_end === null || Date.parse(current_period_end) > nowMs)
  ) {
    status = "active";
  } else if (trial_ends_at !== null && nowMs < Date.parse(trial_ends_at)) {
    status = "trial";
  } else if (sub !== null) {
    status = "expired"; // a row exists (was paid) but neither active nor in trial
  } else {
    status = "none";
  }

  const plan: "pro" | null = status === "active" ? "pro" : null;

  const nowUnix = Math.floor(nowMs / 1000);
  const claims: Record<string, unknown> = {
    sub: user_id,
    status,
    plan,
    current_period_end,
    trial_ends_at,
    iat: nowUnix,
    exp: nowUnix + TOKEN_TTL_S,
  };

  const token = await ctx.sign.sign(claims);

  return {
    status: 200,
    json: {
      status,
      ...(plan !== null ? { plan } : {}),
      ...(current_period_end !== null ? { current_period_end } : {}),
      ...(trial_ends_at !== null ? { trial_ends_at } : {}),
      token,
      server_time,
    },
  };
}
