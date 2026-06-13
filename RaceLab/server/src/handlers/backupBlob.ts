/**
 * /api/backup/blob — whole-domain backup blob (D11: backup = domain blob
 * put/get, NOT entity sync). Bearer-authed, OWNER-SCOPED: every blob is keyed
 * by (auth.user_id, domain) — the domain comes from the query, the user NEVER
 * from the body, so there is no parameter that reaches another user's rows.
 *
 *   GET  /api/backup/blob?domain=<domain>
 *     -> 200 { domain, format, state, updated_at, server_time }
 *     -> 404 { error: "not_found" } when this user has no blob for the domain.
 *
 *   PUT  /api/backup/blob?domain=<domain>
 *     body: { format: number; state: unknown; base_updated_at?: string }
 *     Optimistic concurrency on updated_at: if a row exists and
 *     base_updated_at !== current.updated_at (or a row exists and no base was
 *     sent) -> 409 { error: "server_newer", current_updated_at, server_time }.
 *     Otherwise upsert with updated_at = server now (idempotent on same base).
 *     -> 200 { domain, updated_at, server_time }
 *
 * The {format, state} envelope is stored VERBATIM/OPAQUE — the server never
 * reads or migrates state (D11: no server-side migration). state may be any
 * JSON value (object, array, primitive, null) — it is the client's domain.
 *
 * domain allowlist: one of the fixed domains, or "sheets:<carId>". Anything
 * else -> 400 { error: "bad_request" }. The server stores, it does not vouch.
 *
 * This module is D11-scoped: blob backup only. No advice/report endpoints live
 * here (D18 — there is no recommendation surface in this tier, ever).
 */

import type { HttpRequest, HttpResponse } from "../types";
import type { TokenVerifier } from "../auth";
import type { BlobBackupStore } from "../stores/backupBlobStore";
import { requireAuth } from "../auth";

/** Minimal ctx — only the seams this module touches. */
export interface BackupCtx {
  now: () => string;
  verifier: TokenVerifier;
  store: BlobBackupStore;
}

/**
 * Whole-domain blob size cap. A {format, state} snapshot whose `state`
 * serializes to more than this is rejected (413) before the store call —
 * guards an abusive/runaway domain blob from reaching storage. Measured on
 * JSON.stringify(state).length (UTF-16 code units, a cheap proxy for wire
 * bytes); sized well above any real per-domain client snapshot.
 */
const MAX_BLOB_STATE_BYTES = 1 * 1024 * 1024;

/** Fixed whole-domain backup targets. */
const FIXED_DOMAINS = new Set(["garage", "tracks", "logbook", "reports", "account"]);
/** Versioned per-car sheet bundles: "sheets:<carId>". */
const SHEETS_PREFIX = "sheets:";

/** Validate the ?domain= param against the allowlist / prefix. */
function readDomain(query: HttpRequest["query"]): string | null {
  const raw = query.domain;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== "string" || s === "") return null;
  if (FIXED_DOMAINS.has(s)) return s;
  if (s.startsWith(SHEETS_PREFIX) && s.length > SHEETS_PREFIX.length) {
    const carId = s.slice(SHEETS_PREFIX.length);
    // carId must be a single non-empty token (no nested colons / whitespace)
    if (carId.trim() === carId && carId !== "" && !carId.includes(":")) return s;
  }
  return null;
}

export async function backupBlobGet(ctx: BackupCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;
  const server_time = ctx.now();

  const domain = readDomain(req.query);
  if (domain === null) return { status: 400, json: { error: "bad_request" } };

  const blob = await ctx.store.get(auth.user_id, domain);
  if (blob === null) return { status: 404, json: { error: "not_found" } };

  return {
    status: 200,
    json: {
      domain,
      format: blob.format,
      state: blob.state, // verbatim / opaque (D11)
      updated_at: blob.updated_at,
      server_time,
    },
  };
}

export async function backupBlobPut(ctx: BackupCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;
  const server_time = ctx.now();

  const domain = readDomain(req.query);
  if (domain === null) return { status: 400, json: { error: "bad_request" } };

  const body = req.body;
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, json: { error: "bad_request" } };
  }
  const r = body as Record<string, unknown>;

  // format: an integer schema version (the client's, opaque to us).
  if (typeof r.format !== "number" || !Number.isInteger(r.format)) {
    return { status: 400, json: { error: "bad_request" } };
  }
  const format = r.format;

  // state must be PRESENT (any JSON value, including null) — but a missing key
  // is a malformed body, not an intentional null snapshot.
  if (!("state" in r)) return { status: 400, json: { error: "bad_request" } };
  const state = r.state;

  // Size cap BEFORE the store call: an oversized blob is rejected (413).
  // (JSON.stringify(undefined) is undefined, not a string — coalesce to "".)
  if ((JSON.stringify(state) ?? "").length > MAX_BLOB_STATE_BYTES) {
    return { status: 413, json: { error: "payload_too_large", server_time } };
  }

  // base_updated_at: optional optimistic-concurrency token. When present it
  // must be a parseable ISO instant; absence means "first write".
  let base_updated_at: string | undefined;
  if (r.base_updated_at !== undefined && r.base_updated_at !== null) {
    if (typeof r.base_updated_at !== "string" || Number.isNaN(Date.parse(r.base_updated_at))) {
      return { status: 400, json: { error: "bad_request" } };
    }
    base_updated_at = r.base_updated_at;
  }

  const result = await ctx.store.put(
    auth.user_id,
    domain,
    format,
    state,
    server_time,
    base_updated_at,
  );
  if (!result.ok) {
    return {
      status: 409,
      json: { error: "server_newer", current_updated_at: result.current_updated_at, server_time },
    };
  }

  return { status: 200, json: { domain, updated_at: result.updated_at, server_time } };
}
