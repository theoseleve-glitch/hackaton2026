/**
 * pushReceipts WORKER — Expo push-receipt processing + DeviceNotRegistered prune,
 * and the send-eligibility gate that decides whether a notification may go out.
 *
 * This is a WORKER/UTIL, not an HTTP route: it is invoked by the deploy cron /
 * queue (receipt sweep) or by a handler before enqueuing a push. There is no
 * router wiring here.
 *
 * Two pure functions, ALL I/O injected as seams (zero committed runtime deps,
 * no node built-ins). Neither throws across its public boundary — every failure
 * is a discriminated result { ok:false, reason } (or, inside the batch, a counted
 * outcome), so a single flaky receipt or prune can never crash the sweep.
 *
 *   1. processReceipts(batch, deps)
 *      Given a batch of Expo push-TICKET ids (the ids returned when a message was
 *      accepted for delivery), fetch their delivery RECEIPTS via the injected
 *      ExpoReceiptFetcher.get(ids) seam. For each receipt:
 *        - status 'ok'                        -> nothing to do.
 *        - status 'error' / DeviceNotRegistered
 *              -> the token is dead; prune it via PushPruner.unregisterByToken(token).
 *                 (Expo surfaces the offending token in receipt.details.expoPushToken;
 *                  we also accept a ticket->token map for the common case where the
 *                  receipt omits it — see TicketTokenLookup.)
 *        - status 'error' / any OTHER error code (MessageRateExceeded,
 *              MessageTooBig, InvalidCredentials, …)
 *              -> NOT a dead device: reported in `retry` for the caller to back off
 *                 and resend later. Never pruned, never thrown.
 *      A fetch that fails for the whole batch (network/Expo down) returns
 *      { ok:false, reason:'fetch_failed' } — the caller retries the sweep; nothing
 *      is pruned on a fetch failure (fail-closed: we never prune on uncertainty).
 *
 *   2. sendEligible(userId, type, deps)
 *      The send-side GATE. Resolves the user's per-device push prefs (injected
 *      PrefsReader.read(userId) seam -> one PushPrefs per registered device) and
 *      decides whether a notification of `type` may be sent, and to which tokens.
 *      - `type` is constrained to the four allowed NotificationType values; an
 *        unknown type is rejected { ok:false, reason:'unknown_type' } and nothing
 *        is sent.
 *      - The trial-ending nudge ('trial_ending') is MARKETING (GDPR): it requires
 *        prefs.marketing_consent on a device in addition to the per-type opt-in.
 *        The other three are service messages, gated only on their per-type opt-in.
 *      - Returns the eligible tokens; if no device qualifies the result is still
 *        ok with an empty token list (a no-op send, not an error).
 */

// ── notification taxonomy (the SEND-side allow-list) ─────────────────────────

/** The only notification types the worker will ever send. Anything else is a
 *  programming error and is rejected, not silently dropped onto a default. */
export const NOTIFICATION_TYPES = [
  "speedhive_new_run", // a new lap/run was imported for the user (SERVICE)
  "trial_ending", // trial-ending nudge (MARKETING -> requires marketing_consent)
  "social_prop", // someone reacted/proposed on the user's content (SERVICE)
  "social_comment", // someone commented on the user's content (SERVICE)
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** The single MARKETING type — gated on marketing_consent (GDPR). Service types
 *  are not. Kept as a Set so the rule is data, not a scattered string compare. */
const MARKETING_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>(["trial_ending"]);

function isNotificationType(t: string): t is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(t);
}

// ── per-device prefs (mirrors stores/pushStore.PushPrefs, restated locally so
//    the worker has no cross-layer import; the PrefsReader seam adapts the row) ─

/** One registered device's opt-ins. `token` is its current Expo push token. */
export interface DevicePrefs {
  token: string;
  /** Speedhive new-run imports (service). */
  speedhive_new_run?: boolean;
  /** Trial-ending nudge. MARKETING -> only sent when marketing_consent. */
  trial_ending?: boolean;
  /** Reaction/proposal on the user's content (service). */
  social_prop?: boolean;
  /** Comment on the user's content (service). */
  social_comment?: boolean;
  /** GDPR marketing consent flag — the trial nudge is gated on this. */
  marketing_consent?: boolean;
}

// ── injected seams (interfaces only — zero committed runtime deps) ────────────

/** An Expo delivery receipt as the worker consumes it. `id` is the TICKET id the
 *  receipt belongs to. Mirrors the shape Expo's getPushNotificationReceiptsAsync
 *  returns, pared to the fields this worker reads. */
export interface ExpoReceipt {
  id: string;
  status: "ok" | "error";
  /** Present only on status:'error'. The canonical Expo error code lives in
   *  details.error; `message` is human text. */
  message?: string;
  details?: {
    error?: string; // 'DeviceNotRegistered' | 'MessageRateExceeded' | 'MessageTooBig' | …
    expoPushToken?: string; // Expo echoes the offending token here on DeviceNotRegistered
  };
}

/** Fetch delivery receipts for a batch of ticket ids. The seam owns the network
 *  call (and Expo's 1000-id chunking) — the worker stays pure. Must resolve, not
 *  reject, on a partial result; a thrown/rejected fetch is treated as a whole-
 *  batch failure and handled fail-closed (nothing pruned). */
export interface ExpoReceiptFetcher {
  get(ticketIds: readonly string[]): Promise<{ receipts: readonly ExpoReceipt[] }>;
}

/** Prune a dead Expo push token (DeviceNotRegistered). Deletes every device row
 *  carrying this token. Idempotent — pruning an already-gone token is a no-op. */
export interface PushPruner {
  unregisterByToken(token: string): Promise<void>;
}

/** Resolve the offending token for a ticket when the receipt omits it. The send
 *  side records ticketId->token at enqueue time; this reads it back. Returns null
 *  when unknown (then a receipt without an inline token cannot be pruned safely). */
export interface TicketTokenLookup {
  tokenForTicket(ticketId: string): Promise<string | null>;
}

/** Read a user's per-device push prefs (one entry per registered device). */
export interface PrefsReader {
  read(userId: string): Promise<readonly DevicePrefs[]>;
}

// ── processReceipts ───────────────────────────────────────────────────────────

export interface ProcessReceiptsDeps {
  fetcher: ExpoReceiptFetcher;
  pruner: PushPruner;
  /** Optional: resolve a token for a receipt that omits details.expoPushToken. */
  ticketTokens?: TicketTokenLookup;
}

/** Per-ticket entry the caller should retry (transient / non-fatal error). */
export interface RetryEntry {
  ticketId: string;
  error: string; // Expo error code (MessageRateExceeded, …) or a synthetic code
}

/** A receipt the worker could not act on (e.g. DeviceNotRegistered but no token
 *  resolvable, or an unparseable receipt). Surfaced, never thrown. */
export interface SkippedEntry {
  ticketId: string;
  reason: string;
}

export type ProcessReceiptsResult =
  | {
      ok: true;
      pruned: number; // tokens actually unregistered
      retry: RetryEntry[]; // transient errors to resend later
      skipped: SkippedEntry[]; // receipts we deliberately took no action on
    }
  | { ok: false; reason: "empty_batch" | "fetch_failed" | "prune_failed" };

/** Process a batch of Expo push-ticket ids: prune DeviceNotRegistered tokens,
 *  report transient errors for retry. Pure (all I/O via deps); never throws. */
export async function processReceipts(
  ticketIds: readonly string[],
  deps: ProcessReceiptsDeps,
): Promise<ProcessReceiptsResult> {
  if (ticketIds.length === 0) return { ok: false, reason: "empty_batch" };

  let fetched: { receipts: readonly ExpoReceipt[] };
  try {
    fetched = await deps.fetcher.get(ticketIds);
  } catch {
    // Whole-batch fetch failure (Expo/network down). Fail-closed: prune nothing,
    // let the caller retry the entire sweep. Never throws.
    return { ok: false, reason: "fetch_failed" };
  }

  const retry: RetryEntry[] = [];
  const skipped: SkippedEntry[] = [];
  // De-dup tokens to prune: many tickets can share one dead token; prune once.
  const tokensToPrune = new Set<string>();

  for (const r of fetched.receipts ?? []) {
    if (r === null || typeof r !== "object" || typeof r.id !== "string") {
      // Unparseable receipt — record and move on; one bad row can't abort the sweep.
      skipped.push({ ticketId: typeof r?.id === "string" ? r.id : "<unknown>", reason: "malformed_receipt" });
      continue;
    }

    if (r.status === "ok") continue; // delivered — nothing to do

    const code = r.details?.error ?? "UnknownError";

    if (code === "DeviceNotRegistered") {
      // Resolve the dead token: prefer the inline token Expo echoes, fall back to
      // the ticket->token map. We NEVER prune without a concrete token (fail-safe).
      let token = r.details?.expoPushToken;
      if ((token === undefined || token === "") && deps.ticketTokens) {
        const looked = await deps.ticketTokens.tokenForTicket(r.id).catch(() => null);
        token = looked ?? undefined;
      }
      if (token === undefined || token === "") {
        skipped.push({ ticketId: r.id, reason: "device_not_registered_token_unknown" });
        continue;
      }
      tokensToPrune.add(token);
      continue;
    }

    // Any other error (MessageRateExceeded, MessageTooBig, InvalidCredentials, …)
    // is not a dead device — it's transient or a payload/config issue the caller
    // should back off and resend. Report for retry; never prune, never throw.
    retry.push({ ticketId: r.id, error: code });
  }

  // Prune each dead token exactly once. COLLECT-AND-CONTINUE (audit MED): one
  // failing prune must NOT discard the whole batch — the other dead tokens still
  // get cleaned, and the failed ones are surfaced (so the caller can retry just
  // those) instead of losing every success this sweep. Never throws across the
  // boundary.
  let pruned = 0;
  for (const token of tokensToPrune) {
    try {
      await deps.pruner.unregisterByToken(token);
      pruned++;
    } catch {
      // Don't bail the batch; record this one token for a later retry and keep
      // pruning the rest. The token (a dead-device push token) is low-sensitivity
      // routing data, surfaced here so the caller knows what to re-sweep.
      skipped.push({ ticketId: `token:${token}`, reason: "prune_failed" });
    }
  }

  return { ok: true, pruned, retry, skipped };
}

// ── sendEligible ──────────────────────────────────────────────────────────────

export interface SendEligibleDeps {
  prefs: PrefsReader;
}

export type SendEligibleResult =
  | { ok: true; type: NotificationType; tokens: string[] }
  | { ok: false; reason: "unknown_type" | "prefs_unavailable" };

/** True iff a device has opted into `type` (and, for marketing types, has also
 *  granted marketing_consent). Pure; the per-type opt-in defaults to OFF — a
 *  device must explicitly opt in (absent flag = not eligible). */
function deviceEligible(d: DevicePrefs, type: NotificationType): boolean {
  if (d.token === undefined || d.token === "") return false;
  const optedIn = d[type] === true;
  if (!optedIn) return false;
  if (MARKETING_TYPES.has(type) && d.marketing_consent !== true) return false; // GDPR gate
  return true;
}

/** Decide whether a notification of `type` may be sent to `userId`, and to which
 *  device tokens. Constrains `type` to the allow-list and enforces the marketing
 *  consent gate for the trial-ending nudge. Pure (prefs via the seam); never throws.
 *
 *  `type` is typed as string on purpose so an out-of-taxonomy value coming from a
 *  caller (or a stringly-typed queue payload) is rejected at runtime, not just by
 *  the type checker. */
export async function sendEligible(
  userId: string,
  type: string,
  deps: SendEligibleDeps,
): Promise<SendEligibleResult> {
  if (!isNotificationType(type)) return { ok: false, reason: "unknown_type" };

  let devices: readonly DevicePrefs[];
  try {
    devices = await deps.prefs.read(userId);
  } catch {
    return { ok: false, reason: "prefs_unavailable" };
  }

  // De-dup tokens (a user could have the same token on two device rows after a
  // reinstall) so we never push twice to one device.
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const d of devices ?? []) {
    if (deviceEligible(d, type) && !seen.has(d.token)) {
      seen.add(d.token);
      tokens.push(d.token);
    }
  }

  return { ok: true, type, tokens };
}
