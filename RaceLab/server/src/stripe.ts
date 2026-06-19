/**
 * Stripe webhook BOUNDARY — interface + PURE event mapping. No `stripe`
 * dependency is committed; signature verification is an injected capability
 * (fake in tests, the real Stripe SDK at deploy — mirrors auth.ts/TokenVerifier).
 *
 * Web-first billing (no IAP): the racelabrc.app checkout creates the Stripe
 * subscription; Stripe then drives our DB through these webhooks. The app only
 * ever READS /api/subscription/status — it never writes payment state.
 *
 * Deploy wiring (runtime dep installed at deploy time only — see src/deploy.ts):
 *
 *   npm i stripe
 *   import Stripe from "stripe";
 *   const client = new Stripe(process.env.STRIPE_SECRET_KEY!);
 *   const verifier: StripeWebhookVerifier = {
 *     verify: async (rawBody, signature) => {
 *       try {
 *         // constructEventAsync: serverless-safe (WebCrypto, no sync node crypto)
 *         return (await client.webhooks.constructEventAsync(
 *           rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!,
 *         )) as unknown as StripeEvent;
 *       } catch { return null; }   // bad signature / malformed -> null -> 400
 *     },
 *   };
 *
 * ATTRIBUTION CONTRACT (the web /subscribe page MUST honor this): the Checkout
 * Session is created with `subscription_data.metadata.user_id = <clerk id>`, so
 * every `customer.subscription.*` event carries `metadata.user_id`. That is how
 * we attribute a Stripe subscription to a Clerk account WITHOUT a customer→user
 * mapping table. `client_reference_id` (set on the session) is a fallback.
 */

/** The subset of a Stripe event the mapper reads. The deploy-time verifier
 *  passes the real Stripe.Event through unchanged; these fields are present on
 *  `customer.subscription.*` event objects. */
export interface StripeEventObject {
  metadata?: Record<string, string> | null;
  client_reference_id?: string | null;
  /** Stripe subscription lifecycle status (active|trialing|past_due|canceled|…). */
  status?: string;
  /** Unix seconds — the paid-through instant. */
  current_period_end?: number;
}

export interface StripeEvent {
  type: string;
  data: { object: StripeEventObject };
}

export interface StripeWebhookVerifier {
  /** Verify the Stripe-Signature over the RAW request body; return the parsed
   *  event, or null when the signature is missing/invalid/malformed. */
  verify(rawBody: string, signature: string): Promise<StripeEvent | null>;
}

/** A subscriptions-row write derived from a verified event. */
export interface SubscriptionWrite {
  user_id: string;
  status: "active" | "canceled" | "expired";
  expires_at: string | null;
}

/** Event types that move entitlement state. Everything else is acked + ignored. */
const HANDLED_TYPES: ReadonlySet<string> = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

/**
 * PURE core: a verified Stripe event -> the subscriptions-row write it implies,
 * or null when the event is irrelevant or unattributable (no user_id). The 3
 * row states map onto subscriptionStatus.ts, which computes active/expired from
 * expires_at at read time — so the load-bearing value is expires_at:
 *  - active/trialing/past_due  -> {active,  expires_at=current_period_end}
 *  - canceled/unpaid/…expired  -> {canceled, expires_at} (still "active" to the
 *                                  read API while expires_at is in the future —
 *                                  exactly "canceled but paid-through")
 *  - subscription.deleted      -> {expired,  expires_at} (period has ended)
 *  - incomplete/paused/unknown -> null (no entitlement change)
 */
export function mapEvent(event: StripeEvent): SubscriptionWrite | null {
  if (!HANDLED_TYPES.has(event.type)) return null;
  const obj = event.data.object;

  const candidate = obj.metadata?.user_id ?? obj.client_reference_id ?? undefined;
  if (typeof candidate !== "string" || candidate === "") return null;
  const user_id = candidate;

  const expires_at =
    typeof obj.current_period_end === "number" && Number.isFinite(obj.current_period_end)
      ? new Date(obj.current_period_end * 1000).toISOString()
      : null;

  if (event.type === "customer.subscription.deleted") {
    return { user_id, status: "expired", expires_at };
  }

  switch (obj.status) {
    case "active":
    case "trialing":
    case "past_due":
      return { user_id, status: "active", expires_at };
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return { user_id, status: "canceled", expires_at };
    default:
      return null; // incomplete / paused / undefined — no change
  }
}
