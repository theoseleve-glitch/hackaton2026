/**
 * exportStore SQL CONTRACT test — pins the exact SQL makeSqlExportStore emits
 * against a RECORDING QueryFn (mirrors the SQL-reader block of
 * src/test-entitlement.ts). No HTTP, no Postgres, no handler — this exercises
 * the repository factory directly and asserts table name, columns
 * written/selected, owner-scoping predicates, and parameter binding.
 *
 * These are REGRESSION GUARDS: a future rename of the table/column or a
 * loosening of the (user_id, job_id) ownership predicate must fail here.
 *
 * Run: npx tsx src/test-exportStoreSql.ts
 */

import type { QueryFn } from "./db";
import { makeSqlExportStore } from "./stores/exportStore";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

// ── recording QueryFn: captures every (sql, params) the store issues ──────────
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

// ═══ createJob: INSERT INTO export_jobs ══════════════════════════════════════
console.log("— createJob: INSERT —");
{
  const { calls, query } = recorder(() => ({
    rows: [{ job_id: "exp-abc", status: "pending" }],
  }));
  const store = makeSqlExportStore(query);
  const out = await store.createJob("user_A", AT);
  const sql = norm(calls[0].sql);
  const params = calls[0].params as readonly unknown[];

  check("createJob: targets export_jobs table", /\binsert\s+into\s+export_jobs\b/i.test(sql), sql);
  check(
    "createJob: writes job_id,user_id,status,url,created_at columns",
    /\(\s*job_id\s*,\s*user_id\s*,\s*status\s*,\s*url\s*,\s*created_at\s*\)/i.test(sql),
    sql,
  );
  check("createJob: status hard-coded to 'pending'", /values\s*\(\s*\$1\s*,\s*\$2\s*,\s*'pending'/i.test(sql), sql);
  check("createJob: url hard-coded NULL on create", /'pending'\s*,\s*null\s*,/i.test(sql), sql);
  check("createJob: created_at param is timestamptz-cast", /\$3::timestamptz/i.test(sql), sql);
  check("createJob: RETURNING job_id, status", /returning\s+job_id\s*,\s*status/i.test(sql), sql);
  check(
    "createJob: server-generated job_id param ($1) is 'exp-' prefixed, NOT client-supplied",
    typeof params[0] === "string" && (params[0] as string).startsWith("exp-"),
    String(params[0]),
  );
  check("createJob: owner param ($2) = userId, atIso ($3) = atIso", params[1] === "user_A" && params[2] === AT);
  check("createJob: maps RETURNING row -> {job_id, status:'pending'}", out.job_id === "exp-abc" && out.status === "pending", JSON.stringify(out));
}

// ═══ getJob: owner-scoped SELECT ═════════════════════════════════════════════
console.log("\n— getJob: owner-scoped SELECT —");
{
  const { calls, query } = recorder(() => ({
    rows: [{ status: "ready", url: "https://blob/exp-abc.zip" }],
  }));
  const store = makeSqlExportStore(query);
  const out = await store.getJob("user_A", "exp-abc");
  const sql = norm(calls[0].sql);
  const params = calls[0].params as readonly unknown[];

  check("getJob: selects from export_jobs", /\bfrom\s+export_jobs\b/i.test(sql), sql);
  check("getJob: selects status, url columns", /select\s+status\s*,\s*url\b/i.test(sql), sql);
  check(
    "getJob: OWNER-SCOPED — WHERE user_id = $1 AND job_id = $2 (no IDOR)",
    /where\s+user_id\s*=\s*\$1\s+and\s+job_id\s*=\s*\$2/i.test(sql),
    sql,
  );
  check("getJob: predicate binds (userId, jobId) in order", params[0] === "user_A" && params[1] === "exp-abc");
  check("getJob: maps row -> {status, url}", out !== null && out.status === "ready" && out.url === "https://blob/exp-abc.zip", JSON.stringify(out));
}

// ── getJob: zero rows (foreign or missing job_id) -> null, never a throw ──────
{
  const { query } = recorder(() => ({ rows: [] }));
  const out = await makeSqlExportStore(query).getJob("user_A", "exp-someone-elses");
  check("getJob: zero rows -> null (foreign/missing job_id indistinguishable)", out === null);
}

// ── getJob: null url (worker hasn't readied it) maps to null, not 'null' ──────
{
  const { query } = recorder(() => ({ rows: [{ status: "pending", url: null }] }));
  const out = await makeSqlExportStore(query).getJob("user_A", "exp-pending");
  check("getJob: null url -> null (pending, pre-worker)", out !== null && out.url === null && out.status === "pending", JSON.stringify(out));
}

// ── getJob: undefined url column also maps to null ───────────────────────────
{
  const { query } = recorder(() => ({ rows: [{ status: "pending" }] }));
  const out = await makeSqlExportStore(query).getJob("user_A", "exp-pending");
  check("getJob: missing url column -> null", out !== null && out.url === null);
}

// ═══ verdict ═════════════════════════════════════════════════════════════════
console.log(failures === 0 ? "\nEXPORT-STORE-SQL: all checks passed" : `\nEXPORT-STORE-SQL: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
