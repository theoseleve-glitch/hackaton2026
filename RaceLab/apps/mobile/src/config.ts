/**
 * App-layer runtime config (non-secret). Kept tiny and dependency-light so it
 * can be imported from anywhere (providers, screens) without pulling RN.
 */

import { DEFAULT_API_BASE } from "@racelab/account";

/**
 * Clerk publishable key. EMPTY = in-app sign-in is OFF (the app runs fully
 * anonymous; trial + web-paywall work without ever signing in — see
 * src/auth.tsx for how to flip Clerk on).
 *
 * Set at deploy time to the project's non-secret publishable key (the
 * `pk_test_…` / `pk_live_…` value — publishable keys are safe to ship in the
 * client bundle; the SECRET key never appears in the app). Leaving it "" is the
 * intended launch state per D18 ("No in-app Clerk dependency").
 */
export const CLERK_PUBLISHABLE_KEY = "";

/**
 * Base URL for the account/subscription API (GET /api/subscription/status,
 * POST /api/trial/start). Defaults to the package placeholder until the Vercel
 * project exists; override here at deploy if the host differs.
 */
export const API_BASE = DEFAULT_API_BASE;
