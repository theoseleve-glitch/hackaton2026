/**
 * GDPR data-export module test — POST/GET /api/me/export exercised directly
 * against an in-memory ExportStore fake + a fake token verifier. No HTTP, no
 * Postgres. Harness style mirrors src/test-server.ts.
 *
 * Run: npx tsx src/test-export.ts   (from server/)
 *
 * Covers: happy path (create -> 202 pending; status pending/ready/failed),
 * auth-required (401 on both verbs), owner-scoping/IDOR (a job_id from user B
 * is a 404 for user A — never B's url), bad input (400 missing job_id), and
 * the missing-job 404.
 */

import type { TokenVerifier } from "./auth";
import type { HttpRequest } from "./types";
import {
  dataExportCreate,
  dataExportStatus,
  type ExportCtx,
} from "./handlers/dataExport";
import type { ExportJobStatus, ExportStore } from "./stores/exportStore";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

// ── in-memory ExportStore fake (same contract as makeSqlExportStore) ─────────

interface FakeJobRow {
  user_id: string;
  status: ExportJobStatus;
  url: string | null;
}

class FakeExportStore implements ExportStore {
  jobs = new Map<string, FakeJobRow>(); // job_id -> row
  private counter = 0;

  async createJob(userId: string, _atIso: string): Promise<{ job_id: string; status: "pending" }> {
    this.counter++;
    const job_id = `exp-${this.counter}`;
    this.jobs.set(job_id, { user_id: userId, status: "pending", url: null });
    return { job_id, status: "pending" };
  }

  async getJob(
    userId: string,
    jobId: string,
  ): Promise<{ status: ExportJobStatus; url: string | null } | null> {
    const row = this.jobs.get(jobId);
    // owner-scoped: a row that exists but belongs to someone else is invisible
    if (row === undefined || row.user_id !== userId) return null;
    return { status: row.status, url: row.url };
  }

  /** test-only: simulate the out-of-band worker readying / failing a job. */
  _setWorkerResult(jobId: string, status: ExportJobStatus, url: string | null): void {
    const row = this.jobs.get(jobId);
    if (row !== undefined) {
      row.status = status;
      row.url = url;
    }
  }
}

// ── fixtures ─────────────────────────────────────────────────────────────────

const NOW = "2026-06-13T12:00:00.000Z";

const verifier: TokenVerifier = {
  verify: async (token) => {
    if (token === "tok-A") return { user_id: "user_A" };
    if (token === "tok-B") return { user_id: "user_B" };
    if (token === "tok-throws") throw new Error("verifier exploded");
    return null;
  },
};

const store = new FakeExportStore();
const ctx: ExportCtx = { verifier, now: () => NOW, store };

function req(
  method: string,
  opts?: { token?: string; query?: Record<string, string> },
): HttpRequest {
  return {
    method,
    path: "/api/me/export",
    headers: opts?.token !== undefined ? { authorization: `Bearer ${opts.token}` } : {},
    query: opts?.query ?? {},
    body: undefined,
  };
}

// ═══ auth required ════════════════════════════════════════════════════════════

console.log("— auth —");
{
  const cNoTok = await dataExportCreate(ctx, req("POST"));
  check("auth: POST without token -> 401", cNoTok.status === 401 && cNoTok.json.error === "unauthorized");
  const sNoTok = await dataExportStatus(ctx, req("GET", { query: { job_id: "exp-1" } }));
  check("auth: GET without token -> 401", sNoTok.status === 401 && sNoTok.json.error === "unauthorized");

  const cBadTok = await dataExportCreate(ctx, req("POST", { token: "tok-garbage" }));
  check("auth: unknown token -> 401", cBadTok.status === 401);
  const cThrow = await dataExportCreate(ctx, req("POST", { token: "tok-throws" }));
  check("auth: throwing verifier -> 401 (not 500)", cThrow.status === 401);
  const cBasic = await dataExportCreate(
    { ...ctx },
    { ...req("POST"), headers: { authorization: "Basic abc" } },
  );
  check("auth: non-Bearer scheme -> 401", cBasic.status === 401);
}

// ═══ create (happy path) ══════════════════════════════════════════════════════

console.log("\n— create —");
let jobIdA = "";
{
  const c = await dataExportCreate(ctx, req("POST", { token: "tok-A" }));
  jobIdA = c.json.job_id as string;
  check("create: 202 Accepted", c.status === 202);
  check("create: status pending", c.json.status === "pending");
  check("create: returns a job_id", typeof c.json.job_id === "string" && jobIdA !== "");
  check("create: carries server_time", c.json.server_time === NOW);
  check("create: row landed in store as pending", store.jobs.get(jobIdA)?.status === "pending");

  const c2 = await dataExportCreate(ctx, req("POST", { token: "tok-A" }));
  check("create: a second request mints a DISTINCT job_id", c2.json.job_id !== jobIdA);
}

// ═══ status (pending / ready / failed) ════════════════════════════════════════

console.log("\n— status —");
{
  const sPending = await dataExportStatus(ctx, req("GET", { token: "tok-A", query: { job_id: jobIdA } }));
  check("status: pending job -> 200 pending, no url", sPending.status === 200 && sPending.json.status === "pending" && sPending.json.url === undefined);
  check("status: echoes job_id + server_time", sPending.json.job_id === jobIdA && sPending.json.server_time === NOW);

  // worker readies the archive
  store._setWorkerResult(jobIdA, "ready", "https://blob.example/exp/user_A/archive.zip?sig=abc");
  const sReady = await dataExportStatus(ctx, req("GET", { token: "tok-A", query: { job_id: jobIdA } }));
  check("status: ready job -> 200 ready + url", sReady.status === 200 && sReady.json.status === "ready" && sReady.json.url === "https://blob.example/exp/user_A/archive.zip?sig=abc");

  // worker can fail a (different) job
  const fail = await dataExportCreate(ctx, req("POST", { token: "tok-A" }));
  const failId = fail.json.job_id as string;
  store._setWorkerResult(failId, "failed", null);
  const sFailed = await dataExportStatus(ctx, req("GET", { token: "tok-A", query: { job_id: failId } }));
  check("status: failed job -> 200 failed, no url", sFailed.status === 200 && sFailed.json.status === "failed" && sFailed.json.url === undefined);
}

// ═══ owner-scoping / IDOR ═════════════════════════════════════════════════════

console.log("\n— owner-scoping / IDOR —");
{
  // user_B creates a job, then user_A tries to read it by its real id
  const bCreate = await dataExportCreate(ctx, req("POST", { token: "tok-B" }));
  const jobIdB = bCreate.json.job_id as string;
  store._setWorkerResult(jobIdB, "ready", "https://blob.example/exp/user_B/secret.zip?sig=xyz");

  const aReadsB = await dataExportStatus(ctx, req("GET", { token: "tok-A", query: { job_id: jobIdB } }));
  check("IDOR: A reading B's job_id -> 404 (not B's data)", aReadsB.status === 404 && aReadsB.json.error === "not_found");
  check("IDOR: A's 404 leaks no url or status", aReadsB.json.url === undefined && aReadsB.json.status === undefined);

  // B can still read its own job (proves the row exists; A's 404 was scoping)
  const bReadsB = await dataExportStatus(ctx, req("GET", { token: "tok-B", query: { job_id: jobIdB } }));
  check("IDOR: B reading its OWN job -> 200 ready + B's url", bReadsB.status === 200 && bReadsB.json.url === "https://blob.example/exp/user_B/secret.zip?sig=xyz");

  // symmetric: B cannot read A's pending job
  const bReadsA = await dataExportStatus(ctx, req("GET", { token: "tok-B", query: { job_id: jobIdA } }));
  check("IDOR: B reading A's job_id -> 404", bReadsA.status === 404);
}

// ═══ missing job + bad input ══════════════════════════════════════════════════

console.log("\n— missing + bad input —");
{
  const sMissing = await dataExportStatus(ctx, req("GET", { token: "tok-A", query: { job_id: "exp-does-not-exist" } }));
  check("status: unknown job_id -> 404", sMissing.status === 404 && sMissing.json.error === "not_found");

  const sNoParam = await dataExportStatus(ctx, req("GET", { token: "tok-A" }));
  check("status: missing job_id query -> 400 bad_request", sNoParam.status === 400 && sNoParam.json.error === "bad_request");

  const sEmpty = await dataExportStatus(ctx, req("GET", { token: "tok-A", query: { job_id: "" } }));
  check("status: empty job_id -> 400 bad_request", sEmpty.status === 400 && sEmpty.json.error === "bad_request");

  // bad input is checked BEFORE the store is touched (no row reached)
  const sArrayParam = await dataExportStatus(ctx, {
    method: "GET",
    path: "/api/me/export",
    headers: { authorization: "Bearer tok-A" },
    query: { job_id: ["a", "b"] },
    body: undefined,
  });
  check("status: array job_id collapses to first, still resolves (404 here)", sArrayParam.status === 404);
}

// ═══ verdict ═════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nEXPORT: all checks passed" : `\nEXPORT: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
