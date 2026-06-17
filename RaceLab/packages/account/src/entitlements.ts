/**
 * Entitlement checks — schema's pure checkEntitlement, fed by the
 * tamper-guarded clock and the persisted account blob.
 *
 * ── OFFLINE POLICY (the airplane-mode-48h invariant) ─────────────────────────
 *  - FREE features ("advisor" — D18/D20, free forever) are allowed
 *    STRUCTURALLY: canUse returns before touching storage, network, or the
 *    clock, so no storage failure, clock tamper, or dead endpoint can ever
 *    gate them. Local data is never gated at all — entitlements only guard
 *    premium FEATURES, never reads/writes of the user's own data.
 *  - The TRIAL works fully offline: it is pure local state (trial_started_at /
 *    trial_ends_at) evaluated against the guarded clock. No network on the
 *    path.
 *  - A CACHED subscription stays valid offline: the last server-validated
 *    {status, expires_at, validated_at} is trusted until expires_at, then for
 *    GRACE_DAYS (7, schema) more as "grace", then fails closed with
 *    "subscription_expired". Re-validation (validate.ts) is opportunistic,
 *    never required for continued use inside that window.
 *  - Storage failure: premium checks fail CLOSED (evaluated against a fresh
 *    initAccount() → "requires_subscription"); free features are unaffected
 *    (see first bullet). We never throw across the package boundary.
 */

import type { EntitlementResult, Feature } from "../../schema/src/index";
import { FREE_FEATURES, checkEntitlement, initAccount } from "../../schema/src/index";
import type { Clock, KV } from "./deps";
import { loadAccount } from "./deps";
import type { TrialDeps } from "./trial";
import { TrialService, guardedNow } from "./trial";

/** canUse needs only local capabilities — no fetch in the type, so the
 *  no-network-on-this-path property is structural. */
export interface EntitlementDeps {
  store: KV;
  now: Clock;
}

/** The one entitlement gate the app calls. Local-only, never throws. */
export async function canUse(feature: Feature, deps: EntitlementDeps): Promise<EntitlementResult> {
  // free features: no I/O of any kind — cannot be gated by anything
  if (FREE_FEATURES.includes(feature)) return { allowed: true, via: "free" };
  const nowIso = await guardedNow(deps);
  const loaded = await loadAccount(deps.store, nowIso);
  const account = loaded.ok ? loaded.account : initAccount(); // fail closed on store error
  return checkEntitlement(account, feature, nowIso);
}

/**
 * Convenience for the app layer: "the user tapped a premium feature".
 * If the user never had a trial, this STARTS it (the William-decided
 * first-premium-touch moment) and re-checks; otherwise it is exactly canUse.
 */
export async function touchPremiumFeature(feature: Feature, deps: TrialDeps): Promise<EntitlementResult> {
  const first = await canUse(feature, deps);
  if (first.allowed) return first;
  if (first.reason === "requires_subscription") {
    const ensured = await new TrialService(deps).ensureTrialState();
    if (ensured.ok) return canUse(feature, deps);
  }
  return first;
}
