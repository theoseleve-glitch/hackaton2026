/**
 * stripeWebhookStore SQL CONTRACT test — pins the exact SQL
 * makeSqlStripeWebhookStore emits against a RECORDING QueryFn (mirrors the
 * SQL-reader block of src/test-entitlement.ts). No HTTP, no Stripe SDK, no
 * Postgres.
 *
 * Load-bearing invariants guarded here:
 *  - idempotency ledger: markProcessed is ON CONFLICT (event_id) DO NOTHING.
 *  - subscription truth lives in stripe_subscriptions (D29), keyed per user.
 *  - OUT-OF-ORDER GUARD: the upsert's ON CONFLICT WHERE must require
 *    EXCLUDED.event_created > stored event_created (STRICT), plus the
 *    same-second 'canceled' terminal tiebreaker — so a late 'subscription.updated'
 *    can never clobber a 'deleted'. A loosening to >= (or dropping the
 *    tiebreaker) MUST fail here.
 *
 * Run: npx tsx src/test-stripeWebhookStoreSql.ts
 */

import type { QueryFn } from "./db";
import { makeSqlStripeWebhookStore } from "./stores/stripeWebhookStore";
import type { StripeSubscriptionUpsert } from "./stores/stripeWebhookStore";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

interface Call {
  sql: string;
  params: readonly unknown[] | undefined;
}
function recorder(reply: (sql: string) => { rows: Record<string, unknown>[] }) {
  const calls: Call[] = [];
  const query: QueryFn = async (sql, params) => {
    calls.push({ sql, params });
    return reply(sql);
  };
  return { calls, query };
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const AT = "2026-06-13T12:00:00.000Z";

// ═══ isProcessed: idempotency ledger lookup ══════════════════════════════════
console.log("— isProcessed: ledger lookup —");
{
  const { calls, query } = recorder(() => ({ rows: [{ "?column?": 1 }] }));
  const store = makeSqlStripeWebhookStore(query);
  const out = await store.isProcessed("evt_1");
  const sql = norm(calls[0].sql);
  check("isProcessed: reads processed_stripe_events", /from\s+processed_stripe_events/i.test(sql), sql);
  check("isProcessed: keyed on event_id = $1", /where\s+event_id\s*=\s*\$1/i.test(sql), sql);
  check("isProcessed: binds the event id", (calls[0].params as unknown[])[0] === "evt_1");
  check("isProcessed: row present -> true", out === true);
}
{
  const { query } = recorder(() => ({ rows: [] }));
  const out = await makeSqlStripeWebhookStore(query).isProcessed("evt_unseen");
  check("isProcessed: no row -> false", out === false);
}

// ═══ markProcessed: idempotent ledger insert ═════════════════════════════════
console.log("\n— markProcessed: idempotent insert —");
{
  const { calls, query } = recorder(() => ({ rows: [] }));
  await makeSqlStripeWebhookStore(query).markProcessed("evt_1", AT);
  const sql = norm(calls[0].sql);
  const params = calls[0].params as readonly unknown[];
  check("markProcessed: targets processed_stripe_events", /insert\s+into\s+processed_stripe_events/i.test(sql), sql);
  check("markProcessed: writes (event_id, processed_at)", /\(\s*event_id\s*,\s*processed_at\s*\)/i.test(sql), sql);
  check("markProcessed: processed_at is ::timestamptz-cast", /\$2::timestamptz/i.test(sql), sql);
  check(
    "markProcessed: idempotent — ON CONFLICT (event_id) DO NOTHING (redelivery no-op)",
    /on\s+conflict\s*\(\s*event_id\s*\)\s+do\s+nothing/i.test(sql),
    sql,
  );
  check("markProcessed: binds [eventId, atIso]", params[0] === "evt_1" && params[1] === AT);
}

// ═══ getEventCreated: per-user watermark read ════════════════════════════════
console.log("\n— getEventCreated: watermark read —");
{
  const { calls, query } = recorder(() => ({ rows: [{ event_created: 1_700_000_000 }] }));
  const out = await makeSqlStripeWebhookStore(query).getEventCreated("user_A");
  const sql = norm(calls[0].sql);
  check("getEventCreated: reads event_created from stripe_subscriptions", /select\s+event_created\s+from\s+stripe_subscriptions/i.test(sql), sql);
  check("getEventCreated: OWNER-SCOPED WHERE user_id = $1", /where\s+user_id\s*=\s*\$1/i.test(sql), sql);
  check("getEventCreated: binds the user id", (calls[0].params as unknown[])[0] === "user_A");
  check("getEventCreated: returns the stored unix-second watermark as a number", out === 1_700_000_000);
}
{
  const { query } = recorder(() => ({ rows: [] }));
  const out = await makeSqlStripeWebhookStore(query).getEventCreated("user_A");
  check("getEventCreated: no row -> null (no subscription yet)", out === null);
}
{
  const { query } = recorder(() => ({ rows: [{ event_created: null }] }));
  const out = await makeSqlStripeWebhookStore(query).getEventCreated("user_A");
  check("getEventCreated: null watermark column -> null", out === null);
}

// ═══ upsertSubscription: out-of-order watermark guard ════════════════════════
console.log("\n— upsertSubscription: watermark guard —");
{
  const { calls, query } = recorder(() => ({ rows: [] }));
  const RECEIPT = "2026-06-14T09:30:00.000Z";
  const upsert: StripeSubscriptionUpsert = {
    status: "active",
    current_period_end: "2026-07-13T00:00:00.000Z",
    event_created: 1_700_000_000,
    received_at: RECEIPT,
  };
  await makeSqlStripeWebhookStore(query).upsertSubscription("user_A", upsert);
  // upsert now issues TWO statements: ensure the users row (FK safety), then the
  // subscription upsert. Pin both, but read the assertions off the subscription one.
  check("upsert: FK-safety — ensures the users row first (INSERT INTO users ON CONFLICT DO NOTHING)", calls.some((c) => /insert\s+into\s+users\b/i.test(norm(c.sql)) && /on\s+conflict\s*\(\s*id\s*\)\s+do\s+nothing/i.test(norm(c.sql))));
  const subCall = calls.find((c) => /insert\s+into\s+stripe_subscriptions/i.test(c.sql));
  if (subCall === undefined) throw new Error("no stripe_subscriptions upsert issued");
  const sql = norm(subCall.sql);
  const params = subCall.params as readonly unknown[];

  check("upsert: targets stripe_subscriptions (D29 subscription truth)", /insert\s+into\s+stripe_subscriptions/i.test(sql), sql);
  check(
    "upsert: writes (user_id, status, current_period_end, event_created, updated_at)",
    /\(\s*user_id\s*,\s*status\s*,\s*current_period_end\s*,\s*event_created\s*,\s*updated_at\s*\)/i.test(sql),
    sql,
  );
  check("upsert: current_period_end is ::timestamptz-cast", /\$3::timestamptz/i.test(sql), sql);
  check("upsert: updated_at is ::timestamptz-cast", /\$5::timestamptz/i.test(sql), sql);
  check("upsert: keyed per user — ON CONFLICT (user_id) DO UPDATE", /on\s+conflict\s*\(\s*user_id\s*\)\s+do\s+update/i.test(sql), sql);
  check(
    "upsert: SET replaces status,event_created,updated_at from EXCLUDED",
    /set\s+status\s*=\s*excluded\.status/i.test(sql) &&
      /event_created\s*=\s*excluded\.event_created/i.test(sql) &&
      /updated_at\s*=\s*excluded\.updated_at/i.test(sql),
    sql,
  );
  check(
    "upsert: current_period_end COALESCEs EXCLUDED over the stored value (a null checkout period end never clobbers a known one)",
    /current_period_end\s*=\s*coalesce\(\s*excluded\.current_period_end\s*,\s*stripe_subscriptions\.current_period_end\s*\)/i.test(sql),
    sql,
  );
  // THE guard: STRICT > , with the same-second terminal 'canceled' tiebreaker.
  check(
    "upsert: STRICT watermark guard — WHERE EXCLUDED.event_created > stripe_subscriptions.event_created",
    /where\s+excluded\.event_created\s*>\s*stripe_subscriptions\.event_created/i.test(sql),
    sql,
  );
  check(
    "upsert: guard is NOT loosened to >= (a same-second update can't clobber a delete)",
    !/excluded\.event_created\s*>=\s*stripe_subscriptions\.event_created/i.test(sql),
    sql,
  );
  check(
    "upsert: same-second tiebreaker — OR (EXCLUDED.event_created = stored AND EXCLUDED.status = 'canceled')",
    /or\s*\(\s*excluded\.event_created\s*=\s*stripe_subscriptions\.event_created\s+and\s+excluded\.status\s*=\s*'canceled'\s*\)/i.test(sql),
    sql,
  );
  check(
    "upsert: param[2] current_period_end passed through verbatim (ISO or null)",
    params[2] === "2026-07-13T00:00:00.000Z",
    String(params[2]),
  );
  check(
    "upsert: param[3] event_created is the unix-second watermark; param[4] updated_at = server RECEIPT time (NOT the event epoch)",
    params[3] === 1_700_000_000 && params[4] === RECEIPT && params[4] !== new Date(1_700_000_000 * 1000).toISOString(),
    JSON.stringify([params[3], params[4]]),
  );
  check("upsert: owner param[0] = userId, param[1] = status", params[0] === "user_A" && params[1] === "active");
}

// ── upsert: updated_at is the server receipt time, independent of event_created ─
{
  const { calls, query } = recorder(() => ({ rows: [] }));
  const RECEIPT = "2026-06-14T10:00:00.000Z";
  const upsert = {
    status: "expired" as const,
    current_period_end: null,
    event_created: null as unknown as number,
    received_at: RECEIPT,
  };
  await makeSqlStripeWebhookStore(query).upsertSubscription("user_A", upsert);
  const subCall = calls.find((c) => /insert\s+into\s+stripe_subscriptions/i.test(c.sql));
  if (subCall === undefined) throw new Error("no stripe_subscriptions upsert issued");
  const params = subCall.params as readonly unknown[];
  check("upsert: updated_at param = received_at even when event_created is null (no 'Invalid Date')", params[4] === RECEIPT, String(params[4]));
  check("upsert: null current_period_end passed through as null", params[2] === null);
}

// ═══ verdict ═════════════════════════════════════════════════════════════════
console.log(failures === 0 ? "\nSTRIPE-WEBHOOK-STORE-SQL: all checks passed" : `\nSTRIPE-WEBHOOK-STORE-SQL: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
