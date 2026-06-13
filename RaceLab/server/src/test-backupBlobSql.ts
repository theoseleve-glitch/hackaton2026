/**
 * backupBlobStore SQL contract test — pins the EXACT SQL the real store issues
 * against a RECORDING QueryFn (capture {sql, params}, return canned rows). Style
 * mirrors the recorder in src/test-entitlement.ts. No HTTP, no Postgres.
 * Run: npx tsx src/test-backupBlobSql.ts
 *
 * Why this exists: the store is the ONLY place the wire contract for backup
 * blobs touches the database. A silent table/column rename, a dropped
 * owner-scoping predicate (IDOR), a missing ON CONFLICT target, or a non-ISO
 * timestamp on the wire would all pass a handler-level fake — these assertions
 * catch them at the SQL boundary.
 */

import type { QueryFn } from "./db";
import { makeSqlBackupBlobStore } from "./stores/backupBlobStore";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

// pg-TEXT timestamp shape (what neon returns for timestamptz, NOT a JS Date):
//   "2026-06-13 12:00:00+00"  — space separator, "+00" offset, no "T"/"Z".
const PG_TS = "2026-06-13 12:00:00+00";
const PG_TS_ISO = "2026-06-13T12:00:00.000Z";

// ── recorder ──────────────────────────────────────────────────────────────────
type Call = { sql: string; params: readonly unknown[] | undefined };

function recorder(handler: (sql: string) => Record<string, unknown>[]): {
  query: QueryFn;
  calls: Call[];
} {
  const calls: Call[] = [];
  const query: QueryFn = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: handler(sql) };
  };
  return { query, calls };
}

// ═══ get: table / columns / owner-scoping / ISO ════════════════════════════════

console.log("— get —");
{
  const { query, calls } = recorder((sql) =>
    /from\s+backup_blobs/i.test(sql)
      ? [{ format: 3, state: { a: 1 }, updated_at: PG_TS }]
      : [],
  );
  const store = makeSqlBackupBlobStore(query);
  const blob = await store.get("user_A", "garage");
  const sql = calls[0].sql;

  check("get: queries backup_blobs", /\bfrom\s+backup_blobs\b/i.test(sql), sql);
  check("get: selects format column", /\bselect[\s\S]*\bformat\b/i.test(sql), sql);
  check("get: selects state column", /\bstate\b/i.test(sql), sql);
  check("get: selects updated_at column", /\bupdated_at\b/i.test(sql), sql);
  check(
    "get: owner-scoped (WHERE user_id = $1)",
    /\bwhere\s+user_id\s*=\s*\$1\b/i.test(sql),
    sql,
  );
  check("get: also scoped by domain = $2", /\bdomain\s*=\s*\$2\b/i.test(sql), sql);
  check(
    "get: params bind [userId, domain] in order",
    Array.isArray(calls[0].params) &&
      calls[0].params[0] === "user_A" &&
      calls[0].params[1] === "garage",
    JSON.stringify(calls[0].params),
  );
  check(
    "get: pg-TEXT updated_at normalized to strict ISO on the wire",
    blob !== null && blob.updated_at === PG_TS_ISO,
    JSON.stringify(blob),
  );
  check("get: format coerced to number", blob !== null && blob.format === 3, JSON.stringify(blob));
  check("get: state passed through verbatim (opaque, D11)", blob !== null && (blob.state as { a: number }).a === 1);
}

// ═══ get: no row -> null ══════════════════════════════════════════════════════

console.log("\n— get: miss —");
{
  const { query } = recorder(() => []);
  const blob = await makeSqlBackupBlobStore(query).get("user_A", "garage");
  check("get: no row -> null", blob === null);
}

// ═══ put: INSERT...ON CONFLICT target / columns / params ══════════════════════

console.log("\n— put: insert path —");
{
  const { query, calls } = recorder((sql) =>
    /insert\s+into\s+backup_blobs/i.test(sql) ? [{ updated_at: PG_TS }] : [],
  );
  const store = makeSqlBackupBlobStore(query);
  const res = await store.put("user_A", "garage", 4, { x: 9 }, "2026-06-13T12:00:00.000Z", undefined);
  const sql = calls[0].sql;

  check("put: targets backup_blobs", /\binsert\s+into\s+backup_blobs\b/i.test(sql), sql);
  check(
    "put: writes (user_id, domain, format, state, updated_at)",
    /\(\s*user_id\s*,\s*domain\s*,\s*format\s*,\s*state\s*,\s*updated_at\s*\)/i.test(sql),
    sql,
  );
  check(
    "put: ON CONFLICT target is (user_id, domain)",
    /on\s+conflict\s*\(\s*user_id\s*,\s*domain\s*\)/i.test(sql),
    sql,
  );
  check("put: DO UPDATE (conditional upsert)", /do\s+update/i.test(sql), sql);
  check("put: RETURNING updated_at", /\breturning\s+updated_at\b/i.test(sql), sql);
  check(
    "put: param[0]=userId, param[1]=domain (owner-scoped write)",
    Array.isArray(calls[0].params) &&
      calls[0].params[0] === "user_A" &&
      calls[0].params[1] === "garage",
    JSON.stringify(calls[0].params),
  );
  check(
    "put: state is JSON.stringified into params (param[3])",
    Array.isArray(calls[0].params) && calls[0].params[3] === JSON.stringify({ x: 9 }),
    String(calls[0].params?.[3]),
  );
  check(
    "put: pg-TEXT RETURNING updated_at normalized to ISO",
    res.ok === true && res.updated_at === PG_TS_ISO,
    JSON.stringify(res),
  );
}

// ═══ put: conflict path -> reads back current cursor, ISO-normalized ══════════

console.log("\n— put: conflict path —");
{
  // INSERT...ON CONFLICT returns zero rows (guard failed); store re-reads cursor.
  const { query, calls } = recorder((sql) =>
    /insert\s+into\s+backup_blobs/i.test(sql)
      ? [] // upsert no-op -> conflict
      : /select\s+updated_at\s+from\s+backup_blobs/i.test(sql)
        ? [{ updated_at: PG_TS }]
        : [],
  );
  const store = makeSqlBackupBlobStore(query);
  const res = await store.put("user_A", "garage", 4, { x: 9 }, "2026-06-13T12:00:00.000Z", "2020-01-01T00:00:00.000Z");

  check("put: conflict -> ok:false reason conflict", res.ok === false && res.reason === "conflict");
  check(
    "put: conflict re-read is owner+domain scoped",
    /\bwhere\s+user_id\s*=\s*\$1\s+and\s+domain\s*=\s*\$2\b/i.test(calls[1].sql),
    calls[1].sql,
  );
  check(
    "put: conflict current_updated_at normalized to ISO from pg-TEXT",
    res.ok === false && res.current_updated_at === PG_TS_ISO,
    JSON.stringify(res),
  );
}

// ═══ verdict ═════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nBACKUP_BLOB_SQL: all checks passed" : `\nBACKUP_BLOB_SQL: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
