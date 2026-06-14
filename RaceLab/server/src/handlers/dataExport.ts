/**
 * GDPR data export (P2, D17 — the store-side of the legal blocker; the GDPR
 * Art. 20 portability counterpart to DELETE /api/account's Art. 17 erasure:
 * export-before-delete is the user's right).
 *
 *   POST /api/me/export           — bearer -> create an async export job.
 *   GET  /api/me/export?job_id=…   — bearer -> poll that job's status/url.
 *
 * The archive itself (all domain blobs + media refs + billing history) is
 * assembled by an OUT-OF-BAND WORKER and is a deploy concern — these handlers
 * only own the job ledger. POST returns 202 'pending'; the worker later flips
 * the row to 'ready' + a signed url (or 'failed'), which GET surfaces.
 *
 * D18 is untouched: this is data portability, NOT advice/recommendations —
 * no engine output, no report generation crosses this boundary.
 *
 * OWNER-SCOPED (no IDOR): GET reads getJob(auth.user_id, job_id); ownership is
 * enforced in the store predicate, so a job_id minted for another user resolves
 * to null and 404s here — another user's url can never be returned.
 */

import type { HttpRequest, HttpResponse } from "../types";
import { requireAuth, type TokenVerifier } from "../auth";
import type { ExportStore } from "../stores/exportStore";

/** Minimal seam set this module consumes — only what the two handlers touch. */
export interface ExportCtx {
  verifier: TokenVerifier;
  now: () => string;
  store: ExportStore;
}

/** POST /api/me/export — create a pending export job. 202 Accepted: the
 *  archive is assembled asynchronously by the worker. */
export async function dataExportCreate(ctx: ExportCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;
  const server_time = ctx.now();

  const job = await ctx.store.createJob(auth.user_id, server_time);
  return {
    status: 202,
    json: { job_id: job.job_id, status: job.status, server_time },
  };
}

/** GET /api/me/export?job_id=… — owner-scoped status/url poll. 404 when the
 *  job is missing OR belongs to another user (indistinguishable on purpose). */
export async function dataExportStatus(ctx: ExportCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;
  const server_time = ctx.now();

  const raw = req.query.job_id;
  const job_id = Array.isArray(raw) ? raw[0] : raw;
  if (typeof job_id !== "string" || job_id === "") {
    return { status: 400, json: { error: "bad_request" } };
  }

  const job = await ctx.store.getJob(auth.user_id, job_id);
  if (job === null) return { status: 404, json: { error: "not_found" } };

  return {
    status: 200,
    json: {
      job_id,
      status: job.status,
      ...(job.url !== null ? { url: job.url } : {}),
      server_time,
    },
  };
}
