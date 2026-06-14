/**
 * racelab-account — Tier A client account logic. Orchestration over
 * packages/schema's pure account math: trial lifecycle, tamper-guarded clock,
 * offline-first entitlements, external-web subscribe URL, server validation
 * cache, deletion with tombstone retry. Zero runtime deps, zero node
 * built-ins; every capability injected (D18 culture).
 */

// injected capability surfaces + persisted account blob
export type { KV, FetchLike, FetchResponseLike, Clock, LoadAccountResult } from "./deps";
export {
  STORAGE_KEYS,
  DEFAULT_API_BASE,
  loadAccount,
  loadAccountResilient,
  peekLastKnownGood,
  saveAccount,
  msToIso,
  parseMsOr,
} from "./deps";

// auth boundary (Clerk stays at the app layer)
export type { TokenProvider } from "./auth";
export { ANONYMOUS_TOKENS } from "./auth";

// trial orchestration + tamper-guarded clock
export type { TrialDeps, TrialSync, EnsureTrialResult, ClockState } from "./trial";
export { TrialService, TRIAL_DAYS, guardedNow, noteServerTime } from "./trial";

// entitlements (offline policy lives here)
export type { EntitlementDeps } from "./entitlements";
export { canUse, touchPremiumFeature } from "./entitlements";

// external-web subscribe (no IAP — open URL at the app layer)
export { SUBSCRIBE_WEB_BASE, buildSubscribeUrl } from "./subscribe";

// server validation cache
export type { ValidateDeps, ValidateResult } from "./validate";
export { validateSubscription } from "./validate";

// account deletion (Apple 5.1.1(v) / GDPR Art. 17)
export type { DeletionDeps, PendingDeletion, DeleteAccountResult, RetryDeletionResult } from "./deletion";
export { deleteAccount, retryPendingDeletion } from "./deletion";

// convenience re-exports from the frozen schema contract (single import for the app)
export { GRACE_DAYS, FEATURES, FREE_FEATURES } from "../../schema/src/index";
export type { Feature, EntitlementResult, AccountState, SubscriptionStatus } from "../../schema/src/index";
