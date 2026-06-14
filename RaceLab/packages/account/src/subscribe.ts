/**
 * Subscribe = OPEN AN EXTERNAL URL. Never IAP.
 *
 * Monetization decision (William, CEO): subscriptions are purchased on our
 * EXTERNAL WEB platform only — the in-app "subscribe" action opens the web
 * checkout in the system browser, bypassing Apple's commission. There is no
 * StoreKit, no IAP SDK, no purchase flow inside the app.
 *
 * Apple compliance notes (recorded for the docs):
 *  - Since the 2025 US injunction (Epic v. Apple) and App Review Guideline
 *    updates, US storefront apps may link out to external purchase flows.
 *    Outside the US, the External Link Account / external-purchase-link
 *    entitlements have jurisdiction-specific rules — the entitlement request
 *    is an App Store Connect task (blocked on dev accounts, William).
 *  - We deliberately show no in-app price comparison and complete no purchase
 *    in-app; the app only opens the URL.
 *
 * openExternal is APP-LAYER, not this package (zero RN deps here):
 *
 *   import { Linking } from "react-native";
 *   await Linking.openURL(buildSubscribeUrl(SUBSCRIBE_WEB_BASE, tokens.userId() ?? undefined));
 */

/** PLACEHOLDER — the real domain is William's call (brand sign-off pending,
 *  GripLab D19). Single constant so the swap is one line. */
export const SUBSCRIBE_WEB_BASE = "https://griplab.example.com";

/** Build the external checkout URL. user_id (Clerk id) lets the web platform
 *  attach the purchase to the account so /api/subscription/status sees it;
 *  anonymous users subscribe by signing in on the web page instead. */
export function buildSubscribeUrl(base: string, user_id?: string): string {
  const trimmed = base.replace(/\/+$/, "");
  const qs = user_id !== undefined && user_id !== "" ? `?user_id=${encodeURIComponent(user_id)}` : "";
  return `${trimmed}/subscribe${qs}`;
}
