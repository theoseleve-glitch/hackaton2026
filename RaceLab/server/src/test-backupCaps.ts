/**
 * backupPush size-cap test suite (build-now #6) — the per-entry payload byte
 * cap (MAX_ENTRY_PAYLOAD_BYTES). Exercised against an in-memory Db fake + fake
 * token verifier; no HTTP, no Postgres. backupPush's other behaviour lives in
 * src/test-server.ts (INTEGRATOR-owned); this file owns ONLY the cap.
 *
 * Run from server/:  npx tsx src/test-backupCaps.ts
 */

import type { HttpRequest, ServerCtx } from "./types";
import type { TokenVerifier } from "./auth";
import type {
  Db,
  BackupEntryInput,
  BackupRow,
  SubscriptionRow,
} from "./db";
import { backupPush, MAX_ENTRY_PAYLOAD_BYTES } from "./handlers/backupPush";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

// ── in-memory Db fake (only the seams backupPush touches do real work) ────────

class FakeDb implements Db {
  backups = new Map<string, Map<string, BackupRow>>();
  ensuredUsers = new Set<string>();
  private seqCounter = 0;

  async ensureUser(user_id: string): Promise<void> {
    this.ensuredUsers.add(user_id);
  }
  async recordTrialStart(): Promise<string> {
    throw new Error("not used");
  }
  async getSubscription(): Promise<SubscriptionRow | null> {
    return null;
  }
  async insertBackupEntries(
    user_id: string,
    entries: readonly BackupEntryInput[],
    received_at_iso: string,
  ): Promise<{ inserted: number; skipped: number }> {
    let userMap = this.backups.get(user_id);
    if (userMap === undefined) {
      userMap = new Map();
      this.backups.set(user_id, userMap);
    }
    let inserted = 0;
    for (const e of entries) {
      if (userMap.has(e.entry_id)) continue;
      this.seqCounter++;
      userMap.set(e.entry_id, { ...e, seq: this.seqCounter, received_at: received_at_iso });
      inserted++;
    }
    return { inserted, skipped: entries.length - inserted };
  }
  async listBackupEntries(): Promise<BackupRow[]> {
    return [];
  }
  async deleteUserData(): Promise<void> {
    /* not used */
  }
  async isTombstoned(): Promise<boolean> {
    return false; // not used on the backup-caps path
  }
  /** Total stored rows for a user — to prove a rejected batch touched nothing. */
  count(user_id: string): number {
    return this.backups.get(user_id)?.size ?? 0;
  }
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW = "2026-06-13T12:00:00.000Z";

const verifier: TokenVerifier = {
  verify: async (token) => {
    if (token === "tok-A") return { user_id: "user_A" };
    return null;
  },
};

function req(opts?: { token?: string; body?: unknown }): HttpRequest {
  return {
    method: "POST",
    path: "/api/backup/push",
    headers: opts?.token !== undefined ? { authorization: `Bearer ${opts.token}` } : {},
    query: {},
    body: opts?.body,
  };
}

/** Entry with a payload whose JSON.stringify length is ~`approxLen` chars. */
function entryWithPayloadOfLen(id: string, approxLen: number): Record<string, unknown> {
  // {"s":"<filler>"} -> JSON envelope around the string value is 8 chars.
  const filler = "x".repeat(Math.max(0, approxLen - 8));
  return { entry_id: id, ts: NOW, domain: "runs", op: "create", payload: { s: filler } };
}

// ═══ per-entry payload size cap (413) ════════════════════════════════════════

console.log("— backupPush per-entry payload cap —");
{
  const CAP = MAX_ENTRY_PAYLOAD_BYTES;
  check("cap constant is 256 KiB", CAP === 256 * 1024);

  // a payload right AT the cap (length === CAP) is accepted (cap is strict >).
  {
    const db = new FakeDb();
    const ctx: ServerCtx = { db, verifier, now: () => NOW };
    const at = entryWithPayloadOfLen("ob-at", CAP);
    check("cap: at-cap payload JSON length === CAP (sanity)", JSON.stringify(at.payload).length === CAP);
    const r = await backupPush(ctx, req({ token: "tok-A", body: { entries: [at] } }));
    check("cap: at-cap entry -> 200 inserted (boundary is strict >)", r.status === 200 && r.json.inserted === 1);
  }

  // one char over the cap -> 413 payload_too_large with the offending index.
  {
    const db = new FakeDb();
    const ctx: ServerCtx = { db, verifier, now: () => NOW };
    const over = entryWithPayloadOfLen("ob-over", CAP + 1);
    check("cap: over-cap payload JSON length === CAP+1 (sanity)", JSON.stringify(over.payload).length === CAP + 1);
    const r = await backupPush(ctx, req({ token: "tok-A", body: { entries: [over] } }));
    check("cap: over-cap entry -> 413 payload_too_large", r.status === 413 && r.json.error === "payload_too_large");
    check("cap: 413 reports the offending index", r.json.index === 0);
    // rejected BEFORE the db: nothing stored, user never ensured.
    check("cap: rejected batch stored nothing", db.count("user_A") === 0);
    check("cap: rejected batch did not ensure the user", db.ensuredUsers.size === 0);
  }

  // the cap rejects the WHOLE batch (a valid + an oversized entry) at the
  // oversized index — we never half-accept a journal.
  {
    const db = new FakeDb();
    const ctx: ServerCtx = { db, verifier, now: () => NOW };
    const ok = entryWithPayloadOfLen("ob-ok", 64); // small, fine
    const over = entryWithPayloadOfLen("ob-big", CAP + 100);
    const r = await backupPush(ctx, req({ token: "tok-A", body: { entries: [ok, over] } }));
    check("cap: mixed batch -> 413 at the oversized index", r.status === 413 && r.json.error === "payload_too_large" && r.json.index === 1);
    check("cap: mixed batch stored NOTHING (whole-batch reject)", db.count("user_A") === 0);
  }

  // size check runs only after structural validation: a structurally bad entry
  // BEFORE an oversized one still returns the structural 400, not 413.
  {
    const db = new FakeDb();
    const ctx: ServerCtx = { db, verifier, now: () => NOW };
    const badTs = { entry_id: "ob-bad", ts: "not-a-date", domain: "runs", op: "create", payload: {} };
    const over = entryWithPayloadOfLen("ob-big2", CAP + 1);
    const r = await backupPush(ctx, req({ token: "tok-A", body: { entries: [badTs, over] } }));
    check("cap: structural 400 precedes the size 413 (index 0 wins)", r.status === 400 && r.json.field === "ts" && r.json.index === 0);
  }

  // a normal small batch still passes (regression guard).
  {
    const db = new FakeDb();
    const ctx: ServerCtx = { db, verifier, now: () => NOW };
    const r = await backupPush(ctx, req({ token: "tok-A", body: { entries: [entryWithPayloadOfLen("ob-1", 100), entryWithPayloadOfLen("ob-2", 200)] } }));
    check("cap: normal small batch -> 200, both inserted", r.status === 200 && r.json.inserted === 2);
    check("cap: server_time echoed", r.json.server_time === NOW);
  }
}

// ═══ verdict ═════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nBACKUP-CAPS: all checks passed" : `\nBACKUP-CAPS: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
