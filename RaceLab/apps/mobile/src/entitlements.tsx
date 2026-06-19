/**
 * Entitlement bridge (app layer). Wires @racelab/account's never-throw,
 * offline-first entitlement math into React.
 *
 * D18 invariants honored here:
 *  - The ADVISOR (FREE_FEATURES) is allowed SYNCHRONOUSLY with zero I/O and
 *    without subscribing to the controller (useEntitlement short-circuits).
 *  - App launch is NEVER gated: the provider mounts immediately, seeds its
 *    cache asynchronously, and every entitlement decision is computed from the
 *    in-memory cached AccountState (fail-closed initAccount() until seeded).
 *    No render path awaits the network.
 *  - The real trial STARTS at first premium touch via ensure() →
 *    touchPremiumFeature (NOT at onboarding).
 *  - validateSubscription is opportunistic: it only runs when tokens.userId()
 *    is non-null (so it is a structural no-op while anonymous) and never clears
 *    the cache on failure (offline grace).
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { AppState, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ANONYMOUS_TOKENS,
  SUBSCRIBE_WEB_BASE,
  buildSubscribeUrl,
  guardedNow,
  loadAccount,
  touchPremiumFeature,
  validateSubscription,
} from "@racelab/account";
import type {
  AccountState,
  Clock,
  EntitlementResult,
  Feature,
  FetchLike,
  KV,
  SubscriptionStatus,
  TokenProvider,
} from "@racelab/account";
import {
  FREE_FEATURES,
  checkEntitlement,
  effectiveSubscriptionStatus,
  initAccount,
} from "@racelab/schema";
import { API_BASE } from "./config";
import { useTokenProvider } from "./auth";

const DAY_MS = 86_400_000;
/** Debounce window for the foreground re-validate trigger. */
const FOREGROUND_DEBOUNCE_MS = 60_000;
/** Deep-link return from web checkout (the Stripe webhook → DB write lags). */
const SUBSCRIBE_RETURN_URL = "racelab://subscribe/return";

// ── injected capability adapters ──────────────────────────────────────────────

/** AsyncStorage → the exact 3-method KV surface @racelab/account needs. */
const STORE: KV = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

/** Device wall clock — never trusted raw; guardedNow applies the tamper floor. */
const NOW: Clock = () => new Date().toISOString();

/** The global fetch, typed structurally as FetchLike (null if unavailable). */
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
  private apiBase = API_BASE;
  private tokens: TokenProvider = ANONYMOUS_TOKENS;

  private account: AccountState = initAccount();
  private nowIso: string = new Date().toISOString();
  private snapshot: { account: AccountState; nowIso: string } = {
    account: this.account,
    nowIso: this.nowIso,
  };

  private listeners = new Set<() => void>();
  /** Single-flight latch for validateNow(). */
  private validating: Promise<void> | null = null;
  private lastForegroundValidate = 0;

  /** Swap in the live tokens from the auth provider (called by the provider). */
  setTokens(tokens: TokenProvider): void {
    this.tokens = tokens;
  }

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
   * Opportunistic server re-validation. No-ops while anonymous (userId null) or
   * without a fetch transport. On {ok:true} swaps the cache; on {ok:false}
   * KEEPS the cache (offline grace). Single-flight.
   */
  validateNow(): Promise<void> {
    if (this.validating) return this.validating;
    this.validating = this.runValidate().finally(() => {
      this.validating = null;
    });
    return this.validating;
  }

  private async runValidate(): Promise<void> {
    if (this.fetchFn === null) return;
    if (this.tokens.userId() === null) return; // anonymous → structural no-op
    let token: string | null;
    try {
      token = await this.tokens.getToken();
    } catch {
      token = null;
    }
    if (token === null) return;
    const res = await validateSubscription(
      { fetchFn: this.fetchFn, store: this.store, now: this.now, apiBase: this.apiBase },
      token,
    );
    if (res.ok) {
      this.account = res.account;
      this.nowIso = await guardedNow({ store: this.store, now: this.now });
      this.notify();
    }
    // res.ok === false → keep the cache (offline grace); never clear.
  }

  /** Debounced foreground re-validate (AppState → active). */
  validateOnForeground(): void {
    const t = Date.now();
    if (t - this.lastForegroundValidate < FOREGROUND_DEBOUNCE_MS) return;
    this.lastForegroundValidate = t;
    void this.validateNow();
  }

  /**
   * Poll validateNow a few times with backoff after the web-checkout return —
   * the Stripe webhook → DB write lags the redirect, so the first GET may still
   * report the old status.
   */
  async validateAfterReturn(): Promise<void> {
    const delays = [0, 2_000, 5_000];
    for (const d of delays) {
      if (d > 0) await new Promise((r) => setTimeout(r, d));
      await this.validateNow();
    }
  }

  /** STARTS the local trial on first premium touch, then re-checks. */
  async touchFeature(feature: Feature): Promise<EntitlementResult> {
    const result = await touchPremiumFeature(feature, {
      store: this.store,
      fetchFn: this.fetchFn,
      now: this.now,
      tokens: this.tokens,
      apiBase: this.apiBase,
    });
    await this.reload();
    return result;
  }

  /** Open the external web checkout, tagged with the user id when known. */
  openSubscribe(): void {
    const uid = this.tokens.userId() ?? undefined;
    void Linking.openURL(buildSubscribeUrl(SUBSCRIBE_WEB_BASE, uid)).catch(() => {});
  }
}

// ── provider ──────────────────────────────────────────────────────────────────

const ControllerContext = createContext<EntitlementController | null>(null);

export function EntitlementProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  // created exactly once
  const ref = useRef<EntitlementController | null>(null);
  if (ref.current === null) ref.current = new EntitlementController();
  const controller = ref.current;

  // keep the controller's tokens in sync with the auth provider. The in-render
  // assignment is an idempotent write to the ref-held controller (no React
  // state, no re-render) so the boot effect's validateNow() below already sees
  // the current tokens; the effect mirrors it for later token changes (e.g.
  // sign-in once Clerk is wired). Anonymous-default tokens make this a no-op.
  const tokens = useTokenProvider();
  controller.setTokens(tokens);
  useEffect(() => {
    controller.setTokens(tokens);
  }, [controller, tokens]);

  useEffect(() => {
    // boot once: seed cache from storage, then an opportunistic validate
    void controller.reload();
    void controller.validateNow();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") controller.validateOnForeground();
    });

    const onUrl = ({ url }: { url: string }) => {
      if (url.startsWith(SUBSCRIBE_RETURN_URL)) void controller.validateAfterReturn();
    };
    const linkSub = Linking.addEventListener("url", onUrl);
    void Linking.getInitialURL().then((url) => {
      if (url !== null && url.startsWith(SUBSCRIBE_RETURN_URL)) void controller.validateAfterReturn();
    });

    return () => {
      sub.remove();
      linkSub.remove();
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
  /** Open the external web checkout. */
  openSubscribe: () => void;
  /** Opportunistic server re-validation (e.g. "I already paid — refresh"). */
  validateNow: () => Promise<void>;
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
    const openSubscribe = () => controller.openSubscribe();
    const validateNow = () => controller.validateNow();

    if (isFree) {
      return {
        allowed: true,
        via: "free",
        ensure,
        openSubscribe,
        validateNow,
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
      openSubscribe,
      validateNow,
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
