/**
 * POST /api/stripe/webhook — the web-billing keystone. Stripe calls this on
 * every subscription lifecycle change; it is the ONLY writer of the
 * subscriptions table (schema.sql). Auth here is the Stripe SIGNATURE, not
 * Clerk — so it does NOT use requireAuth.
 *
 * Contract:
 *  - missing Stripe-Signature header           -> 400 missing_signature
 *  - signature fails to verify (or malformed)  -> 400 invalid_signature
 *  - verified but not subscription-relevant /
 *    unattributable (no user_id)               -> 200 {applied:false}  (ACK so
 *                                                 Stripe stops retrying)
 *  - verified + mappable                        -> upsert row, 200 {applied:true}
 *
 * Raw body: signature verification needs the EXACT bytes. The webhook's Vercel
 * entry disables the body parser and threads them as req.rawBody (see
 * src/vercel.ts runVercelWebhook). Tests pass the bytes as a string body with a
 * fake verifier that ignores them.
 */

import type { HttpRequest, HttpResponse, ServerCtx } from "../types";
import { mapEvent } from "../stripe";

export async function stripeWebhook(ctx: ServerCtx, req: HttpRequest): Promise<HttpResponse> {
  const sigHeader = req.headers["stripe-signature"] ?? req.headers["Stripe-Signature"];
  const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
  if (signature === undefined || signature === "") {
    return { status: 400, json: { error: "missing_signature" } };
  }

  const raw =
    typeof req.rawBody === "string"
      ? req.rawBody
      : typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body ?? {});

  let event;
  try {
    event = await ctx.webhookVerifier.verify(raw, signature);
  } catch {
    event = null; // a throwing verifier is a bad-signature 400, never a 500
  }
  if (event === null) return { status: 400, json: { error: "invalid_signature" } };

  const write = mapEvent(event);
  if (write === null) return { status: 200, json: { received: true, applied: false } };

  const now = ctx.now();
  await ctx.db.ensureUser(write.user_id, now);
  await ctx.db.upsertSubscription(write.user_id, write.status, write.expires_at, now);
  return { status: 200, json: { received: true, applied: true } };
}
