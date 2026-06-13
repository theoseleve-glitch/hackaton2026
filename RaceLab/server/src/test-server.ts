/**
 * racelab-server test suite — the whole API exercised through the pure router
 * against an in-memory Db fake and a fake token verifier. No HTTP, no
 * Postgres, no Vercel. Assertion style mirrors packages/schema.
 */

import type { BackupEntryInput, BackupRow, Db, SubscriptionRow } from "./db";
import type { TokenVerifier } from "./auth";
import type { HttpRequest, HttpResponse, ServerCtx } from "./types";
import { makeHandler } from "./handler";
import type { AppCtx } from "./appCtx";
import { makeSqlDb } from "./db";
import { existsSync } from "node:fs";
import { MAX_PUSH_BATCH } from "./handlers/backupPush";
import { toHttpRequest } from "./vercel";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

// ── in-memory Db fake (same contract as makeSqlDb / db/schema.sql) ───────────

class FakeDb implements Db {
  users = new Map<string, { created_at: string; trial_started_at: string | null }>();
  subs = new Map<string, SubscriptionRow>();
  backups = new Map<string, Map<string, BackupRow>>();
  deletions = new Map<string, string>(); // user_id -> requested_at (first wins)
  private seqCounter = 0;

  async ensureUser(user_id: string, now_iso: string): Promise<void> {
    if (!this.users.has(user_id)) {
      this.users.set(user_id, { created_at: now_iso, trial_started_at: null });
    }
  }
  async recordTrialStart(user_id: string, started_at_iso: string, now_iso: string): Promise<string> {
    let u = this.users.get(user_id);
    if (u === undefined) {
      u = { created_at: now_iso, trial_started_at: null };
      this.users.set(user_id, u);
    }
    if (u.trial_started_at === null) u.trial_started_at = started_at_iso; // first-seen wins
    return u.trial_started_at;
  }
  async getSubscription(user_id: string): Promise<SubscriptionRow | null> {
    return this.subs.get(user_id) ?? null;
  }
  async insertBackupEntries(
    user_id: string,
    entries: readonly BackupEntryInput[],
    received_at_iso: string,
  ): Promise<{ inserted: number; skipped: number }> {
    let userMap = this.backups.get(user_id);
    if (userMap === undefined) {
      userMap = new Map();
      this.backups.set(user_id, userMap);
    }
    let inserted = 0;
    for (const e of entries) {
      if (userMap.has(e.entry_id)) continue; // idempotent on (user_id, entry_id)
      this.seqCounter++;
      userMap.set(e.entry_id, { ...e, seq: this.seqCounter, received_at: received_at_iso });
      inserted++;
    }
    return { inserted, skipped: entries.length - inserted };
  }
  async listBackupEntries(user_id: string, after_seq: number, limit: number): Promise<BackupRow[]> {
    const userMap = this.backups.get(user_id);
    if (userMap === undefined) return [];
    return [...userMap.values()]
      .filter((r) => r.seq > after_seq)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit);
  }
  async deleteUserData(user_id: string, requested_at_iso: string): Promise<void> {
    this.users.delete(user_id);
    this.subs.delete(user_id);
    this.backups.delete(user_id);
    if (!this.deletions.has(user_id)) this.deletions.set(user_id, requested_at_iso); // first wins
  }
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW = "2026-06-12T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const DAY = 86_400_000;
const day = (n: number): string => new Date(NOW_MS + n * DAY).toISOString();

const verifier: TokenVerifier = {
  verify: async (token) => {
    if (token === "tok-A") return { user_id: "user_A" };
    if (token === "tok-B") return { user_id: "user_B" };
    if (token === "tok-throws") throw new Error("verifier exploded");
    return null;
  },
};

const db = new FakeDb();
let nowIso = NOW;
const ctx: ServerCtx = { db, verifier, now: () => nowIso };
// Lift a base ServerCtx to AppCtx: the Tier-B module seams are stubbed because
// the core-route tests below never touch them, and the new-route WIRING smoke
// test only asserts registration (status !== 404/405). Each module has its OWN
// exhaustive suite (test-<module>.ts) with real fakes. healthz gets a working
// ping+seams so the ops route can be asserted for real.
const app = (base: ServerCtx): AppCtx =>
  ({ ...base, healthPing: async () => true, healthSeams: { stripe: false, signing: false, blob: false, render: false } } as unknown as AppCtx);
const handle = makeHandler(app(ctx));

function req(
  method: string,
  path: string,
  opts?: { token?: string; query?: Record<string, string>; body?: unknown },
): HttpRequest {
  return {
    method,
    path,
    headers: opts?.token !== undefined ? { authorization: `Bearer ${opts.token}` } : {},
    query: opts?.query ?? {},
    body: opts?.body,
  };
}
const entry = (id: string, domain = "runs"): Record<string, unknown> => ({
  entry_id: id,
  ts: NOW,
  domain,
  op: "create",
  payload: { entity: id, v: 1 },
});

// ═══ routing + auth ═══════════════════════════════════════════════════════════

console.log("— routing + auth —");
{
  const r404 = await handle(req("GET", "/api/nope"));
  check("router: unknown path -> 404", r404.status === 404 && r404.json.error === "not_found");
  const r405 = await handle(req("POST", "/api/backup/restore", { token: "tok-A" }));
  check("router: wrong method -> 405 with allow list", r405.status === 405 && Array.isArray(r405.json.allow) && (r405.json.allow as string[]).includes("GET"));
  const rTrail = await handle(req("DELETE", "/api/account/", { token: "tok-A" }));
  check("router: trailing slash normalized", rTrail.status === 200);

  for (const [method, path] of [
    ["GET", "/api/subscription/status"],
    ["POST", "/api/trial/start"],
    ["POST", "/api/backup/push"],
    ["GET", "/api/backup/restore"],
    ["DELETE", "/api/account"],
  ] as const) {
    const noTok = await handle(req(method, path));
    check(`auth: ${method} ${path} without token -> 401`, noTok.status === 401 && noTok.json.error === "unauthorized");
  }
  const badTok = await handle(req("GET", "/api/subscription/status", { token: "tok-garbage" }));
  check("auth: unknown token -> 401", badTok.status === 401);
  const throwTok = await handle(req("GET", "/api/subscription/status", { token: "tok-throws" }));
  check("auth: throwing verifier -> 401 (not 500)", throwTok.status === 401);
  const noBearer = await handle({ ...req("GET", "/api/subscription/status"), headers: { authorization: "Basic abc" } });
  check("auth: non-Bearer scheme -> 401", noBearer.status === 401);

  const throwingDb = new FakeDb();
  throwingDb.getSubscription = async () => {
    throw new Error("db down");
  };
  const h2 = makeHandler(app({ db: throwingDb, verifier, now: () => NOW }));
  const r500 = await h2(req("GET", "/api/subscription/status", { token: "tok-A" }));
  // 500 carries error + server_time (P4), and NOTHING else (no stack/detail leak).
  check("router: handler throw -> 500 internal_error (no leak)", r500.status === 500 && r500.json.error === "internal_error" && Object.keys(r500.json).sort().join(",") === "error,server_time");
}

// ═══ trial first-seen ════════════════════════════════════════════════════════

console.log("\n— trial first-seen —");
{
  const claim1 = day(-3); // device 1 started its trial offline 3 days ago
  const r1 = await handle(req("POST", "/api/trial/start", { token: "tok-A", body: { trial_started_at: claim1 } }));
  check("trial: first claim recorded verbatim", r1.status === 200 && r1.json.trial_started_at === claim1 && r1.json.ok === true);
  check("trial: response carries server_time", r1.json.server_time === NOW);

  const r2 = await handle(req("POST", "/api/trial/start", { token: "tok-A", body: { trial_started_at: day(-1) } }));
  check("trial: later device claim does NOT move first-seen", r2.status === 200 && r2.json.trial_started_at === claim1);
  const r3 = await handle(req("POST", "/api/trial/start", { token: "tok-A", body: { trial_started_at: day(-10) } }));
  check("trial: even an EARLIER later claim does not move it (first-seen, not min)", r3.status === 200 && r3.json.trial_started_at === claim1);

  const rFuture = await handle(req("POST", "/api/trial/start", { token: "tok-B", body: { trial_started_at: day(5) } }));
  check("trial: future claim clamped to server now", rFuture.status === 200 && rFuture.json.trial_started_at === NOW);

  const dbC = new FakeDb();
  const hC = makeHandler(app({ db: dbC, verifier, now: () => NOW }));
  const rNoBody = await hC(req("POST", "/api/trial/start", { token: "tok-A" }));
  check("trial: no body -> server now", rNoBody.status === 200 && rNoBody.json.trial_started_at === NOW);
  const rBad = await hC(req("POST", "/api/trial/start", { token: "tok-A", body: { trial_started_at: "not-a-date" } }));
  check("trial: garbage timestamp -> 400", rBad.status === 400 && rBad.json.error === "invalid_trial_started_at");
  const rBadBody = await hC(req("POST", "/api/trial/start", { token: "tok-A", body: [1, 2] }));
  check("trial: array body -> 400", rBadBody.status === 400 && rBadBody.json.error === "invalid_body");
}

// ═══ subscription status ═════════════════════════════════════════════════════

console.log("\n— subscription status —");
{
  const rNone = await handle(req("GET", "/api/subscription/status", { token: "tok-A" }));
  check("subscription: no row -> none", rNone.status === 200 && rNone.json.status === "none" && rNone.json.expires_at === undefined);

  db.subs.set("user_A", { status: "active", expires_at: day(30) });
  const rActive = await handle(req("GET", "/api/subscription/status", { token: "tok-A" }));
  check("subscription: active before expiry -> active + expires_at", rActive.status === 200 && rActive.json.status === "active" && rActive.json.expires_at === day(30));

  db.subs.set("user_A", { status: "canceled", expires_at: day(10) });
  const rCanceled = await handle(req("GET", "/api/subscription/status", { token: "tok-A" }));
  check("subscription: canceled but paid-through -> still active", rCanceled.json.status === "active");

  db.subs.set("user_A", { status: "active", expires_at: day(-1) });
  const rExpired = await handle(req("GET", "/api/subscription/status", { token: "tok-A" }));
  check("subscription: past expires_at -> expired (grace is client-side)", rExpired.json.status === "expired" && rExpired.json.expires_at === day(-1));

  db.subs.set("user_A", { status: "active", expires_at: NOW });
  const rEdge = await handle(req("GET", "/api/subscription/status", { token: "tok-A" }));
  check("subscription: at the exact expiry instant -> active (t <= expires)", rEdge.json.status === "active");
  db.subs.delete("user_A");
}

// ═══ backup push (idempotency) ═══════════════════════════════════════════════

console.log("\n— backup push —");
{
  const batch = [entry("ob-1"), entry("ob-2"), entry("ob-3", "sheets")];
  const r1 = await handle(req("POST", "/api/backup/push", { token: "tok-A", body: { entries: batch } }));
  check("push: fresh batch inserted", r1.status === 200 && r1.json.inserted === 3 && r1.json.skipped === 0);

  const r2 = await handle(req("POST", "/api/backup/push", { token: "tok-A", body: { entries: batch } }));
  check("push: double push -> ok with all skipped (idempotent)", r2.status === 200 && r2.json.ok === true && r2.json.inserted === 0 && r2.json.skipped === 3);

  const r3 = await handle(req("POST", "/api/backup/push", { token: "tok-A", body: { entries: [entry("ob-3"), entry("ob-4")] } }));
  check("push: overlapping batch -> partial insert + skip counts", r3.status === 200 && r3.json.inserted === 1 && r3.json.skipped === 1);

  const r4 = await handle(req("POST", "/api/backup/push", { token: "tok-A", body: { entries: [entry("ob-5"), entry("ob-5")] } }));
  check("push: within-batch duplicate counted as skipped", r4.status === 200 && r4.json.inserted === 1 && r4.json.skipped === 1);

  const rAlias = await handle(req("POST", "/api/backup/push", { token: "tok-A", body: { entries: [{ id: "ob-6", ts: NOW, domain: "runs", op: "create", payload: { x: 1 } }] } }));
  check("push: client OutboxEntry 'id' accepted as entry_id alias", rAlias.status === 200 && rAlias.json.inserted === 1);

  const rEmpty = await handle(req("POST", "/api/backup/push", { token: "tok-A", body: { entries: [] } }));
  check("push: empty batch -> ok 0/0", rEmpty.status === 200 && rEmpty.json.inserted === 0 && rEmpty.json.skipped === 0);

  const rMalformed = await handle(req("POST", "/api/backup/push", { token: "tok-A", body: { entries: [entry("ob-7"), { entry_id: "ob-8", ts: "garbage", domain: "runs", op: "create", payload: {} }] } }));
  check("push: malformed entry rejects the WHOLE batch with its index", rMalformed.status === 400 && rMalformed.json.error === "invalid_entry" && rMalformed.json.index === 1 && rMalformed.json.field === "ts");
  check("push: rejected batch inserted NOTHING (never partial)", !db.backups.get("user_A")?.has("ob-7"));

  const rNoPayload = await handle(req("POST", "/api/backup/push", { token: "tok-A", body: { entries: [{ entry_id: "ob-9", ts: NOW, domain: "runs", op: "create", payload: "nope" }] } }));
  check("push: non-object payload -> 400", rNoPayload.status === 400 && rNoPayload.json.field === "payload");

  const big = Array.from({ length: MAX_PUSH_BATCH + 1 }, (_, i) => entry(`ob-big-${i}`));
  const rBig = await handle(req("POST", "/api/backup/push", { token: "tok-A", body: { entries: big } }));
  check("push: oversized batch -> 400 batch_too_large", rBig.status === 400 && rBig.json.error === "batch_too_large");

  const rBadBody = await handle(req("POST", "/api/backup/push", { token: "tok-A", body: "entries" }));
  check("push: non-object body -> 400", rBadBody.status === 400 && rBadBody.json.error === "invalid_body");

  const rNewDomain = await handle(req("POST", "/api/backup/push", { token: "tok-A", body: { entries: [entry("ob-10", "future_domain")] } }));
  check("push: unknown domain accepted (forward compat, server stores not vouches)", rNewDomain.status === 200 && rNewDomain.json.inserted === 1);
}

// ═══ backup restore: pagination + per-user isolation ═════════════════════════

console.log("\n— backup restore —");
{
  // user_B pushes interleaved so global seqs mix across users
  await handle(req("POST", "/api/backup/push", { token: "tok-B", body: { entries: [entry("ob-b1"), entry("ob-b2")] } }));

  const all = await handle(req("GET", "/api/backup/restore", { token: "tok-A" }));
  const allEntries = all.json.entries as BackupRow[];
  check("restore: returns all of user A's entries by default", all.status === 200 && allEntries.length === 7 && all.json.has_more === false);
  check("restore: seq strictly ascending", allEntries.every((e, i) => i === 0 || e.seq > allEntries[i - 1].seq));
  check("restore: payload round-trips", allEntries[0].payload !== null && (allEntries[0].payload as { entity?: string }).entity === "ob-1");

  const p1 = await handle(req("GET", "/api/backup/restore", { token: "tok-A", query: { limit: "3" } }));
  const p1e = p1.json.entries as BackupRow[];
  check("restore: page 1 honors limit + has_more", p1.status === 200 && p1e.length === 3 && p1.json.has_more === true);
  const p2 = await handle(req("GET", "/api/backup/restore", { token: "tok-A", query: { limit: "3", after_seq: String(p1.json.next_after_seq) } }));
  const p2e = p2.json.entries as BackupRow[];
  const p3 = await handle(req("GET", "/api/backup/restore", { token: "tok-A", query: { limit: "3", after_seq: String(p2.json.next_after_seq) } }));
  const p3e = p3.json.entries as BackupRow[];
  const paged = [...p1e, ...p2e, ...p3e].map((e) => e.entry_id);
  check("restore: cursor pagination covers everything exactly once", paged.length === 7 && new Set(paged).size === 7 && p3.json.has_more === false);
  check("restore: drained cursor returns empty page with stable next_after_seq", (() => {
    const last = p3e.length > 0 ? p3e[p3e.length - 1].seq : 0;
    return p3.json.next_after_seq === last;
  })());

  // ── per-user isolation: A must NEVER see B's rows, and vice versa ──
  const aIds = new Set(allEntries.map((e) => e.entry_id));
  check("isolation: user A sees none of user B's entries", !aIds.has("ob-b1") && !aIds.has("ob-b2"));
  const bAll = await handle(req("GET", "/api/backup/restore", { token: "tok-B" }));
  const bEntries = bAll.json.entries as BackupRow[];
  check("isolation: user B sees exactly their own 2 entries", bEntries.length === 2 && bEntries.every((e) => e.entry_id.startsWith("ob-b")));
  const bProbe = await handle(req("GET", "/api/backup/restore", { token: "tok-B", query: { after_seq: "0", limit: "500" } }));
  const probeIds = (bProbe.json.entries as BackupRow[]).map((e) => e.entry_id);
  check("isolation: B probing the full global seq range still only gets B's rows", probeIds.every((id) => id.startsWith("ob-b")) && !probeIds.includes("ob-1"));

  const rBadSeq = await handle(req("GET", "/api/backup/restore", { token: "tok-A", query: { after_seq: "abc" } }));
  check("restore: malformed after_seq -> 400", rBadSeq.status === 400 && rBadSeq.json.error === "invalid_after_seq");
  const rBadLimit = await handle(req("GET", "/api/backup/restore", { token: "tok-A", query: { limit: "0" } }));
  check("restore: limit < 1 -> 400", rBadLimit.status === 400 && rBadLimit.json.error === "invalid_limit");
}

// ═══ account delete ══════════════════════════════════════════════════════════

console.log("\n— account delete —");
{
  db.subs.set("user_A", { status: "active", expires_at: day(30) });
  const d1 = await handle(req("DELETE", "/api/account", { token: "tok-A" }));
  check("delete: 200 with deleted flag", d1.status === 200 && d1.json.deleted === true);
  check("delete: user row gone", !db.users.has("user_A"));
  check("delete: subscription gone", db.subs.get("user_A") === undefined);
  check("delete: ALL backup entries gone", db.backups.get("user_A") === undefined);
  check("delete: tombstone written with requested_at", db.deletions.get("user_A") === NOW);

  const afterRestore = await handle(req("GET", "/api/backup/restore", { token: "tok-A" }));
  check("delete: restore after delete -> empty (token still valid at Clerk)", afterRestore.status === 200 && (afterRestore.json.entries as unknown[]).length === 0);
  const afterStatus = await handle(req("GET", "/api/subscription/status", { token: "tok-A" }));
  check("delete: subscription status after delete -> none", afterStatus.json.status === "none");

  nowIso = day(1); // a day later, the client's tombstone retry fires blind
  const d2 = await handle(req("DELETE", "/api/account", { token: "tok-A" }));
  check("delete: re-delete is idempotent 200", d2.status === 200 && d2.json.deleted === true);
  check("delete: tombstone keeps the FIRST requested_at", db.deletions.get("user_A") === NOW);
  nowIso = NOW;

  check("delete: user B untouched by A's deletion", db.backups.get("user_B")?.size === 2 && db.users.has("user_B"));
}

// ═══ vercel glue (request conversion, no runtime) ════════════════════════════

console.log("\n— vercel glue —");
{
  const httpReq = toHttpRequest({
    method: "get",
    url: "/api/backup/restore?after_seq=3&limit=2",
    headers: { authorization: "Bearer tok-A" },
  });
  check("glue: method uppercased + path extracted", httpReq.method === "GET" && httpReq.path === "/api/backup/restore");
  check("glue: query string parsed", httpReq.query.after_seq === "3" && httpReq.query.limit === "2");
  const viaGlue = await handle(httpReq);
  check("glue: converted request flows through the router", viaGlue.status === 200);

  const strBody = toHttpRequest({ method: "POST", url: "/api/trial/start", headers: {}, body: '{"trial_started_at":"2026-06-01T00:00:00.000Z"}' });
  check("glue: string JSON body parsed", typeof strBody.body === "object" && strBody.body !== null && (strBody.body as Record<string, unknown>).trial_started_at === "2026-06-01T00:00:00.000Z");
  const rawBody = toHttpRequest({ method: "POST", url: "/api/trial/start", headers: {}, body: "not json" });
  check("glue: unparseable body left as string (handler 400s it)", rawBody.body === "not json");
}

// ═══ BACKEND.md module route wiring (registration smoke test) ════════════════
// Each module has its own exhaustive suite (test-<module>.ts); here we only
// prove handler.ts maps every new path+method to a real handler (no typo,
// missing route, or wrong method). Auth'd routes reach requireAuth -> 401;
// auth-free routes reach the (stubbed) handler -> 500. Either way: NOT 404
// (unknown path) and NOT 405 (wrong method) == correctly registered + adapted.

console.log("\n— module route wiring —");
{
  const WIRED: Array<[string, string]> = [
    ["POST", "/api/webhooks/stripe"],
    ["GET", "/api/entitlement"],
    ["POST", "/api/media/upload-url"],
    ["GET", "/api/backup/blob"],
    ["PUT", "/api/backup/blob"],
    ["POST", "/api/share/publish"],
    ["GET", "/api/share/get"],
    ["POST", "/api/share/import"],
    ["GET", "/api/content/rcdata"],
    ["GET", "/api/content/kb"],
    ["POST", "/api/me/export"],
    ["GET", "/api/me/export"],
    ["POST", "/api/push/token"],
    ["DELETE", "/api/push/token"],
    ["GET", "/api/healthz"],
  ];
  for (const [method, path] of WIRED) {
    const r = await handle(req(method, path, { token: "tok-A" }));
    check(`wired: ${method} ${path} registered (not 404/405)`, r.status !== 404 && r.status !== 405);
  }
  const wrongMethod = await handle(req("DELETE", "/api/entitlement", { token: "tok-A" }));
  check("wired: wrong method on a known path -> 405", wrongMethod.status === 405 && Array.isArray(wrongMethod.json.allow));
  const unknown = await handle(req("GET", "/api/does-not-exist"));
  check("wired: unknown path -> 404", unknown.status === 404);
  check("wired: error responses carry server_time (P4)", typeof unknown.json.server_time === "string" && typeof wrongMethod.json.server_time === "string");

  // healthz works for real (auth-free, ping up, seams reported as booleans only)
  const hz = await handle(req("GET", "/api/healthz"));
  check("healthz: 200 ok, db up, seams are booleans, no secrets", hz.status === 200 && hz.json.ok === true && hz.json.db === "up" && typeof hz.json.seams === "object" && typeof (hz.json.seams as Record<string, unknown>).stripe === "boolean");
}

// ═══ deploy reachability — every route has a Vercel function file (must-fix #2) ═
console.log("\n— api function coverage —");
{
  const API_FILES = [
    "api/account.ts", "api/subscription/status.ts", "api/trial/start.ts", "api/backup/push.ts", "api/backup/restore.ts",
    "api/webhooks/stripe.ts", "api/entitlement.ts", "api/media/upload-url.ts", "api/backup/blob.ts",
    "api/share/publish.ts", "api/share/get.ts", "api/share/import.ts", "api/content/rcdata.ts", "api/content/kb.ts",
    "api/me/export.ts", "api/push/token.ts", "api/healthz.ts",
  ];
  for (const f of API_FILES) check(`api: ${f} exists (route reachable on Vercel)`, existsSync(f));
}

// ═══ GDPR deletion targets the LIVE tables (must-fix #3) ═════════════════════
console.log("\n— deletion SQL contract —");
{
  const seen: string[] = [];
  const recDb = makeSqlDb(async (sql) => { seen.push(sql); return { rows: [] }; });
  await recDb.deleteUserData("user_X", NOW);
  const sql = seen.join(" ");
  for (const tbl of ["backup_entries", "backup_blobs", "media", "export_jobs", "push_tokens", "stripe_subscriptions", "share_snapshots", "share_imports", "users"]) {
    check(`delete: wipes ${tbl}`, new RegExp(`DELETE FROM ${tbl}\\b`).test(sql));
  }
  check("delete: does NOT touch the dropped legacy `subscriptions` table", !/DELETE FROM subscriptions\b/.test(sql));
  check("delete: tombstones the request", /INSERT INTO deletions/.test(sql));
}

// ═══ verdict ═════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nSERVER: all checks passed" : `\nSERVER: ${failures} failures`);
if (failures > 0) process.exit(1);
