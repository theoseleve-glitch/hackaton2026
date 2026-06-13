/**
 * racelab-account test suite — assertion style mirrors packages/schema:
 * plain checks, console output, exit(1) on any failure. All clocks, storage,
 * fetch, and tokens are deterministic fakes (no Date.now() on any path).
 */

import { parseAccountState } from "../../schema/src/index";
import type { KV, FetchLike } from "./deps";
import { STORAGE_KEYS, loadAccount } from "./deps";
import type { TokenProvider } from "./auth";
import { ANONYMOUS_TOKENS } from "./auth";
import { TRIAL_DAYS, TrialService, guardedNow, noteServerTime } from "./trial";
import type { TrialDeps } from "./trial";
import { canUse, touchPremiumFeature } from "./entitlements";
import { SUBSCRIBE_WEB_BASE, buildSubscribeUrl } from "./subscribe";
import { validateSubscription } from "./validate";
import { deleteAccount, retryPendingDeletion } from "./deletion";
import type { DeletionDeps } from "./deletion";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

// ── fakes ─────────────────────────────────────────────────────────────────────

class MemKV implements KV {
  map = new Map<string, string>();
  fail = false;
  async getItem(k: string): Promise<string | null> {
    if (this.fail) throw new Error("kv down");
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  async setItem(k: string, v: string): Promise<void> {
    if (this.fail) throw new Error("kv down");
    this.map.set(k, v);
  }
  async removeItem(k: string): Promise<void> {
    if (this.fail) throw new Error("kv down");
    this.map.delete(k);
  }
}

const T0 = "2026-06-12T10:00:00.000Z";
const T0_MS = Date.parse(T0);
const DAY = 86_400_000;
const day = (n: number): string => new Date(T0_MS + n * DAY).toISOString();

interface FakeCall {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}
type FakeRoute = (call: FakeCall) => { status: number; json: unknown } | "network_down";
function makeFetch(route: FakeRoute, calls?: FakeCall[]): FetchLike {
  return async (url, init) => {
    const call: FakeCall = { url, method: init?.method, headers: init?.headers, body: init?.body };
    calls?.push(call);
    const r = route(call);
    if (r === "network_down") throw new Error("network down");
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json };
  };
}

const tokensFor = (uid: string): TokenProvider => ({
  getToken: async () => `tok-${uid}`,
  userId: () => uid,
  signOut: async () => {},
});

// ═══ guardedNow / tamper guard ═══════════════════════════════════════════════

console.log("— tamper-guarded clock —");
{
  const kv = new MemKV();
  let device = T0;
  const deps = { store: kv, now: () => device };

  check("guardedNow: first read returns the device clock", (await guardedNow(deps)) === T0);
  device = day(10);
  check("guardedNow: advances with the device clock", (await guardedNow(deps)) === day(10));
  device = day(2); // rollback
  check("guardedNow: clock rolled back -> stays at the floor", (await guardedNow(deps)) === day(10));
  device = day(11);
  check("guardedNow: moves again once the device passes the floor", (await guardedNow(deps)) === day(11));

  await noteServerTime(kv, day(20));
  device = day(3);
  check("noteServerTime: server time raises the floor past any local rollback", (await guardedNow(deps)) === day(20));
  await noteServerTime(kv, day(15)); // older server time
  check("noteServerTime: never lowers the floor", (await guardedNow(deps)) === day(20));

  const kv2 = new MemKV();
  const depsA = { store: kv2, now: () => day(5) };
  await guardedNow(depsA);
  const depsB = { store: kv2, now: () => day(1) }; // new service instance, same store
  check("guardedNow: floor persists across instances (same store)", (await guardedNow(depsB)) === day(5));

  await kv2.setItem(STORAGE_KEYS.clock, "{corrupt!!");
  check("guardedNow: corrupt clock blob -> degrades to device clock, no throw", (await guardedNow({ store: kv2, now: () => day(6) })) === day(6));
  check("guardedNow: corrupt clock blob was stashed, not deleted", kv2.map.get(`${STORAGE_KEYS.corruptPrefix}clock`) === "{corrupt!!");
}

// ═══ trial lifecycle ═════════════════════════════════════════════════════════

console.log("\n— trial lifecycle —");
{
  const kv = new MemKV();
  let device = T0;
  const deps: TrialDeps = { store: kv, fetchFn: null, now: () => device, tokens: ANONYMOUS_TOKENS };
  const svc = new TrialService(deps);

  const r1 = await svc.ensureTrialState();
  check("ensureTrialState: starts the local trial offline+anonymous", r1.ok && r1.started && r1.status === "trial" && r1.sync === "anonymous");
  check("ensureTrialState: trial_started_at = guarded now", r1.ok && r1.account.trial_started_at === T0);
  check("ensureTrialState: trial_ends_at = start + 15 days", r1.ok && r1.account.trial_ends_at === day(TRIAL_DAYS));

  const persisted = await loadAccount(kv, device);
  check("ensureTrialState: persisted blob round-trips parseAccountState", persisted.ok && persisted.account.trial_started_at === T0);

  const r2 = await svc.ensureTrialState();
  check("ensureTrialState: second call does NOT restart (once-ever)", r2.ok && !r2.started && r2.ok && r2.account.trial_started_at === T0);

  device = day(TRIAL_DAYS); // exact boundary
  check("entitlement: allowed at the exact trial end instant (t <= ends)", (await canUse("multi_car", deps)).allowed);
  device = new Date(T0_MS + TRIAL_DAYS * DAY + 1).toISOString();
  const expired = await canUse("multi_car", deps);
  check("entitlement: 1ms past the boundary -> trial_expired", !expired.allowed && !expired.allowed && expired.reason === "trial_expired");

  const r3 = await svc.ensureTrialState();
  check("ensureTrialState: after expiry stays expired, never a second trial", r3.ok && !r3.started && r3.status === "expired");
}

// ═══ trial server sync (record / reconcile / first-seen) ═════════════════════

console.log("\n— trial server sync —");
{
  // recorded: server echoes our claim
  const kv = new MemKV();
  const calls: FakeCall[] = [];
  const fetchEcho = makeFetch((c) => {
    const claim = (JSON.parse(c.body ?? "{}") as { trial_started_at: string }).trial_started_at;
    return { status: 200, json: { ok: true, trial_started_at: claim, server_time: T0 } };
  }, calls);
  const deps: TrialDeps = { store: kv, fetchFn: fetchEcho, now: () => T0, tokens: tokensFor("user_A"), apiBase: "https://api.test" };
  const r = await new TrialService(deps).ensureTrialState();
  check("sync: online start -> recorded", r.ok && r.started && r.sync === "recorded");
  check("sync: POST /api/trial/start with bearer + claim", calls.length === 1 && calls[0].url === "https://api.test/api/trial/start" && calls[0].method === "POST" && calls[0].headers?.authorization === "Bearer tok-user_A" && (JSON.parse(calls[0].body ?? "{}") as { trial_started_at: string }).trial_started_at === T0);
  check("sync: adopts user_id from the token provider", r.ok && r.account.user_id === "user_A");

  // reconciled: server knows an earlier first-seen (other device / reinstall)
  const kv2 = new MemKV();
  const fetchEarlier = makeFetch(() => ({ status: 200, json: { ok: true, trial_started_at: day(-5), server_time: T0 } }));
  const deps2: TrialDeps = { store: kv2, fetchFn: fetchEarlier, now: () => T0, tokens: tokensFor("user_A") };
  const r2 = await new TrialService(deps2).ensureTrialState();
  check("sync: server first-seen wins -> reconciled", r2.ok && r2.sync === "reconciled" && r2.account.trial_started_at === day(-5));
  check("sync: reconciled trial_ends_at recomputed from server start", r2.ok && r2.account.trial_ends_at === day(-5 + TRIAL_DAYS));
  check("sync: reconciled account still in trial at T0 (10 days left)", r2.ok && r2.status === "trial");

  // server error: local trial stands
  const kv3 = new MemKV();
  const deps3: TrialDeps = { store: kv3, fetchFn: makeFetch(() => ({ status: 500, json: {} })), now: () => T0, tokens: tokensFor("user_A") };
  const r3 = await new TrialService(deps3).ensureTrialState();
  check("sync: 500 -> server_error, local trial unaffected", r3.ok && r3.sync === "server_error" && r3.status === "trial" && r3.account.trial_started_at === T0);

  // network down: offline
  const kv4 = new MemKV();
  const deps4: TrialDeps = { store: kv4, fetchFn: makeFetch(() => "network_down"), now: () => T0, tokens: tokensFor("user_A") };
  const r4 = await new TrialService(deps4).ensureTrialState();
  check("sync: network throw -> offline, local trial stands", r4.ok && r4.sync === "offline" && r4.status === "trial");

  // server_time in the response raises the tamper floor
  const kv5 = new MemKV();
  const fetchFuture = makeFetch((c) => ({ status: 200, json: { ok: true, trial_started_at: (JSON.parse(c.body ?? "{}") as { trial_started_at: string }).trial_started_at, server_time: day(3) } }));
  const deps5: TrialDeps = { store: kv5, fetchFn: fetchFuture, now: () => T0, tokens: tokensFor("user_A") };
  await new TrialService(deps5).ensureTrialState();
  check("sync: response server_time raises the clock floor", (await guardedNow({ store: kv5, now: () => T0 })) === day(3));
}

// ═══ entitlements / offline policy ═══════════════════════════════════════════

console.log("\n— entitlements + offline policy —");
{
  // airplane-mode invariant: free features touch NOTHING
  const deadKv = new MemKV();
  deadKv.fail = true;
  const free = await canUse("advisor", { store: deadKv, now: () => T0 });
  check("advisor: allowed via free with storage DEAD (structural, no I/O)", free.allowed && free.via === "free");

  // premium fails closed on storage failure (never throws)
  const prem = await canUse("analytics", { store: deadKv, now: () => T0 });
  check("premium: storage dead -> fails closed (requires_subscription)", !prem.allowed && prem.reason === "requires_subscription");

  // trial fully offline: 48h airplane mode mid-trial
  const kv = new MemKV();
  let device = T0;
  const deps: TrialDeps = { store: kv, fetchFn: null, now: () => device, tokens: ANONYMOUS_TOKENS };
  await new TrialService(deps).ensureTrialState();
  device = day(2); // 48h later, still airplane mode
  const midTrial = await canUse("strategy_planner", deps);
  check("trial: works fully offline 48h in (via trial)", midTrial.allowed && midTrial.via === "trial");

  // tamper: rollback does NOT extend the trial
  device = day(TRIAL_DAYS + 1);
  const gone = await canUse("strategy_planner", deps);
  check("tamper: trial expired at +16d", !gone.allowed && gone.reason === "trial_expired");
  device = day(3); // user rolls the clock back 13 days
  const stillGone = await canUse("strategy_planner", deps);
  check("tamper: clock rolled back -> entitlement does NOT come back", !stillGone.allowed && stillGone.reason === "trial_expired");
  const freeStill = await canUse("advisor", deps);
  check("tamper: advisor still free regardless", freeStill.allowed && freeStill.via === "free");
}

// ═══ validation cache + offline grace ════════════════════════════════════════

console.log("\n— validateSubscription + offline grace —");
{
  const kv = new MemKV();
  let device = T0;
  const E = day(30); // subscription expires T0+30d
  const calls: FakeCall[] = [];
  const fetchActive = makeFetch((c) => {
    if (!c.url.endsWith("/api/subscription/status")) return { status: 404, json: { error: "not_found" } };
    if (c.headers?.authorization !== "Bearer tok-user_A") return { status: 401, json: { error: "unauthorized" } };
    return { status: 200, json: { status: "active", expires_at: E, server_time: T0 } };
  }, calls);

  const v = await validateSubscription({ fetchFn: fetchActive, store: kv, now: () => device, apiBase: "https://api.test" }, "tok-user_A");
  check("validate: active -> ok with expires_at", v.ok && v.status === "active" && v.expires_at === E);
  check("validate: GET with bearer", calls[0].method === "GET" && calls[0].headers?.authorization === "Bearer tok-user_A");
  const cached = parseAccountState(JSON.parse(kv.map.get(STORAGE_KEYS.account) ?? "null"));
  check("validate: cache persisted with validated_at (parseAccountState round-trip)", cached.ok && cached.value.subscription.status === "active" && cached.value.subscription.validated_at === T0 && cached.value.subscription.expires_at === E);

  // now fully offline (fetchFn never consulted by canUse)
  const offlineDeps = { store: kv, now: () => device };
  device = day(29);
  const active = await canUse("analytics", offlineDeps);
  check("offline: cached subscription valid before expiry (via subscription)", active.allowed && active.via === "subscription");
  device = day(31);
  const grace = await canUse("analytics", offlineDeps);
  check("offline: 1 day past expiry -> grace", grace.allowed && grace.via === "grace");
  device = day(37); // expiry + GRACE_DAYS exactly
  const graceEdge = await canUse("analytics", offlineDeps);
  check("offline: at expiry+GRACE_DAYS boundary -> still grace", graceEdge.allowed && graceEdge.via === "grace");
  device = new Date(Date.parse(E) + 7 * DAY + 1).toISOString();
  const hardExpired = await canUse("analytics", offlineDeps);
  check("offline: past grace -> fails closed as subscription_expired", !hardExpired.allowed && hardExpired.reason === "subscription_expired");

  // 'none' response must NOT stamp payment evidence
  const kv2 = new MemKV();
  let device2 = T0;
  const deps2: TrialDeps = { store: kv2, fetchFn: null, now: () => device2, tokens: ANONYMOUS_TOKENS };
  await new TrialService(deps2).ensureTrialState(); // trial running
  const fetchNone = makeFetch(() => ({ status: 200, json: { status: "none", server_time: T0 } }));
  const vNone = await validateSubscription({ fetchFn: fetchNone, store: kv2, now: () => device2 }, "tok-x");
  check("validate: 'none' caches without validated_at", vNone.ok && vNone.account.subscription.validated_at === undefined);
  device2 = day(TRIAL_DAYS + 2);
  const upsell = await canUse("analytics", { store: kv2, now: () => device2 });
  check("validate: never-paid user still sees trial_expired (not subscription_expired)", !upsell.allowed && upsell.reason === "trial_expired");

  // failure modes
  const v401 = await validateSubscription({ fetchFn: makeFetch(() => ({ status: 401, json: {} })), store: new MemKV(), now: () => T0 }, "bad");
  check("validate: 401 -> unauthorized, cache untouched", !v401.ok && v401.reason === "unauthorized");
  const vDown = await validateSubscription({ fetchFn: makeFetch(() => "network_down"), store: new MemKV(), now: () => T0 }, "t");
  check("validate: network down -> network_error", !vDown.ok && vDown.reason === "network_error");
  const vGarbage = await validateSubscription({ fetchFn: makeFetch(() => ({ status: 200, json: { status: "vip" } })), store: new MemKV(), now: () => T0 }, "t");
  check("validate: unknown status -> bad_response (never cached)", !vGarbage.ok && vGarbage.reason === "bad_response");

  // server_time ahead of the device raises the floor (kills frozen-clock trials)
  const kv3 = new MemKV();
  const deps3: TrialDeps = { store: kv3, fetchFn: null, now: () => T0, tokens: ANONYMOUS_TOKENS };
  await new TrialService(deps3).ensureTrialState();
  const fetchFuture = makeFetch(() => ({ status: 200, json: { status: "none", server_time: day(TRIAL_DAYS + 5) } }));
  await validateSubscription({ fetchFn: fetchFuture, store: kv3, now: () => T0 }, "t");
  const afterServer = await canUse("analytics", { store: kv3, now: () => T0 });
  check("validate: server_time ends an offline clock-freeze (trial now expired)", !afterServer.allowed && afterServer.reason === "trial_expired");
}

// ═══ touchPremiumFeature (first-premium-touch starts the trial) ══════════════

console.log("\n— touchPremiumFeature —");
{
  const kv = new MemKV();
  const deps: TrialDeps = { store: kv, fetchFn: null, now: () => T0, tokens: ANONYMOUS_TOKENS };
  const first = await touchPremiumFeature("multi_car", deps);
  check("touch: first premium touch starts the trial and allows", first.allowed && first.via === "trial");
  const acct = await loadAccount(kv, T0);
  check("touch: trial actually persisted", acct.ok && acct.account.trial_started_at === T0);
  const free = await touchPremiumFeature("advisor", deps);
  check("touch: free feature short-circuits (via free)", free.allowed && free.via === "free");

  // expired trial does NOT restart on touch
  const kv2 = new MemKV();
  let device2 = T0;
  const deps2: TrialDeps = { store: kv2, fetchFn: null, now: () => device2, tokens: ANONYMOUS_TOKENS };
  await new TrialService(deps2).ensureTrialState();
  device2 = day(TRIAL_DAYS + 1);
  const again = await touchPremiumFeature("multi_car", deps2);
  check("touch: expired trial stays expired (no restart)", !again.allowed && again.reason === "trial_expired");
}

// ═══ subscribe URL (external web — no IAP) ═══════════════════════════════════

console.log("\n— subscribe URL —");
{
  check("subscribe: placeholder base is https", SUBSCRIBE_WEB_BASE.startsWith("https://"));
  check("subscribe: base only", buildSubscribeUrl(SUBSCRIBE_WEB_BASE) === `${SUBSCRIBE_WEB_BASE}/subscribe`);
  check("subscribe: with user_id", buildSubscribeUrl("https://griplab.example.com", "user_2abc") === "https://griplab.example.com/subscribe?user_id=user_2abc");
  check("subscribe: trailing slash normalized", buildSubscribeUrl("https://griplab.example.com/", "u1") === "https://griplab.example.com/subscribe?user_id=u1");
  check("subscribe: user_id is URL-encoded", buildSubscribeUrl("https://x.test", "a b&c") === "https://x.test/subscribe?user_id=a%20b%26c");
  check("subscribe: empty user_id treated as absent", buildSubscribeUrl("https://x.test", "") === "https://x.test/subscribe");
}

// ═══ deletion ════════════════════════════════════════════════════════════════

console.log("\n— deletion —");
{
  // happy path: server reachable
  const kv = new MemKV();
  let wiped = 0;
  const calls: FakeCall[] = [];
  const deps: DeletionDeps = {
    store: kv,
    fetchFn: makeFetch((c) => (c.method === "DELETE" && c.url === "https://api.test/api/account" ? { status: 200, json: { ok: true } } : { status: 404, json: {} }), calls),
    now: () => T0,
    tokens: tokensFor("user_A"),
    apiBase: "https://api.test",
  };
  const d1 = await deleteAccount(deps, async () => {
    wiped++;
  });
  check("delete: server wipe then local wipe", d1.ok && d1.server === "deleted" && wiped === 1);
  check("delete: DELETE /api/account with bearer", calls[0].method === "DELETE" && calls[0].headers?.authorization === "Bearer tok-user_A");
  check("delete: no tombstone on success", kv.map.get(STORAGE_KEYS.pendingDeletion) === undefined);

  // server already gone (404) still counts as deleted
  const d404 = await deleteAccount({ ...deps, fetchFn: makeFetch(() => ({ status: 404, json: {} })) }, async () => {});
  check("delete: 404 (already gone) -> deleted", d404.ok && d404.server === "deleted");

  // server down: wipe anyway + tombstone queued AFTER the wipe
  const kv2 = new MemKV();
  let order: string[] = [];
  const deps2: DeletionDeps = {
    store: kv2,
    fetchFn: makeFetch(() => "network_down"),
    now: () => T0,
    tokens: tokensFor("user_A"),
  };
  const d2 = await deleteAccount(deps2, async () => {
    order.push("wipe");
    kv2.map.clear(); // a real localWipe may clear EVERYTHING
  });
  const tombRaw = kv2.map.get(STORAGE_KEYS.pendingDeletion);
  check("delete: server down -> local wipe still happens, queued", d2.ok && d2.server === "queued" && order.length === 1);
  check("delete: tombstone written after the wipe (survives clear-all)", tombRaw !== undefined && (JSON.parse(tombRaw ?? "{}") as { user_id?: string }).user_id === "user_A");

  // retry drains the queue once the server is back
  const retryUp = await retryPendingDeletion({ ...deps2, fetchFn: makeFetch(() => ({ status: 200, json: { ok: true } })) });
  check("delete: retry succeeds -> tombstone removed", retryUp.ok && !retryUp.pending && kv2.map.get(STORAGE_KEYS.pendingDeletion) === undefined);
  const retryEmpty = await retryPendingDeletion(deps2);
  check("delete: retry with empty queue -> pending false", retryEmpty.ok && !retryEmpty.pending);

  // retry while still down: attempts bookkeeping
  const kv3 = new MemKV();
  const deps3: DeletionDeps = { store: kv3, fetchFn: makeFetch(() => "network_down"), now: () => T0, tokens: tokensFor("user_B") };
  await deleteAccount(deps3, async () => {});
  const retryDown = await retryPendingDeletion(deps3);
  check("delete: retry offline -> still pending, attempts unchanged", retryDown.ok && retryDown.pending === true && retryDown.pending && retryDown.attempts === 1 && retryDown.last_error === "offline");
  const retry500 = await retryPendingDeletion({ ...deps3, fetchFn: makeFetch(() => ({ status: 500, json: {} })) });
  check("delete: retry 5xx -> attempts bumped", retry500.ok && retry500.pending === true && retry500.pending && retry500.attempts === 2 && retry500.last_error === "server_error");

  // anonymous: local-only wipe, no network call
  const kv4 = new MemKV();
  let fetchTouched = 0;
  let wiped4 = 0;
  const d4 = await deleteAccount(
    { store: kv4, fetchFn: makeFetch(() => (fetchTouched++, { status: 200, json: {} })), now: () => T0, tokens: ANONYMOUS_TOKENS },
    async () => {
      wiped4++;
    },
  );
  check("delete: anonymous -> local wipe only, server never called", d4.ok && d4.server === "anonymous" && wiped4 === 1 && fetchTouched === 0);

  // unauthorized: nothing wiped, caller decides
  let wiped5 = 0;
  const d5 = await deleteAccount({ store: new MemKV(), fetchFn: makeFetch(() => ({ status: 401, json: {} })), now: () => T0, tokens: tokensFor("user_C") }, async () => {
    wiped5++;
  });
  check("delete: 401 -> unauthorized, local data untouched", !d5.ok && d5.reason === "unauthorized" && wiped5 === 0);

  // localWipe failure is reported, never swallowed
  const d6 = await deleteAccount({ store: new MemKV(), fetchFn: makeFetch(() => ({ status: 200, json: {} })), now: () => T0, tokens: tokensFor("user_D") }, async () => {
    throw new Error("disk");
  });
  check("delete: localWipe throw -> local_wipe_failed", !d6.ok && d6.reason === "local_wipe_failed");
}

// ═══ never-wipe (corrupt account blob) ═══════════════════════════════════════

console.log("\n— never-wipe —");
{
  const kv = new MemKV();
  await kv.setItem(STORAGE_KEYS.account, "{definitely not json");
  const loaded = await loadAccount(kv, T0);
  check("corrupt account: load recovers with init + reports the stash", loaded.ok && loaded.recovered !== undefined && loaded.account.subscription.status === "none");
  const stashed = loaded.ok && loaded.recovered !== undefined ? kv.map.get(loaded.recovered.stashed_key) : undefined;
  check("corrupt account: original bytes preserved in the stash", stashed === "{definitely not json");
  const reparsed = parseAccountState(JSON.parse(kv.map.get(STORAGE_KEYS.account) ?? "null"));
  check("corrupt account: live slot reset to a valid blob", reparsed.ok);

  // wrong-shape (valid JSON, fails parseAccountState) also stashes
  const kv2 = new MemKV();
  await kv2.setItem(STORAGE_KEYS.account, JSON.stringify({ subscription: { status: "vip", source: "web" } }));
  const loaded2 = await loadAccount(kv2, T0);
  check("corrupt account: schema-invalid blob stashed with parse reason", loaded2.ok && loaded2.recovered !== undefined && loaded2.recovered.parse_reason.startsWith("invalid:"));
}

// ═══ verdict ═════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nACCOUNT: all checks passed" : `\nACCOUNT: ${failures} failures`);
if (failures > 0) process.exit(1);
