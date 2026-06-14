/**
 * entitlement test suite — GET /api/entitlement exercised directly against the
 * handler with in-memory fakes (fake EntitlementReader, fake JwtSigner, fake
 * TokenVerifier). No HTTP, no Postgres, no Vercel. Style mirrors
 * src/test-server.ts. Run: npx tsx src/test-entitlement.ts
 *
 * Covers: happy paths (active / trial / expired / none), the active in-period
 * vs lapsed boundary, the trial boundary, plan=pro only when active, token
 * claims (sub/status/plan/iat/exp), auth-required (401), owner-scoping/IDOR
 * (id comes from the verified token, never the request), and a throwing signer
 * propagating (the router would 500 it).
 */

import type { HttpRequest } from "./types";
import type { QueryFn } from "./db";
import type { TokenVerifier } from "./auth";
import { entitlement } from "./handlers/entitlement";
import type { EntitlementCtx } from "./handlers/entitlement";
import type {
  EntitlementReader,
  JwtSigner,
  SubscriptionFact,
} from "./stores/entitlementStore";
import { TRIAL_DAYS, makeSqlEntitlementReader } from "./stores/entitlementStore";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW = "2026-06-13T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const DAY = 86_400_000;
const day = (n: number): string => new Date(NOW_MS + n * DAY).toISOString();

// ── in-memory EntitlementReader fake (same contract as makeSqlEntitlementReader)
class FakeReader implements EntitlementReader {
  subs = new Map<string, SubscriptionFact>();
  trials = new Map<string, string>();
  async getSubscription(userId: string): Promise<SubscriptionFact | null> {
    return this.subs.get(userId) ?? null;
  }
  async getTrialStart(userId: string): Promise<string | null> {
    return this.trials.get(userId) ?? null;
  }
}

// ── fake JwtSigner: records claims and returns a decodable opaque token ────────
class FakeSigner implements JwtSigner {
  lastClaims: Record<string, unknown> | null = null;
  async sign(claims: Record<string, unknown>): Promise<string> {
    this.lastClaims = claims;
    // base64url(JSON) — purely so the test can read claims back; NOT a real JWT.
    return "fake." + Buffer.from(JSON.stringify(claims)).toString("base64url");
  }
}
function decode(token: string): Record<string, unknown> {
  const part = token.slice("fake.".length);
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

const verifier: TokenVerifier = {
  verify: async (token) => {
    if (token === "tok-A") return { user_id: "user_A" };
    if (token === "tok-B") return { user_id: "user_B" };
    if (token === "tok-throws") throw new Error("verifier exploded");
    return null;
  },
};

let store = new FakeReader();
let signer = new FakeSigner();
const ctx: EntitlementCtx = { now: () => NOW, verifier, sign: signer, store };

function req(opts?: { token?: string; body?: unknown }): HttpRequest {
  return {
    method: "GET",
    path: "/api/entitlement",
    headers: opts?.token !== undefined ? { authorization: `Bearer ${opts.token}` } : {},
    query: {},
    body: opts?.body,
  };
}

// ═══ auth ═════════════════════════════════════════════════════════════════════

console.log("— auth —");
{
  const noTok = await entitlement(ctx, req());
  check("auth: no token -> 401", noTok.status === 401 && noTok.json.error === "unauthorized");
  const badTok = await entitlement(ctx, req({ token: "tok-garbage" }));
  check("auth: unknown token -> 401", badTok.status === 401);
  const throwTok = await entitlement(ctx, req({ token: "tok-throws" }));
  check("auth: throwing verifier -> 401 (not 500)", throwTok.status === 401);
  const basic = await entitlement(ctx, {
    ...req(),
    headers: { authorization: "Basic abc" },
  });
  check("auth: non-Bearer scheme -> 401", basic.status === 401);
}

// ═══ status: none ════════════════════════════════════════════════════════════

console.log("\n— status: none —");
{
  store.subs.clear();
  store.trials.clear();
  const r = await entitlement(ctx, req({ token: "tok-A" }));
  check("none: no sub + no trial -> none", r.status === 200 && r.json.status === "none");
  check("none: no plan key", r.json.plan === undefined);
  check("none: no current_period_end key", r.json.current_period_end === undefined);
  check("none: no trial_ends_at key", r.json.trial_ends_at === undefined);
  check("none: carries server_time", r.json.server_time === NOW);
  check("none: carries a token", typeof r.json.token === "string");
  const c = decode(r.json.token as string);
  check("none: token sub = verified user, status=none, plan=null", c.sub === "user_A" && c.status === "none" && c.plan === null);
  check("none: token current_period_end=null, trial_ends_at=null", c.current_period_end === null && c.trial_ends_at === null);
  check("none: token iat/exp set, exp = iat + 86400", typeof c.iat === "number" && c.exp === (c.iat as number) + 86_400);
}

// ═══ status: trial ═══════════════════════════════════════════════════════════

console.log("\n— status: trial —");
{
  store.subs.clear();
  store.trials.clear();
  store.trials.set("user_A", day(-3)); // started 3 days ago
  const r = await entitlement(ctx, req({ token: "tok-A" }));
  const expectedEnds = new Date(Date.parse(day(-3)) + TRIAL_DAYS * DAY).toISOString();
  check("trial: in-window -> trial", r.status === 200 && r.json.status === "trial");
  check("trial: trial_ends_at = start + 15d", r.json.trial_ends_at === expectedEnds);
  check("trial: no plan (plan gates pro only)", r.json.plan === undefined);
  check("trial: no current_period_end", r.json.current_period_end === undefined);
  const c = decode(r.json.token as string);
  check("trial: token status=trial, plan=null, trial_ends_at set", c.status === "trial" && c.plan === null && c.trial_ends_at === expectedEnds);

  // boundary: now === trial_ends_at -> NOT trial (strict <)
  store.trials.set("user_A", day(-TRIAL_DAYS));
  const rEdge = await entitlement(ctx, req({ token: "tok-A" }));
  check("trial: exact expiry instant -> NOT trial (none, no sub)", rEdge.json.status === "none");

  // just before boundary -> still trial
  store.trials.set("user_A", new Date(NOW_MS - TRIAL_DAYS * DAY + 1000).toISOString());
  const rJust = await entitlement(ctx, req({ token: "tok-A" }));
  check("trial: 1s before expiry -> still trial", rJust.json.status === "trial");
}

// ═══ status: active ══════════════════════════════════════════════════════════

console.log("\n— status: active —");
{
  store.subs.clear();
  store.trials.clear();
  store.subs.set("user_A", { status: "active", current_period_end: day(30) });
  const r = await entitlement(ctx, req({ token: "tok-A" }));
  check("active: active + in period -> active", r.status === 200 && r.json.status === "active");
  check("active: plan = pro", r.json.plan === "pro");
  check("active: current_period_end echoed", r.json.current_period_end === day(30));
  const c = decode(r.json.token as string);
  check("active: token status=active, plan=pro", c.status === "active" && c.plan === "pro");

  // canceled-but-paid-through stays active per period check? spec: active needs status==='active'.
  store.subs.set("user_A", { status: "canceled", current_period_end: day(30) });
  const rCancel = await entitlement(ctx, req({ token: "tok-A" }));
  check("active: canceled status (even paid-through) is NOT active -> none/expired", rCancel.json.status === "expired");

  // active flag but lifetime (cpe === null) -> active
  store.subs.set("user_A", { status: "active", current_period_end: null });
  const rLifetime = await entitlement(ctx, req({ token: "tok-A" }));
  check("active: status=active + null period_end (lifetime) -> active", rLifetime.json.status === "active" && rLifetime.json.plan === "pro" && rLifetime.json.current_period_end === undefined);

  // active flag but period lapsed -> NOT active -> expired (row exists)
  store.subs.set("user_A", { status: "active", current_period_end: day(-1) });
  const rLapsed = await entitlement(ctx, req({ token: "tok-A" }));
  check("active: status=active but period lapsed -> expired (no plan)", rLapsed.json.status === "expired" && rLapsed.json.plan === undefined);

  // boundary: now === current_period_end -> NOT active (strict >)
  store.subs.set("user_A", { status: "active", current_period_end: NOW });
  const rEdge = await entitlement(ctx, req({ token: "tok-A" }));
  check("active: exact period_end instant -> expired (strict >)", rEdge.json.status === "expired");
}

// ═══ active beats trial (precedence) ═════════════════════════════════════════

console.log("\n— precedence —");
{
  store.subs.clear();
  store.trials.clear();
  store.subs.set("user_A", { status: "active", current_period_end: day(30) });
  store.trials.set("user_A", day(-3)); // also in trial
  const r = await entitlement(ctx, req({ token: "tok-A" }));
  check("precedence: active wins over trial", r.json.status === "active" && r.json.plan === "pro");

  // lapsed sub + still in trial -> trial (active check fails, trial check passes)
  store.subs.set("user_A", { status: "expired", current_period_end: day(-5) });
  store.trials.set("user_A", day(-3));
  const r2 = await entitlement(ctx, req({ token: "tok-A" }));
  check("precedence: lapsed sub but in trial -> trial", r2.json.status === "trial");

  // lapsed sub + trial over -> expired (row exists)
  store.trials.set("user_A", day(-TRIAL_DAYS - 1));
  const r3 = await entitlement(ctx, req({ token: "tok-A" }));
  check("precedence: lapsed sub + trial over -> expired", r3.json.status === "expired");
}

// ═══ owner-scoping / IDOR ════════════════════════════════════════════════════

console.log("\n— owner-scoping / IDOR —");
{
  store.subs.clear();
  store.trials.clear();
  store.subs.set("user_A", { status: "active", current_period_end: day(30) });
  store.subs.set("user_B", { status: "expired", current_period_end: day(-10) });

  const rA = await entitlement(ctx, req({ token: "tok-A" }));
  check("idor: A sees A's active entitlement", rA.json.status === "active");
  const cA = decode(rA.json.token as string);
  check("idor: A's token subject is user_A", cA.sub === "user_A");

  const rB = await entitlement(ctx, req({ token: "tok-B" }));
  check("idor: B sees B's expired entitlement (NOT A's active)", rB.json.status === "expired" && rB.json.plan === undefined);
  const cB = decode(rB.json.token as string);
  check("idor: B's token subject is user_B", cB.sub === "user_B");

  // a forged user_id in the body is IGNORED — ownership is the verified token
  const rForge = await entitlement(ctx, req({ token: "tok-B", body: { user_id: "user_A", sub: "user_A" } }));
  const cForge = decode(rForge.json.token as string);
  check("idor: body-supplied user_id ignored, token bound to verified user_B", rForge.json.status === "expired" && cForge.sub === "user_B");
}

// ═══ signer failure propagates (router would 500 it) ═════════════════════════

console.log("\n— signer failure —");
{
  const boomSigner: JwtSigner = {
    sign: async () => {
      throw new Error("kms unavailable");
    },
  };
  const ctx2: EntitlementCtx = { now: () => NOW, verifier, sign: boomSigner, store };
  store.subs.clear();
  store.trials.clear();
  store.trials.set("user_A", day(-1));
  let threw = false;
  try {
    await entitlement(ctx2, req({ token: "tok-A" }));
  } catch {
    threw = true;
  }
  check("signer: a throwing signer propagates (router maps to 500)", threw);
}

// ═══ SQL reader: queries the RIGHT table/column (regression guard) ═══════════
//
// MUST_FIX regression: makeSqlEntitlementReader previously read
// `subscriptions.expires_at`, but the Stripe webhook (source of truth, D29)
// writes `stripe_subscriptions(status, current_period_end)` — so every paying
// user read null and PRO was never granted. These tests pin the exact table
// name and column so a future rename can't silently re-break Pro.

console.log("\n— SQL reader: table/column —");
{
  // Capture every SQL string + params the reader issues against a fake QueryFn.
  const calls: { sql: string; params: readonly unknown[] | undefined }[] = [];
  const fakeQuery: QueryFn = async (sql, params) => {
    calls.push({ sql, params });
    if (/from\s+stripe_subscriptions/i.test(sql)) {
      // simulate one paying user paid-through a future instant
      return { rows: [{ status: "active", current_period_end: day(30) }] };
    }
    return { rows: [] };
  };
  const reader = makeSqlEntitlementReader(fakeQuery);

  const fact = await reader.getSubscription("user_A");
  const subCall = calls[0];

  check(
    "sql: getSubscription queries stripe_subscriptions (NOT legacy subscriptions)",
    /\bfrom\s+stripe_subscriptions\b/i.test(subCall.sql),
    subCall.sql,
  );
  check(
    "sql: getSubscription does NOT read the legacy `subscriptions` table",
    !/\bfrom\s+subscriptions\b/i.test(subCall.sql),
    subCall.sql,
  );
  check(
    "sql: getSubscription selects current_period_end column",
    /\bcurrent_period_end\b/i.test(subCall.sql),
    subCall.sql,
  );
  check(
    "sql: getSubscription does NOT select the legacy expires_at column",
    !/\bexpires_at\b/i.test(subCall.sql),
    subCall.sql,
  );
  check(
    "sql: getSubscription is owner-scoped (WHERE user_id = $1, param bound)",
    /\bwhere\s+user_id\s*=\s*\$1\b/i.test(subCall.sql) &&
      Array.isArray(subCall.params) &&
      subCall.params[0] === "user_A",
    subCall.sql,
  );
  check(
    "sql: maps stripe_subscriptions.current_period_end -> SubscriptionFact",
    fact !== null && fact.status === "active" && fact.current_period_end === day(30),
    JSON.stringify(fact),
  );

  // null current_period_end (lifetime / no expiry asserted) -> null, not "null"
  calls.length = 0;
  const fakeLifetime: QueryFn = async (sql) =>
    /from\s+stripe_subscriptions/i.test(sql)
      ? { rows: [{ status: "active", current_period_end: null }] }
      : { rows: [] };
  const lifeFact = await makeSqlEntitlementReader(fakeLifetime).getSubscription("user_A");
  check(
    "sql: null current_period_end maps to null (lifetime)",
    lifeFact !== null && lifeFact.current_period_end === null,
    JSON.stringify(lifeFact),
  );

  // Date driver values are normalized to ISO
  const cpeDate = new Date(NOW_MS + 5 * DAY);
  const fakeDateDriver: QueryFn = async (sql) =>
    /from\s+stripe_subscriptions/i.test(sql)
      ? { rows: [{ status: "active", current_period_end: cpeDate }] }
      : { rows: [] };
  const dateFact = await makeSqlEntitlementReader(fakeDateDriver).getSubscription("user_A");
  check(
    "sql: Date-typed current_period_end normalized to ISO string",
    dateFact !== null && dateFact.current_period_end === cpeDate.toISOString(),
    JSON.stringify(dateFact),
  );

  // no row -> null (never paid)
  const fakeEmpty: QueryFn = async () => ({ rows: [] });
  const noFact = await makeSqlEntitlementReader(fakeEmpty).getSubscription("user_A");
  check("sql: no stripe_subscriptions row -> null (never paid)", noFact === null);

  // getTrialStart still reads users.trial_started_at, owner-scoped
  const trialCalls: { sql: string; params: readonly unknown[] | undefined }[] = [];
  const fakeUsers: QueryFn = async (sql, params) => {
    trialCalls.push({ sql, params });
    return { rows: [{ trial_started_at: day(-2) }] };
  };
  const ts = await makeSqlEntitlementReader(fakeUsers).getTrialStart("user_A");
  check(
    "sql: getTrialStart reads users.trial_started_at WHERE id = $1 (owner-scoped)",
    /\bfrom\s+users\b/i.test(trialCalls[0].sql) &&
      /\btrial_started_at\b/i.test(trialCalls[0].sql) &&
      /\bwhere\s+id\s*=\s*\$1\b/i.test(trialCalls[0].sql) &&
      Array.isArray(trialCalls[0].params) &&
      trialCalls[0].params[0] === "user_A",
    trialCalls[0].sql,
  );
  check("sql: getTrialStart returns the stored ISO start", ts === day(-2), String(ts));

  // unknown status from the row is normalized defensively to "expired"
  const fakeWeird: QueryFn = async (sql) =>
    /from\s+stripe_subscriptions/i.test(sql)
      ? { rows: [{ status: "past_due", current_period_end: day(10) }] }
      : { rows: [] };
  const weird = await makeSqlEntitlementReader(fakeWeird).getSubscription("user_A");
  check(
    "sql: unknown status normalized to expired",
    weird !== null && weird.status === "expired",
    JSON.stringify(weird),
  );
}

// ═══ BUILD-NOW #7: exp capped to current_period_end (no over-grant) ══════════
//
// The offline token must never outlive the paid period. When cpe is sooner than
// nowUnix + TOKEN_TTL_S (24h), exp is clamped to floor(cpe/1000). When cpe is
// far out or absent (lifetime/trial/none), exp is the full TTL window. This must
// hold for EVERY status — a near-future cpe caps the grant regardless of client
// behavior.

console.log("\n— exp cap (over-grant) —");
{
  const TTL = 86_400; // mirrors TOKEN_TTL_S
  const nowUnix = Math.floor(NOW_MS / 1000);

  // cpe sooner than the TTL window (active, period_end in 1h) -> exp == cpe_unix
  store.subs.clear();
  store.trials.clear();
  const soon = new Date(NOW_MS + 3600_000).toISOString(); // +1h, < 24h TTL
  store.subs.set("user_A", { status: "active", current_period_end: soon });
  const rSoon = await entitlement(ctx, req({ token: "tok-A" }));
  const cSoon = decode(rSoon.json.token as string);
  const cpeUnixSoon = Math.floor(Date.parse(soon) / 1000);
  check("cap: active+cpe in 1h -> exp == floor(cpe/1000) (< now+TTL)", cSoon.exp === cpeUnixSoon, `exp=${cSoon.exp} cpe=${cpeUnixSoon}`);
  check("cap: exp <= cpe_unix when cpe < now+TTL", (cSoon.exp as number) <= cpeUnixSoon);
  check("cap: capped exp is strictly less than the full TTL exp", (cSoon.exp as number) < nowUnix + TTL);

  // cpe far in the future (active, +30d) -> exp == now + TTL (TTL wins)
  store.subs.set("user_A", { status: "active", current_period_end: day(30) });
  const rFar = await entitlement(ctx, req({ token: "tok-A" }));
  const cFar = decode(rFar.json.token as string);
  check("cap: active+cpe far (+30d) -> exp == now + TTL", cFar.exp === nowUnix + TTL && cFar.exp === (cFar.iat as number) + TTL);
  check("cap: far-cpe exp <= cpe_unix still holds", (cFar.exp as number) <= Math.floor(Date.parse(day(30)) / 1000));

  // cpe absent (lifetime, status=active, cpe=null) -> exp == now + TTL
  store.subs.set("user_A", { status: "active", current_period_end: null });
  const rLife = await entitlement(ctx, req({ token: "tok-A" }));
  const cLife = decode(rLife.json.token as string);
  check("cap: lifetime (cpe absent) -> exp == now + TTL", cLife.exp === nowUnix + TTL);

  // cpe absent (none, no sub) -> exp == now + TTL (regression: unchanged)
  store.subs.clear();
  const rNone = await entitlement(ctx, req({ token: "tok-A" }));
  const cNone = decode(rNone.json.token as string);
  check("cap: none (no cpe) -> exp == now + TTL (unchanged)", cNone.exp === (cNone.iat as number) + TTL);

  // cap also bites on a non-active row whose cpe is sooner than the TTL
  // (e.g. canceled but a near-future period_end is still on the row) — the cap is
  // status-independent so a near cpe can never be over-granted via any path.
  store.subs.set("user_A", { status: "canceled", current_period_end: soon });
  const rCancelSoon = await entitlement(ctx, req({ token: "tok-A" }));
  const cCancelSoon = decode(rCancelSoon.json.token as string);
  check("cap: canceled+near cpe still caps exp to cpe_unix", cCancelSoon.exp === cpeUnixSoon);
}

// ═══ POLISH #2: malformed current_period_end -> loud 500 (not silent expire) ══
//
// A non-null current_period_end that Date.parse() can't read is a corrupt DB
// instant. Silently treating it as expired would demote a paying user and make
// the app drop its last-known-good token. Prefer a loud 500 {error, server_time}
// so the client keeps its cached token and the corruption surfaces.

console.log("\n— NaN guard (malformed cpe) —");
{
  store.subs.clear();
  store.trials.clear();
  store.subs.set("user_A", { status: "active", current_period_end: "not-a-real-instant" });
  const r = await entitlement(ctx, req({ token: "tok-A" }));
  check("nan: malformed cpe -> 500 internal_error (not silent expire/none)", r.status === 500 && r.json.error === "internal_error", `status=${r.status} body=${JSON.stringify(r.json)}`);
  check("nan: 500 still carries server_time", r.json.server_time === NOW);
  check("nan: 500 does NOT leak a token", r.json.token === undefined);
  check("nan: 500 does NOT leak a status", r.json.status === undefined);

  // even with an in-window trial present, a corrupt cpe still hard-fails
  // (the malformed instant is detected before status is computed) — we refuse
  // rather than guess which state the corrupt row implies.
  store.trials.set("user_A", day(-1));
  const rTrial = await entitlement(ctx, req({ token: "tok-A" }));
  check("nan: corrupt cpe hard-fails even with a live trial present", rTrial.status === 500 && rTrial.json.error === "internal_error");

  // a null cpe is NOT malformed — lifetime active still mints normally
  store.subs.set("user_A", { status: "active", current_period_end: null });
  store.trials.clear();
  const rNull = await entitlement(ctx, req({ token: "tok-A" }));
  check("nan: null cpe is fine (lifetime active, 200)", rNull.status === 200 && rNull.json.status === "active");
}

// ═══ verdict ═════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nENTITLEMENT: all checks passed" : `\nENTITLEMENT: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
