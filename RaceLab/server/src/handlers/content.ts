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
 * SIGNING-ORACLE GUARD: this GET is auth-free and mints an EdDSA signature over
 * a DETERMINISTIC (name, version) row on every hit — so an anonymous loop is an
 * unbounded private-key signing oracle (free CPU burn + signature farming). We
 * defuse that by memoizing the detached signature in-process, keyed by the
 * immutable triple `${name}:${version}:${content_hash}`. content_versions is
 * append-only with PK (name, version), so that row — and therefore its
 * canonical manifest and its signature — never changes; a repeat (name,version)
 * returns the cached signature WITHOUT touching the signer. Including
 * content_hash in the key is belt-and-suspenders: were a row ever mutated, the
 * key would change and we'd re-sign rather than serve a stale signature. The
 * cache is per-process (cold start = empty), which is fine: correctness comes
 * from the signature itself, the Map is purely an oracle/CPU rate-limit.
 *
 * Response 200: { name, version, content_hash, url, published_at?, signature,
 * server_time, meta: { cache_control } }. No content -> 404 { error: "not_found" }.
 * meta.cache_control is a HINT for the transport adapter (vercel.ts owns real
 * HTTP headers — INTEGRATOR: emit it as a `Cache-Control` response header so the
 * CDN/client collapse the anonymous fan-out before it reaches the function).
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

/**
 * Public, cacheable for an hour. The manifest is a versioned, immutable pointer
 * (a higher version is a NEW manifest at a new value of `latest`), so a short
 * TTL is safe and a new publish is picked up within the window. Surfaced in the
 * JSON as meta.cache_control for the transport adapter to emit as a header.
 */
const CACHE_CONTROL = "public, max-age=3600";

/**
 * In-process signature memo: `${name}:${version}:${content_hash}` -> signature.
 * Module-level so it survives across requests within a warm function instance.
 * Bounded growth — one entry per published (name, version), of which there are
 * a handful. The signer is invoked at most once per immutable manifest.
 */
const sigCache = new Map<string, string>();

/** Test/ops seam: drop the in-process signature memo. */
export function _clearContentSigCache(): void {
  sigCache.clear();
}

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

  // Defuse the signing oracle: the manifest is fully determined by the immutable
  // (name, version, content_hash) triple, so sign once and reuse. A repeat hit
  // never reaches ctx.sign.
  const cacheKey = `${name}:${row.version}:${row.content_hash}`;
  let signature = sigCache.get(cacheKey);
  if (signature === undefined) {
    signature = await ctx.sign.sign(manifest);
    sigCache.set(cacheKey, signature);
  }

  return {
    status: 200,
    json: { ...manifest, signature, server_time, meta: { cache_control: CACHE_CONTROL } },
  };
}

/** Mirror the router's trailing-slash normalization so a path match is stable. */
function normalizePath(p: string): string {
  const noTrail = p.replace(/\/+$/, "");
  return noTrail === "" ? "/" : noTrail;
}
