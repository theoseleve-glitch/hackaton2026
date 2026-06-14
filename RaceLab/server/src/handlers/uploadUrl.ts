/**
 * POST /api/media/upload-url — bearer -> a short-lived presigned blob PUT.
 *
 * P0.5: blocks backup+share. The client uploads a photo / setup PDF straight to
 * object storage (Supabase Storage / S3) using the returned URL; this server
 * only mints an owner-scoped key, presigns the PUT, and records an accounting
 * row for the per-user quota — the bytes never flow through us.
 *
 * Body: { mime: string; bytes: number }
 *   - mime must be on a fixed ALLOWLIST (image/jpeg|png|webp, application/pdf)
 *     -> else 415 unsupported_media_type.
 *   - bytes in (0, MAX_BYTES] -> else 413 payload_too_large.
 *   - the DECLARED bytes is the presigned PUT's content-length ceiling (a client
 *     that declares 1 byte can't push 10 MiB through the same URL).
 *   - quota is enforced by an atomic conditional insert in the store: the row is
 *     written IFF used(user) + bytes <= QUOTA_BYTES (no read-then-write TOCTOU);
 *     0 rows inserted -> 409 quota_exceeded, and we presign ONLY after the row
 *     lands.
 *
 * The media_id is SERVER-generated and the blob key embeds the owner
 * (u/<user_id>/<media_id>) so one user can never presign into another's space
 * (no IDOR — nothing in the body decides ownership). Both ids are also charset-
 * guarded to [A-Za-z0-9_-] before they touch the key, so a hostile verifier sub
 * (e.g. 'a/../b') can't path-escape the owner prefix -> 401.
 *
 * EXIF NOTE: GPS/location EXIF is stripped at PROCESSING/RENDER time, before a
 * photo enters any SHARED artifact (D10 share / backup render) — NOT here. This
 * endpoint accepts the raw upload; the strip is a downstream invariant.
 *
 * D29: paid features are gated by the web subscription, never IAP — quota is the
 * server-side accounting that the entitlement check builds on.
 */

import type { HttpRequest, HttpResponse } from "../types";
import type { TokenVerifier } from "../auth";
import { requireAuth } from "../auth";
import type { BlobStore, MediaStore } from "../stores/mediaStore";

/** Minimal seam set this handler consumes — declared here, wired by the integrator. */
export interface UploadUrlCtx {
  verifier: TokenVerifier;
  now: () => string;
  blobs: BlobStore;
  store: MediaStore;
  /** Owner-scoped media id factory (injected so tests are deterministic).
   *  Optional — defaults to a crypto-random id when not provided. */
  newMediaId?: () => string;
}

/** Fixed upload allowlist — photos + setup-sheet PDFs only. */
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

/** Per-file ceiling (10 MiB) and per-user quota (200 MiB). */
export const MAX_BYTES = 10 * 1024 * 1024;
export const QUOTA_BYTES = 200 * 1024 * 1024;

/** Blob-key-safe charset for owner + media id. The key is `u/<user_id>/<media_id>`;
 *  anything outside [A-Za-z0-9_-] (notably '/', '.', '..') could escape the owner
 *  prefix and presign into another user's space (IDOR) — so a verifier sub like
 *  'a/../b' or an injected id with a slash is rejected, never interpolated. */
const ID_CHARSET = /^[A-Za-z0-9_-]+$/;

interface UploadUrlBody {
  mime: AllowedMime;
  bytes: number;
}

export async function uploadUrl(ctx: UploadUrlCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;

  // IDOR guard: the user_id comes straight off the (untrusted) token verifier and
  // is interpolated into the blob key `u/<user_id>/<media_id>`. A hostile/buggy
  // verifier that returns a sub like 'a/../b' would escape the owner prefix and
  // presign into another user's space. Reject anything outside the key-safe
  // charset before it ever touches a key — treat it as an auth failure (401).
  if (!ID_CHARSET.test(auth.user_id)) {
    return { status: 401, json: { error: "unauthorized" } };
  }

  const server_time = ctx.now();

  const parsed = parseBody(req.body);
  if (!parsed.ok) return { status: parsed.status, json: { error: parsed.error } };
  const { mime, bytes } = parsed.value;

  const media_id = (ctx.newMediaId ?? defaultMediaId)();
  // The media_id is also interpolated into the key — same escape guard applies
  // (an injected id with a '/' or '..' would break out of the owner prefix).
  if (!ID_CHARSET.test(media_id)) {
    return { status: 401, json: { error: "unauthorized" } };
  }

  // Per-user quota, enforced atomically INSIDE the store: the accounting row is
  // inserted IFF (already-used + declared bytes) <= QUOTA_BYTES, in one statement
  // (no usedBytes()-then-record() TOCTOU). Scoped to auth.user_id, so a user can
  // never spend another user's quota. We presign ONLY after a confirmed reserve.
  const reserved = await ctx.store.tryRecord(
    auth.user_id,
    media_id,
    mime,
    bytes,
    QUOTA_BYTES,
    server_time,
  );
  if (!reserved) {
    return { status: 409, json: { error: "quota_exceeded", server_time } };
  }

  // Owner embedded in the key — presign can only ever target this user's space.
  const key = `u/${auth.user_id}/${media_id}`;

  // Hard ceiling = the client's DECLARED bytes (clamped to MAX_BYTES at parse).
  // Passing the declared size — not MAX_BYTES — makes the presigned PUT's
  // content-length constraint match what the client said it would upload, so a
  // client that declares 1 byte cannot then push 10 MiB through the same URL.
  const presigned = await ctx.blobs.presignPut(key, mime, bytes);

  return {
    status: 200,
    json: {
      media_id,
      upload_url: presigned.url,
      ...(presigned.headers !== undefined ? { upload_headers: presigned.headers } : {}),
      expires_at: presigned.expires_at,
      server_time,
    },
  };
}

type ParseResult =
  | { ok: true; value: UploadUrlBody }
  | { ok: false; status: number; error: string };

function parseBody(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, status: 400, error: "bad_request" };
  }
  const b = body as Record<string, unknown>;

  const mime = b.mime;
  if (typeof mime !== "string" || mime === "") {
    return { ok: false, status: 400, error: "bad_request" };
  }
  if (!(ALLOWED_MIME as readonly string[]).includes(mime)) {
    return { ok: false, status: 415, error: "unsupported_media_type" };
  }

  const bytes = b.bytes;
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || !Number.isInteger(bytes)) {
    return { ok: false, status: 400, error: "bad_request" };
  }
  if (bytes <= 0 || bytes > MAX_BYTES) {
    return { ok: false, status: 413, error: "payload_too_large" };
  }

  return { ok: true, value: { mime: mime as AllowedMime, bytes } };
}

/** Default media-id factory: URL-safe random, no separators that could break the
 *  blob key. Overridable via ctx.newMediaId (tests pass a deterministic one). */
function defaultMediaId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `m_${hex}`;
}
