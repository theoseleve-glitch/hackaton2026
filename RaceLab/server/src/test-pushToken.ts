/**
 * push-token endpoints test — handlers exercised directly against an in-memory
 * PushStore fake and a fake token verifier. No HTTP, no Postgres. Assertion
 * style mirrors src/test-server.ts. Run:
 *   npx tsx src/test-pushToken.ts   (from RaceLab/server)
 *
 * Covers: happy path (register + rotate + prefs), auth-required (401),
 * owner-scoping / IDOR (a user can never touch another user's device row),
 * idempotent delete, many-devices-per-user, and bad input (400).
 */

import type { HttpRequest } from "./types";
import type { TokenVerifier } from "./auth";
import type { PushStore, PushPrefs } from "./stores/pushStore";
import {
  registerPushToken,
  unregisterPushToken,
  type PushCtx,
} from "./handlers/pushToken";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

// ── in-memory PushStore fake (same contract as makeSqlPushStore) ─────────────

interface Row {
  token: string;
  prefs: PushPrefs;
  updated_at: string;
}

class FakePushStore implements PushStore {
  // user_id -> (device_id -> row)
  rows = new Map<string, Map<string, Row>>();

  async register(
    userId: string,
    deviceId: string,
    token: string,
    prefs: PushPrefs,
    atIso: string,
  ): Promise<void> {
    let devices = this.rows.get(userId);
    if (devices === undefined) {
      devices = new Map();
      this.rows.set(userId, devices);
    }
    devices.set(deviceId, { token, prefs: { ...prefs }, updated_at: atIso }); // upsert
  }

  async unregister(userId: string, deviceId: string): Promise<void> {
    this.rows.get(userId)?.delete(deviceId); // no-op when absent -> idempotent
  }

  get(userId: string, deviceId: string): Row | undefined {
    return this.rows.get(userId)?.get(deviceId);
  }
  count(userId: string): number {
    return this.rows.get(userId)?.size ?? 0;
  }
}

// ── fixtures ─────────────────────────────────────────────────────────────────

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

let store = new FakePushStore();
let nowIso = NOW;
let ctx: PushCtx = { verifier, now: () => nowIso, store };

function reset(): void {
  store = new FakePushStore();
  nowIso = NOW;
  ctx = { verifier, now: () => nowIso, store };
}

function req(
  method: string,
  opts?: { token?: string; query?: Record<string, string>; body?: unknown },
): HttpRequest {
  return {
    method,
    path: "/api/push/token",
    headers: opts?.token !== undefined ? { authorization: `Bearer ${opts.token}` } : {},
    query: opts?.query ?? {},
    body: opts?.body,
  };
}

// ═══ register: happy path ════════════════════════════════════════════════════

console.log("— register happy path —");
{
  reset();
  const r = await registerPushToken(
    ctx,
    req("POST", { token: "tok-A", body: { device_id: "dev-1", token: "ExpoPush[aaa]" } }),
  );
  check("register: 200 ok", r.status === 200 && r.json.ok === true);
  check("register: carries server_time", r.json.server_time === NOW);
  const row = store.get("user_A", "dev-1");
  check("register: row stored under user_A/dev-1", row?.token === "ExpoPush[aaa]");
  check("register: absent prefs default to {}", row !== undefined && Object.keys(row.prefs).length === 0);

  // with prefs (all 4 supported types)
  const r2 = await registerPushToken(
    ctx,
    req("POST", {
      token: "tok-A",
      body: {
        device_id: "dev-2",
        token: "ExpoPush[bbb]",
        prefs: { speedhive: true, trial: false, social: true, marketing_consent: true },
      },
    }),
  );
  const row2 = store.get("user_A", "dev-2");
  check(
    "register: prefs persisted verbatim",
    r2.status === 200 &&
      row2?.prefs.speedhive === true &&
      row2?.prefs.trial === false &&
      row2?.prefs.social === true &&
      row2?.prefs.marketing_consent === true,
  );

  check("register: many devices per user", store.count("user_A") === 2);
}

// ═══ register: upsert / token rotation ═══════════════════════════════════════

console.log("\n— register upsert (rotation) —");
{
  reset();
  await registerPushToken(
    ctx,
    req("POST", { token: "tok-A", body: { device_id: "dev-1", token: "ExpoPush[old]", prefs: { speedhive: true } } }),
  );
  nowIso = LATER;
  const r = await registerPushToken(
    ctx,
    req("POST", { token: "tok-A", body: { device_id: "dev-1", token: "ExpoPush[new]", prefs: { social: true } } }),
  );
  const row = store.get("user_A", "dev-1");
  check("rotate: same device upserts, not duplicates", r.status === 200 && store.count("user_A") === 1);
  check("rotate: token replaced", row?.token === "ExpoPush[new]");
  check("rotate: prefs replaced wholesale (not merged)", row?.prefs.speedhive === undefined && row?.prefs.social === true);
  check("rotate: updated_at moves to new now", row?.updated_at === LATER);
}

// ═══ auth required (401) ═════════════════════════════════════════════════════

console.log("\n— auth required —");
{
  reset();
  const noTok = await registerPushToken(ctx, req("POST", { body: { device_id: "d", token: "t" } }));
  check("auth: POST without token -> 401", noTok.status === 401 && noTok.json.error === "unauthorized");
  const noTokDel = await unregisterPushToken(ctx, req("DELETE", { body: { device_id: "d" } }));
  check("auth: DELETE without token -> 401", noTokDel.status === 401);

  const badTok = await registerPushToken(ctx, req("POST", { token: "tok-garbage", body: { device_id: "d", token: "t" } }));
  check("auth: unknown token -> 401", badTok.status === 401);
  const throwTok = await registerPushToken(ctx, req("POST", { token: "tok-throws", body: { device_id: "d", token: "t" } }));
  check("auth: throwing verifier -> 401 (not 500)", throwTok.status === 401);

  const noBearer = await registerPushToken(
    ctx,
    { ...req("POST", { body: { device_id: "d", token: "t" } }), headers: { authorization: "Basic abc" } },
  );
  check("auth: non-Bearer scheme -> 401", noBearer.status === 401);
  check("auth: nothing written without a valid token", store.count("user_A") === 0 && store.count("user_B") === 0);
}

// ═══ owner-scoping / IDOR ════════════════════════════════════════════════════

console.log("\n— owner-scoping / IDOR —");
{
  reset();
  // user_A and user_B both register a device that happens to share a device_id
  await registerPushToken(ctx, req("POST", { token: "tok-A", body: { device_id: "shared-dev", token: "A-token" } }));
  await registerPushToken(ctx, req("POST", { token: "tok-B", body: { device_id: "shared-dev", token: "B-token" } }));
  check("idor: same device_id under two users -> two distinct rows", store.get("user_A", "shared-dev")?.token === "A-token" && store.get("user_B", "shared-dev")?.token === "B-token");

  // user_B deletes "shared-dev": must only remove B's row, A's stays
  const del = await unregisterPushToken(ctx, req("DELETE", { token: "tok-B", body: { device_id: "shared-dev" } }));
  check("idor: B deleting shared device_id removes ONLY B's row", del.status === 200 && store.get("user_A", "shared-dev")?.token === "A-token" && store.get("user_B", "shared-dev") === undefined);

  // user_B registers, then A re-registers the same device_id: B's row is untouched
  await registerPushToken(ctx, req("POST", { token: "tok-B", body: { device_id: "shared-dev", token: "B-token-2" } }));
  await registerPushToken(ctx, req("POST", { token: "tok-A", body: { device_id: "shared-dev", token: "A-token-2" } }));
  check("idor: A re-register cannot overwrite B's row", store.get("user_A", "shared-dev")?.token === "A-token-2" && store.get("user_B", "shared-dev")?.token === "B-token-2");
}

// ═══ delete: idempotent + query fallback ═════════════════════════════════════

console.log("\n— delete idempotent —");
{
  reset();
  await registerPushToken(ctx, req("POST", { token: "tok-A", body: { device_id: "dev-1", token: "t" } }));

  const d1 = await unregisterPushToken(ctx, req("DELETE", { token: "tok-A", body: { device_id: "dev-1" } }));
  check("delete: 200 ok", d1.status === 200 && d1.json.ok === true && d1.json.server_time === NOW);
  check("delete: row gone", store.get("user_A", "dev-1") === undefined);

  const d2 = await unregisterPushToken(ctx, req("DELETE", { token: "tok-A", body: { device_id: "dev-1" } }));
  check("delete: re-delete is idempotent 200", d2.status === 200 && d2.json.ok === true);

  const dNever = await unregisterPushToken(ctx, req("DELETE", { token: "tok-A", body: { device_id: "never-existed" } }));
  check("delete: unknown device -> idempotent 200 (no error)", dNever.status === 200 && dNever.json.ok === true);

  // device_id via query string (DELETE with no body)
  await registerPushToken(ctx, req("POST", { token: "tok-A", body: { device_id: "dev-q", token: "t" } }));
  const dQ = await unregisterPushToken(ctx, req("DELETE", { token: "tok-A", query: { device_id: "dev-q" } }));
  check("delete: device_id read from query string", dQ.status === 200 && store.get("user_A", "dev-q") === undefined);
}

// ═══ bad input (400) ═════════════════════════════════════════════════════════

console.log("\n— bad input —");
{
  reset();
  const cases: Array<[string, unknown]> = [
    ["non-object body", "device_id=d"],
    ["array body", [1, 2]],
    ["null body", null],
    ["missing device_id", { token: "t" }],
    ["empty device_id", { device_id: "   ", token: "t" }],
    ["non-string device_id", { device_id: 123, token: "t" }],
    ["missing token", { device_id: "d" }],
    ["empty token", { device_id: "d", token: "" }],
    ["non-string token", { device_id: "d", token: 5 }],
    ["prefs is array", { device_id: "d", token: "t", prefs: [] }],
    ["prefs is string", { device_id: "d", token: "t", prefs: "yes" }],
    ["prefs.speedhive non-boolean", { device_id: "d", token: "t", prefs: { speedhive: "true" } }],
    ["prefs.marketing_consent non-boolean", { device_id: "d", token: "t", prefs: { marketing_consent: 1 } }],
  ];
  for (const [label, body] of cases) {
    const r = await registerPushToken(ctx, req("POST", { token: "tok-A", body }));
    check(`register 400: ${label}`, r.status === 400 && r.json.error === "bad_request");
  }
  check("register: no bad-input row leaked", store.count("user_A") === 0);

  // null/undefined prefs are allowed (-> {})
  const rNullPrefs = await registerPushToken(ctx, req("POST", { token: "tok-A", body: { device_id: "d", token: "t", prefs: null } }));
  check("register: null prefs accepted -> {}", rNullPrefs.status === 200 && Object.keys(store.get("user_A", "d")!.prefs).length === 0);

  // unknown pref keys are ignored, not rejected (forward compat)
  const rExtra = await registerPushToken(ctx, req("POST", { token: "tok-A", body: { device_id: "d2", token: "t", prefs: { speedhive: true, future_flag: true } } }));
  check("register: unknown pref key ignored (kept types only)", rExtra.status === 200 && store.get("user_A", "d2")?.prefs.speedhive === true && (store.get("user_A", "d2")?.prefs as Record<string, unknown>).future_flag === undefined);

  // DELETE with no device_id anywhere -> 400
  const dNoId = await unregisterPushToken(ctx, req("DELETE", { token: "tok-A" }));
  check("delete 400: no device_id in body or query", dNoId.status === 400 && dNoId.json.error === "bad_request");
  const dEmptyId = await unregisterPushToken(ctx, req("DELETE", { token: "tok-A", query: { device_id: "  " } }));
  check("delete 400: blank device_id", dEmptyId.status === 400 && dEmptyId.json.error === "bad_request");
}

// ═══ verdict ═════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nPUSH: all checks passed" : `\nPUSH: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
