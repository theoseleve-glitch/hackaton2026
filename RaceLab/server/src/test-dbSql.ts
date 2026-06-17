/**
 * SQL contract test for makeSqlDb — drives the real repo over a RECORDING
 * QueryFn (captures {sql, params}, returns canned rows) and pins the table
 * names, columns, owner-scoping predicates, ON CONFLICT targets, and isoOf
 * normalization. Without this, dropping `user_id = $1` from the real SQL would
 * leave every cross-user isolation test green (those run against the FakeDb's
 * JS filter, not the SQL). Mirrors the per-store *Sql.ts recorders.
 */

import { makeSqlDb } from "./db";
import type { QueryFn } from "./db";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) console.log(`ok   ${label}`);
  else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

const NOW = "2026-06-12T12:00:00.000Z";
const PG_TEXT_TS = "2026-06-12 12:00:00+00"; // neon HTTP driver shape (NOT ISO)
const ISO_OF_PG = new Date(PG_TEXT_TS).toISOString();

/** Recording QueryFn: remembers the last call, returns caller-chosen rows. */
function recorder(rows: Record<string, unknown>[] = []) {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const fn: QueryFn = async (sql, params = []) => {
    calls.push({ sql, params });
    return { rows };
  };
  return { fn, calls, last: () => calls[calls.length - 1] };
}

console.log("— db SQL contract (owner-scoping + tables + isoOf) —");

// ensureUser
{
  const rec = recorder();
  await makeSqlDb(rec.fn).ensureUser("user_A", NOW);
  const c = rec.last();
  check("ensureUser: INSERT INTO users ON CONFLICT (id) DO NOTHING", /INSERT INTO users\b/.test(c.sql) && /ON CONFLICT \(id\) DO NOTHING/.test(c.sql));
  check("ensureUser: params bind user_id then now", c.params[0] === "user_A" && c.params[1] === NOW);
}

// recordTrialStart (first-seen + isoOf of the returned instant)
{
  const rec = recorder([{ trial_started_at: PG_TEXT_TS }]);
  const got = await makeSqlDb(rec.fn).recordTrialStart("user_A", "2026-06-01T00:00:00.000Z", NOW);
  const c = rec.last();
  check("recordTrialStart: ON CONFLICT (id) DO UPDATE + COALESCE first-seen", /ON CONFLICT \(id\) DO UPDATE/.test(c.sql) && /COALESCE\(users\.trial_started_at/.test(c.sql));
  check("recordTrialStart: RETURNING trial_started_at", /RETURNING trial_started_at/.test(c.sql));
  check("recordTrialStart: normalizes pg-TEXT result to ISO", got === ISO_OF_PG);
}

// getSubscription — MUST read stripe_subscriptions (NOT the dropped legacy table)
{
  const rec = recorder([{ status: "active", expires_at: PG_TEXT_TS }]);
  const got = await makeSqlDb(rec.fn).getSubscription("user_A");
  const c = rec.last();
  check("getSubscription: FROM stripe_subscriptions (not legacy subscriptions)", /FROM stripe_subscriptions\b/.test(c.sql) && !/FROM subscriptions\b/.test(c.sql));
  check("getSubscription: current_period_end AS expires_at", /current_period_end AS expires_at/.test(c.sql));
  check("getSubscription: owner-scoped WHERE user_id = $1", /WHERE user_id = \$1/.test(c.sql) && c.params[0] === "user_A");
  check("getSubscription: maps + isoOf the expiry", got?.status === "active" && got?.expires_at === ISO_OF_PG);
}
{
  const rec = recorder([]); // no row
  const got = await makeSqlDb(rec.fn).getSubscription("user_A");
  check("getSubscription: no row -> null", got === null);
}

// insertBackupEntries — idempotency target + owner scoping
{
  const rec = recorder([{ seq: 1 }]);
  const r = await makeSqlDb(rec.fn).insertBackupEntries("user_A", [{ entry_id: "ob-1", ts: NOW, domain: "runs", op: "create", payload: { v: 1 } }], NOW);
  const c = rec.last();
  check("insertBackupEntries: INTO backup_entries", /INSERT INTO backup_entries\b/.test(c.sql));
  check("insertBackupEntries: ON CONFLICT (user_id, entry_id) DO NOTHING", /ON CONFLICT \(user_id, entry_id\) DO NOTHING/.test(c.sql));
  check("insertBackupEntries: user_id bound first, entry_id second", c.params[0] === "user_A" && c.params[1] === "ob-1");
  check("insertBackupEntries: RETURNING seq -> inserted count", r.inserted === 1 && r.skipped === 0);
}

// listBackupEntries — the IDOR-critical read: must be user-scoped + ordered + limited
{
  const rec = recorder([{ seq: 5, entry_id: "ob-5", ts: PG_TEXT_TS, domain: "runs", op: "create", payload: { v: 1 }, received_at: PG_TEXT_TS }]);
  const rows = await makeSqlDb(rec.fn).listBackupEntries("user_A", 3, 50);
  const c = rec.last();
  check("listBackupEntries: FROM backup_entries", /FROM backup_entries\b/.test(c.sql));
  check("listBackupEntries: WHERE user_id = $1 AND seq > $2 (owner + cursor)", /WHERE user_id = \$1 AND seq > \$2/.test(c.sql));
  check("listBackupEntries: ORDER BY seq ASC + LIMIT $3", /ORDER BY seq ASC/.test(c.sql) && /LIMIT \$3/.test(c.sql));
  check("listBackupEntries: params (user, after_seq, limit)", c.params[0] === "user_A" && c.params[1] === 3 && c.params[2] === 50);
  check("listBackupEntries: isoOf on ts + received_at", rows[0]?.ts === ISO_OF_PG && rows[0]?.received_at === ISO_OF_PG);
}

// deleteUserData — wipes every live table, never the legacy one
{
  const rec = recorder();
  await makeSqlDb(rec.fn).deleteUserData("user_A", NOW);
  const sql = rec.last().sql;
  for (const t of ["backup_entries", "backup_blobs", "media", "export_jobs", "push_tokens", "stripe_subscriptions", "share_snapshots", "share_imports", "users"]) {
    check(`deleteUserData: DELETE FROM ${t}`, new RegExp(`DELETE FROM ${t}\\b`).test(sql));
  }
  check("deleteUserData: never the dropped legacy `subscriptions`", !/DELETE FROM subscriptions\b/.test(sql));
  check("deleteUserData: tombstones via INSERT INTO deletions", /INSERT INTO deletions/.test(sql));
}

// isTombstoned — reads the surviving deletions tombstone (re-trial gate)
{
  const rec = recorder([{ "?column?": 1 }]); // a present row
  const yes = await makeSqlDb(rec.fn).isTombstoned("user_A");
  check("isTombstoned: SELECT FROM deletions WHERE user_id = $1", /select\s+1\s+from\s+deletions\s+where\s+user_id\s*=\s*\$1/i.test(rec.last().sql), rec.last().sql);
  check("isTombstoned: params bind user_id", rec.last().params[0] === "user_A");
  check("isTombstoned: row present -> true", yes === true);
  const recNone = recorder([]); // no row
  const no = await makeSqlDb(recNone.fn).isTombstoned("user_A");
  check("isTombstoned: no row -> false", no === false);
}

console.log(failures === 0 ? "\nDB-SQL: all checks passed" : `\nDB-SQL: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
