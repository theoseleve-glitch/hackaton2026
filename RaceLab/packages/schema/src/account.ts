/**
 * Account / entitlements — offline-first (D4): user_id is absent until the
 * first online signup; the stored subscription status is the last SERVER-
 * ASSERTED fact and may be stale offline, so the effective status is COMPUTED
 * from timestamps against a caller-provided clock. NO Date.now() in this
 * package — `now` is always injected.
 *
 * D18 consequence: the "advisor" feature is ALWAYS allowed (the deterministic
 * engineer is the free acquisition hook); Pro gates the rest.
 */

import type { IsoDateTime } from "./vocab";
import { deepFreeze, isFiniteNum } from "./vocab";
import { isoToMs } from "./ids";

export const DRIVER_LEVELS = ["beginner", "club", "regional", "national", "pro"] as const;
export type DriverLevel = (typeof DRIVER_LEVELS)[number];

export interface DriverProfile {
  level: DriverLevel; // one tap at onboarding — the only required answer
  age?: number; // clamped to integer [1, 120]
  country?: string; // ISO 3166-1 alpha-2, stored uppercase
}

export type ProfileRejectReason = "non_finite_numeric" | "invalid_country";

export interface MakeProfileInput {
  level: DriverLevel;
  age?: number;
  country?: string;
}

/** Build a frozen DriverProfile. age clamps to [1, 120]; country must be a
 *  2-letter code when present (stored uppercase). */
export function makeDriverProfile(
  input: MakeProfileInput,
): { ok: true; profile: DriverProfile } | { ok: false; reason: ProfileRejectReason } {
  let age: number | undefined;
  if (input.age !== undefined) {
    if (!isFiniteNum(input.age)) return { ok: false, reason: "non_finite_numeric" };
    const r = Math.round(input.age);
    age = r < 1 ? 1 : r > 120 ? 120 : r;
  }
  let country: string | undefined;
  if (input.country !== undefined) {
    const c = input.country.trim();
    if (!/^[A-Za-z]{2}$/.test(c)) return { ok: false, reason: "invalid_country" };
    country = c.toUpperCase();
  }
  return {
    ok: true,
    profile: deepFreeze({
      level: input.level,
      ...(age !== undefined ? { age } : {}),
      ...(country !== undefined ? { country } : {}),
    }),
  };
}

export const SUBSCRIPTION_STATUSES = ["none", "trial", "active", "expired", "grace"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_SOURCES = ["web", "iap"] as const;
export type SubscriptionSource = (typeof SUBSCRIPTION_SOURCES)[number];

export interface Subscription {
  status: SubscriptionStatus; // server-asserted fact; effective status vs `now` is COMPUTED
  source: SubscriptionSource; // "web" = Stripe web checkout; "iap" = Play/App-Store in-app purchase
  validated_at?: IsoDateTime;
  expires_at?: IsoDateTime;
}

export interface AccountState {
  user_id?: string; // absent = anonymous local account (offline-first)
  trial_started_at?: IsoDateTime;
  trial_ends_at?: IsoDateTime;
  subscription: Subscription;
}

export function initAccount(): AccountState {
  return deepFreeze({ subscription: { status: "none", source: "web" } });
}

/** Days a lapsed paid subscription keeps working offline before hard expiry. */
export const GRACE_DAYS = 7;
const DAY_MS = 86_400_000;

/** Stored status may be stale offline — the effective status is derived from
 *  timestamps vs the caller's clock. Deterministic:
 *  1. paid (active/grace asserted): no expiry → active; now <= expiry → active;
 *     within GRACE_DAYS past expiry → grace; else expired
 *  2. a trial was started: now <= trial_ends_at → trial; else expired
 *  3. server said expired → expired; otherwise none. */
export function effectiveSubscriptionStatus(account: AccountState, now: IsoDateTime): SubscriptionStatus {
  const t = isoToMs(now);
  const sub = account.subscription;
  if (sub.status === "active" || sub.status === "grace") {
    if (sub.expires_at === undefined) return "active";
    const exp = isoToMs(sub.expires_at);
    if (t <= exp) return "active";
    if (t <= exp + GRACE_DAYS * DAY_MS) return "grace";
    return "expired";
  }
  if (account.trial_started_at !== undefined) {
    if (account.trial_ends_at !== undefined && t <= isoToMs(account.trial_ends_at)) return "trial";
    return "expired";
  }
  if (sub.status === "expired") return "expired";
  return "none";
}

export const FEATURES = [
  "advisor",
  "multi_car",
  "full_version_history",
  "analytics",
  "strategy_planner",
  "speedhive_import",
  "auto_weather",
  "public_sharing",
  "pdf_export",
] as const;
export type Feature = (typeof FEATURES)[number];

/** D18: the deterministic advisor is the free acquisition hook — never gated. */
export const FREE_FEATURES: readonly Feature[] = Object.freeze(["advisor"]);

export type EntitlementResult =
  | { allowed: true; via: "free" | "trial" | "subscription" | "grace" }
  | { allowed: false; reason: "requires_subscription" | "trial_expired" | "subscription_expired" };

/** Clock is INJECTED — no Date.now() anywhere in this package. */
export function checkEntitlement(
  account: AccountState,
  feature: Feature,
  now: IsoDateTime,
): EntitlementResult {
  if (FREE_FEATURES.includes(feature)) return { allowed: true, via: "free" };
  const status = effectiveSubscriptionStatus(account, now);
  switch (status) {
    case "trial":
      return { allowed: true, via: "trial" };
    case "active":
      return { allowed: true, via: "subscription" };
    case "grace":
      return { allowed: true, via: "grace" };
    case "expired": {
      // Ever-paid evidence: a server validation stamp, or a server-asserted
      // paid status (active/grace). A bare stored "expired" with no
      // validated_at is NOT payment evidence — a never-paid user whose trial
      // expiry the server asserted must see "trial_expired" upsell copy,
      // not be told to renew a subscription they never had.
      const sub = account.subscription;
      const everPaid =
        sub.validated_at !== undefined || sub.status === "active" || sub.status === "grace";
      return { allowed: false, reason: everPaid ? "subscription_expired" : "trial_expired" };
    }
    case "none":
      return { allowed: false, reason: "requires_subscription" };
  }
}

export type TrialRejectReason = "trial_already_used" | "already_subscribed" | "invalid_duration";

/** Start the one free trial. Returns a NEW frozen account; failure keeps the
 *  caller's previous reference. */
export function startTrial(
  account: AccountState,
  now: IsoDateTime,
  duration_days: number,
): { ok: true; account: AccountState } | { ok: false; reason: TrialRejectReason } {
  if (!isFiniteNum(duration_days) || duration_days <= 0) {
    return { ok: false, reason: "invalid_duration" };
  }
  if (account.trial_started_at !== undefined) return { ok: false, reason: "trial_already_used" };
  const status = effectiveSubscriptionStatus(account, now);
  if (status === "active" || status === "grace") return { ok: false, reason: "already_subscribed" };
  const startMs = isoToMs(now);
  const next: AccountState = deepFreeze({
    ...(account.user_id !== undefined ? { user_id: account.user_id } : {}),
    trial_started_at: now,
    trial_ends_at: new Date(startMs + duration_days * DAY_MS).toISOString(),
    subscription: { ...account.subscription, status: "trial" as const },
  });
  return { ok: true, account: next };
}
