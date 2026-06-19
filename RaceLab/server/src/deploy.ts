/**
 * Deploy wiring — the ONLY file that knows about real infrastructure.
 * Nothing deploys yet (no accounts exist); when they do, this is the
 * complete checklist:
 *
 *  1. Runtime deps (committed nowhere, installed at deploy time):
 *        npm i @neondatabase/serverless jose stripe
 *     (loaded below via dynamic import, so typecheck/test need neither)
 *  2. Vercel project env vars:
 *        DATABASE_URL          — Neon connection string (vercel marketplace: Neon)
 *        CLERK_JWKS_URL        — https://<clerk-frontend-api>/.well-known/jwks.json
 *        CLERK_ISSUER          — https://<clerk-frontend-api>   (optional but recommended)
 *        STRIPE_SECRET_KEY     — Stripe secret key (sk_live_…)
 *        STRIPE_WEBHOOK_SECRET — signing secret of the racelabrc.app webhook endpoint (whsec_…)
 *  3. Apply db/schema.sql to the Neon database.
 *  4. `vercel deploy` from server/ — api/*.ts are the functions (vercel.json).
 *  5. Add a Stripe webhook → https://<deploy>/api/stripe/webhook for events
 *     customer.subscription.created / .updated / .deleted; copy its signing
 *     secret into STRIPE_WEBHOOK_SECRET.
 *
 * Misconfiguration throws here and is mapped to a 500 "server_misconfigured"
 * by src/vercel.ts — the app treats that exactly like being offline (Tier B
 * is enrichment only; every client flow works with this whole tier down).
 */

import { makeSqlDb } from "./db";
import type { ServerCtx } from "./types";
import type { TokenVerifier } from "./auth";
import type { StripeEvent, StripeWebhookVerifier } from "./stripe";

export async function getDeployCtx(
  env: Record<string, string | undefined> = process.env,
): Promise<ServerCtx> {
  const dbUrl = env.DATABASE_URL;
  const jwksUrl = env.CLERK_JWKS_URL;
  const issuer = env.CLERK_ISSUER;
  const stripeSecret = env.STRIPE_SECRET_KEY;
  const stripeWebhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (
    dbUrl === undefined ||
    dbUrl === "" ||
    jwksUrl === undefined ||
    jwksUrl === "" ||
    stripeSecret === undefined ||
    stripeSecret === "" ||
    stripeWebhookSecret === undefined ||
    stripeWebhookSecret === ""
  ) {
    throw new Error(
      "server_misconfigured: DATABASE_URL, CLERK_JWKS_URL, STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required",
    );
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

  const stripeSpec = "stripe" as string;
  const Stripe = (
    (await import(stripeSpec)) as { default: new (key: string) => StripeClient }
  ).default;
  const stripeClient = new Stripe(stripeSecret);
  const webhookVerifier: StripeWebhookVerifier = {
    verify: async (rawBody, signature) => {
      try {
        // constructEventAsync verifies the signature using WebCrypto (safe in
        // serverless) and throws on any mismatch / tampering.
        const event = await stripeClient.webhooks.constructEventAsync(
          rawBody,
          signature,
          stripeWebhookSecret,
        );
        return event as unknown as StripeEvent;
      } catch {
        return null;
      }
    },
  };

  return { db, verifier, webhookVerifier, now: () => new Date().toISOString() };
}

/** The slice of the Stripe SDK we touch (avoids a committed type dependency). */
interface StripeClient {
  webhooks: {
    constructEventAsync(rawBody: string, signature: string, secret: string): Promise<unknown>;
  };
}
