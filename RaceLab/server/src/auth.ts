/**
 * TokenVerifier — Clerk BOUNDARY, interface only. No clerk dependency is
 * committed; verification is an injected capability (fake in tests, JWKS at
 * deploy).
 *
 * Deploy wiring (runtime dep installed at deploy time only):
 *
 *   npm i jose
 *
 *   import { createRemoteJWKSet, jwtVerify } from "jose";
 *   const jwks = createRemoteJWKSet(new URL(process.env.CLERK_JWKS_URL!));
 *   //   CLERK_JWKS_URL = https://<clerk-frontend-api>/.well-known/jwks.json
 *   //   CLERK_ISSUER   = https://<clerk-frontend-api>
 *   const verifier: TokenVerifier = {
 *     verify: async (token) => {
 *       try {
 *         const { payload } = await jwtVerify(token, jwks, { issuer: process.env.CLERK_ISSUER });
 *         return typeof payload.sub === "string" && payload.sub !== "" ? { user_id: payload.sub } : null;
 *       } catch {
 *         return null;
 *       }
 *     },
 *   };
 *
 * (src/deploy.ts builds exactly this, via dynamic import so nothing is needed
 * at typecheck/test time.)
 */

import type { HttpRequest, HttpResponse } from "./types";

export interface TokenVerifier {
  /** Resolve a bearer token to a user id, or null when invalid/expired. */
  verify(token: string): Promise<{ user_id: string } | null>;
}

export type AuthResult = { ok: true; user_id: string } | { ok: false; response: HttpResponse };

const UNAUTHORIZED: { ok: false; response: HttpResponse } = {
  ok: false,
  response: { status: 401, json: { error: "unauthorized" } },
};

/** Shared bearer extraction + verification. Never throws (a throwing verifier
 *  is a 401, not a 500 — auth failures must not look like outages). */
export async function requireAuth(ctx: { verifier: TokenVerifier }, req: HttpRequest): Promise<AuthResult> {
  const rawHeader = req.headers["authorization"] ?? req.headers["Authorization"];
  const raw = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (raw === undefined || !raw.startsWith("Bearer ") || raw.length <= 7) return UNAUTHORIZED;
  const token = raw.slice(7).trim();
  if (token === "") return UNAUTHORIZED;
  let verified: { user_id: string } | null;
  try {
    verified = await ctx.verifier.verify(token);
  } catch {
    verified = null;
  }
  if (verified === null || verified.user_id === "") return UNAUTHORIZED;
  return { ok: true, user_id: verified.user_id };
}
