/**
 * POST /api/media/confirm — bearer -> mark a reserved media row as uploaded.
 *
 * The upload is a two-phase reservation (POST /api/media/upload-url reserves
 * quota + presigns a PUT; the client uploads the bytes directly to object
 * storage; THEN it calls this to confirm the PUT landed). Without this confirm
 * step every reservation would count against the user's quota forever even when
 * the client abandoned the upload — the audit's "quota permanently overstated"
 * bug. An UNconfirmed row whose presign aged past the TTL is reclaimed by the
 * presignSweep cron (workers/mediaMaintenance); a confirmed row is real bytes
 * and is never swept.
 *
 * Body: { media_id: string }.
 * OWNER-SCOPED (no IDOR): the store flips the row only when (user_id, media_id)
 * both match — a media_id minted for another user resolves to nothing -> 404.
 * Idempotent: re-confirming an already-confirmed row is 200 {confirmed:false}.
 */

import type { HttpRequest, HttpResponse } from "../types";
import type { TokenVerifier } from "../auth";
import { requireAuth } from "../auth";
import type { MediaStore } from "../stores/mediaStore";

/** Blob-key-safe charset for the media id (same guard as uploadUrl). */
const ID_CHARSET = /^[A-Za-z0-9_-]+$/;

export interface MediaConfirmCtx {
  verifier: TokenVerifier;
  now: () => string;
  store: MediaStore;
}

export async function mediaConfirm(ctx: MediaConfirmCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;
  const server_time = ctx.now();

  const body = req.body;
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, json: { error: "bad_request" } };
  }
  const media_id = (body as Record<string, unknown>).media_id;
  if (typeof media_id !== "string" || !ID_CHARSET.test(media_id)) {
    return { status: 400, json: { error: "bad_request" } };
  }

  const flipped = await ctx.store.confirm(auth.user_id, media_id);
  // flipped=false means either the row was already confirmed (idempotent 200) or
  // the id doesn't belong to this user. We can't tell those apart owner-scoped, so
  // a row that never existed for this user reports confirmed:false too — never an
  // error that leaks whether another user's media_id exists.
  return { status: 200, json: { ok: true, confirmed: flipped, server_time } };
}
