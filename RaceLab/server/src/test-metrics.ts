/**
 * metrics seam test suite — src/metrics.ts exercised against a CAPTURING write
 * sink (no real stderr, no network). Assertion style mirrors src/test-health.ts.
 *
 * Covers: no-op default drops everything (and never throws), the console impl
 * emits one stable JSON-line per call with the right kind/value, the alert-metric
 * name constants are the snake_case strings the alert rules reference, ALERT_METRICS
 * enumerates exactly those, tag sanitization drops non-scalar / non-finite / secret
 * values (PII guard), non-finite observe samples are zeroed, a throwing write never
 * escapes the boundary, and the emit helpers fire the correct name + low-cardinality
 * tags.
 *
 * Run from C:/Users/willy/hackaton2026/RaceLab/server:
 *   npx tsx src/test-metrics.ts
 */

import {
  noopMetrics,
  makeConsoleMetrics,
  METRIC,
  ALERT_METRICS,
  emitStripeSignatureFail,
  emitStripeWebhookFail,
  emitAuthFail,
  emitBackupConflict,
  emitHttp5xx,
  type MetricLine,
  type Metrics,
} from "./metrics";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

/** A console impl whose lines are captured into `lines` instead of stderr. */
function capturing(): { m: Metrics; lines: MetricLine[] } {
  const lines: MetricLine[] = [];
  return { m: makeConsoleMetrics((l) => lines.push(l)), lines };
}

// ═══ no-op default ═════════════════════════════════════════════════════════════

console.log("— no-op default —");
{
  let threw = false;
  try {
    noopMetrics.increment("anything", { route: "/x" });
    noopMetrics.observe("anything", 12.5, { route: "/x" });
    noopMetrics.increment("nameonly");
  } catch {
    threw = true;
  }
  check("noop: never throws", threw === false);
  // nothing to assert beyond "silently dropped" — the contract is no side effect.
}

// ═══ console impl — one stable line per call ═══════════════════════════════════

console.log("\n— console impl: increment —");
{
  const { m, lines } = capturing();
  m.increment(METRIC.AUTH_FAIL, { route: "/api/entitlement" });
  check("inc: exactly one line", lines.length === 1);
  check("inc: metric name carried", lines[0].metric === "auth_fail");
  check("inc: kind=count", lines[0].kind === "count");
  check("inc: value=1", lines[0].value === 1);
  check("inc: tags carried", JSON.stringify(lines[0].tags) === JSON.stringify({ route: "/api/entitlement" }));
}

console.log("\n— console impl: observe —");
{
  const { m, lines } = capturing();
  m.observe("http_latency_ms", 42, { route: "/api/healthz" });
  check("obs: one line", lines.length === 1);
  check("obs: kind=observe", lines[0].kind === "observe");
  check("obs: value carried verbatim", lines[0].value === 42);
}

console.log("\n— console impl: no tags omits the field —");
{
  const { m, lines } = capturing();
  m.increment("nameonly");
  check("notags: tags absent (not {} )", lines[0].tags === undefined);
  check("notags: line still has metric+kind+value", lines[0].metric === "nameonly" && lines[0].kind === "count" && lines[0].value === 1);
}

// ═══ alert-metric name constants — the contract the alert rules reference ══════

console.log("\n— alert-metric name constants —");
{
  check("name: stripe_signature_fail", METRIC.STRIPE_SIGNATURE_FAIL === "stripe_signature_fail");
  check("name: stripe_webhook_fail", METRIC.STRIPE_WEBHOOK_FAIL === "stripe_webhook_fail");
  check("name: auth_fail", METRIC.AUTH_FAIL === "auth_fail");
  check("name: backup_conflict_409", METRIC.BACKUP_CONFLICT_409 === "backup_conflict_409");
  check("name: http_5xx", METRIC.HTTP_5XX === "http_5xx");
}

console.log("\n— ALERT_METRICS enumerates exactly the five —");
{
  const expected = ["stripe_signature_fail", "stripe_webhook_fail", "auth_fail", "backup_conflict_409", "http_5xx"].sort();
  check("alerts: exactly the five names", [...ALERT_METRICS].sort().join(",") === expected.join(","));
  let frozenThrew = false;
  try {
    (ALERT_METRICS as string[]).push("oops");
  } catch {
    frozenThrew = true;
  }
  check("alerts: list is frozen (immutable catalog)", frozenThrew === true || !ALERT_METRICS.includes("oops"));
}

// ═══ tag sanitization — the PII / cardinality guard ════════════════════════════

console.log("\n— tag sanitization (non-scalar / secret values dropped) —");
{
  const { m, lines } = capturing();
  // a caller smuggles an object (could carry a secret) + a function + a null +
  // good scalar dimensions. Only the scalars must survive.
  m.increment("evt", {
    route: "/api/x",
    status: 500,
    leak_obj: { stripe_secret_key: "sk_live_DEADBEEF" } as unknown as string,
    leak_fn: (() => "x") as unknown as string,
    leak_null: null as unknown as string,
    leak_undef: undefined as unknown as string,
  });
  const tags = lines[0].tags ?? {};
  check("sani: route kept", tags.route === "/api/x");
  check("sani: numeric status kept", tags.status === 500);
  check("sani: object tag dropped", !("leak_obj" in tags));
  check("sani: function tag dropped", !("leak_fn" in tags));
  check("sani: null tag dropped", !("leak_null" in tags));
  check("sani: undefined tag dropped", !("leak_undef" in tags));
  check("sani: serialized line carries NO secret value", !JSON.stringify(lines[0]).includes("sk_live"));
}

console.log("\n— tag sanitization: all-bad tags collapse to undefined —");
{
  const { m, lines } = capturing();
  m.increment("evt", { bad: {} as unknown as string });
  check("sani: empty result omits tags entirely", lines[0].tags === undefined);
}

console.log("\n— non-finite observe sample is zeroed —");
{
  const { m, lines } = capturing();
  m.observe("lat", NaN);
  m.observe("lat", Infinity);
  check("obs: NaN -> 0", lines[0].value === 0);
  check("obs: Infinity -> 0", lines[1].value === 0);
}

console.log("\n— non-finite numeric TAG is dropped (not stringified) —");
{
  const { m, lines } = capturing();
  m.increment("evt", { status: NaN as unknown as number });
  check("sani: NaN tag dropped -> tags undefined", lines[0].tags === undefined);
}

// ═══ a throwing write must NEVER escape the boundary ═══════════════════════════

console.log("\n— throwing sink never escapes —");
{
  const exploding = makeConsoleMetrics(() => {
    throw new Error("sink down");
  });
  let threw = false;
  try {
    exploding.increment(METRIC.HTTP_5XX, { route: "/x", status: 500 });
    exploding.observe("lat", 1);
  } catch {
    threw = true;
  }
  check("throw: increment/observe swallow a throwing sink", threw === false);
}

// ═══ emit helpers — correct name + low-cardinality tags only ═══════════════════

console.log("\n— emit helpers —");
{
  const { m, lines } = capturing();
  emitStripeSignatureFail(m);
  check("helper: signature-fail name", lines[0].metric === "stripe_signature_fail");
  check("helper: signature-fail has NO tags (no user known)", lines[0].tags === undefined);
}
{
  const { m, lines } = capturing();
  emitStripeWebhookFail(m);
  check("helper: webhook-fail name", lines[0].metric === "stripe_webhook_fail");
}
{
  const { m, lines } = capturing();
  emitAuthFail(m, "/api/entitlement");
  check("helper: auth-fail name", lines[0].metric === "auth_fail");
  check("helper: auth-fail route tag only", JSON.stringify(lines[0].tags) === JSON.stringify({ route: "/api/entitlement" }));
}
{
  const { m, lines } = capturing();
  emitAuthFail(m);
  check("helper: auth-fail with no route omits tags", lines[0].tags === undefined);
}
{
  const { m, lines } = capturing();
  emitBackupConflict(m, "runs");
  check("helper: backup-409 name", lines[0].metric === "backup_conflict_409");
  check("helper: backup-409 domain tag", JSON.stringify(lines[0].tags) === JSON.stringify({ domain: "runs" }));
}
{
  const { m, lines } = capturing();
  emitHttp5xx(m, "/api/backup/push", 500);
  check("helper: http-5xx name", lines[0].metric === "http_5xx");
  check("helper: http-5xx route+status tags", JSON.stringify(lines[0].tags) === JSON.stringify({ route: "/api/backup/push", status: 500 }));
}

// ═══ default impl writes to stderr (smoke — does not throw, no capture) ════════

console.log("\n— default stderr writer (smoke) —");
{
  const m = makeConsoleMetrics(); // real stderr writer
  let threw = false;
  try {
    m.increment(METRIC.AUTH_FAIL, { route: "/smoke" });
  } catch {
    threw = true;
  }
  check("default: real-stderr increment never throws", threw === false);
}

// ═══ verdict ═══════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nMETRICS: all checks passed" : `\nMETRICS: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
