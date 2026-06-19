/**
 * RevenueCat (Google Play Billing) IAP boundary — the ONLY file in the app that
 * imports `react-native-purchases`. Everything else (entitlements.tsx, Paywall,
 * Settings) talks to this thin, never-throw surface.
 *
 * D18 invariants honored here:
 *  - configureIap() is idempotent and SAFE in Expo Go: react-native-purchases
 *    runs in "Preview API Mode" inside Expo Go (it auto-mocks the native calls),
 *    so importing + configuring never crashes the JS bundle. Real purchases need
 *    an EAS dev/release build, but the app must still boot and be usable here.
 *  - App launch is NEVER gated on RevenueCat: configureIap() is fire-and-forget
 *    and every read (readEntitlement/restore) catches → a benign
 *    {active:false, expires_at:null}. The cached AccountState (never this file)
 *    is the source of truth for entitlement decisions.
 *  - Only purchasePlan surfaces a non-entitlement outcome ({cancelled:true});
 *    every other boundary function resolves to an Entitlement, never rejects.
 *
 * The RevenueCat ENTITLEMENT identifier ("pro") and API keys live in config.ts.
 */

import Purchases from "react-native-purchases";
// isExpoGo lives in the package's utils/environment module; react-native-purchases
// 10.x does NOT re-export it from the package root, so we deep-import it. In Expo
// Go this returns true and Purchases is in Preview API Mode (mocked natives).
import { isExpoGo } from "react-native-purchases/dist/utils/environment";
import type {
  CustomerInfo,
  PurchasesEntitlementInfo,
  PurchasesPackage,
} from "react-native-purchases";
import { Platform } from "react-native";
import {
  RC_ENTITLEMENT_ID,
  RC_EXPO_GO_TEST_KEY,
  RC_GOOGLE_API_KEY,
} from "./config";

/** The normalized paid signal this boundary hands back to the app layer. */
export interface Entitlement {
  active: boolean;
  expires_at: string | null;
}

/** A purchase either yields the post-purchase entitlement or is user-cancelled. */
export type PurchaseOutcome = Entitlement | { cancelled: true };

const INACTIVE: Entitlement = { active: false, expires_at: null };

let configured = false;

/**
 * Pick the RevenueCat API key for the current environment.
 *  - Expo Go / web: the Preview-Mode SDK REQUIRES a `test_…`/`rcb_…` key; passing
 *    a `goog_…`/`appl_…` key throws there. isExpoGo() gates that.
 *  - EAS Android build: the real `goog_…` key.
 *  - any other native target (none ship today): fall back to the test key so
 *    configure can't throw.
 */
function apiKeyForEnv(): string {
  if (isExpoGo()) return RC_EXPO_GO_TEST_KEY;
  return Platform.select({
    android: RC_GOOGLE_API_KEY,
    default: RC_EXPO_GO_TEST_KEY,
  });
}

/** Map a RevenueCat EntitlementInfo (or its absence) to the app's signal. */
function toEntitlement(info: PurchasesEntitlementInfo | undefined): Entitlement {
  if (info === undefined) return INACTIVE;
  return { active: info.isActive, expires_at: info.expirationDate };
}

/** Read the "pro" entitlement out of a CustomerInfo snapshot. */
function entitlementFrom(info: CustomerInfo): Entitlement {
  return toEntitlement(info.entitlements.active[RC_ENTITLEMENT_ID]);
}

/**
 * Configure RevenueCat ONCE. Idempotent and never throws — a failure here (e.g.
 * a missing/placeholder key) must not block launch; entitlement reads simply
 * keep returning the inactive default until a real build + key are in place.
 */
export function configureIap(): void {
  if (configured) return;
  try {
    Purchases.configure({ apiKey: apiKeyForEnv() });
    configured = true;
  } catch {
    // never block launch on billing setup (D18). Leave configured=false so a
    // later call can retry once a real key is present.
  }
}

/**
 * Read the current "pro" entitlement from RevenueCat's customer info. Never
 * throws: any failure (Preview Mode, network, unconfigured) → inactive default.
 */
export async function readEntitlement(): Promise<Entitlement> {
  try {
    const info = await Purchases.getCustomerInfo();
    return entitlementFrom(info);
  } catch {
    return INACTIVE;
  }
}

/**
 * Present the native purchase sheet for the monthly/annual package. Returns the
 * post-purchase entitlement on success, `{cancelled:true}` if the user backed
 * out, or the inactive default on any other failure (never throws).
 */
export async function purchasePlan(plan: "monthly" | "annual"): Promise<PurchaseOutcome> {
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    const pkg: PurchasesPackage | null =
      (plan === "monthly" ? current?.monthly : current?.annual) ??
      pickFromAvailable(current?.availablePackages, plan);
    if (pkg === null || pkg === undefined) return INACTIVE; // no offering configured
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return entitlementFrom(customerInfo);
  } catch (e) {
    if (isUserCancelled(e)) return { cancelled: true };
    return INACTIVE;
  }
}

/** Restore prior purchases and return the resulting "pro" entitlement. Never throws. */
export async function restore(): Promise<Entitlement> {
  try {
    const info = await Purchases.restorePurchases();
    return entitlementFrom(info);
  } catch {
    return INACTIVE;
  }
}

/**
 * Subscribe to RevenueCat customer-info pushes (renewals, restores, expiries
 * from another device). Returns an unsubscribe fn. Safe in Expo Go.
 */
export function onEntitlementChange(cb: (e: Entitlement) => void): () => void {
  const listener = (info: CustomerInfo) => cb(entitlementFrom(info));
  try {
    Purchases.addCustomerInfoUpdateListener(listener);
  } catch {
    return () => {};
  }
  return () => {
    try {
      Purchases.removeCustomerInfoUpdateListener(listener);
    } catch {
      // ignore — nothing to clean up
    }
  };
}

// ── helpers ────────────────────────────────────────────────────────────────

/** Fallback: scan availablePackages for the right PACKAGE_TYPE when the named
 *  monthly/annual accessor is null (offering uses custom package ids). */
function pickFromAvailable(
  packages: readonly PurchasesPackage[] | undefined,
  plan: "monthly" | "annual",
): PurchasesPackage | null {
  if (packages === undefined) return null;
  const wanted = plan.toUpperCase(); // "MONTHLY" | "ANNUAL" — matches PACKAGE_TYPE
  for (const p of packages) {
    if (String(p.packageType).toUpperCase() === wanted) return p;
  }
  return null;
}

/** Narrow an unknown thrown value to RevenueCat's userCancelled flag. */
function isUserCancelled(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "userCancelled" in e &&
    (e as { userCancelled?: unknown }).userCancelled === true
  );
}
