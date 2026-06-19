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
  /** Stripe customer id ("cus_…") — persisted so the Customer Portal can find
   *  the customer (there is no customer→user table). */
  customer?: string;
}

export interface StripeEvent {
  type: string;
  /** Unix seconds the event was created — the monotonic ordering key (Stripe
   *  delivery is unordered + at-least-once). */
  created?: number;
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
  /** Stripe customer id, when the event carried one (null = leave existing). */
  stripe_customer_id: string | null;
  /** ISO of the event's `created` time — the upsert applies only if this is at
   *  or after the stored watermark, so a stale/replayed delivery can't regress
   *  a paying user. null when absent (then it applies unconditionally). */
  event_at: string | null;
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
  const stripe_customer_id =
    typeof obj.customer === "string" && obj.customer !== "" ? obj.customer : null;
  const event_at =
    typeof event.created === "number" && Number.isFinite(event.created)
      ? new Date(event.created * 1000).toISOString()
      : null;

  if (event.type === "customer.subscription.deleted") {
    return { user_id, status: "expired", expires_at, stripe_customer_id, event_at };
  }

  switch (obj.status) {
    case "active":
    case "trialing":
    case "past_due":
      return { user_id, status: "active", expires_at, stripe_customer_id, event_at };
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return { user_id, status: "canceled", expires_at, stripe_customer_id, event_at };
    default:
      return null; // incomplete / paused / undefined — no change
  }
}

// ── Billing capability (Checkout + Customer Portal) ──────────────────────────
// Injected like StripeWebhookVerifier: fake in tests, the real Stripe SDK at
// deploy (see src/deploy.ts). Plan→price resolution lives at the deploy
// boundary (the price ids are env); handlers stay pure + testable.

export interface CheckoutSessionParams {
  plan: "monthly" | "annual";
  /** Verified Clerk user id — written as client_reference_id AND
   *  subscription_data.metadata.user_id so the webhook attributes the sub. */
  client_reference_id: string;
  user_id: string;
  success_url: string;
  cancel_url: string;
}

export interface PortalSessionParams {
  customer: string;
  return_url: string;
}

export interface StripeBilling {
  createCheckoutSession(p: CheckoutSessionParams): Promise<{ url: string | null }>;
  createPortalSession(p: PortalSessionParams): Promise<{ url: string }>;
}

/** Validate the requested plan. Absent/empty → "monthly" (default); a present
 *  but unrecognized value → null (the handler 400s it). */
export function parsePlan(raw: unknown): "monthly" | "annual" | null {
  if (raw === undefined || raw === null || raw === "") return "monthly";
  if (raw === "monthly" || raw === "annual") return raw;
  return null;
}
