/**
 * POST /api/webhooks/stripe — AUTH-FREE (no bearer): authenticated by the
 * Stripe SIGNATURE in the "stripe-signature" header against the raw body.
 * This is the business model's spine (D29: external web Stripe checkout, NO
 * IAP) — it is the ONLY writer of subscription truth; the status endpoint and
 * entitlement reads consume stripe_subscriptions downstream.
 *
 * The body for THIS route is the RAW JSON STRING exactly as Stripe sent it
 * (Stripe signs the bytes). req.body is read as a string and handed verbatim
 * to the verifier — the deploy adapter MUST pass the unparsed body on this
 * route (see stores/stripeWebhookStore.ts notes + the deploy seam).
 *
 * Flow (each step returns 200 so Stripe stops retrying a handled event):
 *  1) verify(rawBody, sig) fails            -> 400 {error:"invalid_signature"}
 *  2) event.id already processed            -> 200 {received, duplicate}      (idempotent; Stripe redelivers)
 *  3) no user_id resolvable                 -> markProcessed, 200 {received, ignored:"no_user"}
 *  4) event.created <= stored watermark     -> markProcessed, 200 {received, stale} (never downgrade on a stale event)
 *  5) map type -> upsert subscription truth (or note-only for payment_failed; ignore unknown types)
 *  6) markProcessed(event.id, now)          -> 200 {received}
 *
 * Never throws across the boundary; the router would turn a throw into a 500,
 * which would make Stripe retry forever — so failures here are explicit codes.
 */

import type { HttpRequest, HttpResponse } from "../types";
import type {
  StripeEvent,
  StripeSubStatus,
  StripeVerifier,
  StripeWebhookStore,
} from "../stores/stripeWebhookStore";

/** Minimal seams this handler consumes (no bearer verifier — auth is by
 *  signature, so requireAuth/TokenVerifier are deliberately absent). */
export interface StripeWebhookCtx {
  now: () => string;
  verify: StripeVerifier;
  store: StripeWebhookStore;
}

export async function stripeWebhook(
  ctx: StripeWebhookCtx,
  req: HttpRequest,
): Promise<HttpResponse> {
  const server_time = ctx.now();

  // Never throw across the boundary: a rejecting verifier/store (transient pg
  // outage, a thrown SDK call) must NOT bubble to the router as an unhandled
  // rejection. On a caught error we return 500 {error:"internal_error"} and DO NOT
  // mark the event processed — so Stripe retries the delivery later and the
  // idempotency ledger replays cleanly (the event was never committed).
  try {
    // ── 0) raw body: this route is signed over the EXACT bytes. A NON-string
    // object body means a real deploy/bodyParser misconfig (the adapter parsed
    // the body on a route that must stay raw) — surface it as a distinct 500
    // {error:"raw_body_required"} rather than re-stringifying and masking it as
    // an invalid_signature (which would send Stripe into a pointless retry loop
    // against a payload it can never sign-match).
    const rawResult = rawBodyOf(req.body);
    if (rawResult.error !== undefined) {
      return { status: 500, json: { error: rawResult.error, server_time } };
    }
    const rawBody = rawResult.raw;

    // ── 1) signature: the raw body is the signed payload, verbatim ────────────
    const sig = headerOf(req.headers, "stripe-signature");
    const verified = ctx.verify.verify(rawBody, sig);
    if (!verified.ok) {
      return { status: 400, json: { error: "invalid_signature", server_time } };
    }
    const event = verified.event;

    // ── 1b) input validation: reject a malformed event BEFORE its id is used as
    // the idempotency ledger PK. A verifier could (a real SDK after a partial
    // parse, or a fake) hand back an event with an empty id, a non-string type,
    // or a non-finite `created`. An id:"" event must not be written to the
    // ledger (it would poison idempotency for every other empty-id delivery)
    // and a non-finite `created` would corrupt the out-of-order watermark.
    if (
      typeof event.id !== "string" ||
      event.id === "" ||
      typeof event.type !== "string" ||
      !Number.isFinite(event.created)
    ) {
      return { status: 400, json: { error: "invalid_event", server_time } };
    }

    // ── 2) idempotency: Stripe redelivers; an already-handled id is a no-op ───
    if (await ctx.store.isProcessed(event.id)) {
      return { status: 200, json: { received: true, duplicate: true, server_time } };
    }

    const object = objectOf(event);

    // ── 3) resolve the user this event belongs to ─────────────────────────────
    const user_id = resolveUserId(object);
    if (user_id === null) {
      await ctx.store.markProcessed(event.id, server_time);
      return { status: 200, json: { received: true, ignored: "no_user", server_time } };
    }
    // The id comes from client-controlled fields (client_reference_id / metadata
    // on the Checkout Session the buyer's browser created). Before we write
    // subscription truth keyed by it, require the Clerk id shape (user_<alnum>).
    // A mismatch is an attacker trying to attach a paid subscription to an id
    // they don't own (or write to a bogus key) — mark processed (so Stripe
    // stops retrying) and acknowledge, but write NOTHING.
    if (!USER_ID_RE.test(user_id)) {
      await ctx.store.markProcessed(event.id, server_time);
      return { status: 200, json: { received: true, ignored: "bad_user", server_time } };
    }

    // ── 3b) GDPR Art.17: never resurrect an erased id. upsertSubscription
    // ensureUser's the users row, so a redelivery / trailing customer.subscription.*
    // event arriving AFTER an account deletion would re-create erased identity and a
    // ghost subscription. If the id is tombstoned, ack + mark processed (stop Stripe
    // retrying) and write NOTHING.
    if (await ctx.store.isTombstoned(user_id)) {
      await ctx.store.markProcessed(event.id, server_time);
      return { status: 200, json: { received: true, ignored: "deleted", server_time } };
    }

    // ── map type -> intended subscription mutation (or note-only / ignore) ────
    const mapped = mapEvent(event.type, object);

    if (mapped.kind === "ignore") {
      // unknown type, or a note-only event (payment_failed leaves status alone):
      // mark processed so Stripe stops retrying, but write nothing.
      await ctx.store.markProcessed(event.id, server_time);
      return {
        status: 200,
        json: {
          received: true,
          ...(mapped.note !== undefined ? { note: mapped.note } : { ignored: "unhandled_type" }),
          server_time,
        },
      };
    }

    // ── 4) out-of-order guard: never apply a stale event (< stored watermark) ──
    // Strictly-older events are always stale. For an EQUAL `created` second
    // (two distinct events can share one Stripe-stamped second), a terminal
    // 'canceled' is NOT treated as stale — it is forwarded to the store, whose
    // equal-second tiebreaker lets a delete land over a same-second update
    // regardless of arrival order. Any other equal-second event stays stale
    // (the existing watermark already holds for that second).
    const prevCreated = await ctx.store.getEventCreated(user_id);
    if (prevCreated !== null) {
      const older = event.created < prevCreated;
      const equalNonTerminal = event.created === prevCreated && mapped.status !== "canceled";
      if (older || equalNonTerminal) {
        await ctx.store.markProcessed(event.id, server_time);
        return { status: 200, json: { received: true, stale: true, server_time } };
      }
    }

    // ── 5) commit subscription truth ──────────────────────────────────────────
    await ctx.store.upsertSubscription(user_id, {
      status: mapped.status,
      current_period_end: mapped.current_period_end,
      event_created: event.created,
      received_at: server_time, // updated_at = server receipt time, not the event epoch
    });

    // ── 6) record the event so a redelivery short-circuits at step 2 ──────────
    await ctx.store.markProcessed(event.id, server_time);
    return { status: 200, json: { received: true, server_time } };
  } catch {
    // Do NOT markProcessed here — leaving the event uncommitted lets Stripe
    // retry and the idempotency ledger replay the full flow next time.
    return { status: 500, json: { error: "internal_error", server_time } };
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Clerk user id shape ("user_<alnum>"). The id we key subscription truth by is
 *  client-controlled (checkout client_reference_id / metadata), so it is
 *  validated against this before any write. */
const USER_ID_RE = /^user_[A-Za-z0-9]+$/;

/** req.body is the RAW signed payload on this route. The wire delivers it as a
 *  string; undefined/null collapse to "" (the verifier then rejects the empty
 *  signature). A NON-string OBJECT body, however, is a deploy/bodyParser
 *  misconfig — the adapter parsed a route that MUST stay raw — and is reported
 *  as a distinct `raw_body_required` error rather than re-stringified (which
 *  would mask the misconfig as an unfixable invalid_signature retry loop). */
function rawBodyOf(body: unknown): { raw: string; error?: undefined } | { error: "raw_body_required" } {
  if (typeof body === "string") return { raw: body };
  if (body === undefined || body === null) return { raw: "" };
  return { error: "raw_body_required" };
}

function headerOf(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function objectOf(event: StripeEvent): Record<string, unknown> {
  const o = event.data?.object;
  return o !== null && typeof o === "object" && !Array.isArray(o)
    ? (o as Record<string, unknown>)
    : {};
}

/** client_reference_id (checkout.session) || metadata.user_id || metadata.userId. */
function resolveUserId(object: Record<string, unknown>): string | null {
  const direct = object.client_reference_id;
  if (typeof direct === "string" && direct.trim() !== "") return direct;

  const meta = object.metadata;
  if (meta !== null && typeof meta === "object" && !Array.isArray(meta)) {
    const m = meta as Record<string, unknown>;
    const a = m.user_id;
    if (typeof a === "string" && a.trim() !== "") return a;
    const b = m.userId;
    if (typeof b === "string" && b.trim() !== "") return b;
  }
  return null;
}

type Mapped =
  | { kind: "upsert"; status: StripeSubStatus; current_period_end: string | null }
  | { kind: "ignore"; note?: string };

function mapEvent(type: string, object: Record<string, unknown>): Mapped {
  switch (type) {
    case "checkout.session.completed":
      // A Checkout Session's own `status` is open|complete|expired — that is the
      // SESSION lifecycle, NOT a subscription status, so it must NOT go through
      // mapObjectStatus (which would send "complete" to the default → "expired"
      // and never grant). The event firing at all IS the payment signal → active.
      // The session carries no current_period_end (that lives on the Subscription
      // object); pass null and let customer.subscription.created/updated set the
      // authoritative value — the store COALESCEs so this null never clobbers a
      // known period end.
      return { kind: "upsert", status: "active", current_period_end: null };
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return {
        kind: "upsert",
        status: mapObjectStatus(object.status),
        current_period_end: isoFromUnix(object.current_period_end),
      };
    case "customer.subscription.deleted":
      return {
        kind: "upsert",
        status: "canceled",
        current_period_end: isoFromUnix(object.current_period_end),
      };
    case "invoice.payment_failed":
      // note it, but do NOT change status — Stripe drives the lifecycle via a
      // subsequent subscription.updated/deleted; we don't pre-empt it.
      return { kind: "ignore", note: "payment_failed" };
    default:
      return { kind: "ignore" };
  }
}

/** Map a SUBSCRIPTION object's `status` to our 3-value status (used for
 *  customer.subscription.created/updated — NOT checkout.session, which is handled
 *  separately above). Stripe statuses: active|trialing -> active; canceled ->
 *  canceled; everything else (past_due, unpaid, incomplete, incomplete_expired,
 *  paused) -> expired. A missing/non-string status defaults to active (a
 *  subscription object always carries one; this is only a defensive fallback). */
function mapObjectStatus(raw: unknown): StripeSubStatus {
  if (typeof raw !== "string") return "active";
  switch (raw) {
    case "active":
    case "trialing":
      return "active";
    case "canceled":
      return "canceled";
    default:
      return "expired";
  }
}

/** Stripe current_period_end is a unix-second integer; -> ISO, or null. */
function isoFromUnix(v: unknown): string | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return new Date(v * 1000).toISOString();
}
