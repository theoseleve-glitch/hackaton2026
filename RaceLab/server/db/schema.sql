-- RaceLab Tier B schema (Neon Postgres).
-- Apply with: psql "$DATABASE_URL" -f db/schema.sql  (or the Neon SQL editor).
-- Mirrors server/src/db.ts makeSqlDb — change them together.

-- users: one row per Clerk account. trial_started_at is FIRST-SEEN and never
-- moves once set (later device claims cannot restart the trial clock).
CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,                      -- Clerk user id ("user_...")
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  trial_started_at TIMESTAMPTZ                            -- null until the first trial claim
);

-- (REMOVED at B0+ improvement pass) the legacy `subscriptions` table is gone:
-- subscription truth now lives in `stripe_subscriptions` (written by the Stripe
-- webhook, read by /subscription/status + /entitlement, wiped by deleteUserData).
-- Nothing reads or writes `subscriptions` anymore.

-- backup_entries: the synced outbox journal (packages/schema OutboxEntry).
-- entry_id is the client-generated idempotency key (OutboxEntry.id, "ob-...");
-- (user_id, entry_id) UNIQUE makes duplicate pushes no-ops. seq is a
-- SERVER-assigned cursor for restore pagination — client seqs are per-device
-- and would collide across devices, so they stay inside the payload they came
-- with and are NOT used for ordering here.
CREATE TABLE IF NOT EXISTS backup_entries (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_id    TEXT NOT NULL,
  seq         BIGINT GENERATED ALWAYS AS IDENTITY,
  ts          TIMESTAMPTZ NOT NULL,                       -- client-side append time
  domain      TEXT NOT NULL,                              -- outbox domain (free string: forward compat)
  op          TEXT NOT NULL,                              -- create | update | delete (free string: forward compat)
  payload     JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entry_id)
);
CREATE INDEX IF NOT EXISTS backup_entries_user_seq ON backup_entries (user_id, seq);

-- deletions: GDPR/audit tombstones. Survives the user wipe on purpose
-- (legitimate-interest record that a deletion was requested and honored).
-- First request wins; re-deletes are idempotent no-ops.
CREATE TABLE IF NOT EXISTS deletions (
  user_id      TEXT PRIMARY KEY,
  requested_at TIMESTAMPTZ NOT NULL
);

-- ============================================================================
-- BACKEND.md Tier-B modules (B0+ build, 2026-06-13). Each block mirrors a
-- src/stores/*Store.ts *_SCHEMA_SQL const — change them together. All
-- code-ready; NOT deployed until accounts/keys exist (see src/deploy.ts).
-- ============================================================================

-- stripe webhook (D29 web Stripe, no IAP): idempotency ledger + subscription
-- truth (post-Stripe). subscription_status/entitlement read stripe_subscriptions.
CREATE TABLE IF NOT EXISTS processed_stripe_events (
  event_id     TEXT PRIMARY KEY,                          -- Stripe event id ("evt_...")
  processed_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, -- Clerk user id ("user_...")
  status             TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'expired')),
  current_period_end TIMESTAMPTZ,                          -- paid-through; null = no expiry asserted
  event_created      BIGINT NOT NULL,                      -- unix s of last applied event (out-of-order watermark)
  updated_at         TIMESTAMPTZ NOT NULL
);

-- media (P0.5): upload-url quota ledger; blob bytes live in object storage.
-- `confirmed` flips true once the client's PUT is verified (POST /api/media/confirm);
-- an UNconfirmed row whose presign aged out is reclaimed by the presignSweep cron
-- (workers/mediaMaintenance) so abandoned reservations stop overstating the quota.
CREATE TABLE IF NOT EXISTS media (
  media_id   TEXT PRIMARY KEY,                             -- server-generated, embedded in the blob key
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime       TEXT NOT NULL,                                -- allowlisted at upload time
  bytes      BIGINT NOT NULL,                              -- declared upload size (quota accounting)
  confirmed  BOOLEAN NOT NULL DEFAULT false,               -- true once the upload PUT is verified (else swept)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_user ON media (user_id);

-- backup domain-blobs (P1, D11 — whole-domain snapshot, NOT entity sync).
CREATE TABLE IF NOT EXISTS backup_blobs (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain     TEXT NOT NULL,                                -- garage|tracks|logbook|reports|account|sheets:<carId>
  format     INT NOT NULL,                                 -- client envelope schema version (opaque to server)
  state      JSONB NOT NULL,                               -- whole-domain snapshot, stored VERBATIM (no server migration)
  updated_at TIMESTAMPTZ NOT NULL,                         -- optimistic-concurrency token
  PRIMARY KEY (user_id, domain)
);

-- share + fork (P1 social, D10 unlisted link only). Immutable publish-time
-- snapshot; auth-free token GET; fork lineage ledger.
CREATE TABLE IF NOT EXISTS share_snapshots (
  token         TEXT PRIMARY KEY,                          -- unguessable capability ("s_...")
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- internal lineage; NEVER exposed by the auth-free GET
  kind          TEXT NOT NULL CHECK (kind IN ('track', 'setup')),
  payload       JSONB NOT NULL,                            -- publishable fields only (server-scrubbed)
  artifacts     JSONB NOT NULL DEFAULT '{}'::jsonb,        -- { png_url?, pdf_url? } (D12)
  forked_from   TEXT,
  created_at    TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS share_imports (
  token      TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (token, user_id)
);
CREATE INDEX IF NOT EXISTS share_imports_user ON share_imports (user_id);

-- content delivery (P2): signed bundle manifests (rcdata/kb); monotonic version.
CREATE TABLE IF NOT EXISTS content_versions (
  name         TEXT NOT NULL,                              -- 'rcdata' | 'kb'
  version      INTEGER NOT NULL,                           -- monotonic; served latest = MAX(version)
  content_hash TEXT NOT NULL,                              -- app re-verifies bytes against this
  url          TEXT NOT NULL,                              -- blob/CDN pointer
  published_at TIMESTAMPTZ,
  PRIMARY KEY (name, version)
);

-- GDPR export jobs (P2, D17): async archive of the user's data.
CREATE TABLE IF NOT EXISTS export_jobs (
  job_id     TEXT PRIMARY KEY,                             -- server-generated ("exp-...")
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'ready', 'failed')),
  url        TEXT,                                         -- signed archive url, null until ready
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS export_jobs_user ON export_jobs (user_id, created_at);

-- push tokens (P2): many devices per user; per-device opt-ins (marketing consent).
CREATE TABLE IF NOT EXISTS push_tokens (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id  TEXT NOT NULL,                                -- client-stable install id
  token      TEXT NOT NULL,                                -- Expo push token (rotates)
  prefs      JSONB NOT NULL DEFAULT '{}'::jsonb,           -- per-device notification opt-ins
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);
