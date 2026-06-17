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
  async isTombstoned(user_id: string): Promise<boolean> {
    return this.deletions.has(user_id);
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
  // Fresh DB: the routing section above DELETEs user_A (trailing-slash test),
  // which now writes a deletions tombstone — and a tombstoned id is refused a
  // second trial (audit HIGH). These tests exercise the first-seen logic on a
  // clean slate, so they get their own untombstoned FakeDb.
  const tdb = new FakeDb();
  const handle = makeHandler(app({ db: tdb, verifier, now: () => nowIso }));
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
  check("trial: array body -> 400", rBadBody.status === 400 && rBadBody.json.error === "bad_request");

  // ── tombstone blocks a SECOND trial (audit HIGH regression) ──
  const dbTomb = new FakeDb();
  const hTomb = makeHandler(app({ db: dbTomb, verifier, now: () => NOW }));
  const tFirst = await hTomb(req("POST", "/api/trial/start", { token: "tok-A" }));
  check("trial: first start (no tombstone) -> 200", tFirst.status === 200 && tFirst.json.ok === true);
  // user deletes their account -> a deletions tombstone is written and survives the wipe
  await hTomb(req("DELETE", "/api/account", { token: "tok-A" }));
  check("trial: tombstone exists after deletion", dbTomb.deletions.has("user_A"));
  // a re-claim of the SAME id must NOT get a fresh trial
  const tRetry = await hTomb(req("POST", "/api/trial/start", { token: "tok-A" }));
  check("trial: tombstoned id is REFUSED a second trial -> 409", tRetry.status === 409 && tRetry.json.error === "trial_unavailable_deleted");
  check("trial: refused retrial did NOT re-create the user row", !dbTomb.users.has("user_A"));
  // a genuinely different id (fresh Clerk account) is unaffected
  const tOther = await hTomb(req("POST", "/api/trial/start", { token: "tok-B" }));
  check("trial: a different (un-tombstoned) id still gets its trial", tOther.status === 200 && tOther.json.ok === true);
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
  // RECONCILED with /api/entitlement (audit MED): a stored 'canceled' is NEVER
  // active here, even with a future expires_at — Stripe only stores 'canceled'
  // once the period has ended (subscription.deleted). Matches the entitlement
  // token's status==='active'-only PRO grant; the two endpoints no longer diverge.
  check("subscription: canceled raw status -> expired (reconciled with entitlement)", rCanceled.json.status === "expired");

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
  check("push: non-object body -> 400", rBadBody.status === 400 && rBadBody.json.error === "bad_request");

  const rNewDomain = await handle(req("POST", "/api/backup/push", { token: "tok-A", body: { entries: [entry("ob-10", "future_domain")] } }));
  check("push: unknown domain accepted (forward compat, server stores not vouches)", rNewDomain.status === 200 && rNewDomain.json.inserted === 1);

  // IDOR (audit MED/LOW): the idempotency key is (user_id, entry_id). A user
  // pushing an entry_id another user already has must INSERT under their own row
  // (not be skipped as a dup) and must NEVER touch the other's row — entry_id is
  // scoped per owner. Isolated DB so it doesn't perturb the restore counts below.
  {
    const idorDb = new FakeDb();
    const hIdor = makeHandler(app({ db: idorDb, verifier, now: () => NOW }));
    await hIdor(req("POST", "/api/backup/push", { token: "tok-A", body: { entries: [entry("ob-1")] } }));
    const rCross = await hIdor(req("POST", "/api/backup/push", { token: "tok-B", body: { entries: [entry("ob-1")] } }));
    check("push: cross-user same entry_id inserts under the OTHER user (per-owner idempotency, no IDOR)", rCross.status === 200 && rCross.json.inserted === 1 && rCross.json.skipped === 0);
    check("push: A's ob-1 row is untouched by B's push", idorDb.backups.get("user_A")?.has("ob-1") === true && idorDb.backups.get("user_B")?.has("ob-1") === true);
  }

  // empty-batch still materializes the user row (so a later non-empty push can't
  // FK-fail). A brand-new user whose FIRST contact is an empty push must exist.
  const freshDb = new FakeDb();
  const hFresh = makeHandler(app({ db: freshDb, verifier, now: () => NOW }));
  const rEmptyFirst = await hFresh(req("POST", "/api/backup/push", { token: "tok-A", body: { entries: [] } }));
  check("push: empty batch from a new user STILL creates the user row (no later FK-fail)", rEmptyFirst.status === 200 && freshDb.users.has("user_A"));
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

  // ── Clerk identity deletion (Apple 5.1.1(v), audit MED) ──
  {
    // no Clerk deleter wired -> identity step skipped (data still wiped)
    const dbNoCk = new FakeDb();
    const hNoCk = makeHandler(app({ db: dbNoCk, verifier, now: () => NOW }));
    const rSkip = await hNoCk(req("DELETE", "/api/account", { token: "tok-A" }));
    check("delete: no Clerk deleter -> clerk_identity 'skipped', data still wiped", rSkip.status === 200 && rSkip.json.clerk_identity === "skipped" && !dbNoCk.users.has("user_A"));

    // Clerk deleter wired + succeeds -> identity deleted with the verified id
    const dbCk = new FakeDb();
    let deletedId: string | null = null;
    const ckApp = { ...ctx, db: dbCk, healthPing: async () => true, healthSeams: { stripe: false, signing: false, blob: false, render: false }, deleteClerkIdentity: { deleteIdentity: async (id: string) => { deletedId = id; } } } as unknown as AppCtx;
    const rOk = await makeHandler(ckApp)(req("DELETE", "/api/account", { token: "tok-A" }));
    check("delete: Clerk deleter wired -> clerk_identity 'deleted' with the VERIFIED id", rOk.json.clerk_identity === "deleted" && deletedId === "user_A");

    // Clerk deleter THROWS -> reported 'failed', but the request still 200s (data gone, tombstone set)
    const dbCkF = new FakeDb();
    const ckFApp = { ...ctx, db: dbCkF, healthPing: async () => true, healthSeams: { stripe: false, signing: false, blob: false, render: false }, deleteClerkIdentity: { deleteIdentity: async () => { throw new Error("clerk 500"); } } } as unknown as AppCtx;
    const rFail = await makeHandler(ckFApp)(req("DELETE", "/api/account", { token: "tok-A" }));
    check("delete: Clerk failure -> clerk_identity 'failed' but 200 (data already erased, tombstone set)", rFail.status === 200 && rFail.json.clerk_identity === "failed" && !dbCkF.users.has("user_A") && dbCkF.deletions.has("user_A"));
  }
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
    ["POST", "/api/media/confirm"],
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
    ["POST", "/api/cron/workers"],
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

// ═══ rate limiting (IP dimension, only when a store is wired) ════════════════
// The router enforces RATE_POLICY on auth-free + auth-sensitive surfaces ONLY
// when ctx.rateStore is present (absent everywhere above -> never enforced, so
// the rest of the suite is untouched). Fixed-window over an in-memory counter.
console.log("\n— rate limiting —");
{
  // minimal atomic counter fake (mirrors Redis INCR + PEXPIRE-NX); the router
  // drives `now` off ctx.now(), so we just need monotonic per-key counts here.
  const map = new Map<string, { count: number; reset_at_ms: number }>();
  const rateStore = {
    async incr(key: string, window_ms: number) {
      const nowMs = Date.parse(nowIso);
      const cur = map.get(key);
      if (cur === undefined || nowMs >= cur.reset_at_ms) {
        const fresh = { count: 1, reset_at_ms: nowMs + window_ms };
        map.set(key, fresh);
        return { ...fresh };
      }
      cur.count += 1;
      return { count: cur.count, reset_at_ms: cur.reset_at_ms };
    },
  };
  const rlApp = { ...ctx, healthPing: async () => true, healthSeams: { stripe: false, signing: false, blob: false, render: false }, rateStore } as unknown as AppCtx;
  const rlHandle = makeHandler(rlApp);
  const ipReq = (ip: string): HttpRequest => ({ method: "GET", path: "/api/entitlement", headers: { authorization: "Bearer tok-A" }, query: {}, body: undefined, ip });

  // entitlement policy is 60/min; the 61st from one IP trips 429.
  let last: HttpResponse = { status: 0, json: {} };
  for (let i = 0; i < 60; i++) last = await rlHandle(ipReq("1.1.1.1"));
  check("rate: first 60 from one IP are NOT 429", last.status !== 429);
  const over = await rlHandle(ipReq("1.1.1.1"));
  check("rate: 61st from the same IP -> 429 rate_limited", over.status === 429 && over.json.error === "rate_limited");
  check("rate: 429 carries a positive retry_after_ms", typeof over.json.retry_after_ms === "number" && (over.json.retry_after_ms as number) > 0);
  // a DIFFERENT IP has its own fresh bucket (per-IP isolation).
  const otherIp = await rlHandle(ipReq("2.2.2.2"));
  check("rate: a different IP has its own budget (not 429)", otherIp.status !== 429);
  // an UN-wired ctx (no rateStore) never rate-limits — the default everywhere.
  let none: HttpResponse = { status: 0, json: {} };
  for (let i = 0; i < 100; i++) none = await handle(req("GET", "/api/entitlement", { token: "tok-A" }));
  check("rate: with no rateStore wired, the limiter is OFF (never 429)", none.status !== 429);
}

// ═══ vercel glue: client IP threaded from x-forwarded-for ═════════════════════
console.log("\n— vercel client-ip —");
{
  const withXff = toHttpRequest({ method: "GET", url: "/api/entitlement", headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } });
  check("ip: first x-forwarded-for hop is the client ip", withXff.ip === "203.0.113.9");
  const withReal = toHttpRequest({ method: "GET", url: "/api/entitlement", headers: { "x-real-ip": "198.51.100.7" } });
  check("ip: x-real-ip fallback when no x-forwarded-for", withReal.ip === "198.51.100.7");
  const noIp = toHttpRequest({ method: "GET", url: "/api/entitlement", headers: {} });
  check("ip: absent when no proxy header (router falls back internally)", noIp.ip === undefined);
}

// ═══ deploy reachability — every route has a Vercel function file (must-fix #2) ═
console.log("\n— api function coverage —");
{
  const API_FILES = [
    "api/account.ts", "api/subscription/status.ts", "api/trial/start.ts", "api/backup/push.ts", "api/backup/restore.ts",
    "api/webhooks/stripe.ts", "api/entitlement.ts", "api/media/upload-url.ts", "api/media/confirm.ts", "api/backup/blob.ts",
    "api/share/publish.ts", "api/share/get.ts", "api/share/import.ts", "api/content/rcdata.ts", "api/content/kb.ts",
    "api/me/export.ts", "api/push/token.ts", "api/healthz.ts", "api/cron/workers.ts",
  ];
  for (const f of API_FILES) check(`api: ${f} exists (route reachable on Vercel)`, existsSync(f));
}

// ═══ cron worker entry — secret-gated, fail-closed when unconfigured ═════════
console.log("\n— cron worker entry —");
{
  // no secret wired -> fail closed even with a header present
  const noSecretApp = { ...ctx, healthPing: async () => true, healthSeams: { stripe: false, signing: false, blob: false, render: false } } as unknown as AppCtx;
  const noSecret = makeHandler(noSecretApp);
  const rClosed = await noSecret({ method: "POST", path: "/api/cron/workers", headers: { "x-cron-secret": "anything" }, query: {}, body: undefined });
  check("cron: fail-closed (no CRON_SECRET configured) -> 401", rClosed.status === 401);

  let ran = 0;
  const cronApp = { ...ctx, healthPing: async () => true, healthSeams: { stripe: false, signing: false, blob: false, render: false }, cronSecret: "s3cret", cronRunJobs: async () => { ran++; return { ok: true, ran: ["fake.worker"] }; } } as unknown as AppCtx;
  const cron = makeHandler(cronApp);
  const rNoHdr = await cron({ method: "POST", path: "/api/cron/workers", headers: {}, query: {}, body: undefined });
  check("cron: missing secret -> 401, workers NOT run", rNoHdr.status === 401 && ran === 0);
  const rWrong = await cron({ method: "POST", path: "/api/cron/workers", headers: { "x-cron-secret": "nope" }, query: {}, body: undefined });
  check("cron: wrong secret -> 401, workers NOT run", rWrong.status === 401 && ran === 0);
  const rOk = await cron({ method: "POST", path: "/api/cron/workers", headers: { "x-cron-secret": "s3cret" }, query: {}, body: undefined });
  check("cron: correct x-cron-secret -> 200, workers ran", rOk.status === 200 && rOk.json.ok === true && ran === 1 && Array.isArray(rOk.json.ran));
  const rBearer = await cron({ method: "POST", path: "/api/cron/workers", headers: { authorization: "Bearer s3cret" }, query: {}, body: undefined });
  check("cron: Vercel-native Authorization: Bearer <secret> -> 200", rBearer.status === 200 && ran === 2);
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
if (failures > 0) process.exitCode = 1;
