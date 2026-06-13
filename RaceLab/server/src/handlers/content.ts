/**
 * GET /api/content/rcdata and GET /api/content/kb — PUBLIC content delivery.
 *
 * D13/D18-safe: serving DATA is not computing advice. This hands out a signed
 * pointer to a static, versioned bundle (rcdata reference data / kb rule pack);
 * the on-device advisor stays 100% deterministic and API-free. The server
 * never computes a recommendation here — it returns a manifest, signed.
 *
 * AUTH-FREE on purpose: these bundles are the same data shipped in the app
 * baseline, so there is no per-user secret to protect. Integrity, not secrecy,
 * is the security model: the manifest carries a detached signature over a
 * PINNED key and a content_hash; the app re-hashes the downloaded bytes and
 * verifies the signature before trusting, else it keeps last-known-good / the
 * in-app baseline. So this endpoint does NOT call requireAuth.
 *
 * MONOTONIC: store.latest returns MAX(version) — a downgrade can never be
 * pushed (see contentStore.latest).
 *
 * Response 200: { name, version, content_hash, url, published_at?, signature,
 * server_time }. No content -> 404 { error: "not_found" }.
 */

import type { HttpRequest, HttpResponse } from "../types";
import type { ContentName, ContentStore, ManifestSigner } from "../stores/contentStore";

/** Minimal seams this handler consumes — only what it uses. */
export interface ContentCtx {
  now: () => string;
  sign: ManifestSigner;
  store: ContentStore;
}

/** Route suffix -> bundle name. Anything else is not a content route. */
const NAME_BY_PATH: Record<string, ContentName> = {
  "/api/content/rcdata": "rcdata",
  "/api/content/kb": "kb",
};

export async function content(ctx: ContentCtx, req: HttpRequest): Promise<HttpResponse> {
  const server_time = ctx.now();

  const name = NAME_BY_PATH[normalizePath(req.path)];
  if (name === undefined) return { status: 404, json: { error: "not_found" } };

  const row = await ctx.store.latest(name);
  if (row === null) return { status: 404, json: { error: "not_found" } };

  // Canonical manifest — exactly the bytes the signature covers. published_at
  // is included only when present so the signed payload is stable per row.
  const manifest: Record<string, unknown> = {
    name,
    version: row.version,
    content_hash: row.content_hash,
    url: row.url,
    ...(row.published_at !== null ? { published_at: row.published_at } : {}),
  };

  const signature = await ctx.sign.sign(manifest);

  return { status: 200, json: { ...manifest, signature, server_time } };
}

/** Mirror the router's trailing-slash normalization so a path match is stable. */
function normalizePath(p: string): string {
  const noTrail = p.replace(/\/+$/, "");
  return noTrail === "" ? "/" : noTrail;
}
