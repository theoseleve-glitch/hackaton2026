/**
 * shareStore SQL contract test — pins the EXACT SQL the real store issues
 * against a RECORDING QueryFn (capture {sql, params}, return canned rows). Style
 * mirrors the recorder in src/test-entitlement.ts. No HTTP, no Postgres.
 * Run: npx tsx src/test-shareSql.ts
 *
 * Why this exists: share is the social surface. A wrong table, a missing
 * ON CONFLICT target (token PK / (token,user_id) idempotency), or leaking
 * owner_user_id-vs-token confusion would all pass a handler-level fake. These
 * assertions pin the SQL boundary, including the pg-TEXT -> ISO normalization
 * of created_at on the public GET.
 */

import type { QueryFn } from "./db";
import { makeSqlShareStore } from "./stores/shareStore";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

// pg-TEXT timestamp shape (neon timestamptz) vs strict ISO.
const PG_TS = "2026-06-13 12:00:00+00";
const PG_TS_ISO = "2026-06-13T12:00:00.000Z";

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

// ═══ create: table / columns / ON CONFLICT (token) / params ════════════════════

console.log("— create —");
{
  const { query, calls } = recorder((sql) =>
    /insert\s+into\s+share_snapshots/i.test(sql) ? [{ token: "s_abc" }] : [],
  );
  const store = makeSqlShareStore(query);
  const res = await store.create("owner_1", "setup", { wing: 3 }, { png_url: "u" }, "2026-06-13T12:00:00.000Z");
  // create now ALSO ensures the users row first (FK safety). Pin that, then read
  // the column/param assertions off the share_snapshots insert specifically.
  check("create: FK-safety — ensures the users row first (INSERT INTO users ON CONFLICT DO NOTHING)", calls.some((c) => /insert\s+into\s+users\b/i.test(c.sql) && /on\s+conflict\s*\(\s*id\s*\)\s+do\s+nothing/i.test(c.sql)));
  const snap = calls.find((c) => /insert\s+into\s+share_snapshots/i.test(c.sql));
  if (snap === undefined) throw new Error("no share_snapshots insert issued");
  const sql = snap.sql;

  check("create: targets share_snapshots", /\binsert\s+into\s+share_snapshots\b/i.test(sql), sql);
  check(
    "create: writes token, owner_user_id, kind, payload, artifacts, forked_from, created_at",
    /\(\s*token\s*,\s*owner_user_id\s*,\s*kind\s*,\s*payload\s*,\s*artifacts\s*,\s*forked_from\s*,\s*created_at\s*\)/i.test(sql),
    sql,
  );
  check(
    "create: ON CONFLICT (token) DO NOTHING (PK collision retry)",
    /on\s+conflict\s*\(\s*token\s*\)\s*do\s+nothing/i.test(sql),
    sql,
  );
  check("create: forked_from inserted NULL at root", /\bnull\b/i.test(sql), sql);
  check("create: RETURNING token", /\breturning\s+token\b/i.test(sql), sql);
  check(
    "create: minted token is the unguessable capability (s_ prefix, 100-bit)",
    /^s_[a-z2-7]{20}$/.test(String(snap.params?.[0])),
    String(snap.params?.[0]),
  );
  check(
    "create: param[1] is owner_user_id (publisher lineage, internal)",
    Array.isArray(snap.params) && snap.params[1] === "owner_1",
    JSON.stringify(snap.params),
  );
  check(
    "create: param[2] is kind",
    Array.isArray(snap.params) && snap.params[2] === "setup",
    String(snap.params?.[2]),
  );
  check(
    "create: payload JSON.stringified (param[3])",
    Array.isArray(snap.params) && snap.params[3] === JSON.stringify({ wing: 3 }),
    String(snap.params?.[3]),
  );
  check(
    "create: artifacts JSON.stringified (param[4])",
    Array.isArray(snap.params) && snap.params[4] === JSON.stringify({ png_url: "u" }),
    String(snap.params?.[4]),
  );
  check("create: returns the persisted token", res.token === "s_abc");
}

// ═══ get: table / columns / token predicate / ISO normalization ════════════════

console.log("\n— get —");
{
  const { query, calls } = recorder((sql) =>
    /from\s+share_snapshots/i.test(sql)
      ? [
          {
            token: "s_abc",
            owner_user_id: "owner_1",
            kind: "track",
            payload: { t: 1 },
            artifacts: { pdf_url: "p" },
            forked_from: null,
            created_at: PG_TS,
          },
        ]
      : [],
  );
  const snap = await makeSqlShareStore(query).get("s_abc");
  const sql = calls[0].sql;

  check("get: queries share_snapshots", /\bfrom\s+share_snapshots\b/i.test(sql), sql);
  check(
    "get: selects token, owner_user_id, kind, payload, artifacts, forked_from, created_at",
    /\btoken\b/i.test(sql) &&
      /\bowner_user_id\b/i.test(sql) &&
      /\bkind\b/i.test(sql) &&
      /\bpayload\b/i.test(sql) &&
      /\bartifacts\b/i.test(sql) &&
      /\bforked_from\b/i.test(sql) &&
      /\bcreated_at\b/i.test(sql),
    sql,
  );
  check("get: keyed by token = $1 (capability lookup)", /\bwhere\s+token\s*=\s*\$1\b/i.test(sql), sql);
  check(
    "get: param[0] bound to the token",
    Array.isArray(calls[0].params) && calls[0].params[0] === "s_abc",
    JSON.stringify(calls[0].params),
  );
  check(
    "get: pg-TEXT created_at normalized to strict ISO",
    snap !== null && snap.created_at === PG_TS_ISO,
    JSON.stringify(snap),
  );
  check("get: forked_from null preserved", snap !== null && snap.forked_from === null);
  check("get: owner_user_id mapped (handler must not leak it on public GET)", snap !== null && snap.owner_user_id === "owner_1");
}

console.log("\n— get: miss —");
{
  const { query } = recorder(() => []);
  const snap = await makeSqlShareStore(query).get("s_nope");
  check("get: unknown token -> null", snap === null);
}

// ═══ recordImport: idempotent (token,user_id) target ═══════════════════════════

console.log("\n— recordImport —");
{
  const { query, calls } = recorder(() => []);
  await makeSqlShareStore(query).recordImport("s_abc", "user_2", "2026-06-13T12:00:00.000Z");
  // recordImport now ensures the importer's users row first (FK safety).
  check("recordImport: FK-safety — ensures the users row first", calls.some((c) => /insert\s+into\s+users\b/i.test(c.sql) && /on\s+conflict\s*\(\s*id\s*\)\s+do\s+nothing/i.test(c.sql)));
  const imp = calls.find((c) => /insert\s+into\s+share_imports/i.test(c.sql));
  if (imp === undefined) throw new Error("no share_imports insert issued");
  const sql = imp.sql;

  check("recordImport: targets share_imports", /\binsert\s+into\s+share_imports\b/i.test(sql), sql);
  check(
    "recordImport: writes (token, user_id, created_at)",
    /\(\s*token\s*,\s*user_id\s*,\s*created_at\s*\)/i.test(sql),
    sql,
  );
  check(
    "recordImport: ON CONFLICT (token, user_id) DO NOTHING (re-import idempotent)",
    /on\s+conflict\s*\(\s*token\s*,\s*user_id\s*\)\s*do\s+nothing/i.test(sql),
    sql,
  );
  check(
    "recordImport: params bind [token, user_id, atIso] in order",
    Array.isArray(imp.params) &&
      imp.params[0] === "s_abc" &&
      imp.params[1] === "user_2" &&
      imp.params[2] === "2026-06-13T12:00:00.000Z",
    JSON.stringify(imp.params),
  );
}

// ═══ verdict ═════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nSHARE_SQL: all checks passed" : `\nSHARE_SQL: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
