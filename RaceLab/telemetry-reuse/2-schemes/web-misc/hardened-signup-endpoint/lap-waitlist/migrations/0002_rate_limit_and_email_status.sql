-- Migration 0002 (2026-05-19) — applied as part of Auditron-Σ remediation
-- Closes audit F-017 (rate limiting via D1 fallback when Pages Workers Rate
-- Limit binding can't be configured via API) and F-020 (records Resend send
-- failures so they can be retried later).

-- Per-IP rate-limit log. PK is (ip, ts) so the same IP can have many entries
-- but each (ip, ts) is unique. We INSERT OR IGNORE on duplicates so a clock-
-- skew double-insert doesn't error. Cleanup is probabilistic (handled in
-- signup.ts: 1% chance per request to DELETE entries older than 1 hour).
CREATE TABLE IF NOT EXISTS rate_limit_log (
  ip            TEXT    NOT NULL,
  ts            INTEGER NOT NULL,     -- unix epoch seconds
  PRIMARY KEY (ip, ts)
);
CREATE INDEX IF NOT EXISTS idx_rate_ip_ts ON rate_limit_log(ip, ts);

-- Record Resend send failures on the original waitlist_signups row so a
-- scheduled retry Worker (future P1) can find them with a simple WHERE.
-- email_send_failed_at IS NOT NULL ⇒ this signup didn't get its confirmation
-- email; needs retry. Default NULL ⇒ either sent successfully or never tried.
ALTER TABLE waitlist_signups ADD COLUMN email_send_failed_at TEXT;
