/**
 * Entitlement bridge (app layer). Wires @racelab/account's never-throw,
 * offline-first entitlement math into React.
 *
 * BILLING IS NOW IN-APP PURCHASES (RevenueCat / Google Play Billing). The paid
 * signal source is RevenueCat's `customerInfo.entitlements.active['pro']`, read
 * via src/iap.ts — NOT the server `validateSubscription` path. The entitlement
 * MATH (checkEntitlement / effectiveSubscriptionStatus on the cached
 * AccountState) is unchanged; only the source that flips the cached
 * subscription to "active" changed (server → IAP). The local 15-day trial is
 * untouched. The web-Stripe server endpoints + the racelab://subscribe deep
 * link are now dead code on this rail and left dormant in @racelab/account.
 *
 * D18 invariants honored here:
 *  - The ADVISOR (FREE_FEATURES) is allowed SYNCHRONOUSLY with zero I/O and
 *    without subscribing to the controller (useEntitlement short-circuits).
 *  - App launch is NEVER gated: the provider mounts immediately, seeds its
 *    cache asynchronously, fires configureIap() + a first syncIap() WITHOUT
 *    awaiting, and every entitlement decision is computed from the in-memory
 *    cached AccountState (fail-closed initAccount() until seeded). No render
 *    path awaits RevenueCat init or the network.
 *  - The real trial STARTS at first premium touch via ensure() →
 *    touchPremiumFeature (NOT at onboarding).
 *  - syncIap() is offline-grace-safe and never throws: iap.readEntitlement()
 *    returns {active:false} on any failure, and a non-active read NEVER clears a
 *    cached ever-paid/grace subscription (same non-destructive guard the server
 *    validate path used).
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  guardedNow,
  loadAccount,
  saveAccount,
  touchPremiumFeature,
} from "@racelab/account";
import type {
  AccountState,
  Clock,
  EntitlementResult,
  Feature,
  FetchLike,
  KV,
  SubscriptionStatus,
} from "@racelab/account";
import {
  FREE_FEATURES,
  checkEntitlement,
  effectiveSubscriptionStatus,
  initAccount,
} from "@racelab/schema";
import type { Subscription } from "@racelab/schema";
import {
  configureIap,
  onEntitlementChange,
  purchasePlan,
  readEntitlement,
  restore as restoreIap,
} from "./iap";

const DAY_MS = 86_400_000;
/** Debounce window for the foreground re-sync trigger. */
const FOREGROUND_DEBOUNCE_MS = 60_000;

// ── injected capability adapters ──────────────────────────────────────────────

/** AsyncStorage → the exact 3-method KV surface @racelab/account needs. */
const STORE: KV = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

/** Device wall clock — never trusted raw; guardedNow applies the tamper floor. */
const NOW: Clock = () => new Date().toISOString();

/** The global fetch, typed structurally as FetchLike (null if unavailable).
 *  DORMANT on the IAP rail: kept only so touchPremiumFeature's deps shape is
 *  satisfied (its server-sync arm is a no-op while anonymous). */
const FETCH: FetchLike | null =
  typeof fetch === "function"
    ? (url, init) => fetch(url, init as RequestInit) as Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
    : null;

// ── controller (single instance, useRef-held) ────────────────────────────────

/** Days remaining in the trial, or null when not in trial. */
function trialDaysLeftFrom(account: AccountState, nowIso: string): number | null {
  if (account.trial_ends_at === undefined) return null;
  const end = Date.parse(account.trial_ends_at);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(end) || !Number.isFinite(now)) return null;
  if (now > end) return 0;
  return Math.max(0, Math.ceil((end - now) / DAY_MS));
}

/**
 * Owns the shared deps + the in-memory cache. Exposes a useSyncExternalStore
 * subscribe/getSnapshot pair; the snapshot is a stable object swapped on change
 * so subscribers re-render only when account/now actually move.
 */
class EntitlementController {
  private store = STORE;
  private now = NOW;
  private fetchFn = FETCH;

  private account: AccountState = initAccount();
  private nowIso: string = new Date().toISOString();
  private snapshot: { account: AccountState; nowIso: string } = {
    account: this.account,
    nowIso: this.nowIso,
  };

  private listeners = new Set<() => void>();
  /** Single-flight latch for syncIap(). */
  private syncing: Promise<void> | null = null;
  private lastForegroundSync = 0;

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = (): { account: AccountState; nowIso: string } => this.snapshot;

  private notify(): void {
    this.snapshot = { account: this.account, nowIso: this.nowIso };
    for (const l of this.listeners) l();
  }

  /** Reload the cached account + guarded-now from storage and notify. Never throws. */
  async reload(): Promise<void> {
    const nowIso = await guardedNow({ store: this.store, now: this.now });
    const loaded = await loadAccount(this.store, nowIso);
    this.account = loaded.ok ? loaded.account : initAccount();
    this.nowIso = nowIso;
    this.notify();
  }

  /**
   * Pull the current RevenueCat "pro" entitlement (src/iap.ts) and reconcile it
   * into the cached AccountState. Single-flight, never throws.
   *
   * ACTIVE → merge a paid {status:"active", source:"iap", validated_at:<guarded
   * now>, expires_at} into the cached subscription and persist. INACTIVE → mirror
   * the offline-grace guard: a cached EVER-PAID/grace sub is kept untouched (so
   * local expiry math in checkEntitlement drives grace→expired deterministically
   * without a destructive write); only a never-paid account is set to a bare
   * {status:"none", source:"iap"}. Then reload() so checkEntitlement recomputes.
   */
  syncIap(): Promise<void> {
    if (this.syncing) return this.syncing;
    this.syncing = this.runSyncIap().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async runSyncIap(): Promise<void> {
    const ent = await readEntitlement(); // never throws → {active:false} on failure
    const nowIso = await guardedNow({ store: this.store, now: this.now });
    const loaded = await loadAccount(this.store, nowIso);
    if (!loaded.ok) return; // store error → keep in-memory cache (offline grace)
    const account = loaded.account;

    let next: AccountState | null = null;
    if (ent.active) {
      // paid signal from the store: stamp evidence + expiry into the cache.
      const subscription: Subscription = {
        status: "active",
        source: "iap",
        validated_at: nowIso,
        ...(ent.expires_at !== null ? { expires_at: ent.expires_at } : {}),
      };
      next = { ...account, subscription };
    } else {
      // OFFLINE-GRACE GUARD (same as the old server validate path): a non-active
      // read must NOT erase paid evidence or the grace window. If the cached
      // account was EVER paid, keep it untouched — local expiry math flips it to
      // grace/expired deterministically. Only a never-paid account accepts the
      // bare {status:"none", source:"iap"}.
      const cached = account.subscription;
      const everPaid =
        cached.validated_at !== undefined ||
        cached.status === "active" ||
        cached.status === "grace";
      if (!everPaid && (cached.status !== "none" || cached.source !== "iap")) {
        next = { ...account, subscription: { status: "none", source: "iap" } };
      }
    }

    if (next !== null) await saveAccount(this.store, next);
    await this.reload();
  }

  /** Debounced foreground re-sync (AppState → active). */
  syncOnForeground(): void {
    const t = Date.now();
    if (t - this.lastForegroundSync < FOREGROUND_DEBOUNCE_MS) return;
    this.lastForegroundSync = t;
    void this.syncIap();
  }

  /** STARTS the local trial on first premium touch, then re-checks. */
  async touchFeature(feature: Feature): Promise<EntitlementResult> {
    // Pure-local trial start: the server-sync arm of touchPremiumFeature is a
    // structural no-op while anonymous (no tokens passed), so this only ever
    // mutates local trial state — billing lives on the IAP rail (syncIap).
    const result = await touchPremiumFeature(feature, {
      store: this.store,
      fetchFn: this.fetchFn,
      now: this.now,
    });
    await this.reload();
    return result;
  }

  /**
   * Present the native purchase sheet for a plan, then re-sync. Returns true if
   * the user is now entitled (purchase completed), false on cancel/failure.
   */
  async purchase(plan: "monthly" | "annual"): Promise<boolean> {
    const outcome = await purchasePlan(plan);
    if ("cancelled" in outcome) return false;
    await this.syncIap();
    return outcome.active;
  }

  /** Restore prior purchases, then re-sync. Returns true if now entitled. */
  async restore(): Promise<boolean> {
    const ent = await restoreIap();
    await this.syncIap();
    return ent.active;
  }
}

// ── provider ──────────────────────────────────────────────────────────────────

const ControllerContext = createContext<EntitlementController | null>(null);

export function EntitlementProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  // created exactly once
  const ref = useRef<EntitlementController | null>(null);
  if (ref.current === null) ref.current = new EntitlementController();
  const controller = ref.current;

  useEffect(() => {
    // boot once: configure RevenueCat (idempotent, Expo-Go-safe, never throws),
    // seed the cache from storage, then an opportunistic IAP sync. NONE of this
    // is awaited on the render path — launch is never gated on RevenueCat init.
    configureIap();
    void controller.reload();
    void controller.syncIap();

    // re-sync when the app returns to the foreground (debounced) — picks up a
    // subscription bought/renewed/expired while backgrounded.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") controller.syncOnForeground();
    });

    // push updates from RevenueCat (renewals, restores, cross-device changes).
    const unsubscribe = onEntitlementChange(() => {
      void controller.syncIap();
    });

    return () => {
      sub.remove();
      unsubscribe();
    };
  }, [controller]);

  return <ControllerContext.Provider value={controller}>{children}</ControllerContext.Provider>;
}

function useController(): EntitlementController {
  const c = useContext(ControllerContext);
  if (c === null) throw new Error("useEntitlement used outside <EntitlementProvider>");
  return c;
}

// ── public hook ───────────────────────────────────────────────────────────────

export interface UseEntitlement {
  allowed: boolean;
  reason?: "requires_subscription" | "trial_expired" | "subscription_expired";
  via?: "free" | "trial" | "subscription" | "grace";
  /** Starts the trial on first premium touch, then returns the fresh result. */
  ensure: () => Promise<EntitlementResult>;
  /** Present the native Google Play purchase sheet for a plan; resolves true if
   *  the user is now entitled, false on cancel/failure. */
  purchase: (plan: "monthly" | "annual") => Promise<boolean>;
  /** Restore prior store purchases; resolves true if now entitled. */
  restore: () => Promise<boolean>;
  /** Effective subscription status for banner/paywall copy. */
  status: SubscriptionStatus;
  /** Days left in trial, or null when not in trial. */
  trialDaysLeft: number | null;
}

/**
 * Reactive entitlement for a single feature.
 *
 * FREE features (advisor) short-circuit: no controller subscription, no I/O,
 * `{ allowed:true, via:'free' }` synchronously — the D18 advisor guarantee.
 */
export function useEntitlement(feature: Feature): UseEntitlement {
  const controller = useController();
  const isFree = FREE_FEATURES.includes(feature);

  // Subscribe to the cache for non-free features only. For free features we
  // pass a no-op store so React still gets a stable snapshot but we never wake
  // on account changes (and never read the account at all below).
  const snap = useSyncExternalStore(
    isFree ? noopSubscribe : controller.subscribe,
    isFree ? noopSnapshot : controller.getSnapshot,
    isFree ? noopSnapshot : controller.getSnapshot,
  );

  return useMemo<UseEntitlement>(() => {
    const ensure = () => controller.touchFeature(feature);
    const purchase = (plan: "monthly" | "annual") => controller.purchase(plan);
    const restore = () => controller.restore();

    if (isFree) {
      return {
        allowed: true,
        via: "free",
        ensure,
        purchase,
        restore,
        status: "none",
        trialDaysLeft: null,
      };
    }

    const { account, nowIso } = snap;
    const result = checkEntitlement(account, feature, nowIso);
    const status = effectiveSubscriptionStatus(account, nowIso);
    return {
      allowed: result.allowed,
      ...(result.allowed ? { via: result.via } : { reason: result.reason }),
      ensure,
      purchase,
      restore,
      status,
      trialDaysLeft: trialDaysLeftFrom(account, nowIso),
    };
  }, [controller, feature, isFree, snap]);
}

/** Stable no-op store for free features (no subscription, constant snapshot). */
const FROZEN_SNAP: { account: AccountState; nowIso: string } = {
  account: initAccount(),
  nowIso: "1970-01-01T00:00:00.000Z",
};
function noopSubscribe(): () => void {
  return () => {};
}
function noopSnapshot(): { account: AccountState; nowIso: string } {
  return FROZEN_SNAP;
}

/**
 * Gate helper for a premium action: run `action` if already allowed; otherwise
 * START the trial (ensure) and, if that grants access, run `action`, else open
 * the paywall with the denial reason.
 */
export type DenialReason = NonNullable<UseEntitlement["reason"]>;
export function useGate(
  feature: Feature,
): (
  action: () => void,
  openPaywall: (reason?: DenialReason) => void,
) => Promise<void> {
  const ent = useEntitlement(feature);
  return async (action, openPaywall) => {
    if (ent.allowed) {
      action();
      return;
    }
    const r = await ent.ensure();
    if (r.allowed) action();
    else openPaywall(r.reason);
  };
}
