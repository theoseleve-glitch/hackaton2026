/**
 * stripe-webhook test suite — POST /api/webhooks/stripe exercised directly
 * against in-memory fakes (fake StripeVerifier + fake StripeWebhookStore). No
 * HTTP, no Stripe SDK, no Postgres. Assertion style mirrors src/test-server.ts.
 *
 * Run: npx tsx src/test-stripeWebhook.ts   (from server/)
 */

import type { HttpRequest } from "./types";
import { stripeWebhook } from "./handlers/stripeWebhook";
import type { StripeWebhookCtx } from "./handlers/stripeWebhook";
import type {
  StripeEvent,
  StripeSubscriptionUpsert,
  StripeVerifier,
  StripeWebhookStore,
} from "./stores/stripeWebhookStore";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

// ── in-memory StripeWebhookStore fake (same contract as makeSqlStripeWebhookStore) ──

class FakeStore implements StripeWebhookStore {
  processed = new Map<string, string>(); // event_id -> processed_at
  subs = new Map<string, StripeSubscriptionUpsert>(); // user_id -> row

  async isProcessed(eventId: string): Promise<boolean> {
    return this.processed.has(eventId);
  }
  async markProcessed(eventId: string, atIso: string): Promise<void> {
    if (!this.processed.has(eventId)) this.processed.set(eventId, atIso); // idempotent
  }
  async getEventCreated(userId: string): Promise<number | null> {
    return this.subs.get(userId)?.event_created ?? null;
  }
  async upsertSubscription(userId: string, s: StripeSubscriptionUpsert): Promise<void> {
    // mirror the SQL guard EXACTLY: strict-newer wins, OR an equal-second event
    // wins iff it is terminal ('canceled') — so a same-second delete is never
    // lost to a same-second update, regardless of arrival order.
    const prev = this.subs.get(userId);
    const wins =
      prev === undefined ||
      s.event_created > prev.event_created ||
      (s.event_created === prev.event_created && s.status === "canceled");
    if (wins) {
      // mirror the SQL COALESCE: a null current_period_end (checkout.session.completed)
      // preserves a known period end rather than clobbering it.
      this.subs.set(userId, {
        ...s,
        current_period_end: s.current_period_end ?? prev?.current_period_end ?? null,
      });
    }
  }
}

// ── fake StripeVerifier: a "signature" is valid iff sig === "good:<json>" and
//    the json parses to a StripeEvent. Lets tests forge bad signatures and
//    drive arbitrary events without the real SDK. ──────────────────────────────

const verify: StripeVerifier = {
  verify(rawBody, sigHeader) {
    if (sigHeader === undefined || sigHeader !== `sig:${rawBody}`) return { ok: false };
    try {
      const event = JSON.parse(rawBody) as StripeEvent;
      if (typeof event.id !== "string" || typeof event.type !== "string") return { ok: false };
      return { ok: true, event };
    } catch {
      return { ok: false };
    }
  },
};

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW = "2026-06-13T12:00:00.000Z";
const T0 = 1_700_000_000; // unix s baseline for event.created
const periodEnd = 1_700_500_000; // unix s
const periodEndIso = new Date(periodEnd * 1000).toISOString();

let store = new FakeStore();
const nowIso = NOW;
// each section rebinds the module-level `store` so assertions read fresh state
function freshCtx(): StripeWebhookCtx {
  store = new FakeStore();
  return { now: () => nowIso, verify, store };
}

function evt(e: Partial<StripeEvent> & { type: string; object: Record<string, unknown> }): StripeEvent {
  return {
    id: e.id ?? `evt_${Math.random().toString(36).slice(2)}`,
    type: e.type,
    created: e.created ?? T0,
    data: { object: e.object },
  };
}

/** Build a signed HttpRequest carrying the event as the RAW body string. */
function sreq(event: StripeEvent, opts?: { badSig?: boolean; noSig?: boolean }): HttpRequest {
  const raw = JSON.stringify(event);
  const headers: Record<string, string | string[] | undefined> = {};
  if (opts?.noSig !== true) {
    headers["stripe-signature"] = opts?.badSig === true ? "sig:forged" : `sig:${raw}`;
  }
  return { method: "POST", path: "/api/webhooks/stripe", headers, query: {}, body: raw };
}

// ═══ signature ════════════════════════════════════════════════════════════════

console.log("— signature —");
{
  const c = freshCtx();
  const e = evt({ id: "evt_sig", type: "customer.subscription.created", object: { client_reference_id: "user_A", status: "active" } });

  const bad = await stripeWebhook(c, sreq(e, { badSig: true }));
  check("sig: forged signature -> 400 invalid_signature", bad.status === 400 && bad.json.error === "invalid_signature");
  check("sig: forged signature carries server_time", bad.json.server_time === NOW);
  check("sig: forged signature wrote NOTHING", store.subs.size === 0 && store.processed.size === 0);

  const missing = await stripeWebhook(c, sreq(e, { noSig: true }));
  check("sig: missing stripe-signature header -> 400", missing.status === 400 && missing.json.error === "invalid_signature");

  const ok = await stripeWebhook(c, sreq(e));
  check("sig: valid signature -> 200 received", ok.status === 200 && ok.json.received === true);
}

// ═══ auth-free (no bearer involvement) ═══════════════════════════════════════

console.log("\n— auth model —");
{
  const c = freshCtx();
  const e = evt({ id: "evt_nobearer", type: "customer.subscription.created", object: { client_reference_id: "user_A", status: "active" } });
  // a valid SIGNATURE with NO Authorization header must still succeed: this
  // endpoint is auth-free (signature-authenticated), never bearer-gated.
  const r = await stripeWebhook(c, sreq(e));
  check("auth: no bearer header, valid signature -> 200 (signature is the auth)", r.status === 200 && r.json.received === true && store.subs.get("user_A")?.status === "active");
}

// ═══ happy path: each upsert type ════════════════════════════════════════════

console.log("\n— upsert mapping —");
{
  const c = freshCtx();

  // REALISTIC checkout.session.completed: a real session carries status "complete"
  // (the SESSION lifecycle, not a sub status) and NO current_period_end. It must
  // still grant active — completion is the payment signal — with a null period end
  // that a later subscription event fills in.
  const checkout = evt({ id: "evt_checkout", created: T0 + 1, type: "checkout.session.completed", object: { client_reference_id: "user_A", status: "complete" } });
  const r1 = await stripeWebhook(c, sreq(checkout));
  const a1 = store.subs.get("user_A");
  check("map: checkout.session.completed (status=complete) -> active (NOT expired)", r1.status === 200 && a1?.status === "active" && a1?.event_created === T0 + 1);
  check("map: checkout.session.completed -> null period end (session carries none)", a1?.current_period_end === null);

  const updated = evt({ id: "evt_updated", created: T0 + 2, type: "customer.subscription.updated", object: { metadata: { user_id: "user_A" }, status: "active", current_period_end: periodEnd } });
  const r2 = await stripeWebhook(c, sreq(updated));
  const a2 = store.subs.get("user_A");
  check("map: customer.subscription.updated (active) -> active + authoritative period end, watermark advances", r2.status === 200 && a2?.status === "active" && a2?.current_period_end === periodEndIso && a2?.event_created === T0 + 2);

  const pastDue = evt({ id: "evt_pastdue", created: T0 + 3, type: "customer.subscription.updated", object: { metadata: { user_id: "user_A" }, status: "past_due", current_period_end: periodEnd } });
  const r3 = await stripeWebhook(c, sreq(pastDue));
  check("map: object.status past_due -> expired", r3.status === 200 && store.subs.get("user_A")?.status === "expired");

  const deleted = evt({ id: "evt_deleted", created: T0 + 4, type: "customer.subscription.deleted", object: { metadata: { user_id: "user_A" } } });
  const r4 = await stripeWebhook(c, sreq(deleted));
  check("map: customer.subscription.deleted -> canceled", r4.status === 200 && store.subs.get("user_A")?.status === "canceled");

  const created = evt({ id: "evt_created", created: T0 + 5, type: "customer.subscription.created", object: { metadata: { userId: "user_C" }, status: "trialing", current_period_end: periodEnd } });
  const r5 = await stripeWebhook(c, sreq(created));
  check("map: subscription.created (trialing) -> active, metadata.userId alias resolves user", r5.status === 200 && store.subs.get("user_C")?.status === "active");
}

// ═══ checkout.session.completed must NOT clobber a known period end (#7) ══════
console.log("\n— checkout does not clobber a known period end —");
{
  const c = freshCtx();
  // subscription.created sets the authoritative period end first…
  const sub = evt({ id: "evt_sub_first", created: T0 + 10, type: "customer.subscription.created", object: { client_reference_id: "user_P", status: "active", current_period_end: periodEnd } });
  await stripeWebhook(c, sreq(sub));
  check("setup: subscription set period end", store.subs.get("user_P")?.current_period_end === periodEndIso);
  // …then a LATER checkout.session.completed (newer watermark, null period end)
  // grants active again but must PRESERVE the known period end (COALESCE).
  const checkout = evt({ id: "evt_checkout_after", created: T0 + 11, type: "checkout.session.completed", object: { client_reference_id: "user_P", status: "complete" } });
  await stripeWebhook(c, sreq(checkout));
  const p = store.subs.get("user_P");
  check("checkout after subscription keeps active", p?.status === "active" && p?.event_created === T0 + 11);
  check("checkout's null period end did NOT clobber the known one", p?.current_period_end === periodEndIso);
}

// ═══ user resolution precedence + missing user ═══════════════════════════════

console.log("\n— user resolution —");
{
  const c = freshCtx();

  const both = evt({ id: "evt_prec", type: "customer.subscription.created", object: { client_reference_id: "user_REF", metadata: { user_id: "user_META" }, status: "active" } });
  await stripeWebhook(c, sreq(both));
  check("user: client_reference_id wins over metadata", store.subs.has("user_REF") && !store.subs.has("user_META"));

  const onlyUserId = evt({ id: "evt_uid", type: "customer.subscription.created", object: { metadata: { user_id: "user_X" }, status: "active" } });
  await stripeWebhook(c, sreq(onlyUserId));
  check("user: metadata.user_id resolves", store.subs.has("user_X"));

  const none = evt({ id: "evt_nouser", type: "customer.subscription.created", object: { status: "active" } });
  const rNone = await stripeWebhook(c, sreq(none));
  check("user: no resolvable user -> 200 ignored:no_user", rNone.status === 200 && rNone.json.ignored === "no_user" && rNone.json.received === true);
  check("user: no-user event is marked processed (Stripe stops retrying)", store.processed.has("evt_nouser"));
  check("user: no-user event wrote no subscription", store.subs.size === 2);

  const blankRef = evt({ id: "evt_blank", type: "customer.subscription.created", object: { client_reference_id: "   ", metadata: { user_id: "" }, status: "active" } });
  const rBlank = await stripeWebhook(c, sreq(blankRef));
  check("user: blank/whitespace ids do not resolve -> ignored:no_user", rBlank.json.ignored === "no_user");
}

// ═══ idempotency (Stripe redelivers the same event.id) ═══════════════════════

console.log("\n— idempotency —");
{
  const c = freshCtx();
  const e = evt({ id: "evt_dup", created: T0 + 10, type: "customer.subscription.updated", object: { client_reference_id: "user_A", status: "active", current_period_end: periodEnd } });

  const first = await stripeWebhook(c, sreq(e));
  check("idem: first delivery -> 200 received (no duplicate flag)", first.status === 200 && first.json.received === true && first.json.duplicate === undefined);

  const second = await stripeWebhook(c, sreq(e));
  check("idem: redelivery of same event.id -> 200 duplicate:true", second.status === 200 && second.json.duplicate === true);
  check("idem: redelivery did not re-run the upsert (still one row, same watermark)", store.subs.get("user_A")?.event_created === T0 + 10);

  // a no-user event redelivered is also a duplicate (it was marked processed)
  const nu = evt({ id: "evt_nu_dup", type: "customer.subscription.created", object: { status: "active" } });
  await stripeWebhook(c, sreq(nu));
  const nu2 = await stripeWebhook(c, sreq(nu));
  check("idem: redelivered no-user event short-circuits as duplicate", nu2.json.duplicate === true);
}

// ═══ out-of-order guard (never downgrade on a stale event) ═══════════════════

console.log("\n— out-of-order guard —");
{
  const c = freshCtx();

  // newest first: a "deleted" (canceled) at T0+100 lands...
  const del = evt({ id: "evt_late_del", created: T0 + 100, type: "customer.subscription.deleted", object: { client_reference_id: "user_A" } });
  await stripeWebhook(c, sreq(del));
  check("ooo: setup — canceled at T0+100", store.subs.get("user_A")?.status === "canceled" && store.subs.get("user_A")?.event_created === T0 + 100);

  // ...then an OLDER "updated active" arrives out of order — must be dropped.
  const staleActive = evt({ id: "evt_stale_active", created: T0 + 50, type: "customer.subscription.updated", object: { client_reference_id: "user_A", status: "active", current_period_end: periodEnd } });
  const rStale = await stripeWebhook(c, sreq(staleActive));
  check("ooo: older active event -> 200 stale:true", rStale.status === 200 && rStale.json.stale === true);
  check("ooo: stale event did NOT downgrade canceled back to active", store.subs.get("user_A")?.status === "canceled" && store.subs.get("user_A")?.event_created === T0 + 100);
  check("ooo: stale event is still marked processed", store.processed.has("evt_stale_active"));

  // equal created timestamp is also treated as stale (<=), no re-apply
  const equal = evt({ id: "evt_equal", created: T0 + 100, type: "customer.subscription.updated", object: { client_reference_id: "user_A", status: "active" } });
  const rEqual = await stripeWebhook(c, sreq(equal));
  check("ooo: equal created timestamp -> stale (<=), no change", rEqual.json.stale === true && store.subs.get("user_A")?.status === "canceled");

  // a strictly NEWER event applies normally
  const newer = evt({ id: "evt_newer", created: T0 + 200, type: "customer.subscription.updated", object: { client_reference_id: "user_A", status: "active", current_period_end: periodEnd } });
  const rNewer = await stripeWebhook(c, sreq(newer));
  check("ooo: strictly newer event applies", rNewer.json.stale === undefined && store.subs.get("user_A")?.status === "active" && store.subs.get("user_A")?.event_created === T0 + 200);
}

// ═══ owner-scoping / no cross-user contamination ═════════════════════════════

console.log("\n— owner scoping —");
{
  const c = freshCtx();
  const a = evt({ id: "evt_A", created: T0 + 1, type: "customer.subscription.created", object: { client_reference_id: "user_A", status: "active", current_period_end: periodEnd } });
  const b = evt({ id: "evt_B", created: T0 + 1, type: "customer.subscription.deleted", object: { client_reference_id: "user_B" } });
  await stripeWebhook(c, sreq(a));
  await stripeWebhook(c, sreq(b));
  check("scope: user_A row independent of user_B", store.subs.get("user_A")?.status === "active" && store.subs.get("user_B")?.status === "canceled");
  check("scope: each user has exactly their own row", store.subs.size === 2);
  // user_B's stale watermark must not affect user_A
  const bStale = evt({ id: "evt_B_stale", created: T0, type: "customer.subscription.updated", object: { client_reference_id: "user_B", status: "active" } });
  await stripeWebhook(c, sreq(bStale));
  check("scope: B's stale event leaves A untouched and is dropped for B", store.subs.get("user_A")?.status === "active" && store.subs.get("user_B")?.status === "canceled");
}

// ═══ unknown + note-only types ═══════════════════════════════════════════════

console.log("\n— unknown / note-only types —");
{
  const c = freshCtx();

  const unknown = evt({ id: "evt_unknown", type: "customer.created", object: { client_reference_id: "user_A" } });
  const rU = await stripeWebhook(c, sreq(unknown));
  check("type: unknown type -> 200 ignored:unhandled_type, marked processed, no row", rU.status === 200 && rU.json.ignored === "unhandled_type" && store.processed.has("evt_unknown") && store.subs.size === 0);

  // set an active row, then a payment_failed must NOT change status (note-only)
  const setup = evt({ id: "evt_setup_pf", created: T0 + 1, type: "customer.subscription.created", object: { client_reference_id: "user_A", status: "active", current_period_end: periodEnd } });
  await stripeWebhook(c, sreq(setup));
  const pf = evt({ id: "evt_pf", created: T0 + 2, type: "invoice.payment_failed", object: { client_reference_id: "user_A" } });
  const rPf = await stripeWebhook(c, sreq(pf));
  check("type: invoice.payment_failed -> 200 note:payment_failed, status UNCHANGED", rPf.status === 200 && rPf.json.note === "payment_failed" && store.subs.get("user_A")?.status === "active");
  check("type: payment_failed marked processed but did not move watermark", store.processed.has("evt_pf") && store.subs.get("user_A")?.event_created === T0 + 1);
}

// ═══ malformed / edge input ══════════════════════════════════════════════════

console.log("\n— malformed input —");
{
  const c = freshCtx();

  // body is not valid JSON: the verifier's parse fails -> invalid_signature
  const notJson: HttpRequest = { method: "POST", path: "/api/webhooks/stripe", headers: { "stripe-signature": "sig:not json" }, query: {}, body: "not json" };
  const rNJ = await stripeWebhook(c, notJson);
  check("input: unparseable body -> 400 invalid_signature (verifier rejects)", rNJ.status === 400 && rNJ.json.error === "invalid_signature");

  // event with empty data.object -> no user -> ignored:no_user, never throws
  const emptyObj = evt({ id: "evt_empty", type: "customer.subscription.updated", object: {} });
  const rEmpty = await stripeWebhook(c, sreq(emptyObj));
  check("input: empty object -> 200 ignored:no_user (no throw)", rEmpty.status === 200 && rEmpty.json.ignored === "no_user");

  // header delivered as an array (some adapters): first element is used
  const e = evt({ id: "evt_arrhdr", type: "customer.subscription.created", object: { client_reference_id: "user_A", status: "active" } });
  const raw = JSON.stringify(e);
  const arrHdr: HttpRequest = { method: "POST", path: "/api/webhooks/stripe", headers: { "stripe-signature": [`sig:${raw}`, "extra"] }, query: {}, body: raw };
  const rArr = await stripeWebhook(c, arrHdr);
  check("input: array signature header -> first element used -> 200", rArr.status === 200 && store.subs.get("user_A")?.status === "active");

  // current_period_end missing/garbage -> null, still upserts
  const c2 = freshCtx();
  const noEnd = evt({ id: "evt_noend", type: "customer.subscription.created", object: { client_reference_id: "user_A", status: "active" } });
  await stripeWebhook(c2, sreq(noEnd));
  check("input: missing current_period_end -> null, still active", store.subs.get("user_A")?.status === "active" && store.subs.get("user_A")?.current_period_end === null);
}

// ═══ SHOULD_FIX 1: equal-second downgrade (terminal tiebreaker) ══════════════
// Two DISTINCT events (different ids) sharing the same `created` second must
// not let a 'active' (subscription.updated) clobber a 'canceled'
// (subscription.deleted) — the delete must win regardless of arrival order.

console.log("\n— equal-second downgrade (terminal tiebreaker) —");
{
  // case A — deleted THEN active (same second): canceled must stay canceled.
  const cA = freshCtx();
  const delA = evt({ id: "evt_eq_del_A", created: T0 + 100, type: "customer.subscription.deleted", object: { client_reference_id: "user_A" } });
  await stripeWebhook(cA, sreq(delA));
  check("eqsec A: setup — deleted lands -> canceled at T0+100", store.subs.get("user_A")?.status === "canceled");

  const actA = evt({ id: "evt_eq_act_A", created: T0 + 100, type: "customer.subscription.updated", object: { client_reference_id: "user_A", status: "active", current_period_end: periodEnd } });
  const rActA = await stripeWebhook(cA, sreq(actA));
  check("eqsec A: same-second active is stale -> 200 stale:true", rActA.status === 200 && rActA.json.stale === true);
  check("eqsec A: canceled NOT downgraded to active", store.subs.get("user_A")?.status === "canceled" && store.subs.get("user_A")?.event_created === T0 + 100);

  // case B — active THEN deleted (same second): the delete must still win.
  // (the older `<=` handler guard would have dropped the delete here — that is
  //  exactly the race SHOULD_FIX 1 closes.)
  const cB = freshCtx();
  const actB = evt({ id: "evt_eq_act_B", created: T0 + 100, type: "customer.subscription.updated", object: { client_reference_id: "user_B", status: "active", current_period_end: periodEnd } });
  await stripeWebhook(cB, sreq(actB));
  check("eqsec B: setup — active lands -> active at T0+100", store.subs.get("user_B")?.status === "active");

  const delB = evt({ id: "evt_eq_del_B", created: T0 + 100, type: "customer.subscription.deleted", object: { client_reference_id: "user_B" } });
  const rDelB = await stripeWebhook(cB, sreq(delB));
  check("eqsec B: same-second deleted is NOT stale (terminal forwarded) -> 200, no stale flag", rDelB.status === 200 && rDelB.json.stale === undefined);
  check("eqsec B: deleted wins same second -> canceled (active did NOT survive)", store.subs.get("user_B")?.status === "canceled" && store.subs.get("user_B")?.event_created === T0 + 100);

  // case C — strictly-newer active still applies over a canceled (sanity: the
  // strict guard only blocks EQUAL/older, not a genuinely newer reactivation).
  const cC = freshCtx();
  const delC = evt({ id: "evt_eq_del_C", created: T0 + 100, type: "customer.subscription.deleted", object: { client_reference_id: "user_C" } });
  await stripeWebhook(cC, sreq(delC));
  const newAct = evt({ id: "evt_eq_newact_C", created: T0 + 101, type: "customer.subscription.updated", object: { client_reference_id: "user_C", status: "active", current_period_end: periodEnd } });
  const rNewAct = await stripeWebhook(cC, sreq(newAct));
  check("eqsec C: strictly-newer active over canceled still applies", rNewAct.json.stale === undefined && store.subs.get("user_C")?.status === "active" && store.subs.get("user_C")?.event_created === T0 + 101);

  // case D — store-level guard in isolation (mirrors the SQL ON CONFLICT WHERE):
  // a same-second NON-terminal upsert is rejected by the FakeStore guard, but a
  // same-second 'canceled' is accepted (terminal tiebreaker).
  const fs = new FakeStore();
  await fs.upsertSubscription("u", { status: "active", current_period_end: periodEndIso, event_created: T0 + 100 });
  await fs.upsertSubscription("u", { status: "active", current_period_end: null, event_created: T0 + 100 });
  check("eqsec D: store rejects same-second non-terminal upsert (strict >)", (await fs.getEventCreated("u")) === T0 + 100 && fs.subs.get("u")?.current_period_end === periodEndIso);
  await fs.upsertSubscription("u", { status: "canceled", current_period_end: null, event_created: T0 + 100 });
  check("eqsec D: store accepts same-second 'canceled' (terminal tiebreaker)", fs.subs.get("u")?.status === "canceled");
}

// ═══ SHOULD_FIX 2: never throws across the boundary ══════════════════════════
// A rejecting store/verifier must NOT propagate (router would turn it into an
// unhandled 500 + Stripe-retry storm). The handler resolves to 500
// {error:"internal_error"} and must NOT mark the event processed (so the retry
// replays cleanly through the idempotency ledger).

console.log("\n— never throws (500 internal, not processed) —");
{
  // a store whose upsertSubscription REJECTS — everything else behaves.
  class ThrowingUpsertStore extends FakeStore {
    async upsertSubscription(): Promise<void> {
      throw new Error("pg connection reset");
    }
  }
  const throwing = new ThrowingUpsertStore();
  const ctxThrow: StripeWebhookCtx = { now: () => nowIso, verify, store: throwing };
  const e = evt({ id: "evt_throw", created: T0 + 1, type: "customer.subscription.created", object: { client_reference_id: "user_A", status: "active", current_period_end: periodEnd } });

  let resolved = false;
  let res: Awaited<ReturnType<typeof stripeWebhook>> | undefined;
  try {
    res = await stripeWebhook(ctxThrow, sreq(e));
    resolved = true;
  } catch {
    resolved = false;
  }
  check("throws: handler RESOLVES (did not reject) despite throwing store", resolved === true);
  check("throws: -> 500 {error:internal} with server_time", res?.status === 500 && res?.json.error === "internal_error" && res?.json.server_time === NOW);
  check("throws: event NOT marked processed (Stripe will retry, idempotency replays)", !throwing.processed.has("evt_throw"));
  check("throws: no subscription row committed", throwing.subs.size === 0);

  // a REJECTING verifier (e.g. SDK threw instead of returning {ok:false}) must
  // also be swallowed into a 500, not propagate.
  const throwingVerify: StripeVerifier = {
    verify() {
      throw new Error("verifier blew up");
    },
  };
  const ctxVerifyThrow: StripeWebhookCtx = { now: () => nowIso, verify: throwingVerify, store: new FakeStore() };
  let vResolved = false;
  let vRes: Awaited<ReturnType<typeof stripeWebhook>> | undefined;
  try {
    vRes = await stripeWebhook(ctxVerifyThrow, sreq(e));
    vResolved = true;
  } catch {
    vResolved = false;
  }
  check("throws: rejecting verifier -> handler resolves to 500 internal", vResolved === true && vRes?.status === 500 && vRes?.json.error === "internal_error");

  // a REJECTING isProcessed (idempotency read fails) -> 500, nothing written.
  class ThrowingIsProcessedStore extends FakeStore {
    async isProcessed(): Promise<boolean> {
      throw new Error("pg read timeout");
    }
  }
  const throwingRead = new ThrowingIsProcessedStore();
  const ctxReadThrow: StripeWebhookCtx = { now: () => nowIso, verify, store: throwingRead };
  let rResolved = false;
  let rRes: Awaited<ReturnType<typeof stripeWebhook>> | undefined;
  try {
    rRes = await stripeWebhook(ctxReadThrow, sreq(e));
    rResolved = true;
  } catch {
    rResolved = false;
  }
  check("throws: rejecting isProcessed -> 500 internal, nothing marked", rResolved === true && rRes?.status === 500 && !throwingRead.processed.has("evt_throw"));
}

// ═══ BUILD-NOW 5a: event field validation (reject BEFORE id is the ledger PK) ══
// A verifier that returns ok with a malformed event (empty id, non-string type,
// non-finite created) must be rejected with 400 invalid_event — and crucially
// the event.id must NOT be written to the idempotency ledger (an id:"" event
// would poison every other empty-id delivery; a non-finite created would
// corrupt the watermark). The handler validates these itself, independent of
// the fake verifier's own typeof pre-check.

console.log("\n— event validation (invalid_event) —");
{
  // (a) empty event.id — survives JSON round-trip + the fake verifier's
  // typeof-string check, so it reaches the handler's own non-empty guard.
  const c = freshCtx();
  const emptyId = evt({ id: "", type: "customer.subscription.created", object: { client_reference_id: "user_A", status: "active" } });
  const rEmptyId = await stripeWebhook(c, sreq(emptyId));
  check("validate: empty event.id -> 400 invalid_event", rEmptyId.status === 400 && rEmptyId.json.error === "invalid_event");
  check("validate: empty event.id carries server_time", rEmptyId.json.server_time === NOW);
  check("validate: empty event.id NOT written to ledger (no id:'' PK poison)", !store.processed.has("") && store.processed.size === 0);
  check("validate: empty event.id wrote no subscription", store.subs.size === 0);

  // (b) non-finite event.created — JSON.stringify turns Infinity/NaN into null,
  // so the verifier re-parses created === null -> Number.isFinite(null) false.
  const cInf = freshCtx();
  const infCreated = evt({ id: "evt_inf", created: Infinity, type: "customer.subscription.created", object: { client_reference_id: "user_A", status: "active" } });
  const rInf = await stripeWebhook(cInf, sreq(infCreated));
  check("validate: non-finite created (Infinity->null) -> 400 invalid_event", rInf.status === 400 && rInf.json.error === "invalid_event");
  check("validate: non-finite created NOT marked processed, no row", !store.processed.has("evt_inf") && store.subs.size === 0);

  const cNaN = freshCtx();
  const nanCreated = evt({ id: "evt_nan", created: NaN, type: "customer.subscription.created", object: { client_reference_id: "user_A", status: "active" } });
  const rNaN = await stripeWebhook(cNaN, sreq(nanCreated));
  check("validate: NaN created (->null) -> 400 invalid_event, nothing written", rNaN.status === 400 && rNaN.json.error === "invalid_event" && store.processed.size === 0 && store.subs.size === 0);

  // (c) non-string type / non-finite created delivered DIRECTLY by a verifier
  // that bypasses the fake verifier's own typeof pre-check — proves the handler
  // guards these on its own, not just the test fake.
  const malformedVerify: StripeVerifier = {
    verify() {
      // a forged "ok" event whose type is not a string and created is not finite
      return { ok: true, event: { id: "evt_forged", type: 123 as unknown as string, created: Number.NaN, data: { object: { client_reference_id: "user_A" } } } };
    },
  };
  const badTypeStore = new FakeStore();
  const cBadType: StripeWebhookCtx = { now: () => nowIso, verify: malformedVerify, store: badTypeStore };
  const eForged = evt({ id: "evt_forged", type: "customer.subscription.created", object: { client_reference_id: "user_A", status: "active" } });
  const rBadType = await stripeWebhook(cBadType, sreq(eForged));
  check("validate: handler rejects non-string type / non-finite created from verifier -> 400 invalid_event", rBadType.status === 400 && rBadType.json.error === "invalid_event");
  check("validate: forged-malformed event NOT marked processed, no row", !badTypeStore.processed.has("evt_forged") && badTypeStore.subs.size === 0);

  // sanity: a well-formed event with created 0 (epoch) is finite -> NOT rejected
  // by validation (it flows on through the normal path).
  const cZero = freshCtx();
  const zero = evt({ id: "evt_zero", created: 0, type: "customer.subscription.created", object: { client_reference_id: "user_A", status: "active" } });
  const rZero = await stripeWebhook(cZero, sreq(zero));
  check("validate: created 0 is finite -> NOT invalid_event (flows on, 200)", rZero.status === 200 && rZero.json.received === true);
}

// ═══ BUILD-NOW 5b: client-controlled user id must match /^user_[A-Za-z0-9]+$/ ══
// resolveUserId reads client_reference_id / metadata, which the buyer's browser
// controls. A resolved id that is NOT a Clerk user id is an attacker trying to
// attach a paid subscription to an id they don't own — mark processed (Stripe
// stops retrying) and 200 {received, ignored:"bad_user"}, but write NOTHING.

console.log("\n— bad_user (client-controlled id rejected) —");
{
  const c = freshCtx();

  const sneaky = evt({ id: "evt_baduser", type: "customer.subscription.created", object: { client_reference_id: "admin", status: "active", current_period_end: periodEnd } });
  const rBad = await stripeWebhook(c, sreq(sneaky));
  check("baduser: non-user_ client_reference_id -> 200 ignored:bad_user", rBad.status === 200 && rBad.json.received === true && rBad.json.ignored === "bad_user");
  check("baduser: bad id wrote NO subscription truth", store.subs.has("admin") === false && store.subs.size === 0);
  check("baduser: bad-user event IS marked processed (Stripe stops retrying)", store.processed.has("evt_baduser"));
  check("baduser: redelivery of bad-user event short-circuits as duplicate", (await stripeWebhook(c, sreq(sneaky))).json.duplicate === true);

  // SQL-ish / structurally-wrong ids are all rejected (regex anchors both ends).
  const cInj = freshCtx();
  const inj = evt({ id: "evt_inj", type: "customer.subscription.created", object: { client_reference_id: "user_A; DROP TABLE stripe_subscriptions;--", status: "active" } });
  const rInj = await stripeWebhook(cInj, sreq(inj));
  check("baduser: id with non-alnum chars (anchored regex) -> bad_user, no write", rInj.json.ignored === "bad_user" && store.subs.size === 0);

  const cPrefix = freshCtx();
  const prefixOnly = evt({ id: "evt_prefixonly", type: "customer.subscription.created", object: { client_reference_id: "user_", status: "active" } });
  const rPrefix = await stripeWebhook(cPrefix, sreq(prefixOnly));
  check("baduser: bare 'user_' (no alnum after) -> bad_user", rPrefix.json.ignored === "bad_user" && store.subs.size === 0);

  // and a bad id arriving via metadata (not just client_reference_id) is caught
  const cMeta = freshCtx();
  const badMeta = evt({ id: "evt_badmeta", type: "customer.subscription.created", object: { metadata: { user_id: "root" }, status: "active" } });
  const rBadMeta = await stripeWebhook(cMeta, sreq(badMeta));
  check("baduser: bad metadata.user_id -> bad_user, no write", rBadMeta.json.ignored === "bad_user" && store.subs.size === 0);

  // sanity: a legit user_ id still writes (the guard does not over-reject).
  const cOk = freshCtx();
  const okUser = evt({ id: "evt_okuser", type: "customer.subscription.created", object: { client_reference_id: "user_Legit123", status: "active" } });
  await stripeWebhook(cOk, sreq(okUser));
  check("baduser: legit user_ id still writes (no over-rejection)", store.subs.get("user_Legit123")?.status === "active");
}

// ═══ POLISH 6: object body on a raw route -> 500 raw_body_required ════════════
// Stripe signs the EXACT bytes; this route MUST receive the raw string. If a
// bodyParser misconfig hands the handler an already-parsed OBJECT, that is a
// deploy bug — surface it as a distinct 500 {error:"raw_body_required"} instead
// of re-stringifying and masking it as an unfixable invalid_signature loop.

console.log("\n— raw_body_required (object body on raw route) —");
{
  const c = freshCtx();
  const event = evt({ id: "evt_objbody", type: "customer.subscription.created", object: { client_reference_id: "user_A", status: "active" } });

  // body delivered as a parsed OBJECT (the misconfig) instead of the raw string.
  const objBody: HttpRequest = {
    method: "POST",
    path: "/api/webhooks/stripe",
    headers: { "stripe-signature": `sig:${JSON.stringify(event)}` },
    query: {},
    body: event as unknown,
  };
  const rObj = await stripeWebhook(c, objBody);
  check("rawbody: object body -> 500 raw_body_required (NOT invalid_signature)", rObj.status === 500 && rObj.json.error === "raw_body_required");
  check("rawbody: object body carries server_time", rObj.json.server_time === NOW);
  check("rawbody: object body wrote NOTHING (not in ledger, no row)", store.processed.size === 0 && store.subs.size === 0);

  // an ARRAY body is also a non-string object -> same distinct 500.
  const arrBody: HttpRequest = {
    method: "POST",
    path: "/api/webhooks/stripe",
    headers: { "stripe-signature": "sig:[]" },
    query: {},
    body: [] as unknown,
  };
  const rArr = await stripeWebhook(c, arrBody);
  check("rawbody: array body -> 500 raw_body_required", rArr.status === 500 && rArr.json.error === "raw_body_required");

  // a number body (another non-string) -> same.
  const numBody: HttpRequest = {
    method: "POST",
    path: "/api/webhooks/stripe",
    headers: { "stripe-signature": "sig:0" },
    query: {},
    body: 0 as unknown,
  };
  const rNum = await stripeWebhook(c, numBody);
  check("rawbody: number body -> 500 raw_body_required", rNum.status === 500 && rNum.json.error === "raw_body_required");

  // regression: a STRING body still flows through signature verification as
  // before (raw_body_required only fires for non-string objects).
  const cStr = freshCtx();
  const okStr = await stripeWebhook(cStr, sreq(event));
  check("rawbody: string body unaffected -> 200 (raw path intact)", okStr.status === 200 && okStr.json.received === true);

  // regression: undefined/null body still collapses to "" -> invalid_signature,
  // NOT raw_body_required (those are the empty-wire case, not a misconfig).
  const cNull = freshCtx();
  const nullBody: HttpRequest = { method: "POST", path: "/api/webhooks/stripe", headers: {}, query: {}, body: undefined };
  const rNull = await stripeWebhook(cNull, nullBody);
  check("rawbody: undefined body -> 400 invalid_signature (empty wire, not misconfig)", rNull.status === 400 && rNull.json.error === "invalid_signature");
}

// ═══ verdict ═════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nSTRIPE-WEBHOOK: all checks passed" : `\nSTRIPE-WEBHOOK: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
