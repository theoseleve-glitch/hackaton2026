/**
 * GET /api/healthz — AUTH-FREE liveness/readiness probe.
 *
 * Answers one question for load balancers, uptime monitors, and the deploy
 * smoke check: can this instance reach its database, and which optional seams
 * are configured? It returns 200 only when a trivial `SELECT 1` (the `ping`
 * seam) succeeds, else 503 — so an instance that booted but lost its DB is
 * correctly drained rather than serving traffic.
 *
 * AUTH-FREE on purpose: a health probe must answer BEFORE/WITHOUT a valid
 * bearer (the monitor has none), and it exposes nothing per-user. So this
 * endpoint does NOT call requireAuth.
 *
 * NO SECRET LEAKAGE: `seams` reports only booleans — whether each integration's
 * credentials are PRESENT in the environment, never the values. The integrator
 * derives these from env presence without reading the secrets through here.
 *
 * NEVER THROWS: a failing `ping()` (rejected promise, thrown guard, or a
 * resolved `false`) is caught and rendered as db:"down" → 503, never an
 * exception across the handler boundary.
 *
 * Response 200: { ok:true,  db:"up",   seams, server_time }
 * Response 503: { ok:false, db:"down", seams, server_time }
 */

import type { HttpResponse } from "../types";

/** The four optional integrations this deployment may or may not have wired.
 *  Each value is PRESENCE only (true = creds in env), never the secret. */
export interface HealthSeams {
  stripe: boolean;
  signing: boolean;
  blob: boolean;
  render: boolean;
}

/** Minimal seams this handler consumes — only what it uses. The integrator
 *  builds `ping` as a `SELECT 1` over the db seam and derives `seams` from env
 *  presence (booleans only). No HttpRequest is needed: the probe takes no
 *  input — its answer depends solely on the instance's own state. */
export interface HealthCtx {
  now: () => string;
  /** Resolves true when the DB answered a `SELECT 1`. A rejection or a
   *  resolved false both mean "down" — the handler treats them identically. */
  ping: () => Promise<boolean>;
  seams: HealthSeams;
}

export async function health(ctx: HealthCtx): Promise<HttpResponse> {
  const server_time = ctx.now();
  // Snapshot the booleans so the response can never alias a mutable ctx object
  // or accidentally carry an extra (secret-bearing) field.
  const seams: HealthSeams = {
    stripe: ctx.seams.stripe === true,
    signing: ctx.seams.signing === true,
    blob: ctx.seams.blob === true,
    render: ctx.seams.render === true,
  };

  // ping() must never escape as an exception: a thrown guard or a rejected
  // promise is a "down" signal, not a 500. Default to down, flip only on a
  // strict `true`.
  let up = false;
  try {
    up = (await ctx.ping()) === true;
  } catch {
    up = false;
  }

  if (up) {
    return { status: 200, json: { ok: true, db: "up", seams, server_time } };
  }
  return { status: 503, json: { ok: false, db: "down", seams, server_time } };
}
