/**
 * POST /api/stripe/portal — open the Stripe Customer Portal for the signed-in
 * Clerk user (cancel, change card, view invoices — all Stripe-hosted, no app
 * code). Clerk-bearer authed. The Stripe customer id was persisted on the
 * user's subscriptions row by the webhook; there is no customer→user table.
 *
 * Response: { url } (the portal to redirect to) | 409 no_subscription if the
 * user has never had a subscription (no customer on file).
 */

import type { HttpRequest, HttpResponse, ServerCtx } from "../types";
import { requireAuth } from "../auth";

const RETURN_URL = "https://racelabrc.app/subscribe/success";

export async function stripePortal(ctx: ServerCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;

  const sub = await ctx.db.getSubscription(auth.user_id);
  const customer = sub?.stripe_customer_id ?? null;
  if (customer === null || customer === "") {
    return { status: 409, json: { error: "no_subscription" } };
  }

  const { url } = await ctx.stripe.createPortalSession({ customer, return_url: RETURN_URL });
  return { status: 200, json: { url } };
}
