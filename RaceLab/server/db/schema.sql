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

-- subscriptions: written by the EXTERNAL WEB checkout platform (never by the
-- app — no IAP). status is the raw platform fact; the API computes
-- active/expired against expires_at at read time.
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status             TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'expired')),
  expires_at         TIMESTAMPTZ,                          -- null = lifetime/manual
  stripe_customer_id TEXT,                                 -- Stripe customer ("cus_…"); set by the webhook, read by the Portal
  last_event_at      TIMESTAMPTZ,                          -- Stripe event.created watermark; upsert ignores older deliveries (unordered/at-least-once)
  source             TEXT NOT NULL DEFAULT 'web',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
