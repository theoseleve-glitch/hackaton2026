/**
 * Transport-agnostic request/response shapes — handlers are pure functions
 * {method, path, headers, query, body} -> {status, json}, so the whole API is
 * unit-testable without Vercel, HTTP, or a database (api/*.ts adapts the real
 * runtime in ~20 lines, src/test-server.ts injects fakes).
 */

import type { Db } from "./db";
import type { TokenVerifier } from "./auth";

export interface HttpRequest {
  method: string;
  /** pathname only, e.g. "/api/backup/push" */
  path: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  /** Best-effort client IP (the first x-forwarded-for hop at the edge), the IP
   *  dimension of the rate limiter. Absent when no proxy populated it — the
   *  router falls back to a stable placeholder so the limiter never crashes. */
  ip?: string;
}

export interface HttpResponse {
  status: number;
  json: Record<string, unknown>;
}

export interface ServerCtx {
  db: Db;
  verifier: TokenVerifier;
  /** Server clock, injected (fixed in tests). Every response echoes it as
   *  server_time — the client uses it to raise its tamper-guard floor. */
  now: () => string;
}
