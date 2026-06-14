/**
 * Clerk BOUNDARY — interface only. This package has NO clerk dependency and
 * never will: auth is an injected capability like storage and fetch, so the
 * whole account layer stays deterministic-testable and the app works fully
 * anonymous/offline (D4 offline-first — user_id is absent until first online
 * signup).
 *
 * App-layer wiring with Clerk Expo (the ONLY place @clerk/clerk-expo appears):
 *
 *   import { useAuth } from "@clerk/clerk-expo";
 *
 *   function useTokenProvider(): TokenProvider {
 *     const { getToken, userId, signOut } = useAuth();
 *     return {
 *       getToken: () => getToken(),          // short-lived Clerk session JWT
 *       userId: () => userId ?? null,        // Clerk user id ("user_...")
 *       signOut: () => signOut(),
 *     };
 *   }
 *
 * The server side verifies these JWTs against Clerk's JWKS — see
 * server/src/auth.ts (also dependency-free, injected verifier).
 */

export interface TokenProvider {
  /** Resolve a bearer token for API calls, or null when signed out/offline. */
  getToken(): Promise<string | null>;
  /** Current Clerk user id, or null when anonymous. */
  userId(): string | null;
  /** Ends the session at the app layer (Clerk signOut). */
  signOut(): Promise<void>;
}

/** The anonymous/offline provider — what every flow runs against before the
 *  user ever signs up. Everything in this package must work with it. */
export const ANONYMOUS_TOKENS: TokenProvider = {
  getToken: async () => null,
  userId: () => null,
  signOut: async () => {},
};
