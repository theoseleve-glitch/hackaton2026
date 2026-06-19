/**
 * Transport-agnostic request/response shapes — handlers are pure functions
 * {method, path, headers, query, body} -> {status, json}, so the whole API is
 * unit-testable without Vercel, HTTP, or a database (api/*.ts adapts the real
 * runtime in ~20 lines, src/test-server.ts injects fakes).
 */

import type { Db } from "./db";
import type { TokenVerifier } from "./auth";
import type { StripeBilling, StripeWebhookVerifier } from "./stripe";

export interface HttpRequest {
  method: string;
  /** pathname only, e.g. "/api/backup/push" */
  path: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  /** Exact request bytes, preserved ONLY for routes that need them (the Stripe
   *  webhook signature). Undefined elsewhere — handlers read `body`. */
  rawBody?: string;
}

export interface HttpResponse {
  status: number;
  json: Record<string, unknown>;
}

export interface ServerCtx {
  db: Db;
  verifier: TokenVerifier;
  /** Stripe webhook signature verifier (injected: fake in tests, real SDK at
   *  deploy). Only /api/stripe/webhook consumes it. */
  webhookVerifier: StripeWebhookVerifier;
  /** Stripe billing capability (Checkout + Customer Portal session creation;
   *  injected: fake in tests, real SDK at deploy). */
  stripe: StripeBilling;
  /** Server clock, injected (fixed in tests). Every response echoes it as
   *  server_time — the client uses it to raise its tamper-guard floor. */
  now: () => string;
}
