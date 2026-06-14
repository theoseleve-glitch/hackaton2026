/**
 * pushStore SQL CONTRACT test — pins the exact SQL makeSqlPushStore emits
 * against a RECORDING QueryFn (mirrors the SQL-reader block of
 * src/test-entitlement.ts). No HTTP, no Postgres, no handler.
 *
 * Guards:
 *  - register is an UPSERT on the (user_id, device_id) composite key — a device
 *    re-register rotates token + replaces prefs, never inserts a duplicate.
 *  - prefs is serialized to JSON and ::jsonb-cast.
 *  - unregister is OWNER-SCOPED (WHERE user_id = $1 AND device_id = $2) so one
 *    user can never delete another user's device row (no IDOR). A drop of the
 *    user_id predicate MUST fail here.
 *
 * Run: npx tsx src/test-pushStoreSql.ts
 */

import type { QueryFn } from "./db";
import { makeSqlPushStore } from "./stores/pushStore";
import type { PushPrefs } from "./stores/pushStore";

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

// ═══ register: UPSERT on (user_id, device_id) ════════════════════════════════
console.log("— register: composite UPSERT —");
{
  const { calls, query } = recorder(() => ({ rows: [] }));
  const store = makeSqlPushStore(query);
  const prefs: PushPrefs = { speedhive: true, trial: false, marketing_consent: true };
  await store.register("user_A", "dev-1", "ExpoTok[xyz]", prefs, AT);
  const sql = norm(calls[0].sql);
  const params = calls[0].params as readonly unknown[];

  check("register: targets push_tokens table", /insert\s+into\s+push_tokens/i.test(sql), sql);
  check(
    "register: writes (user_id, device_id, token, prefs, updated_at)",
    /\(\s*user_id\s*,\s*device_id\s*,\s*token\s*,\s*prefs\s*,\s*updated_at\s*\)/i.test(sql),
    sql,
  );
  check("register: prefs param is ::jsonb-cast", /\$4::jsonb/i.test(sql), sql);
  check("register: updated_at param is ::timestamptz-cast", /\$5::timestamptz/i.test(sql), sql);
  check(
    "register: UPSERT on the COMPOSITE key — ON CONFLICT (user_id, device_id) DO UPDATE",
    /on\s+conflict\s*\(\s*user_id\s*,\s*device_id\s*\)\s+do\s+update/i.test(sql),
    sql,
  );
  check(
    "register: re-register ROTATES token + REPLACES prefs + bumps updated_at from EXCLUDED",
    /set\s+token\s*=\s*excluded\.token/i.test(sql) &&
      /prefs\s*=\s*excluded\.prefs/i.test(sql) &&
      /updated_at\s*=\s*excluded\.updated_at/i.test(sql),
    sql,
  );
  check(
    "register: params bound in order [userId, deviceId, token, JSON(prefs), atIso]",
    params[0] === "user_A" && params[1] === "dev-1" && params[2] === "ExpoTok[xyz]" && params[4] === AT,
    JSON.stringify(params),
  );
  check(
    "register: prefs param[3] is JSON.stringify(prefs) (not the raw object)",
    typeof params[3] === "string" && JSON.stringify(JSON.parse(params[3] as string)) === JSON.stringify(prefs),
    String(params[3]),
  );
}

// ═══ unregister: owner-scoped delete (no IDOR) ═══════════════════════════════
console.log("\n— unregister: owner-scoped delete —");
{
  const { calls, query } = recorder(() => ({ rows: [] }));
  await makeSqlPushStore(query).unregister("user_A", "dev-1");
  const sql = norm(calls[0].sql);
  const params = calls[0].params as readonly unknown[];

  check("unregister: deletes from push_tokens", /delete\s+from\s+push_tokens/i.test(sql), sql);
  check(
    "unregister: OWNER-SCOPED — WHERE user_id = $1 AND device_id = $2 (cross-user delete impossible)",
    /where\s+user_id\s*=\s*\$1\s+and\s+device_id\s*=\s*\$2/i.test(sql),
    sql,
  );
  check(
    "unregister: predicate carries BOTH owner and device (not device_id alone -> no IDOR)",
    /\buser_id\s*=\s*\$1\b/i.test(sql) && /\bdevice_id\s*=\s*\$2\b/i.test(sql),
    sql,
  );
  check("unregister: binds [userId, deviceId] in order", params[0] === "user_A" && params[1] === "dev-1");
  check("unregister: issues exactly one query (idempotent delete, no read-back)", calls.length === 1, `${calls.length} calls`);
}

// ═══ verdict ═════════════════════════════════════════════════════════════════
console.log(failures === 0 ? "\nPUSH-STORE-SQL: all checks passed" : `\nPUSH-STORE-SQL: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
