/**
 * App-layer runtime config (non-secret). Kept tiny and dependency-light so it
 * can be imported from anywhere (providers, screens) without pulling RN.
 */

import { DEFAULT_API_BASE } from "@racelab/account";

/**
 * DORMANT on the IAP billing rail. Billing now goes through RevenueCat /
 * Google Play Billing (src/iap.ts) — Clerk + the web subscribe URL + the
 * server `validateSubscription` path are no longer used for billing. These
 * constants stay on disk (not wired) so re-enabling the web rail later is a
 * config flip, not a rewrite.
 *
 * Clerk publishable key. EMPTY = in-app sign-in is OFF (the app runs fully
 * anonymous). Unused on the IAP rail; see src/auth.tsx for how to flip Clerk on.
 */
export const CLERK_PUBLISHABLE_KEY = "";

/**
 * DORMANT (see above). Base URL for the account/subscription API. No longer on
 * the billing path — entitlements come from RevenueCat, not the server.
 */
export const API_BASE = DEFAULT_API_BASE;

// ── RevenueCat / Google Play Billing (the LIVE billing rail) ─────────────────
// All three are NON-SECRET and safe to ship in the client bundle. Replace the
// REPLACE_ME placeholders at deploy time with the project's real values from
// the RevenueCat dashboard (app.revenuecat.com).

/**
 * RevenueCat Android (Google Play) public API key — a `goog_…` value. Used in
 * EAS dev/release builds. Throws if passed to the SDK inside Expo Go, so iap.ts
 * only uses it on a real Android build (isExpoGo() gates it).
 */
export const RC_GOOGLE_API_KEY = "goog_REPLACE_ME";

/**
 * RevenueCat test/sandbox key — a `test_…`/`rcb_…` value. REQUIRED by Expo Go /
 * web Preview API Mode (a `goog_…`/`appl_…` key throws there).
 */
export const RC_EXPO_GO_TEST_KEY = "test_REPLACE_ME";

/**
 * The RevenueCat ENTITLEMENT identifier that maps to RaceLab Pro. Must match the
 * entitlement id configured in the RevenueCat dashboard (and attached to the
 * monthly + annual products in the "current" offering).
 */
export const RC_ENTITLEMENT_ID = "pro";
