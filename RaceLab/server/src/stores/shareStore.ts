/**
 * ShareStore + RenderSeam — the persistence/render seams for the share+fork
 * module (D10: share link + fork is ALL of social for V1.0; D11: a share is a
 * PUBLISH-TIME IMMUTABLE snapshot; D12: artifacts are fill-never-redraw).
 *
 * Zero committed runtime deps: the store runs over an INJECTED QueryFn (same
 * makeSqlDb style as src/db.ts — parameterized SQL, no pg/neon import here),
 * and the renderer is an injected capability stubbed at deploy time onto the
 * PDF/PNG service. The in-memory fakes live in src/test-share.ts only.
 *
 * Deploy wiring lives in src/deploy.ts (the integrator owns it): pass the same
 * neon-backed QueryFn as makeSqlDb, and wire RenderSeam onto the render service
 * (D12 fill-never-redraw — render NEVER fabricates a sheet, it fills the kit
 * template). A render failure must surface as null artifacts, never a throw.
 */

import type { QueryFn } from "../db";
import { isoOf } from "../sqlUtil";

// ── render seam ─────────────────────────────────────────────────────────────

export type ShareKind = "track" | "setup";

/** Rendered share artifacts. Both optional: a renderer may produce only a PNG
 *  preview, only a PDF, both, or (stub / failure) neither. */
export interface ShareArtifacts {
  png_url?: string;
  pdf_url?: string;
}

/** RenderSeam — stubbed at deploy onto the PDF/PNG service (D12 fill-never-
 *  redraw). Pure capability: (kind, payload) -> artifact urls. */
export interface RenderSeam {
  render(kind: ShareKind, payload: Record<string, unknown>): Promise<ShareArtifacts>;
}

// ── snapshot record ─────────────────────────────────────────────────────────

/** The immutable snapshot as stored (full row — includes owner identity, which
 *  the AUTH-FREE get handler must NEVER leak). */
export interface ShareSnapshot {
  token: string;
  owner_user_id: string;
  kind: ShareKind;
  payload: Record<string, unknown>;
  artifacts: ShareArtifacts;
  forked_from: string | null;
  created_at: string;
}

// ── store seam ──────────────────────────────────────────────────────────────

export interface ShareStore {
  /** Insert an IMMUTABLE snapshot under a fresh unguessable token; returns it
   *  (D11 publish-time snapshot — there is no update path on purpose). */
  create(
    ownerUserId: string,
    kind: ShareKind,
    payload: Record<string, unknown>,
    artifacts: ShareArtifacts,
    atIso: string,
  ): Promise<{ token: string }>;
  /** Read a snapshot by token, or null when it does not exist. */
  get(token: string): Promise<ShareSnapshot | null>;
  /** Record a fork/import of `token` by `intoUserId` (lineage). Idempotent on
   *  (token, user_id) — a re-import is a no-op, not an error. */
  recordImport(token: string, intoUserId: string, atIso: string): Promise<void>;
}

// ── unguessable token ───────────────────────────────────────────────────────

/** 100-bit base32 token ("s_..."): unguessable (the share URL IS the
 *  capability, D10) and url/path safe. 20 base32 chars × 5 bits/char = 100 bits
 *  of entropy — each char is one uniform 5-bit draw (b % 32 is unbiased because
 *  256 is a multiple of 32). 100 bits is far beyond brute-forceable for an
 *  unlisted capability link. We require a real CSPRNG (crypto.getRandomValues,
 *  always present on Node ≥ 19 and on Vercel) — never silently downgrade to
 *  Math.random, which is NOT cryptographically secure and would make tokens
 *  predictable. */
export function newShareToken(): string {
  const bytes = randomBytes(20);
  let out = "";
  for (const b of bytes) out += BASE32[b % 32];
  return "s_" + out;
}

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

function randomBytes(n: number): Uint8Array {
  const g = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (g === undefined || typeof g.getRandomValues !== "function") {
    // Node/Vercel always provide a CSPRNG; refuse rather than mint a guessable
    // token from Math.random (which would defeat the token-is-the-capability model).
    throw new Error("share_token_no_csprng");
  }
  const buf = new Uint8Array(n);
  g.getRandomValues(buf);
  return buf;
}

// ── SQL implementation ──────────────────────────────────────────────────────

export function makeSqlShareStore(query: QueryFn): ShareStore {
  return {
    async create(ownerUserId, kind, payload, artifacts, atIso) {
      // FK safety: share_snapshots.owner_user_id now REFERENCES users(id) (so a
      // user wipe cascades their published shares). Materialize the user row
      // first (idempotent) — a publish could be a user's first server write.
      await query(
        `INSERT INTO users (id, created_at) VALUES ($1, $2::timestamptz)
         ON CONFLICT (id) DO NOTHING`,
        [ownerUserId, atIso],
      );
      // retry on the (astronomically unlikely) token PK collision
      for (let attempt = 0; attempt < 5; attempt++) {
        const token = newShareToken();
        const { rows } = await query(
          `INSERT INTO share_snapshots (token, owner_user_id, kind, payload, artifacts, forked_from, created_at)
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, NULL, $6::timestamptz)
           ON CONFLICT (token) DO NOTHING
           RETURNING token`,
          [token, ownerUserId, kind, JSON.stringify(payload), JSON.stringify(artifacts), atIso],
        );
        if (rows.length > 0) return { token: String(rows[0].token) };
      }
      throw new Error("share_token_exhausted");
    },

    async get(token) {
      const { rows } = await query(
        `SELECT token, owner_user_id, kind, payload, artifacts, forked_from, created_at
         FROM share_snapshots WHERE token = $1`,
        [token],
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        token: String(r.token),
        owner_user_id: String(r.owner_user_id),
        kind: String(r.kind) as ShareKind,
        payload: (r.payload ?? {}) as Record<string, unknown>,
        artifacts: (r.artifacts ?? {}) as ShareArtifacts,
        forked_from: r.forked_from === null || r.forked_from === undefined ? null : String(r.forked_from),
        created_at: isoOf(r.created_at),
      };
    },

    async recordImport(token, intoUserId, atIso) {
      // FK safety: share_imports.user_id now REFERENCES users(id). Ensure the
      // importer's row exists first (idempotent) so the import never FK-fails.
      await query(
        `INSERT INTO users (id, created_at) VALUES ($1, $2::timestamptz)
         ON CONFLICT (id) DO NOTHING`,
        [intoUserId, atIso],
      );
      await query(
        `INSERT INTO share_imports (token, user_id, created_at)
         VALUES ($1, $2, $3::timestamptz)
         ON CONFLICT (token, user_id) DO NOTHING`,
        [token, intoUserId, atIso],
      );
    },
  };
}


// ── schema (mirrors db/schema.sql style; apply alongside it) ─────────────────

export const SHARE_SCHEMA_SQL = `
-- share_snapshots: a published share is an IMMUTABLE publish-time snapshot
-- (D11). token is the unguessable capability — possessing the link IS the
-- read grant (D10 unlisted share; the GET is auth-free). There is no update
-- path on purpose: editing the source setup later never mutates a snapshot.
-- payload holds ONLY publishable fields (the publisher chooses what to share);
-- owner_user_id is internal lineage and is NEVER exposed by the auth-free GET.
CREATE TABLE IF NOT EXISTS share_snapshots (
  token         TEXT PRIMARY KEY,                          -- unguessable id ("s_...")
  owner_user_id TEXT NOT NULL,                             -- publisher (internal; never leaked publicly)
  kind          TEXT NOT NULL CHECK (kind IN ('track', 'setup')),
  payload       JSONB NOT NULL,                            -- public snapshot fields only
  artifacts     JSONB NOT NULL DEFAULT '{}'::jsonb,        -- { png_url?, pdf_url? } (D12 fill-never-redraw)
  forked_from   TEXT,                                      -- lineage: token this snapshot was forked from (null at root)
  created_at    TIMESTAMPTZ NOT NULL
);

-- share_imports: a fork/import event — user_id forked snapshot token into their
-- garage. (token, user_id) PRIMARY KEY makes a re-import idempotent. This is
-- the lineage ledger ("Strava of RC" fork graph); the snapshot itself stays
-- immutable, so the imported copy lives in the importer's own garage/outbox.
CREATE TABLE IF NOT EXISTS share_imports (
  token      TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (token, user_id)
);
CREATE INDEX IF NOT EXISTS share_imports_user ON share_imports (user_id);
`;
