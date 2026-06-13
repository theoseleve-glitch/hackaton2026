/**
 * Content-delivery store + signer seams.
 *
 * D13/D18-safe: this module SERVES DATA (versioned content bundle pointers),
 * it never computes advice. The advisor stays deterministic and on-device;
 * what this endpoint hands out is a signed pointer to a static, versioned blob
 * (the rcdata reference data or the kb rule pack). The app re-hashes the bytes
 * it downloads and verifies the manifest signature against a PINNED key before
 * trusting anything; otherwise it keeps its last-known-good / in-app baseline.
 *
 * D11-aligned: content here is whole-bundle (a named, versioned blob), not
 * per-entity sync.
 *
 * Zero committed runtime deps: the SQL store runs over an INJECTED QueryFn
 * (the makeSqlDb style), and the signer is an injected capability (real
 * EdDSA/JWT signer wired at deploy — same family as the entitlement signer).
 */

import type { QueryFn } from "../db";
import { isoOf } from "../sqlUtil";

/** The two named content bundles the client knows how to consume. */
export type ContentName = "rcdata" | "kb";

/** Raw MAX-version row for a named bundle (monotonic — see latest()). */
export interface ContentVersionRow {
  version: number;
  content_hash: string;
  url: string;
  published_at: string | null;
}

export interface ContentStore {
  /**
   * Latest = the MAX(version) row for `name`, or null when nothing is
   * published. MONOTONIC by construction: a downgrade can never be served
   * because we always return the highest version, never "most recently
   * inserted". (A mistaken low-version insert is simply ignored here.)
   */
  latest(name: ContentName): Promise<ContentVersionRow | null>;
}

/**
 * ManifestSigner — detached signature over the canonical manifest. Same
 * JWT/EdDSA signer family as the entitlement signer; the app pins the public
 * key. Interface only; the real signer is injected at deploy.
 */
export interface ManifestSigner {
  sign(payload: Record<string, unknown>): Promise<string>;
}

/** Real store over an injected query fn (no pg/neon committed). */
export function makeSqlContentStore(query: QueryFn): ContentStore {
  return {
    async latest(name) {
      const { rows } = await query(
        `SELECT version, content_hash, url, published_at
         FROM content_versions
         WHERE name = $1
         ORDER BY version DESC
         LIMIT 1`,
        [name],
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        version: Number(r.version),
        content_hash: String(r.content_hash),
        url: String(r.url),
        published_at:
          r.published_at === null || r.published_at === undefined ? null : isoOf(r.published_at),
      };
    },
  };
}


/**
 * content_versions: append-only registry of published bundle pointers. One
 * row per (name, version); the served "latest" is MAX(version) so a lower
 * version can never be pushed over a higher one (monotonic, no downgrades).
 * content_hash lets the app re-hash downloaded bytes; url points at the blob/
 * CDN object (bytes live there, not in Postgres). Mirrors makeSqlContentStore
 * — change them together.
 */
export const CONTENT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS content_versions (
  name         TEXT NOT NULL,                  -- 'rcdata' | 'kb'
  version      INTEGER NOT NULL,               -- monotonic; served latest = MAX(version)
  content_hash TEXT NOT NULL,                  -- hash of the bundle bytes (app re-verifies)
  url          TEXT NOT NULL,                  -- blob/CDN pointer to the bytes
  published_at TIMESTAMPTZ,                    -- null until explicitly published
  PRIMARY KEY (name, version)
);
`;
