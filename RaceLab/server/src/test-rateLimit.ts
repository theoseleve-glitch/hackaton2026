/**
 * rateLimit test suite — the pure fixed-window limiter exercised against an
 * in-memory fake RateStore that mimics the deploy seam's atomic Redis
 * INCR + PEXPIRE-NX semantics (window starts at the first hit, is NOT extended
 * by later hits). No HTTP, no Redis, no timers — the clock is injected and the
 * window is advanced by moving `now`. Assertion style mirrors
 * src/test-health.ts / src/test-mediaStoreSql.ts.
 *
 * Covers (the prompt's checklist):
 *  - under limit -> ok + remaining decrements monotonically
 *  - at/over limit -> rate_limited + a positive retry_after_ms
 *  - window reset (advance now past reset) -> counter restarts, ok again
 *  - per-key isolation (two keys do not share a budget)
 *  - store failure FAILS OPEN by default (auth-safe) AND logs a warn
 *  - store failure FAILS CLOSED when opted in (abuse surfaces) -> store_unavailable
 *  - bad store reply treated as an outage; misconfigured opts fail open + log
 *  - retry_after determinism (injected now), and clock-skew floor
 *  - key composition: sanitisation, stable shape, ip+account pairing
 *
 * Run from C:/Users/willy/hackaton2026/RaceLab/server:
 *   npx tsx src/test-rateLimit.ts
 */

import {
  rateLimit,
  compositeKey,
  ipAccountKey,
  type RateStore,
  type RateIncr,
  type RateLogger,
} from "./rateLimit";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

// ── fakes ─────────────────────────────────────────────────────────────────────

/** A clock you can advance by hand (epoch ms). */
function clock(start: number) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms), set: (ms: number) => (t = ms) };
}

/**
 * In-memory fake of the atomic counter seam. Mirrors Redis INCR + PEXPIRE NX:
 *  - first incr in a window sets reset_at = now + window_ms (the TTL),
 *  - subsequent incrs within the window only bump the count (TTL untouched),
 *  - once now >= reset_at the key has "expired": count restarts at 1 and a fresh
 *    window opens. Reads `clk.now()` so window expiry tracks the injected clock.
 */
function fakeStore(clk: { now: () => number }) {
  const map = new Map<string, { count: number; reset_at_ms: number }>();
  const store: RateStore = {
    async incr(key, window_ms): Promise<RateIncr> {
      const now = clk.now();
      const cur = map.get(key);
      if (cur === undefined || now >= cur.reset_at_ms) {
        const fresh = { count: 1, reset_at_ms: now + window_ms };
        map.set(key, fresh);
        return { ...fresh };
      }
      cur.count += 1;
      return { count: cur.count, reset_at_ms: cur.reset_at_ms };
    },
  };
  return { store, map };
}

/** A store that always throws (counter outage). */
const throwingStore: RateStore = {
  async incr() {
    throw new Error("ECONNREFUSED redis");
  },
};

/** A store that returns a malformed reply. */
function badReplyStore(reply: Partial<RateIncr>): RateStore {
  return { async incr() { return reply as RateIncr; } };
}

/** Capturing logger. */
function capLogger() {
  const warns: Array<{ msg: string; key?: string; err_name?: string; err_msg?: string }> = [];
  const log: RateLogger = { warn: (f) => void warns.push(f) };
  return { log, warns };
}

const WINDOW = 60_000;
const T0 = 1_700_000_000_000;

// ═══ under the limit: ok + remaining decrements ═══════════════════════════════
console.log("— under the limit (remaining decrements) —");
{
  const clk = clock(T0);
  const { store } = fakeStore(clk);
  const deps = { store, now: clk.now };
  const opts = { key: "rl:login:ip:a", limit: 3, window_ms: WINDOW };

  const r1 = await rateLimit(deps, opts);
  const r2 = await rateLimit(deps, opts);
  const r3 = await rateLimit(deps, opts);

  check("hit 1: ok", r1.ok === true);
  check("hit 1: remaining = limit-1 = 2", r1.ok && r1.remaining === 2, JSON.stringify(r1));
  check("hit 2: remaining = 1", r2.ok && r2.remaining === 1, JSON.stringify(r2));
  check("hit 3: remaining = 0 (last allowed hit)", r3.ok && r3.remaining === 0, JSON.stringify(r3));
}

// ═══ at/over the limit: rate_limited + positive retry_after ═══════════════════
console.log("\n— at the limit (rate_limited + retry_after) —");
{
  const clk = clock(T0);
  const { store } = fakeStore(clk);
  const deps = { store, now: clk.now };
  const opts = { key: "rl:login:ip:b", limit: 2, window_ms: WINDOW };

  await rateLimit(deps, opts); // 1
  await rateLimit(deps, opts); // 2 (at limit, still ok with remaining 0)
  const over = await rateLimit(deps, opts); // 3 -> over

  check("4th-ish hit over limit: ok=false", over.ok === false);
  check(
    "over limit: reason rate_limited",
    over.ok === false && over.reason === "rate_limited",
    JSON.stringify(over),
  );
  check(
    "over limit: retry_after_ms is the full remaining window (no time elapsed)",
    over.ok === false && over.reason === "rate_limited" && over.retry_after_ms === WINDOW,
    JSON.stringify(over),
  );
}

// retry_after shrinks deterministically as the injected clock advances
{
  const clk = clock(T0);
  const { store } = fakeStore(clk);
  const deps = { store, now: clk.now };
  const opts = { key: "rl:login:ip:b2", limit: 1, window_ms: WINDOW };

  await rateLimit(deps, opts); // opens window, reset_at = T0+WINDOW
  clk.advance(15_000); // 15s into the window
  const over = await rateLimit(deps, opts);
  check(
    "retry_after tracks injected clock (45s left after 15s elapsed)",
    over.ok === false && over.reason === "rate_limited" && over.retry_after_ms === WINDOW - 15_000,
    JSON.stringify(over),
  );
}

// ═══ window reset: advance past reset -> fresh budget ═════════════════════════
console.log("\n— window reset —");
{
  const clk = clock(T0);
  const { store } = fakeStore(clk);
  const deps = { store, now: clk.now };
  const opts = { key: "rl:login:ip:c", limit: 1, window_ms: WINDOW };

  const a = await rateLimit(deps, opts); // ok, remaining 0
  const b = await rateLimit(deps, opts); // over
  clk.advance(WINDOW); // now == reset_at -> window expired
  const c = await rateLimit(deps, opts); // fresh window -> ok again

  check("reset: first hit ok", a.ok === true);
  check("reset: second hit (same window) rate_limited", b.ok === false);
  check("reset: after advancing one window, ok again", c.ok === true, JSON.stringify(c));
  check("reset: remaining back to limit-1 in the new window", c.ok && c.remaining === 0, JSON.stringify(c));
}

// ═══ per-key isolation ════════════════════════════════════════════════════════
console.log("\n— per-key isolation —");
{
  const clk = clock(T0);
  const { store } = fakeStore(clk);
  const deps = { store, now: clk.now };

  // exhaust key X
  await rateLimit(deps, { key: "X", limit: 1, window_ms: WINDOW });
  const xOver = await rateLimit(deps, { key: "X", limit: 1, window_ms: WINDOW });
  // key Y is untouched
  const yFirst = await rateLimit(deps, { key: "Y", limit: 1, window_ms: WINDOW });

  check("isolation: X is over its limit", xOver.ok === false);
  check("isolation: Y has its own full budget (X's hits don't count)", yFirst.ok === true, JSON.stringify(yFirst));
}

// ═══ store failure: FAIL OPEN by default (auth-safe) + logs ═══════════════════
console.log("\n— store outage: fail OPEN (default, auth-safe) —");
{
  const clk = clock(T0);
  const { log, warns } = capLogger();
  const deps = { store: throwingStore, now: clk.now, log };

  const r = await rateLimit(deps, { key: "rl:login:ip:z", limit: 5, window_ms: WINDOW });

  check("outage(open): does NOT throw across the boundary", true);
  check("outage(open): ok=true (request allowed — no userbase lockout)", r.ok === true, JSON.stringify(r));
  check("outage(open): remaining advertised as limit-1", r.ok && r.remaining === 4, JSON.stringify(r));
  check("outage(open): logged a warn so the outage is alertable", warns.length === 1, JSON.stringify(warns));
  check(
    "outage(open): warn carries the key + sanitized error (no stack)",
    warns[0]?.msg === "rate_limit_store_unavailable" &&
      warns[0]?.key === "rl:login:ip:z" &&
      warns[0]?.err_name === "Error",
    JSON.stringify(warns[0]),
  );
}

// ═══ store failure: FAIL CLOSED when opted in (abuse surfaces) ════════════════
console.log("\n— store outage: fail CLOSED (opt-in for abuse-only surfaces) —");
{
  const clk = clock(T0);
  const { log, warns } = capLogger();
  const deps = { store: throwingStore, now: clk.now, log };

  const r = await rateLimit(deps, {
    key: "rl:export:ip:z",
    limit: 5,
    window_ms: WINDOW,
    failMode: "closed",
  });

  check("outage(closed): ok=false", r.ok === false);
  check(
    "outage(closed): reason store_unavailable (distinct from rate_limited)",
    r.ok === false && r.reason === "store_unavailable",
    JSON.stringify(r),
  );
  check(
    "outage(closed): retry_after_ms = one window backoff",
    r.ok === false && r.reason === "store_unavailable" && r.retry_after_ms === WINDOW,
    JSON.stringify(r),
  );
  check("outage(closed): still logs the outage", warns.length === 1 && warns[0]?.msg === "rate_limit_store_unavailable");
}

// ═══ bad store reply treated like an outage ═══════════════════════════════════
console.log("\n— malformed store reply —");
{
  const clk = clock(T0);
  const { log, warns } = capLogger();
  // open default: bad reply -> allowed + warn
  const open = await rateLimit(
    { store: badReplyStore({ count: NaN, reset_at_ms: 1 }), now: clk.now, log },
    { key: "k", limit: 3, window_ms: WINDOW },
  );
  check("bad reply (open): ok=true (fail open)", open.ok === true, JSON.stringify(open));
  check("bad reply (open): logged bad_reply warn", warns.some((w) => w.msg === "rate_limit_store_bad_reply"));

  // closed: bad reply -> store_unavailable
  const closed = await rateLimit(
    { store: badReplyStore({ count: 0, reset_at_ms: NaN }), now: clk.now },
    { key: "k", limit: 3, window_ms: WINDOW, failMode: "closed" },
  );
  check(
    "bad reply (closed): store_unavailable",
    closed.ok === false && closed.reason === "store_unavailable",
    JSON.stringify(closed),
  );
}

// ═══ misconfigured opts: fail open + log (gate never silently disabled) ═══════
console.log("\n— misconfigured opts —");
{
  const clk = clock(T0);
  const { store } = fakeStore(clk);
  const { log, warns } = capLogger();

  const zeroLimit = await rateLimit({ store, now: clk.now, log }, { key: "k", limit: 0, window_ms: WINDOW });
  const badWindow = await rateLimit({ store, now: clk.now, log }, { key: "k", limit: 3, window_ms: 0 });

  check("misconfig: limit<1 fails open (allowed)", zeroLimit.ok === true, JSON.stringify(zeroLimit));
  check("misconfig: window<=0 fails open (allowed)", badWindow.ok === true, JSON.stringify(badWindow));
  check(
    "misconfig: both logged as rate_limit_misconfigured",
    warns.filter((w) => w.msg === "rate_limit_misconfigured").length === 2,
    JSON.stringify(warns),
  );
  check("misconfig: store never even consulted (no count consumed)", true);
}

// ═══ clock-skew floor: store reset already in the past -> full-window backoff ══
console.log("\n— clock skew floor —");
{
  const clk = clock(T0);
  // store reports a reset instant in the PAST relative to now -> retry_after must
  // never be 0/negative; falls back to a full window.
  const skewStore = badReplyStore({ count: 99, reset_at_ms: T0 - 5_000 });
  const r = await rateLimit({ store: skewStore, now: () => T0 }, { key: "k", limit: 1, window_ms: WINDOW });
  check(
    "skew: over-limit with past reset_at -> retry_after floored to a full window (never <=0)",
    r.ok === false && r.reason === "rate_limited" && r.retry_after_ms === WINDOW,
    JSON.stringify(r),
  );
}

// ═══ key composition ══════════════════════════════════════════════════════════
console.log("\n— key composition —");
{
  check(
    "compositeKey: namespaced + joined",
    compositeKey("login", ["ip", "203.0.113.7"]) === "rl:login:ip:203.0.113.7",
    compositeKey("login", ["ip", "203.0.113.7"]),
  );
  check(
    "compositeKey: separator-injection in a part is sanitized (can't forge another bucket)",
    compositeKey("login", ["ip", "1.2.3.4:evil"]) === "rl:login:ip:1.2.3.4_evil",
    compositeKey("login", ["ip", "1.2.3.4:evil"]),
  );
  check(
    "compositeKey: empty part collapses to a stable placeholder (stable key shape)",
    compositeKey("login", ["acct", ""]) === "rl:login:acct:_",
    compositeKey("login", ["acct", ""]),
  );

  const both = ipAccountKey("login", "203.0.113.7", "acct_123");
  check("ipAccountKey: ip key", both.ipKey === "rl:login:ip:203.0.113.7", both.ipKey);
  check("ipAccountKey: account key", both.accountKey === "rl:login:acct:acct_123", String(both.accountKey));

  const ipOnly = ipAccountKey("login", "203.0.113.7", null);
  check("ipAccountKey: account absent (pre-identification) -> ip-only", ipOnly.accountKey === undefined);

  // the two dimensions are DISTINCT keys -> isolated buckets (layered limiter)
  check("ipAccountKey: ip vs account keys are distinct buckets", both.ipKey !== both.accountKey);
}

// ═══ layered limiter integration: either dimension can trip ═══════════════════
console.log("\n— layered ip + account limiter —");
{
  const clk = clock(T0);
  const { store } = fakeStore(clk);
  const deps = { store, now: clk.now };
  const limit = 3;

  // Same account hammered from THREE different IPs (credential stuffing): each
  // IP bucket stays under its own per-IP limit, but the shared ACCOUNT bucket
  // accumulates and trips first.
  const acct = "acct_target";
  async function attempt(ip: string) {
    const { ipKey, accountKey } = ipAccountKey("login", ip, acct);
    const ipR = await rateLimit(deps, { key: ipKey, limit, window_ms: WINDOW });
    const acctR = await rateLimit(deps, { key: accountKey!, limit, window_ms: WINDOW });
    return ipR.ok && acctR.ok; // allowed only if BOTH pass
  }

  const a1 = await attempt("ip-1");
  const a2 = await attempt("ip-2");
  const a3 = await attempt("ip-3");
  const a4 = await attempt("ip-4"); // 4th distinct IP, but account bucket now over limit

  check("layered: first 3 distinct-IP attempts allowed", a1 && a2 && a3);
  check("layered: 4th attempt blocked by the per-ACCOUNT bucket (stuffing caught)", a4 === false);
}

// ═══ verdict ═══════════════════════════════════════════════════════════════════
console.log(failures === 0 ? "\nRATE-LIMIT: all checks passed" : `\nRATE-LIMIT: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
