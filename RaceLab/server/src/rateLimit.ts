/**
 * rateLimit — a pure, deterministic FIXED-WINDOW limiter over an INJECTED
 * counter store. Built for auth-sensitive surfaces (login / token-exchange /
 * password-reset), where the limiter is layered: one bucket per IP (a single
 * abusive host) AND one per account (credential-stuffing a known email from a
 * botnet), composed with `ipAccountKey` / `compositeKey`.
 *
 * Why fixed-window over token-bucket: the seam the deploy wires is a single
 * atomic counter — Redis `INCR key` + `PEXPIRE key window NX` (or Upstash's
 * equivalent), which is exactly a fixed window. A token bucket needs
 * read-modify-write of {tokens, last_refill}, a heavier (and racier) store
 * contract. Fixed window gives the same "N attempts per window, then back off"
 * guarantee an auth surface wants, in ONE atomic op. The store owns atomicity
 * and TTL; this module owns ONLY the policy (limit comparison, remaining,
 * retry_after) and is a pure function of (injected now, store reply).
 *
 * Conventions (server-wide): pure function, ALL I/O injected as a seam, zero
 * committed runtime deps / no node built-ins, NEVER throws across this boundary
 * (a store outage resolves to a discriminated result, it does not reject), and
 * a discriminated result {ok:true,…}|{ok:false,reason}. `now` is injected — no
 * Date.now — so the same inputs always produce the same retry_after_ms.
 *
 * FAIL-OPEN on store failure (documented choice, see `rateLimit` body): for an
 * AUTH surface a counter outage must NOT lock every legitimate user out — that
 * converts a cache blip into a full-auth outage (a self-inflicted DoS). We
 * therefore allow the request through AND log a warn so the outage is visible
 * and alertable. The trade-off is explicit: during a store outage the brute-
 * force ceiling is temporarily lifted; that is the lesser harm versus locking
 * out the entire userbase, and auth surfaces have a second line of defence
 * (password hashing cost, lockout-on-the-account-record, MFA). A NON-auth,
 * abuse-only surface (e.g. an expensive export) might prefer fail-CLOSED; this
 * limiter exposes that as an explicit `failMode` override, defaulting to 'open'.
 */

/**
 * The atomic counter seam. ONE implementation per backend (Redis/Upstash) is
 * wired at deploy; the in-memory fake lives in the test. `incr` MUST be atomic
 * and MUST set the key's expiry to `window_ms` on FIRST increment only (so the
 * window starts at the first hit and is not extended by later hits within it —
 * the `… NX` on the expire). It returns the post-increment count for the key
 * AND the absolute instant the window resets (key TTL expiry), in epoch ms, so
 * the limiter can compute retry_after WITHOUT a second round-trip or a clock of
 * its own.
 */
export interface RateStore {
  incr(key: string, window_ms: number): Promise<RateIncr>;
}

export interface RateIncr {
  /** Count for this key AFTER this increment (1 on the first hit of a window). */
  count: number;
  /** Absolute epoch-ms instant the window expires (the key's TTL deadline). */
  reset_at_ms: number;
}

/** Best-effort structured logger seam (the server's logLine shape, injected so
 *  this module pulls in no concrete logger). Optional: absent = silent. */
export interface RateLogger {
  warn(fields: { msg: string; key?: string; err_name?: string; err_msg?: string }): void;
}

export interface RateLimitDeps {
  store: RateStore;
  /** Injected clock (epoch ms). NO Date.now — determinism. */
  now: () => number;
  /** Optional: surfaces a store outage (the fail-open path) for alerting. */
  log?: RateLogger;
}

export interface RateLimitOpts {
  /** The bucket identity (use `ipAccountKey`/`compositeKey` to compose). */
  key: string;
  /** Max requests permitted within one window (must be >= 1). */
  limit: number;
  /** Window length in ms (must be > 0). */
  window_ms: number;
  /** Store-outage behaviour. 'open' (default, safe for AUTH) lets the request
   *  through; 'closed' rejects it (safe for pure abuse-control surfaces). */
  failMode?: "open" | "closed";
}

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; reason: "rate_limited"; retry_after_ms: number }
  | { ok: false; reason: "store_unavailable"; retry_after_ms: number };

/**
 * Apply the fixed-window policy for `opts.key`. Returns:
 *  - {ok:true, remaining}            — under the limit (remaining never < 0)
 *  - {ok:false,'rate_limited', retry_after_ms} — at/over the limit this window
 *  - {ok:false,'store_unavailable', retry_after_ms} — ONLY when failMode:'closed'
 *    and the store threw (fail-open never returns this; it returns ok:true).
 *
 * Never throws: a rejected/throwing store is caught and resolved per failMode.
 */
export async function rateLimit(
  deps: RateLimitDeps,
  opts: RateLimitOpts,
): Promise<RateLimitResult> {
  const { key, limit, window_ms } = opts;
  const failMode = opts.failMode ?? "open";

  // Defensive policy validation — a misconfigured limit must not silently
  // disable the gate. limit<1 or window_ms<=0 is a programming error; treat it
  // as fail-open (allow) but log, so it surfaces without breaking auth.
  if (!Number.isFinite(limit) || limit < 1 || !Number.isFinite(window_ms) || window_ms <= 0) {
    deps.log?.warn({
      msg: "rate_limit_misconfigured",
      key,
      err_name: "bad_opts",
      err_msg: `limit=${limit} window_ms=${window_ms}`,
    });
    return { ok: true, remaining: Number.isFinite(limit) && limit >= 1 ? limit - 1 : 0 };
  }

  let incr: RateIncr;
  try {
    incr = await deps.store.incr(key, window_ms);
  } catch (e) {
    // STORE OUTAGE. Fail-open (default, AUTH-safe): allow + warn so a counter
    // outage cannot lock out the whole userbase. Fail-closed (opt-in): reject
    // with a one-window backoff so an abuse-only surface stays protected.
    const err = toErr(e);
    deps.log?.warn({ msg: "rate_limit_store_unavailable", key, ...err });
    if (failMode === "closed") {
      return { ok: false, reason: "store_unavailable", retry_after_ms: window_ms };
    }
    return { ok: true, remaining: limit - 1 };
  }

  // A store that returns a bad shape is treated like an outage (same fail-mode).
  if (
    !Number.isFinite(incr.count) ||
    incr.count < 1 ||
    !Number.isFinite(incr.reset_at_ms)
  ) {
    deps.log?.warn({
      msg: "rate_limit_store_bad_reply",
      key,
      err_name: "bad_reply",
      err_msg: `count=${incr?.count} reset_at_ms=${incr?.reset_at_ms}`,
    });
    if (failMode === "closed") {
      return { ok: false, reason: "store_unavailable", retry_after_ms: window_ms };
    }
    return { ok: true, remaining: limit - 1 };
  }

  if (incr.count > limit) {
    // Over the limit this window. retry_after = time until the window resets,
    // computed from the INJECTED clock and the store-reported reset instant
    // (deterministic, no second round-trip). Floored at 0; if the store's
    // reset is already in the past (clock skew) fall back to a full window so
    // we never advertise a 0ms / negative backoff.
    const remaining_ms = incr.reset_at_ms - deps.now();
    const retry_after_ms = remaining_ms > 0 ? remaining_ms : window_ms;
    return { ok: false, reason: "rate_limited", retry_after_ms };
  }

  // Under the limit. remaining = how many MORE hits are allowed this window.
  return { ok: true, remaining: limit - incr.count };
}

/** Normalise an unknown thrown value to {err_name,err_msg} (never the stack). */
function toErr(e: unknown): { err_name: string; err_msg: string } {
  if (e instanceof Error) return { err_name: e.name, err_msg: e.message.slice(0, 300) };
  return { err_name: "non_error", err_msg: String(e).slice(0, 300) };
}

// ── key composition ──────────────────────────────────────────────────────────

/**
 * Compose a namespaced rate-limit key from ordered parts. Parts are sanitised
 * (the separator and whitespace are stripped) so a value that itself contains
 * the separator can never forge a different bucket, and an empty/absent part
 * becomes the literal "_" so the key shape (and thus the bucket count) is
 * stable regardless of which dimensions are present. `surface` namespaces the
 * key so a per-IP login bucket never collides with a per-IP reset bucket.
 *
 *   compositeKey('login', ['ip', '203.0.113.7'])  -> "rl:login:ip:203.0.113.7"
 */
export function compositeKey(surface: string, parts: readonly string[]): string {
  const clean = (s: string) => (s ?? "").replace(/[:\s]/g, "_") || "_";
  return ["rl", clean(surface), ...parts.map(clean)].join(":");
}

/**
 * The auth-surface helper: build BOTH dimensions of a layered limiter as a pair
 * of keys — per-IP (caps one host) and per-account (caps attempts against one
 * identity from many hosts, i.e. credential stuffing). The caller runs
 * `rateLimit` against EACH and rejects if EITHER trips; account may be absent
 * pre-identification (e.g. before the email is known), in which case only the
 * IP key is returned.
 *
 *   ipAccountKey('login', '203.0.113.7', 'acct_123')
 *     -> { ipKey: "rl:login:ip:203.0.113.7",
 *          accountKey: "rl:login:acct:acct_123" }
 */
export function ipAccountKey(
  surface: string,
  ip: string,
  account?: string | null,
): { ipKey: string; accountKey?: string } {
  const ipKey = compositeKey(surface, ["ip", ip]);
  if (account === undefined || account === null || account === "") return { ipKey };
  return { ipKey, accountKey: compositeKey(surface, ["acct", account]) };
}
