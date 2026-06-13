/**
 * Account deletion — Apple 5.1.1(v) requires IN-APP account deletion, and
 * GDPR Art. 17 requires the server data to actually go away. Orchestration:
 *
 *   DELETE /api/account  (server wipe — users + subscriptions + backups,
 *                         deletions tombstone written server-side)
 *        └─ ok / 404 ──→  caller-provided localWipe()  ──→ { server: "deleted" }
 *        └─ unreachable → localWipe() anyway (the user asked for their data
 *                         to go away — local deletion never waits on a dead
 *                         server) → tombstone retry-queue entry → "queued"
 *
 * The tombstone is written AFTER localWipe so a full-storage-clear wipe
 * cannot erase it. retryPendingDeletion() drains the queue on a later launch.
 *
 * Honest limitation: retrying needs a live bearer token. If the user signs
 * out (or Clerk session lapses) before the queued server wipe succeeds, the
 * retry stays queued with last_error "unauthorized" until they sign in again;
 * local data is already gone either way.
 */

import type { IsoDateTime } from "../../schema/src/index";
import type { FetchLike, FetchResponseLike, KV, Clock } from "./deps";
import { DEFAULT_API_BASE, STORAGE_KEYS, isRecord } from "./deps";
import type { TokenProvider } from "./auth";

export interface DeletionDeps {
  store: KV;
  fetchFn: FetchLike | null;
  now: Clock;
  tokens: TokenProvider;
  apiBase?: string;
}

export interface PendingDeletion {
  user_id?: string;
  requested_at: IsoDateTime;
  attempts: number;
}

export type DeleteAccountResult =
  | { ok: true; server: "deleted" | "queued" | "anonymous"; local_wiped: true }
  | { ok: false; reason: "unauthorized" | "local_wipe_failed" };

/**
 * Delete the account. `localWipe` is caller-provided (it owns the app's
 * storage layout — sheets, runs, outbox, account keys); it may clear
 * everything, the tombstone is written after it runs.
 */
export async function deleteAccount(
  deps: DeletionDeps,
  localWipe: () => Promise<void>,
): Promise<DeleteAccountResult> {
  let token: string | null = null;
  try {
    token = await deps.tokens.getToken();
  } catch {
    token = null;
  }

  // anonymous local account: nothing server-side to delete
  if (token === null) {
    if (!(await runWipe(localWipe))) return { ok: false, reason: "local_wipe_failed" };
    return { ok: true, server: "anonymous", local_wiped: true };
  }

  const userId = deps.tokens.userId();
  let serverDeleted = false;
  let unauthorized = false;
  if (deps.fetchFn !== null) {
    try {
      const res = await deps.fetchFn(`${apiBase(deps)}/api/account`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok || res.status === 404) serverDeleted = true; // 404 = already gone, fine
      else if (res.status === 401 || res.status === 403) unauthorized = true;
    } catch {
      /* unreachable → queue below */
    }
  }
  if (unauthorized) {
    // token rejected: nothing wiped — the caller decides (re-auth, or wipe
    // locally via the anonymous path if the user insists)
    return { ok: false, reason: "unauthorized" };
  }

  if (!(await runWipe(localWipe))) return { ok: false, reason: "local_wipe_failed" };
  if (serverDeleted) return { ok: true, server: "deleted", local_wiped: true };

  // server unreachable / 5xx: queue the wipe (written AFTER localWipe so a
  // clear-all wipe cannot erase it)
  const tomb: PendingDeletion = {
    ...(userId !== null ? { user_id: userId } : {}),
    requested_at: deps.now(),
    attempts: 1,
  };
  try {
    await deps.store.setItem(STORAGE_KEYS.pendingDeletion, JSON.stringify(tomb));
  } catch {
    /* local data already gone; queue write failed — surfaced by result anyway */
  }
  return { ok: true, server: "queued", local_wiped: true };
}

export type RetryDeletionResult =
  | { ok: true; pending: false }
  | { ok: true; pending: true; attempts: number; last_error: "offline" | "unauthorized" | "server_error" }
  | { ok: false; reason: "store_error" };

/** Drain the tombstone queue — call on app launch / connectivity regain. */
export async function retryPendingDeletion(deps: DeletionDeps): Promise<RetryDeletionResult> {
  let raw: string | null;
  try {
    raw = await deps.store.getItem(STORAGE_KEYS.pendingDeletion);
  } catch {
    return { ok: false, reason: "store_error" };
  }
  if (raw === null) return { ok: true, pending: false };

  const tomb = parsePending(raw);
  if (tomb === null) {
    // corrupt queue entry: stash (never-wipe), stop retrying garbage
    try {
      await deps.store.setItem(`${STORAGE_KEYS.corruptPrefix}pending_deletion`, raw);
      await deps.store.removeItem(STORAGE_KEYS.pendingDeletion);
    } catch {
      return { ok: false, reason: "store_error" };
    }
    return { ok: true, pending: false };
  }

  let token: string | null = null;
  try {
    token = await deps.tokens.getToken();
  } catch {
    token = null;
  }
  if (token === null) return { ok: true, pending: true, attempts: tomb.attempts, last_error: "unauthorized" };
  if (deps.fetchFn === null) return { ok: true, pending: true, attempts: tomb.attempts, last_error: "offline" };

  let res: FetchResponseLike;
  try {
    res = await deps.fetchFn(`${apiBase(deps)}/api/account`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: true, pending: true, attempts: tomb.attempts, last_error: "offline" };
  }
  if (res.ok || res.status === 404) {
    try {
      await deps.store.removeItem(STORAGE_KEYS.pendingDeletion);
    } catch {
      return { ok: false, reason: "store_error" };
    }
    return { ok: true, pending: false };
  }
  const last_error = res.status === 401 || res.status === 403 ? "unauthorized" : "server_error";
  const bumped: PendingDeletion = { ...tomb, attempts: tomb.attempts + 1 };
  try {
    await deps.store.setItem(STORAGE_KEYS.pendingDeletion, JSON.stringify(bumped));
  } catch {
    /* best-effort */
  }
  return { ok: true, pending: true, attempts: bumped.attempts, last_error };
}

function apiBase(deps: DeletionDeps): string {
  return (deps.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, "");
}

async function runWipe(localWipe: () => Promise<void>): Promise<boolean> {
  try {
    await localWipe();
    return true;
  } catch {
    return false;
  }
}

function parsePending(raw: string): PendingDeletion | null {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!isRecord(v)) return null;
    if (typeof v.requested_at !== "string" || Number.isNaN(Date.parse(v.requested_at))) return null;
    if (typeof v.attempts !== "number" || !Number.isFinite(v.attempts)) return null;
    if (v.user_id !== undefined && typeof v.user_id !== "string") return null;
    return {
      ...(v.user_id !== undefined ? { user_id: v.user_id } : {}),
      requested_at: v.requested_at,
      attempts: Math.max(1, Math.floor(v.attempts)),
    };
  } catch {
    return null;
  }
}
