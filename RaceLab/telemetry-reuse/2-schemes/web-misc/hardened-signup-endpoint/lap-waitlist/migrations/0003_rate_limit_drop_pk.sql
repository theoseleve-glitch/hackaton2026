-- Migration 0003 (2026-05-19) — fixes F-017 closure that landed broken in 0002.
--
-- Bug found in live hammer test: 15 parallel POSTs all returned 200, no 429s.
-- Root cause:
--   1. PRIMARY KEY (ip, ts) with ts in epoch seconds + INSERT OR IGNORE meant
--      same-second bursts silently deduped → COUNT stayed at 1 for all.
--   2. Check-then-insert ordering raced: all 15 SELECTs saw count=0 before
--      any INSERT committed.
--
-- Fix: drop the table, recreate with no PK (just index on ip, ts in ms).
-- Signup.ts will use a D1 batch to make INSERT+COUNT atomic.

DROP TABLE IF EXISTS rate_limit_log;

CREATE TABLE rate_limit_log (
  ip TEXT    NOT NULL,
  ts INTEGER NOT NULL  -- epoch milliseconds (was seconds in 0002)
);

CREATE INDEX idx_rate_ip_ts ON rate_limit_log(ip, ts);
