-- Waitlist signups. id is the canonical position (AUTOINCREMENT, never reused).
CREATE TABLE IF NOT EXISTS waitlist_signups (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  signed_up_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  source        TEXT,           -- e.g. 'instagram', 'twitter', 'direct', utm_source
  confirmed_at  TEXT            -- reserved for future double-opt-in
);

CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist_signups(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_signed_up_at ON waitlist_signups(signed_up_at);
