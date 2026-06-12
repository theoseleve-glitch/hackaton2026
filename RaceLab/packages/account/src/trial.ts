/**
 * Trial orchestration (Tier A). packages/schema owns the PURE state math
 * (startTrial / effectiveSubscriptionStatus / checkEntitlement); this module
 * owns ORCHESTRATION: storage round-trips, the tamper-guarded clock, and the
 * best-effort server record/reconcile via POST /api/trial/start.
 *
 * Monetization decisions (William, CEO):
 *  - TRIAL_DAYS = 15 — one free trial, ever.
 *  - The trial starts LOCALLY at the first premium-feature touch (offline is
 *    fine) and is recorded server-side when online; the server's FIRST-SEEN
 *    start wins over any later device claim, so a reinstall or a second
 *    device can never restart the clock.
 *
 * ── Clock-tamper guard ───────────────────────────────────────────────────────
 * We persist a monotonic floor: `last_seen_local_time` (highest device time
 * ever observed) and `last_seen_server_time` (highest server-asserted time
 * ever received). Effective now = max(injected now, both floors). Rolling the
 * device clock BACK therefore never extends a trial: time freezes at the
 * floor instead of rewinding past it, and the next server contact snaps the
 * floor forward again.
 *
 * Residual window, stated honestly: a device that stays OFFLINE can freeze
 * its effective clock at the floor by rolling the wall clock back — the trial
 * then stops counting down until the device next observes a later time
 * (locally or from any server response). We cannot detect "real time passed
 * while the clock lied" without a trusted time source; the floor only
 * guarantees the trial never REWINDS and that one server round-trip ends the
 * freeze. Accepted: the gated features are sync/cloud features, so a
 * permanently-offline tamperer is gating themselves out of most of what they
 * froze the trial for (the advisor is free anyway, D18/D20).
 */

import type { AccountState, IsoDateTime, SubscriptionStatus } from "../../schema/src/index";
import { effectiveSubscriptionStatus, isoToMs, startTrial } from "../../schema/src/index";
import { deepFreeze } from "../../schema/src/vocab";
import type { Clock, FetchLike, FetchResponseLike, KV, LoadAccountResult } from "./deps";
import {
  DEFAULT_API_BASE,
  STORAGE_KEYS,
  isRecord,
  loadAccount,
  msToIso,
  parseMsOr,
  saveAccount,
} from "./deps";
import type { TokenProvider } from "./auth";

export const TRIAL_DAYS = 15;
const DAY_MS = 86_400_000;

export interface TrialDeps {
  store: KV;
  /** null = no network capability right now (airplane mode / no transport). */
  fetchFn: FetchLike | null;
  /** Device wall clock — never trusted raw, see guardedNow. */
  now: Clock;
  /** Auth boundary; absent or token-null = anonymous (server sync skipped). */
  tokens?: TokenProvider;
  /** Defaults to DEFAULT_API_BASE (placeholder until the Vercel project exists). */
  apiBase?: string;
}

// ── tamper-guarded clock ─────────────────────────────────────────────────────

export interface ClockState {
  last_seen_local_time: IsoDateTime;
  last_seen_server_time?: IsoDateTime;
}

/** No-throw read of the persisted floor; corrupt blobs are stashed (never
 *  wiped) and treated as absent. */
async function readClockState(store: KV): Promise<ClockState | null> {
  let raw: string | null;
  try {
    raw = await store.getItem(STORAGE_KEYS.clock);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (isRecord(v)) {
      const local =
        typeof v.last_seen_local_time === "string" && !Number.isNaN(Date.parse(v.last_seen_local_time))
          ? v.last_seen_local_time
          : null;
      const server =
        typeof v.last_seen_server_time === "string" && !Number.isNaN(Date.parse(v.last_seen_server_time))
          ? v.last_seen_server_time
          : undefined;
      if (local !== null) {
        return { last_seen_local_time: local, ...(server !== undefined ? { last_seen_server_time: server } : {}) };
      }
    }
  } catch {
    /* fall through to stash */
  }
  try {
    await store.setItem(`${STORAGE_KEYS.corruptPrefix}clock`, raw);
    await store.removeItem(STORAGE_KEYS.clock);
  } catch {
    /* best-effort */
  }
  return null;
}

/** Effective now = max(injected device clock, persisted monotonic floor).
 *  Advances the local floor as a side effect. NEVER throws — a storage
 *  failure degrades to the raw device clock, it does not block a read. */
export async function guardedNow(deps: { store: KV; now: Clock }): Promise<IsoDateTime> {
  const rawMs = parseMsOr(deps.now(), 0);
  const state = await readClockState(deps.store);
  const localFloor = state === null ? 0 : parseMsOr(state.last_seen_local_time, 0);
  const serverFloor = state === null ? 0 : parseMsOr(state.last_seen_server_time, 0);
  const effMs = Math.max(rawMs, localFloor, serverFloor);
  if (effMs > localFloor) {
    try {
      await deps.store.setItem(
        STORAGE_KEYS.clock,
        JSON.stringify({
          last_seen_local_time: msToIso(effMs),
          ...(state?.last_seen_server_time !== undefined
            ? { last_seen_server_time: state.last_seen_server_time }
            : {}),
        }),
      );
    } catch {
      /* floor persistence is best-effort — never blocks an entitlement read */
    }
  }
  return msToIso(effMs);
}

/** Raise the floor with a server-asserted timestamp (every API response
 *  carries `server_time`). Only ever raises, never lowers. Best-effort. */
export async function noteServerTime(store: KV, serverIso: IsoDateTime): Promise<void> {
  const serverMs = parseMsOr(serverIso, Number.NaN);
  if (Number.isNaN(serverMs)) return;
  const state = await readClockState(store);
  const prevServer = state === null ? 0 : parseMsOr(state.last_seen_server_time, 0);
  const prevLocal = state === null ? 0 : parseMsOr(state.last_seen_local_time, 0);
  if (serverMs <= prevServer) return;
  try {
    await store.setItem(
      STORAGE_KEYS.clock,
      JSON.stringify({
        last_seen_local_time: msToIso(Math.max(prevLocal, serverMs)),
        last_seen_server_time: msToIso(serverMs),
      }),
    );
  } catch {
    /* best-effort */
  }
}

// ── trial service ────────────────────────────────────────────────────────────

export type TrialSync =
  | "recorded" //      server acknowledged; its first-seen matched ours
  | "reconciled" //    server knew an earlier/different first-seen — we adopted it
  | "offline" //       no transport — will sync on a later call
  | "server_error" //  endpoint reachable but unhappy — local trial stands
  | "anonymous" //     no token — will sync after signup
  | "not_needed"; //   already subscribed (active/grace)

export type EnsureTrialResult =
  | {
      ok: true;
      account: AccountState;
      status: SubscriptionStatus;
      /** true only on the call that actually started the local trial */
      started: boolean;
      sync: TrialSync;
      recovered?: { stashed_key: string; parse_reason: string };
    }
  | { ok: false; reason: "store_error" };

export class TrialService {
  constructor(private readonly deps: TrialDeps) {}

  /** The tamper-guarded clock (see module doc). */
  now(): Promise<IsoDateTime> {
    return guardedNow(this.deps);
  }

  async getAccount(): Promise<LoadAccountResult> {
    return loadAccount(this.deps.store, await guardedNow(this.deps));
  }

  /**
   * Idempotent "the user touched a premium feature" hook:
   *  1. starts the local trial if it never ran (works fully offline),
   *  2. best-effort records it server-side (POST /api/trial/start),
   *  3. reconciles the server's FIRST-SEEN start vs local — server wins.
   * Never starts a second trial; never blocks on the network.
   */
  async ensureTrialState(): Promise<EnsureTrialResult> {
    const nowIso = await guardedNow(this.deps);
    const loaded = await loadAccount(this.deps.store, nowIso);
    if (!loaded.ok) return { ok: false, reason: "store_error" };
    let account = loaded.account;
    const recovered = loaded.recovered;

    const statusBefore = effectiveSubscriptionStatus(account, nowIso);
    if (statusBefore === "active" || statusBefore === "grace") {
      return {
        ok: true,
        account,
        status: statusBefore,
        started: false,
        sync: "not_needed",
        ...(recovered !== undefined ? { recovered } : {}),
      };
    }

    let started = false;
    if (account.trial_started_at === undefined) {
      const r = startTrial(account, nowIso, TRIAL_DAYS);
      if (r.ok) {
        // (the reject branches are unreachable here: trial unused, not subscribed,
        //  constant duration — but we never assume, so a reject just means no-start)
        account = r.account;
        started = true;
        const s = await saveAccount(this.deps.store, account);
        if (!s.ok) return { ok: false, reason: "store_error" };
      }
    }

    const synced = await this.syncTrialWithServer(account);
    if ("storeError" in synced) return { ok: false, reason: "store_error" };
    account = synced.account;

    return {
      ok: true,
      account,
      status: effectiveSubscriptionStatus(account, await guardedNow(this.deps)),
      started,
      sync: synced.sync,
      ...(recovered !== undefined ? { recovered } : {}),
    };
  }

  /** Best-effort POST /api/trial/start + first-seen reconcile. Never throws. */
  private async syncTrialWithServer(
    account: AccountState,
  ): Promise<{ sync: TrialSync; account: AccountState } | { storeError: true }> {
    const localStart = account.trial_started_at;
    if (localStart === undefined) return { sync: "not_needed", account };

    let token: string | null = null;
    if (this.deps.tokens !== undefined) {
      try {
        token = await this.deps.tokens.getToken();
      } catch {
        token = null;
      }
    }
    if (token === null) return { sync: "anonymous", account };
    if (this.deps.fetchFn === null) return { sync: "offline", account };

    const base = (this.deps.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, "");
    let res: FetchResponseLike;
    try {
      res = await this.deps.fetchFn(`${base}/api/trial/start`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ trial_started_at: localStart }),
      });
    } catch {
      return { sync: "offline", account };
    }
    if (!res.ok) return { sync: "server_error", account };

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { sync: "server_error", account };
    }
    if (
      !isRecord(body) ||
      typeof body.trial_started_at !== "string" ||
      Number.isNaN(Date.parse(body.trial_started_at))
    ) {
      return { sync: "server_error", account };
    }
    if (typeof body.server_time === "string") {
      await noteServerTime(this.deps.store, body.server_time);
    }

    const serverStart = body.trial_started_at;
    const uid = this.deps.tokens?.userId() ?? null;
    let next = account;
    let changed = false;
    let reconciled = false;

    if (uid !== null && account.user_id !== uid) {
      next = { ...next, user_id: uid };
      changed = true;
    }
    if (isoToMs(serverStart) !== isoToMs(localStart)) {
      // server first-seen wins — the one true start across devices/reinstalls
      next = {
        ...next,
        trial_started_at: serverStart,
        trial_ends_at: msToIso(isoToMs(serverStart) + TRIAL_DAYS * DAY_MS),
        subscription: { ...next.subscription, status: "trial" },
      };
      changed = true;
      reconciled = true;
    }
    if (changed) {
      const frozen = deepFreeze(next);
      const s = await saveAccount(this.deps.store, frozen);
      if (!s.ok) return { storeError: true };
      next = frozen;
    }
    return { sync: reconciled ? "reconciled" : "recorded", account: next };
  }
}
