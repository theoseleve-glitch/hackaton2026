/**
 * racelab-account — injected capability surfaces + the persisted account blob.
 *
 * EVERYTHING that touches the outside world (storage, network, clock, auth
 * tokens) is an injected interface: nothing in this package calls Date.now(),
 * Math.random(), global fetch, or AsyncStorage directly (D18 culture —
 * deterministic-testable, bundles into React Native with zero node built-ins
 * and zero runtime deps).
 *
 * Tier split: packages/schema owns the PURE account math (startTrial,
 * effectiveSubscriptionStatus, checkEntitlement); this package owns
 * ORCHESTRATION (storage round-trips, tamper-guarded clock, best-effort
 * server sync). The cloud is enrichment only — every flow here must complete
 * with every endpoint down.
 */

import type { AccountState, IsoDateTime } from "../../schema/src/index";
import { initAccount, isoToMs, parseAccountState } from "../../schema/src/index";

// ── injected capabilities ─────────────────────────────────────────────────────

/** KV storage — @react-native-async-storage/async-storage satisfies this
 *  structurally (getItem/setItem/removeItem). */
export interface KV {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Minimal structural fetch — the global RN/undici fetch satisfies it. Typed
 *  locally so this package needs neither DOM lib types nor @types/node fetch. */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<FetchResponseLike>;

/** Device wall clock, injected: `() => new Date().toISOString()` at the app
 *  layer. Never trusted raw for entitlements — see guardedNow in trial.ts. */
export type Clock = () => IsoDateTime;

// ── storage keys ──────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  /** JSON AccountState — loads MUST round-trip parseAccountState. */
  account: "racelab.account.v1",
  /** JSON ClockState — the monotonic tamper-guard floor. */
  clock: "racelab.account.clock.v1",
  /** JSON PendingDeletion — tombstone retry-queue entry (deletion.ts). */
  pendingDeletion: "racelab.account.pending_deletion.v1",
  /** Never-wipe stash prefix: corrupt blobs are moved here, never deleted. */
  corruptPrefix: "racelab.account.corrupt.",
} as const;

/** PLACEHOLDER until the Vercel project exists (nothing deploys yet — no
 *  accounts). Callers can always override via deps.apiBase. */
export const DEFAULT_API_BASE = "https://racelab-api.vercel.app";

// ── pure time helpers (conversions only — no clock reads) ────────────────────

export function msToIso(ms: number): IsoDateTime {
  return new Date(ms).toISOString();
}

/** Date.parse that can never NaN-poison arithmetic. */
export function parseMsOr(iso: string | undefined, fallback: number): number {
  if (iso === undefined) return fallback;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? fallback : ms;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// ── account blob persistence (every load goes through parseAccountState) ────

export type LoadAccountResult =
  | { ok: true; account: AccountState; recovered?: { stashed_key: string; parse_reason: string } }
  | { ok: false; reason: "store_error" };

/** Load the persisted AccountState. Missing → fresh initAccount(). Corrupt →
 *  NEVER wiped: the raw blob is stashed under a timestamped corrupt key, the
 *  slot is reset to initAccount(), and the recovery is reported to the caller. */
export async function loadAccount(store: KV, nowIso: IsoDateTime): Promise<LoadAccountResult> {
  let raw: string | null;
  try {
    raw = await store.getItem(STORAGE_KEYS.account);
  } catch {
    return { ok: false, reason: "store_error" };
  }
  if (raw === null) return { ok: true, account: initAccount() };

  let parsed: unknown;
  let parseFailed = false;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parseFailed = true;
  }
  const pr = parseFailed
    ? ({ ok: false, reason: "not_json" } as const)
    : parseAccountState(parsed);
  if (pr.ok) return { ok: true, account: pr.value };

  // never-wipe: stash the corrupt blob, then reset the live slot
  const stashKey = `${STORAGE_KEYS.corruptPrefix}account.${isoToMs(nowIso).toString(36)}`;
  try {
    await store.setItem(stashKey, raw);
    await store.setItem(STORAGE_KEYS.account, JSON.stringify(initAccount()));
  } catch {
    return { ok: false, reason: "store_error" };
  }
  return {
    ok: true,
    account: initAccount(),
    recovered: { stashed_key: stashKey, parse_reason: pr.reason },
  };
}

export async function saveAccount(
  store: KV,
  account: AccountState,
): Promise<{ ok: true } | { ok: false; reason: "store_error" }> {
  try {
    await store.setItem(STORAGE_KEYS.account, JSON.stringify(account));
    rememberGood(store, account); // a confirmed write is the freshest known-good
    return { ok: true };
  } catch {
    return { ok: false, reason: "store_error" };
  }
}

// ── last-known-good account snapshot (BUILD-NOW #9) ─────────────────────────
//
// One flaky AsyncStorage getItem (transient store_error) must NOT paywall an
// active subscriber by re-evaluating against a fresh initAccount(). We keep an
// in-process, per-store last-known-good AccountState: populated by every CLEAN
// load (and every confirmed save), read only to degrade a transient store_error.
//
// Scope is deliberately narrow:
//  - keyed per-KV (a WeakMap, so it never outlives the store / leaks across
//    app installs and is GC-safe),
//  - in-process only (a cold start with dead storage has no snapshot and falls
//    back to fail-closed, exactly as before — premium fails closed, never open),
//  - NOT populated by the corrupt-and-reset recovery (that path has genuinely
//    rewritten the live slot to initAccount(); its semantics stay unchanged).
const lastKnownGood = new WeakMap<KV, AccountState>();

function rememberGood(store: KV, account: AccountState): void {
  lastKnownGood.set(store, account);
}

/** The in-process last-known-good account for this store, if any. */
export function peekLastKnownGood(store: KV): AccountState | undefined {
  return lastKnownGood.get(store);
}

/**
 * loadAccount, hardened for the ENTITLEMENT read path. Identical to loadAccount
 * except that a TRANSIENT store_error (a getItem throw, storage momentarily
 * unavailable — NOT a corrupt blob) degrades to the in-process last-known-good
 * account instead of failing closed against a fresh initAccount(). One flaky
 * read can no longer paywall an active subscriber. A clean load refreshes the
 * snapshot; the corrupt-and-reset path is forwarded untouched. With no snapshot
 * (cold start) it returns the store_error unchanged, so premium still fails
 * CLOSED — never open — and FREE features never reach here at all.
 */
export async function loadAccountResilient(store: KV, nowIso: IsoDateTime): Promise<LoadAccountResult> {
  const loaded = await loadAccount(store, nowIso);
  if (loaded.ok) {
    if (loaded.recovered === undefined) rememberGood(store, loaded.account); // only CLEAN loads
    return loaded;
  }
  const good = lastKnownGood.get(store);
  if (good !== undefined) return { ok: true, account: good };
  return loaded; // no snapshot yet -> unchanged fail-closed store_error
}
