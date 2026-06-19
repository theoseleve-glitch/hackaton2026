/**
 * POST /api/stripe/checkout — create a Stripe Checkout Session for the
 * signed-in Clerk user. Clerk-bearer authed (requireAuth). The user_id written
 * into the session (client_reference_id + subscription_data.metadata.user_id)
 * is ALWAYS the VERIFIED payload.sub — never a query param — so the webhook can
 * attribute the resulting subscription to this exact account (server/src/stripe.ts).
 *
 * Body: { plan?: "monthly" | "annual" } (default monthly; unknown -> 400).
 * Response: { url } (the Stripe-hosted checkout to redirect to) | 502 if Stripe
 * returns no url.
 */

import type { HttpRequest, HttpResponse, ServerCtx } from "../types";
import { requireAuth } from "../auth";
import { parsePlan } from "../stripe";

// Stripe success_url must be http(s) (a custom scheme is rejected): land on a
// web page that deep-links racelab://subscribe/return AND shows a desktop-safe
// confirmation. Cancel returns to the subscribe page.
const SUCCESS_URL = "https://racelabrc.app/subscribe/success";
const CANCEL_URL = "https://racelabrc.app/subscribe?status=cancel";

export async function stripeCheckout(ctx: ServerCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;

  const body = req.body;
  if (body !== undefined && body !== null && (typeof body !== "object" || Array.isArray(body))) {
    return { status: 400, json: { error: "invalid_body" } };
  }
  const rawPlan = body !== undefined && body !== null ? (body as Record<string, unknown>).plan : undefined;
  const plan = parsePlan(rawPlan);
  if (plan === null) return { status: 400, json: { error: "invalid_plan" } };

  const { url } = await ctx.stripe.createCheckoutSession({
    plan,
    client_reference_id: auth.user_id,
    user_id: auth.user_id,
    success_url: SUCCESS_URL,
    cancel_url: CANCEL_URL,
  });
  if (url === null || url === "") return { status: 502, json: { error: "checkout_unavailable" } };
  return { status: 200, json: { url } };
}
