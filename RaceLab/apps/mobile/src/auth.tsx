/**
 * App-layer AUTH boundary. Mirrors the Clerk-boundary convention of
 * packages/account/src/auth.ts: this app has NO @clerk dependency and defaults
 * to ANONYMOUS_TOKENS, so the whole flow (trial start + external web paywall +
 * opportunistic validation) works fully signed-out and offline. `userId()` is
 * null and `getToken()` resolves null until a real auth provider is wired —
 * which makes validateSubscription a structural no-op (it is only ever called
 * when userId() is non-null, see src/entitlements.tsx).
 *
 * The context exposes exactly what the entitlement layer needs:
 *   - `tokens`: a TokenProvider (the @racelab/account injected auth surface)
 *   - `signedIn`: whether a real session exists (drives only UI affordances;
 *     it MUST NEVER gate app launch — D18 invariant #2)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ACTIVATING CLERK (the ONLY place @clerk/clerk-expo would ever appear)
 * ─────────────────────────────────────────────────────────────────────────────
 * Clerk is intentionally OFF for launch (D18 invariant #5: "No in-app Clerk
 * dependency"). To turn it on later WITHOUT regressing offline-first:
 *
 *   1. Install (existing-deps rule is lifted only when you deliberately enable
 *      Clerk — verify Expo 56 / RN 0.85 compat first):
 *
 *        npx expo install @clerk/clerk-expo expo-secure-store
 *
 *   2. Set CLERK_PUBLISHABLE_KEY in src/config.ts to the project's non-secret
 *      `pk_…` publishable key.
 *
 *   3. Wrap the app in a ClerkProvider that NEVER gates render (no <SignedIn>/
 *      <SignedOut> around the tree — the app must boot anonymous), plus a token
 *      cache backed by expo-secure-store:
 *
 *        import { ClerkProvider } from "@clerk/clerk-expo";
 *        import * as SecureStore from "expo-secure-store";
 *        import { CLERK_PUBLISHABLE_KEY } from "./config";
 *
 *        const tokenCache = {
 *          getToken: (k: string) => SecureStore.getItemAsync(k),
 *          saveToken: (k: string, v: string) => SecureStore.setItemAsync(k, v),
 *        };
 *
 *        // In App.tsx, OUTSIDE everything else, but rendering children always:
 *        // <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
 *        //   <ClerkAuthBridge>           ← maps useAuth() → AuthContext
 *        //     <RepoProvider> … </RepoProvider>
 *        //   </ClerkAuthBridge>
 *        // </ClerkProvider>
 *
 *   4. Replace <AnonymousAuthProvider> with this bridge, which maps Clerk's
 *      useAuth() onto the SAME AuthContext shape (so nothing downstream changes)
 *      and STILL renders children immediately (never blocks on Clerk loading):
 *
 *        import { useAuth } from "@clerk/clerk-expo";
 *
 *        export function ClerkAuthBridge({ children }: { children: React.ReactNode }) {
 *          const { isSignedIn, getToken, userId, signOut } = useAuth();
 *          const value = React.useMemo<AuthState>(() => ({
 *            tokens: {
 *              getToken: () => getToken(),       // short-lived Clerk session JWT
 *              userId: () => userId ?? null,     // Clerk user id ("user_…")
 *              signOut: () => signOut(),
 *            },
 *            signedIn: isSignedIn ?? false,
 *          }), [isSignedIn, getToken, userId, signOut]);
 *          return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
 *        }
 *
 * The server verifies these JWTs against Clerk's JWKS (server/src/auth.ts).
 * Until all of the above is done, AnonymousAuthProvider is the default and the
 * app is anonymous-forever, exactly as shipped.
 */

import React, { createContext, useContext } from "react";
import { ANONYMOUS_TOKENS } from "@racelab/account";
import type { TokenProvider } from "@racelab/account";

export interface AuthState {
  /** The injected auth capability handed to @racelab/account flows. */
  tokens: TokenProvider;
  /** Whether a real (non-anonymous) session exists. UI-only; never a gate. */
  signedIn: boolean;
}

const ANONYMOUS_AUTH: AuthState = { tokens: ANONYMOUS_TOKENS, signedIn: false };

export const AuthContext = createContext<AuthState>(ANONYMOUS_AUTH);

/**
 * Default provider: anonymous forever. Supplies ANONYMOUS_TOKENS so userId() is
 * null and getToken() resolves null — the server is never contacted with a
 * bearer token, the trial + web paywall still work end-to-end.
 */
export function AnonymousAuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  return <AuthContext.Provider value={ANONYMOUS_AUTH}>{children}</AuthContext.Provider>;
}

/** The TokenProvider for @racelab/account calls (validate/trial sync). */
export function useTokenProvider(): TokenProvider {
  return useContext(AuthContext).tokens;
}

/** UI-only auth state (e.g. show a "manage account" affordance). NEVER gate launch on this. */
export function useAuthState(): AuthState {
  return useContext(AuthContext);
}
