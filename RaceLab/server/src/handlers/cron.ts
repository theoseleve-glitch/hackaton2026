/**
 * POST /api/cron/workers — the scheduled entry point for the out-of-band WORKERS
 * (exportAssembler / pushReceipts / mediaMaintenance). The audit found those
 * workers had NO cron/api entry — they could never run, so abandoned media
 * presigns never got reclaimed and export jobs never assembled. This handler is
 * what a Vercel Cron (or any scheduler) POSTs to on a timer.
 *
 * AUTH: NOT a bearer/Clerk route — it is machine-to-machine, gated by a shared
 * CRON_SECRET. Accepts the secret via "x-cron-secret" OR the Vercel-native
 * "authorization: Bearer <CRON_SECRET>" (constant-time-ish compare). An external
 * caller without it gets 401. When no secret is configured the route refuses ALL
 * calls (fail-closed) so it can never be triggered by accident in an
 * unconfigured deploy.
 *
 * Pure-ish: the actual work is injected as a `runJobs` seam (deploy wires it to
 * the real worker fan-out over SQL reader seams). The handler owns ONLY auth +
 * the response envelope; it never throws across the boundary (a worker failure
 * is reported as a counted result, the router would otherwise 500 + retry).
 */

import type { HttpRequest, HttpResponse } from "../types";

/** What a cron tick produced — a small, low-cardinality summary for logs/metrics
 *  (never any user PII). Shape is open so the deploy can add per-worker counts. */
export interface CronRunSummary {
  ok: boolean;
  ran: string[]; // worker names that executed this tick
  [k: string]: unknown;
}

export interface CronCtx {
  now: () => string;
  /** The configured cron secret. undefined/"" => the route is fail-closed (401). */
  cronSecret?: string;
  /** Injected worker fan-out (deploy wires the real workers over SQL seams).
   *  Must resolve, never reject — a worker failure is a counted result. */
  runJobs: () => Promise<CronRunSummary>;
}

export async function cronWorkers(ctx: CronCtx, req: HttpRequest): Promise<HttpResponse> {
  const server_time = ctx.now();

  // Fail CLOSED when unconfigured: no secret => nobody may trigger the workers.
  if (ctx.cronSecret === undefined || ctx.cronSecret === "") {
    return { status: 401, json: { error: "unauthorized", server_time } };
  }
  // Accept either the custom header OR the Vercel-native "Authorization: Bearer".
  const provided = headerOf(req.headers, "x-cron-secret") ?? bearerOf(req.headers);
  if (provided === undefined || !safeEqual(provided, ctx.cronSecret)) {
    return { status: 401, json: { error: "unauthorized", server_time } };
  }

  const summary = await ctx.runJobs();
  return { status: 200, json: { ...summary, server_time } };
}

function headerOf(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/** Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" — extract the token. */
function bearerOf(headers: Record<string, string | string[] | undefined>): string | undefined {
  const raw = headerOf(headers, "authorization") ?? headerOf(headers, "Authorization");
  if (raw === undefined || !raw.startsWith("Bearer ")) return undefined;
  const tok = raw.slice(7).trim();
  return tok === "" ? undefined : tok;
}

/** Length-checked, constant-time-ish string compare so a wrong secret can't be
 *  distinguished by timing. Not a security boundary on its own (TLS + a long
 *  random secret are), but cheap and correct. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
