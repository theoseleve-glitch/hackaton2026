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
// 6h (was 24h) — the offline-validity / revocation-latency knob (audit HIGH:
// "a canceled sub keeps PRO"). The signed token is verified OFFLINE against a
// pinned public key, so a cancel/lapse recorded by the Stripe webhook only
// takes effect once the app re-fetches and re-mints — i.e. after at most one
// TTL. 24h let a canceled sub keep PRO for a full day; 6h bounds that to a
// single session while still surviving a typical offline race heat (the app
// re-fetches on the next foreground with network). PRO is a paid convenience,
// not a security boundary, and the advice path is always free + on-device
// (D18/D20); shortening TTL is the revocation mechanism — no server-side token
// blocklist is needed because the token is short-lived and re-minted from the
// live stripe_subscriptions row every fetch.
const TOKEN_TTL_S = 6 * 60 * 60;

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

  // POLISH #2 (NaN guard): a non-null current_period_end that won't parse is a
  // corrupt DB instant, not an expiry. Treating NaN as "lapsed" would silently
  // demote a paying user to expired/none and the app would discard its
  // last-known-good token — the worst failure mode. Fail LOUD with a 500 so the
  // client keeps its cached token (offline grant survives) and the bug is seen.
  // (Still owner-scoped, still echoes server_time, still never throws across the
  // boundary.)
  const cpeMs = current_period_end === null ? null : Date.parse(current_period_end);
  if (cpeMs !== null && Number.isNaN(cpeMs)) {
    return { status: 500, json: { error: "internal_error", server_time } };
  }

  let status: EntStatus;
  if (
    sub !== null &&
    sub.status === "active" &&
    (cpeMs === null || cpeMs > nowMs)
  ) {
    status = "active";
  } else if (trial_ends_at !== null && nowMs <= Date.parse(trial_ends_at)) {
    // INCLUSIVE boundary (audit MED, was strict `<`): matches schema's
    // effectiveSubscriptionStatus ("now <= trial_ends_at -> trial") and
    // checkEntitlement. With `<` the server demoted the user one tick early at the
    // exact trial_ends_at instant while the client still showed "trial" — an
    // off-by-one disagreement at the boundary. The 15-day window is inclusive of
    // its end instant on BOTH sides now.
    status = "trial";
  } else if (sub !== null) {
    status = "expired"; // a row exists (was paid) but neither active nor in trial
  } else {
    status = "none";
  }

  const plan: "pro" | null = status === "active" ? "pro" : null;

  const nowUnix = Math.floor(nowMs / 1000);
  // BUILD-NOW #7 (cap over-grant): the offline grant must NEVER outlive the paid
  // period. When current_period_end is sooner than the full TTL window, clamp
  // exp to the period end (floored to the second so the token can't round PAST
  // it) — so even a misbehaving client can't extend PRO beyond what's paid for.
  // When cpe is absent (lifetime / no expiry asserted) or far out, exp is the
  // full TOKEN_TTL_S window. (cpeMs is already guaranteed non-NaN above.)
  const ttlExp = nowUnix + TOKEN_TTL_S;
  const exp = cpeMs !== null ? Math.min(ttlExp, Math.floor(cpeMs / 1000)) : ttlExp;
  const claims: Record<string, unknown> = {
    sub: user_id,
    status,
    plan,
    current_period_end,
    trial_ends_at,
    iat: nowUnix,
    exp,
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
