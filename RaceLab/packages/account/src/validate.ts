/**
 * Server-side subscription validation — GET /api/subscription/status, cached
 * into the persisted AccountState so entitlements keep working offline
 * (see entitlements.ts OFFLINE POLICY). Called opportunistically by the app
 * when online (foreground, post-purchase deep-link return, pull-to-refresh);
 * NEVER required on the entitlement path.
 *
 * validated_at semantics (must match schema checkEntitlement's everPaid
 * heuristic): validated_at is PAYMENT EVIDENCE. We stamp it only when the
 * server asserts a paid status ("active" / "expired"-after-payment). A "none"
 * response writes a bare {status:"none"} subscription so a never-paid user
 * whose trial lapses still sees "trial_expired" upsell copy, not a renew
 * prompt for a subscription they never had.
 */

import type { AccountState, IsoDateTime, Subscription } from "../../schema/src/index";
import { deepFreeze } from "../../schema/src/vocab";
import type { Clock, FetchLike, FetchResponseLike, KV } from "./deps";
import { DEFAULT_API_BASE, isRecord, loadAccount, saveAccount } from "./deps";
import { guardedNow, noteServerTime } from "./trial";

export interface ValidateDeps {
  fetchFn: FetchLike;
  store: KV;
  now: Clock;
  apiBase?: string;
}

export type ValidateResult =
  | { ok: true; status: "none" | "active" | "expired"; expires_at?: IsoDateTime; account: AccountState }
  | { ok: false; reason: "network_error" | "unauthorized" | "server_error" | "bad_response" | "store_error" };

export async function validateSubscription(deps: ValidateDeps, token: string): Promise<ValidateResult> {
  const base = (deps.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, "");

  let res: FetchResponseLike;
  try {
    res = await deps.fetchFn(`${base}/api/subscription/status`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, reason: "network_error" };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: "unauthorized" };
  if (!res.ok) return { ok: false, reason: "server_error" };

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: "bad_response" };
  }
  if (!isRecord(body) || typeof body.status !== "string") return { ok: false, reason: "bad_response" };
  if (body.status !== "none" && body.status !== "active" && body.status !== "expired") {
    return { ok: false, reason: "bad_response" };
  }
  const status = body.status;
  let expires_at: IsoDateTime | undefined;
  if (body.expires_at !== undefined) {
    if (typeof body.expires_at !== "string" || Number.isNaN(Date.parse(body.expires_at))) {
      return { ok: false, reason: "bad_response" };
    }
    expires_at = body.expires_at;
  }
  const serverTime =
    typeof body.server_time === "string" && !Number.isNaN(Date.parse(body.server_time))
      ? body.server_time
      : undefined;

  // server time raises the tamper-guard floor before we stamp anything
  if (serverTime !== undefined) await noteServerTime(deps.store, serverTime);
  const nowIso = await guardedNow(deps);

  const loaded = await loadAccount(deps.store, nowIso);
  if (!loaded.ok) return { ok: false, reason: "store_error" };

  // OFFLINE-GRACE GUARD: a transient server "none" (webhook lag, a missing /
  // read-replica row, a brief gap right after renewal) must NOT erase paid
  // evidence or the grace window. If the cached account was EVER paid, keep it
  // untouched — local expiry math (expires_at + GRACE_DAYS in checkEntitlement)
  // flips it to grace/expired deterministically without a destructive write.
  // Only a never-paid account accepts the bare {status:"none"} below.
  if (status === "none") {
    const cached = loaded.account.subscription;
    const everPaid =
      cached.validated_at !== undefined || cached.status === "active" || cached.status === "grace";
    if (everPaid) {
      return { ok: true, status: "none", account: loaded.account };
    }
  }

  const validated_at = serverTime ?? nowIso;
  const subscription: Subscription =
    status === "none"
      ? { status: "none", source: "web" } // no validated_at: not payment evidence
      : {
          status,
          source: "web",
          validated_at,
          ...(expires_at !== undefined ? { expires_at } : {}),
        };
  const next = deepFreeze({ ...loaded.account, subscription });

  const saved = await saveAccount(deps.store, next);
  if (!saved.ok) return { ok: false, reason: "store_error" };

  return { ok: true, status, ...(expires_at !== undefined ? { expires_at } : {}), account: next };
}
