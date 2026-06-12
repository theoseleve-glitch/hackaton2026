/**
 * Deploy wiring — the ONLY file that knows about real infrastructure.
 * Nothing deploys yet (no accounts exist); when they do, this is the
 * complete checklist:
 *
 *  1. Runtime deps (committed nowhere, installed at deploy time):
 *        npm i @neondatabase/serverless jose
 *     (loaded below via dynamic import, so typecheck/test need neither)
 *  2. Vercel project env vars:
 *        DATABASE_URL    — Neon connection string (vercel marketplace: Neon)
 *        CLERK_JWKS_URL  — https://<clerk-frontend-api>/.well-known/jwks.json
 *        CLERK_ISSUER    — https://<clerk-frontend-api>   (optional but recommended)
 *  3. Apply db/schema.sql to the Neon database.
 *  4. `vercel deploy` from server/ — api/*.ts are the functions (vercel.json).
 *
 * Misconfiguration throws here and is mapped to a 500 "server_misconfigured"
 * by src/vercel.ts — the app treats that exactly like being offline (Tier B
 * is enrichment only; every client flow works with this whole tier down).
 */

import { makeSqlDb } from "./db";
import type { ServerCtx } from "./types";
import type { TokenVerifier } from "./auth";

export async function getDeployCtx(
  env: Record<string, string | undefined> = process.env,
): Promise<ServerCtx> {
  const dbUrl = env.DATABASE_URL;
  const jwksUrl = env.CLERK_JWKS_URL;
  const issuer = env.CLERK_ISSUER;
  if (dbUrl === undefined || dbUrl === "" || jwksUrl === undefined || jwksUrl === "") {
    throw new Error("server_misconfigured: DATABASE_URL and CLERK_JWKS_URL are required");
  }

  // dynamic imports through widened strings: resolved at runtime on Vercel,
  // invisible to tsc/tsx locally (the deps are deploy-time only)
  const neonSpec = "@neondatabase/serverless" as string;
  const { neon } = (await import(neonSpec)) as {
    neon: (url: string) => { query: (text: string, params?: readonly unknown[]) => Promise<unknown> };
  };
  const sql = neon(dbUrl);
  const db = makeSqlDb(async (text, params) => {
    const out = (await sql.query(text, params)) as unknown;
    // neon().query returns the row array directly; pg-style drivers return {rows}
    if (Array.isArray(out)) return { rows: out as Record<string, unknown>[] };
    return out as { rows: Record<string, unknown>[] };
  });

  const joseSpec = "jose" as string;
  const jose = (await import(joseSpec)) as {
    createRemoteJWKSet: (url: URL) => unknown;
    jwtVerify: (
      token: string,
      key: unknown,
      options?: { issuer?: string },
    ) => Promise<{ payload: { sub?: unknown } }>;
  };
  const jwks = jose.createRemoteJWKSet(new URL(jwksUrl));
  const verifier: TokenVerifier = {
    verify: async (token) => {
      try {
        const { payload } = await jose.jwtVerify(
          token,
          jwks,
          issuer !== undefined && issuer !== "" ? { issuer } : undefined,
        );
        return typeof payload.sub === "string" && payload.sub !== ""
          ? { user_id: payload.sub }
          : null;
      } catch {
        return null;
      }
    },
  };

  return { db, verifier, now: () => new Date().toISOString() };
}
