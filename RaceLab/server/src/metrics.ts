/**
 * Metrics — a tiny metric-emitter SEAM (M8 observability), the counters/gauges
 * companion to src/log.ts's structured stderr trail. log.ts answers "what
 * happened on THIS request"; metrics answers "how OFTEN is this happening across
 * requests" — the signal an alert fires on.
 *
 * Same posture as every seam in this server:
 *  - INTERFACE, zero committed runtime deps, no node built-ins beyond types.
 *  - Never throws across its boundary (emitting a metric must never break a
 *    request — the impls are wrapped exactly like logLine).
 *  - The real sink (StatsD / Datadog / CloudWatch EMF / Sentry) is a DEPLOY
 *    seam: pick an impl at wiring time, default is the no-op.
 *
 * NEVER carries a secret or PII. Names are fixed constants; tags are
 * low-cardinality dimensions only (route, status, reason-code) — NEVER a token,
 * email, user_id, body, or signature. The helpers below construct tags for you
 * so a caller can't accidentally pass a high-cardinality / sensitive value.
 *
 * Two kinds of signal:
 *  - increment(name, tags?)        — a counter tick (an event occurred).
 *  - observe(name, value, tags?)   — a value sample (latency ms, payload bytes).
 */

/** Low-cardinality dimensions on a metric. Values MUST be enums/codes/routes —
 *  never user-derived strings (no ids, tokens, emails, free text). */
export type MetricTags = Readonly<Record<string, string | number>>;

export interface Metrics {
  /** Count one occurrence of `name`. */
  increment(name: string, tags?: MetricTags): void;
  /** Sample a numeric `value` for `name` (latency, size, …). */
  observe(name: string, value: number, tags?: MetricTags): void;
}

// ── alert-worthy metric names (the catalog the audit called out) ─────────────
// Stable string constants so emit sites and the alert rules (docs/OBSERVABILITY)
// reference ONE source of truth — a renamed metric can never silently drop an
// alert. Snake_case, namespaced by subsystem.

export const METRIC = {
  /** Stripe webhook signature verification rejected the payload (400). A
   *  sustained rate > 0 means a leaked/rotated signing secret or a forged
   *  caller — PAGE. (handlers/stripeWebhook invalid_signature.) */
  STRIPE_SIGNATURE_FAIL: "stripe_signature_fail",
  /** Stripe webhook hit the catch-all 500 (transient store/verifier throw); the
   *  event is intentionally left uncommitted so Stripe retries. A spike means
   *  the billing spine is failing to record paid subscriptions. */
  STRIPE_WEBHOOK_FAIL: "stripe_webhook_fail",
  /** A bearer auth check returned 401 (requireAuth). A spike from one route/IP
   *  is credential stuffing or an expired-token storm after a Clerk change. */
  AUTH_FAIL: "auth_fail",
  /** A backup-blob PUT lost the optimistic-concurrency check (409 server_newer).
   *  A high rate means clients are fighting over the same domain blob — a sync
   *  bug, not a security event, but it degrades the user's backup. */
  BACKUP_CONFLICT_409: "backup_conflict_409",
  /** Any handler 5xx (the router catch + explicit 500s). The top-line "is the
   *  API broken" signal. */
  HTTP_5XX: "http_5xx",
} as const;

/** The set of alert-worthy names, for tests / dashboards that enumerate them. */
export const ALERT_METRICS: readonly string[] = Object.freeze(Object.values(METRIC));

// ── no-op default ────────────────────────────────────────────────────────────

/** The default sink: drops everything. Wired everywhere metrics aren't
 *  configured (tests, local dev) so call sites never need a null check. */
export const noopMetrics: Metrics = {
  increment() {
    /* intentionally empty */
  },
  observe() {
    /* intentionally empty */
  },
};

// ── console/JSON-line impl ───────────────────────────────────────────────────

/** A line written by the console impl. `kind` distinguishes a counter tick from
 *  a value sample; shape is stable so a log-based metric pipeline (CloudWatch
 *  EMF, Vector, a grep) can parse it. */
export interface MetricLine {
  metric: string;
  kind: "count" | "observe";
  value: number;
  tags?: MetricTags;
}

/** Default JSON-line writer: one line to STDERR (same stream as log.ts, so the
 *  two trails interleave in one place and never pollute a JSON response body).
 *  Wrapped — emitting must never throw. */
function writeLine(line: MetricLine): void {
  try {
    console.error(JSON.stringify({ metric_line: line }));
  } catch {
    /* best-effort; a metric must never break a request */
  }
}

/**
 * Console/JSON-line Metrics impl. Emits one structured stderr line per call via
 * `write` (default: stderr JSON). Inject a custom `write` to capture lines in a
 * test or to fan them at a real sink. Never throws across the boundary.
 *
 * Guards tags defensively: any non-(string|number) tag value is dropped, so a
 * caller can't smuggle an object/secret through into the emitted line.
 */
export function makeConsoleMetrics(write: (line: MetricLine) => void = writeLine): Metrics {
  const emit = (kind: "count" | "observe", metric: string, value: number, tags?: MetricTags): void => {
    try {
      const safe = sanitizeTags(tags);
      write(safe === undefined ? { metric, kind, value } : { metric, kind, value, tags: safe });
    } catch {
      /* best-effort; a metric must never break a request */
    }
  };
  return {
    increment(name, tags) {
      emit("count", name, 1, tags);
    },
    observe(name, value, tags) {
      // guard a non-finite sample (NaN/Infinity) — it would poison an average.
      emit("observe", name, Number.isFinite(value) ? value : 0, tags);
    },
  };
}

/** Keep only string/number tag values (drops objects, functions, null,
 *  undefined). Defensive: tags are meant to be low-cardinality codes, and this
 *  stops a non-scalar (or a stray secret object) from reaching the sink. Returns
 *  undefined when nothing survives, so empty tags aren't emitted. */
function sanitizeTags(tags?: MetricTags): MetricTags | undefined {
  if (tags === undefined) return undefined;
  const out: Record<string, string | number> = {};
  let n = 0;
  for (const [k, v] of Object.entries(tags)) {
    if (typeof v === "string" || (typeof v === "number" && Number.isFinite(v))) {
      out[k] = v;
      n++;
    }
  }
  return n === 0 ? undefined : out;
}

// ── emit helpers for the alert-worthy metrics ────────────────────────────────
// One helper per alert metric so call sites can't typo a name or attach a
// sensitive tag. Each takes only low-cardinality dimensions. Route is passed
// raw (already a fixed path string in this codebase, never user input).

/** Stripe signature rejected (400). No user is known at this point. */
export function emitStripeSignatureFail(m: Metrics): void {
  m.increment(METRIC.STRIPE_SIGNATURE_FAIL);
}

/** Stripe webhook 500 (uncommitted, will be retried). */
export function emitStripeWebhookFail(m: Metrics): void {
  m.increment(METRIC.STRIPE_WEBHOOK_FAIL);
}

/** A 401 on `route`. Only the route dimension — never the token or any
 *  caller-supplied value. */
export function emitAuthFail(m: Metrics, route?: string): void {
  m.increment(METRIC.AUTH_FAIL, route !== undefined ? { route } : undefined);
}

/** A backup-blob 409 (optimistic-concurrency loss). `domain` is the fixed
 *  backup domain name (a small enum), not user data. */
export function emitBackupConflict(m: Metrics, domain?: string): void {
  m.increment(METRIC.BACKUP_CONFLICT_409, domain !== undefined ? { domain } : undefined);
}

/** A handler 5xx on `route` with `status` (500/502/503…). Both dimensions are
 *  fixed/low-cardinality. */
export function emitHttp5xx(m: Metrics, route: string, status: number): void {
  m.increment(METRIC.HTTP_5XX, { route, status });
}
