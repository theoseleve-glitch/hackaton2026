/**
 * mediaStore SQL CONTRACT test — pins the exact SQL makeSqlMediaStore emits
 * against a RECORDING QueryFn (mirrors the SQL-reader block of
 * src/test-entitlement.ts). No HTTP, no Postgres, no handler.
 *
 * The load-bearing invariant here is the ATOMIC QUOTA GATE: tryRecord must be
 * ONE conditional `INSERT ... SELECT ... WHERE (SUM(bytes)+bytes) <= quota`
 * with `ON CONFLICT (media_id) DO NOTHING`, so two concurrent callers can never
 * both overshoot QUOTA and a duplicate media_id is an idempotent no-op. A
 * refactor that splits this into a read-then-write (re-introducing the TOCTOU
 * window) MUST fail here.
 *
 * Run: npx tsx src/test-mediaStoreSql.ts
 */

import type { QueryFn } from "./db";
import { makeSqlMediaStore } from "./stores/mediaStore";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

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

// ═══ tryRecord: ONE atomic conditional INSERT (the quota gate) ═══════════════
console.log("— tryRecord: atomic conditional INSERT —");
{
  // reply with one row -> the insert landed (quota had room)
  const { calls, query } = recorder(() => ({ rows: [{ media_id: "m-1" }] }));
  const store = makeSqlMediaStore(query);
  const ok = await store.tryRecord("user_A", "m-1", "image/jpeg", 1000, 100_000, AT);
  const sql = norm(calls[0].sql);
  const params = calls[0].params as readonly unknown[];

  check("tryRecord: issues EXACTLY ONE query (no read-then-write TOCTOU)", calls.length === 1, `${calls.length} calls`);
  check("tryRecord: targets media table", /\binsert\s+into\s+media\b/i.test(sql), sql);
  check(
    "tryRecord: writes media_id,user_id,mime,bytes,created_at columns",
    /media\s*\(\s*media_id\s*,\s*user_id\s*,\s*mime\s*,\s*bytes\s*,\s*created_at\s*\)/i.test(sql),
    sql,
  );
  check("tryRecord: is INSERT ... SELECT (conditional), not INSERT ... VALUES", /\binsert\s+into\s+media\b[\s\S]*\bselect\b/i.test(sql) && !/\bvalues\b/i.test(sql), sql);
  // the atomic gate: SUM(bytes) of THIS user's committed rows + new bytes <= quota
  check(
    "tryRecord: gate re-sums committed bytes for THIS owner (WHERE SUM(media WHERE user_id=$2))",
    /coalesce\s*\(\s*sum\s*\(\s*bytes\s*\)\s*,\s*0\s*\)\s+from\s+media\s+where\s+user_id\s*=\s*\$2/i.test(sql),
    sql,
  );
  check(
    "tryRecord: gate is (SUM + bytes) <= quota, evaluated INSIDE the insert (atomic, no race window)",
    /\)\s*\+\s*\$4::bigint\s*<=\s*\$5::bigint/i.test(sql),
    sql,
  );
  check(
    "tryRecord: idempotent on duplicate media_id (ON CONFLICT (media_id) DO NOTHING)",
    /on\s+conflict\s*\(\s*media_id\s*\)\s+do\s+nothing/i.test(sql),
    sql,
  );
  check("tryRecord: RETURNING media_id (row presence = inserted)", /returning\s+media_id/i.test(sql), sql);
  check("tryRecord: bytes & quota are ::bigint-cast (no JS-int overflow on quota math)", /\$4::bigint/i.test(sql) && /\$5::bigint/i.test(sql), sql);
  check("tryRecord: created_at param is ::timestamptz-cast", /\$6::timestamptz/i.test(sql), sql);
  check(
    "tryRecord: params bound in order [mediaId,userId,mime,bytes,quota,atIso]",
    params[0] === "m-1" && params[1] === "user_A" && params[2] === "image/jpeg" && params[3] === 1000 && params[4] === 100_000 && params[5] === AT,
    JSON.stringify(params),
  );
  check("tryRecord: returns true when a row came back (reserved)", ok === true);
}

// ── tryRecord: zero rows back -> false (gate failed OR duplicate) ─────────────
{
  const { query } = recorder(() => ({ rows: [] }));
  const out = await makeSqlMediaStore(query).tryRecord("user_A", "m-2", "image/png", 999_999, 100_000, AT);
  check("tryRecord: zero rows -> false (quota exceeded or duplicate, no overshoot)", out === false);
}

// ── owner-scoping: the gate's SUM is scoped to $2 (the userId), never global ──
{
  const { calls, query } = recorder(() => ({ rows: [{ media_id: "m-3" }] }));
  await makeSqlMediaStore(query).tryRecord("user_B", "m-3", "image/jpeg", 10, 100_000, AT);
  const sql = norm(calls[0].sql);
  // $2 is bound to user_B AND the SUM filters on user_id = $2 -> per-owner quota
  check(
    "tryRecord: quota SUM is per-OWNER (user_B sees only their own bytes)",
    /from\s+media\s+where\s+user_id\s*=\s*\$2/i.test(sql) && (calls[0].params as unknown[])[1] === "user_B",
    sql,
  );
}

// ═══ verdict ═════════════════════════════════════════════════════════════════
console.log(failures === 0 ? "\nMEDIA-STORE-SQL: all checks passed" : `\nMEDIA-STORE-SQL: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
