/**
 * contentStore SQL contract test — pins the EXACT SQL the real store issues
 * against a RECORDING QueryFn (capture {sql, params}, return canned rows). Style
 * mirrors the recorder in src/test-entitlement.ts. No HTTP, no Postgres.
 * Run: npx tsx src/test-contentSql.ts
 *
 * Why this exists: latest() MUST be MONOTONIC (served = MAX(version)); a dropped
 * ORDER BY ... DESC / LIMIT 1, a wrong table, or a missing name predicate would
 * let a downgrade be served. These assertions pin the SQL boundary plus the
 * pg-TEXT -> ISO normalization of published_at.
 */

import type { QueryFn } from "./db";
import { makeSqlContentStore } from "./stores/contentStore";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

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

// ═══ latest: table / columns / monotonic ordering / name predicate ════════════

console.log("— latest —");
{
  const { query, calls } = recorder((sql) =>
    /from\s+content_versions/i.test(sql)
      ? [{ version: 7, content_hash: "h7", url: "https://cdn/x", published_at: PG_TS }]
      : [],
  );
  const row = await makeSqlContentStore(query).latest("kb");
  const sql = calls[0].sql;

  check("latest: queries content_versions", /\bfrom\s+content_versions\b/i.test(sql), sql);
  check(
    "latest: selects version, content_hash, url, published_at",
    /\bversion\b/i.test(sql) &&
      /\bcontent_hash\b/i.test(sql) &&
      /\burl\b/i.test(sql) &&
      /\bpublished_at\b/i.test(sql),
    sql,
  );
  check("latest: filtered by name = $1", /\bwhere\s+name\s*=\s*\$1\b/i.test(sql), sql);
  check(
    "latest: MONOTONIC — ORDER BY version DESC",
    /\border\s+by\s+version\s+desc\b/i.test(sql),
    sql,
  );
  check("latest: LIMIT 1 (the single MAX row)", /\blimit\s+1\b/i.test(sql), sql);
  check(
    "latest: param[0] bound to the bundle name",
    Array.isArray(calls[0].params) && calls[0].params[0] === "kb",
    JSON.stringify(calls[0].params),
  );
  check("latest: version coerced to number", row !== null && row.version === 7, JSON.stringify(row));
  check("latest: content_hash mapped", row !== null && row.content_hash === "h7");
  check("latest: url mapped", row !== null && row.url === "https://cdn/x");
  check(
    "latest: pg-TEXT published_at normalized to strict ISO",
    row !== null && row.published_at === PG_TS_ISO,
    JSON.stringify(row),
  );
}

// ═══ latest: null published_at -> null (not "null") ═══════════════════════════

console.log("\n— latest: unpublished —");
{
  const { query } = recorder((sql) =>
    /from\s+content_versions/i.test(sql)
      ? [{ version: 2, content_hash: "h2", url: "u", published_at: null }]
      : [],
  );
  const row = await makeSqlContentStore(query).latest("rcdata");
  check("latest: null published_at maps to null (draft row)", row !== null && row.published_at === null, JSON.stringify(row));
}

// ═══ latest: name param scopes the correct bundle ══════════════════════════════

console.log("\n— latest: name binding —");
{
  const { query, calls } = recorder(() => []);
  await makeSqlContentStore(query).latest("rcdata");
  check(
    "latest: rcdata bundle binds param[0]='rcdata'",
    Array.isArray(calls[0].params) && calls[0].params[0] === "rcdata",
    JSON.stringify(calls[0].params),
  );
}

// ═══ latest: no row -> null (nothing published) ═══════════════════════════════

console.log("\n— latest: miss —");
{
  const { query } = recorder(() => []);
  const row = await makeSqlContentStore(query).latest("kb");
  check("latest: no published row -> null", row === null);
}

// ═══ verdict ═════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nCONTENT_SQL: all checks passed" : `\nCONTENT_SQL: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
