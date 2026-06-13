/**
 * backup domain-blob test suite (D11) — the two handlers exercised against an
 * in-memory BlobBackupStore fake and a fake token verifier. No HTTP, no
 * Postgres. Assertion style mirrors src/test-server.ts.
 *
 * Run from server/:  npx tsx src/test-backupBlob.ts
 */

import type { HttpRequest } from "./types";
import type { TokenVerifier } from "./auth";
import type {
  BlobBackupStore,
  BackupBlob,
  BackupBlobPutResult,
} from "./stores/backupBlobStore";
import { backupBlobGet, backupBlobPut, type BackupCtx } from "./handlers/backupBlob";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

// ── in-memory BlobBackupStore fake (same contract as makeSqlBackupBlobStore) ──

class FakeBlobStore implements BlobBackupStore {
  // user_id -> domain -> blob
  rows = new Map<string, Map<string, BackupBlob>>();

  async get(userId: string, domain: string): Promise<BackupBlob | null> {
    const blob = this.rows.get(userId)?.get(domain);
    return blob === undefined ? null : { ...blob };
  }

  async put(
    userId: string,
    domain: string,
    format: number,
    state: unknown,
    updatedAt: string,
    baseUpdatedAt: string | undefined,
  ): Promise<BackupBlobPutResult> {
    let userMap = this.rows.get(userId);
    if (userMap === undefined) {
      userMap = new Map();
      this.rows.set(userId, userMap);
    }
    const existing = userMap.get(domain);
    if (existing !== undefined) {
      // row exists -> base must match the stored cursor (and must be provided)
      if (baseUpdatedAt === undefined || baseUpdatedAt !== existing.updated_at) {
        return { ok: false, reason: "conflict", current_updated_at: existing.updated_at };
      }
    }
    // create-if-absent (base undefined, no row) OR matching update
    userMap.set(domain, { format, state, updated_at: updatedAt });
    return { ok: true, updated_at: updatedAt };
  }
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW = "2026-06-13T12:00:00.000Z";
const LATER = "2026-06-13T13:00:00.000Z";

const verifier: TokenVerifier = {
  verify: async (token) => {
    if (token === "tok-A") return { user_id: "user_A" };
    if (token === "tok-B") return { user_id: "user_B" };
    if (token === "tok-throws") throw new Error("verifier exploded");
    return null;
  },
};

function req(
  method: string,
  opts?: { token?: string; query?: Record<string, string>; body?: unknown },
): HttpRequest {
  return {
    method,
    path: "/api/backup/blob",
    headers: opts?.token !== undefined ? { authorization: `Bearer ${opts.token}` } : {},
    query: opts?.query ?? {},
    body: opts?.body,
  };
}

let store = new FakeBlobStore();
let nowIso = NOW;
const ctx: BackupCtx = { now: () => nowIso, verifier, store };
const ctxWith = (s: FakeBlobStore, n: () => string): BackupCtx => ({ now: n, verifier, store: s });

// ═══ auth ═════════════════════════════════════════════════════════════════════

console.log("— auth —");
{
  const gNoTok = await backupBlobGet(ctx, req("GET", { query: { domain: "garage" } }));
  check("auth: GET without token -> 401", gNoTok.status === 401 && gNoTok.json.error === "unauthorized");
  const pNoTok = await backupBlobPut(ctx, req("PUT", { query: { domain: "garage" }, body: { format: 1, state: {} } }));
  check("auth: PUT without token -> 401", pNoTok.status === 401 && pNoTok.json.error === "unauthorized");

  const gBad = await backupBlobGet(ctx, req("GET", { token: "tok-garbage", query: { domain: "garage" } }));
  check("auth: unknown token -> 401", gBad.status === 401);
  const gThrow = await backupBlobGet(ctx, req("GET", { token: "tok-throws", query: { domain: "garage" } }));
  check("auth: throwing verifier -> 401 (not 500)", gThrow.status === 401);
  const gBasic = await backupBlobGet(
    { ...ctx },
    { ...req("GET", { query: { domain: "garage" } }), headers: { authorization: "Basic abc" } },
  );
  check("auth: non-Bearer scheme -> 401", gBasic.status === 401);
}

// ═══ domain allowlist ════════════════════════════════════════════════════════

console.log("\n— domain validation —");
{
  for (const d of ["garage", "tracks", "logbook", "reports", "account", "sheets:car-123", "sheets:abc"]) {
    const g = await backupBlobGet(ctx, req("GET", { token: "tok-A", query: { domain: d } }));
    // valid domain with no row yet -> 404 (not 400)
    check(`domain: '${d}' accepted (404 not_found, not bad_request)`, g.status === 404 && g.json.error === "not_found");
  }
  for (const d of ["", "garages", "Sheets:x", "sheets:", "sheets", "sheets:a:b", "  garage", "unknown_domain"]) {
    const g = await backupBlobGet(ctx, req("GET", { token: "tok-A", query: { domain: d } }));
    check(`domain: invalid '${d}' -> 400 bad_request`, g.status === 400 && g.json.error === "bad_request");
  }
  const gMissing = await backupBlobGet(ctx, req("GET", { token: "tok-A" }));
  check("domain: missing query -> 400", gMissing.status === 400 && gMissing.json.error === "bad_request");
  const pBadDomain = await backupBlobPut(ctx, req("PUT", { token: "tok-A", query: { domain: "nope" }, body: { format: 1, state: {} } }));
  check("domain: PUT invalid domain -> 400", pBadDomain.status === 400 && pBadDomain.json.error === "bad_request");
}

// ═══ GET 404 / PUT-then-GET round trip ═══════════════════════════════════════

console.log("\n— put / get round trip —");
{
  store = new FakeBlobStore();
  const c = ctxWith(store, () => nowIso);
  nowIso = NOW;

  const g0 = await backupBlobGet(c, req("GET", { token: "tok-A", query: { domain: "garage" } }));
  check("get: no blob yet -> 404", g0.status === 404 && g0.json.error === "not_found");

  const stateV1 = { cars: [{ id: "c1", name: "MP11" }], note: "kit baseline" };
  const p1 = await backupBlobPut(c, req("PUT", { token: "tok-A", query: { domain: "garage" }, body: { format: 3, state: stateV1 } }));
  check("put: first write (no base) -> 200 updated_at=now", p1.status === 200 && p1.json.domain === "garage" && p1.json.updated_at === NOW);
  check("put: response carries server_time", p1.json.server_time === NOW);

  const g1 = await backupBlobGet(c, req("GET", { token: "tok-A", query: { domain: "garage" } }));
  check("get: round-trips format + updated_at", g1.status === 200 && g1.json.format === 3 && g1.json.updated_at === NOW);
  check("get: state stored VERBATIM (opaque, D11)", JSON.stringify(g1.json.state) === JSON.stringify(stateV1));
  check("get: carries server_time", g1.json.server_time === NOW);

  // state may be any JSON value: array, primitive, null
  await backupBlobPut(c, req("PUT", { token: "tok-A", query: { domain: "tracks" }, body: { format: 1, state: [1, 2, 3] } }));
  const gArr = await backupBlobGet(c, req("GET", { token: "tok-A", query: { domain: "tracks" } }));
  check("put/get: array state round-trips", JSON.stringify(gArr.json.state) === JSON.stringify([1, 2, 3]));
  await backupBlobPut(c, req("PUT", { token: "tok-A", query: { domain: "logbook" }, body: { format: 0, state: null } }));
  const gNull = await backupBlobGet(c, req("GET", { token: "tok-A", query: { domain: "logbook" } }));
  check("put/get: explicit null state round-trips (present, not missing)", gNull.status === 200 && gNull.json.state === null && gNull.json.format === 0);
}

// ═══ optimistic concurrency ══════════════════════════════════════════════════

console.log("\n— optimistic concurrency —");
{
  store = new FakeBlobStore();
  const c = ctxWith(store, () => nowIso);

  // write v1 at NOW
  nowIso = NOW;
  const p1 = await backupBlobPut(c, req("PUT", { token: "tok-A", query: { domain: "garage" }, body: { format: 1, state: { v: 1 } } }));
  check("oc: initial write ok", p1.status === 200 && p1.json.updated_at === NOW);

  // second device PUTs with NO base while a row exists -> conflict (would clobber)
  const pBlind = await backupBlobPut(c, req("PUT", { token: "tok-A", query: { domain: "garage" }, body: { format: 1, state: { v: "blind" } } }));
  check("oc: existing row + no base -> 409 server_newer", pBlind.status === 409 && pBlind.json.error === "server_newer" && pBlind.json.current_updated_at === NOW);
  check("oc: 409 carries server_time", pBlind.json.server_time === nowIso);

  // PUT with the CORRECT base -> succeeds, bumps updated_at to new now
  nowIso = LATER;
  const p2 = await backupBlobPut(c, req("PUT", { token: "tok-A", query: { domain: "garage" }, body: { format: 2, state: { v: 2 }, base_updated_at: NOW } }));
  check("oc: correct base -> 200, updated_at advances to now", p2.status === 200 && p2.json.updated_at === LATER);

  // a STALE base (the old NOW, now superseded by LATER) -> 409 with current
  const pStale = await backupBlobPut(c, req("PUT", { token: "tok-A", query: { domain: "garage" }, body: { format: 3, state: { v: 3 }, base_updated_at: NOW } }));
  check("oc: stale base -> 409 server_newer with current cursor", pStale.status === 409 && pStale.json.error === "server_newer" && pStale.json.current_updated_at === LATER);

  // and the stale write did NOT take effect
  const gAfter = await backupBlobGet(c, req("GET", { token: "tok-A", query: { domain: "garage" } }));
  check("oc: rejected write left the row unchanged", gAfter.json.format === 2 && JSON.stringify(gAfter.json.state) === JSON.stringify({ v: 2 }));

  // IDEMPOTENT: same base re-applied (client retry after lost ack) -> set, ok.
  // base = LATER matches current; the put rewrites identically and stays ok.
  const pIdem = await backupBlobPut(c, req("PUT", { token: "tok-A", query: { domain: "garage" }, body: { format: 2, state: { v: 2 }, base_updated_at: LATER } }));
  check("oc: same-base retry is idempotent 200 (not a conflict)", pIdem.status === 200 && pIdem.json.updated_at === LATER);

  // first-write with a base_updated_at but NO existing row -> treated as create, ok
  store2: {
    const s = new FakeBlobStore();
    const c2 = ctxWith(s, () => NOW);
    const pFirstWithBase = await backupBlobPut(c2, req("PUT", { token: "tok-A", query: { domain: "tracks" }, body: { format: 1, state: {}, base_updated_at: "2026-01-01T00:00:00.000Z" } }));
    check("oc: base sent but no row -> create succeeds 200", pFirstWithBase.status === 200);
    break store2;
  }
}

// ═══ owner-scoping / IDOR ════════════════════════════════════════════════════

console.log("\n— owner-scoping (IDOR) —");
{
  store = new FakeBlobStore();
  const c = ctxWith(store, () => NOW);

  await backupBlobPut(c, req("PUT", { token: "tok-A", query: { domain: "garage" }, body: { format: 1, state: { owner: "A" } } }));
  await backupBlobPut(c, req("PUT", { token: "tok-B", query: { domain: "garage" }, body: { format: 1, state: { owner: "B" } } }));

  const gA = await backupBlobGet(c, req("GET", { token: "tok-A", query: { domain: "garage" } }));
  const gB = await backupBlobGet(c, req("GET", { token: "tok-B", query: { domain: "garage" } }));
  check("idor: A reads A's blob only", (gA.json.state as { owner?: string }).owner === "A");
  check("idor: B reads B's blob only (same domain, isolated row)", (gB.json.state as { owner?: string }).owner === "B");

  // B writing 'garage' must never touch A's row (no body-supplied user id exists)
  await backupBlobPut(c, req("PUT", { token: "tok-B", query: { domain: "garage" }, body: { format: 9, state: { owner: "B2" }, base_updated_at: NOW } }));
  const gAAfter = await backupBlobGet(c, req("GET", { token: "tok-A", query: { domain: "garage" } }));
  check("idor: B's write left A's blob untouched", (gAAfter.json.state as { owner?: string }).owner === "A" && gAAfter.json.format === 1);

  // C (a user with no rows) sees nothing under any domain
  const gC = await backupBlobGet(ctxWith(store, () => NOW), req("GET", { token: "tok-A", query: { domain: "reports" } }));
  check("idor: domain with no row for this user -> 404", gC.status === 404);
}

// ═══ bad input (400) ═════════════════════════════════════════════════════════

console.log("\n— bad input —");
{
  const c = ctxWith(new FakeBlobStore(), () => NOW);
  const base = { token: "tok-A", query: { domain: "garage" } };

  const bNonObj = await backupBlobPut(c, req("PUT", { ...base, body: "string-body" }));
  check("bad: non-object body -> 400", bNonObj.status === 400 && bNonObj.json.error === "bad_request");
  const bArr = await backupBlobPut(c, req("PUT", { ...base, body: [1, 2] }));
  check("bad: array body -> 400", bArr.status === 400);
  const bNull = await backupBlobPut(c, req("PUT", { ...base, body: null }));
  check("bad: null body -> 400", bNull.status === 400);
  const bNoFormat = await backupBlobPut(c, req("PUT", { ...base, body: { state: {} } }));
  check("bad: missing format -> 400", bNoFormat.status === 400);
  const bFloatFormat = await backupBlobPut(c, req("PUT", { ...base, body: { format: 1.5, state: {} } }));
  check("bad: non-integer format -> 400", bFloatFormat.status === 400);
  const bStrFormat = await backupBlobPut(c, req("PUT", { ...base, body: { format: "1", state: {} } }));
  check("bad: string format -> 400", bStrFormat.status === 400);
  const bNoState = await backupBlobPut(c, req("PUT", { ...base, body: { format: 1 } }));
  check("bad: missing state key -> 400", bNoState.status === 400);
  const bBadBase = await backupBlobPut(c, req("PUT", { ...base, body: { format: 1, state: {}, base_updated_at: "not-a-date" } }));
  check("bad: unparseable base_updated_at -> 400", bBadBase.status === 400);
  const bNumBase = await backupBlobPut(c, req("PUT", { ...base, body: { format: 1, state: {}, base_updated_at: 12345 } }));
  check("bad: numeric base_updated_at -> 400", bNumBase.status === 400);

  // format=0 and explicit-null base_updated_at are VALID (edges, not errors)
  const okZero = await backupBlobPut(c, req("PUT", { ...base, body: { format: 0, state: {}, base_updated_at: null } }));
  check("edge: format 0 + null base -> 200 (treated as no base)", okZero.status === 200);
}

// ═══ verdict ═════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nBACKUP-BLOB: all checks passed" : `\nBACKUP-BLOB: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
