# OBSERVABILITY (M8)

Two server-side signal trails, both already in code, both deploy-wired at the end:

| Trail | File | Question it answers | Sink (deploy seam) |
|-------|------|---------------------|--------------------|
| **Structured logs** | `server/src/log.ts` | "what happened on THIS request" | stderr → Vercel log drain / Sentry breadcrumbs |
| **Metrics** | `server/src/metrics.ts` | "how OFTEN across requests" (alert signal) | no-op default → StatsD/Datadog/CloudWatch EMF, or Sentry |

Both are **pure seams**: interface + no-op/console default, zero committed runtime deps, never throw across their boundary (a broken log/metric must never break a request). The real sink is chosen at deploy.

This doc is the catalog + alert rules + the PII/correlation policy + the Sentry wiring note. It closes the `⬜ Sentry + alert rules wire at deploy` item in `docs/BACKEND_STATUS.md` (Cross-cutting — Observability).

---

## 1. Metric catalog

Five **alert-worthy** metrics, named as stable constants in `server/src/metrics.ts` (`METRIC.*`) and enumerated by `ALERT_METRICS`. Each has a typed emit helper so a call site cannot typo the name or attach a sensitive tag.

| Metric (`METRIC.*`) | Kind | Emitted at | Helper | Tags |
|---------------------|------|-----------|--------|------|
| `stripe_signature_fail` | counter | `handlers/stripeWebhook` → 400 `invalid_signature` | `emitStripeSignatureFail(m)` | none (no user known) |
| `stripe_webhook_fail` | counter | `handlers/stripeWebhook` catch-all → 500 (event left **uncommitted**, Stripe retries) | `emitStripeWebhookFail(m)` | none |
| `auth_fail` | counter | `auth.requireAuth` → 401 | `emitAuthFail(m, route?)` | `route` |
| `backup_conflict_409` | counter | `handlers/backupBlob` PUT → 409 `server_newer` (optimistic-concurrency loss) | `emitBackupConflict(m, domain?)` | `domain` |
| `http_5xx` | counter | `handler.ts` router catch + any explicit 5xx | `emitHttp5xx(m, route, status)` | `route`, `status` |

Generic primitives (use directly, no helper):
- `m.increment(name, tags?)` — a counter tick.
- `m.observe(name, value, tags?)` — a numeric sample (latency ms, payload bytes); non-finite samples are coerced to `0` so they can't poison an average.

**Tags are low-cardinality dimensions only** — route, status code, domain enum. `makeConsoleMetrics` **sanitizes** every tag set: any non-`(string | finite number)` value (object, function, null, undefined, `NaN`) is dropped before emit. A caller therefore cannot smuggle a token/email/object/secret through a tag. (Verified in `src/test-metrics.ts`: a tag carrying `sk_live_…` never appears in the emitted line.)

Console-impl line shape (one JSON object per call, to stderr, parseable by a log-based metric pipeline / CloudWatch EMF / Vector):

```json
{"metric_line":{"metric":"auth_fail","kind":"count","value":1,"tags":{"route":"/api/entitlement"}}}
```

---

## 2. Alert rules

Thresholds are starting points; tune against the first week of real traffic. Severity: **PAGE** = wake someone; **TICKET** = next business day.

| Alert | Condition | Severity | Why |
|-------|-----------|----------|-----|
| **Stripe signature failures** | `rate(stripe_signature_fail) > 0` sustained for 5m | **PAGE** | The webhook is auth-free, signed only by the Stripe secret. A non-zero sustained rate ⇒ leaked/rotated signing secret, a forged caller, or a webhook-secret mismatch after a deploy. Billing is the business spine (D29) — any of these blocks paid subscriptions from recording. |
| **Stripe webhook 5xx** | `rate(stripe_webhook_fail) > 0` for 10m, **or** any spike vs. baseline | **PAGE** | The catch-all 500 leaves the event **uncommitted on purpose** so Stripe retries — but a sustained rate means the store/verifier is down and paid subscriptions are silently not landing. Cross-check against the Stripe dashboard's webhook retry queue. |
| **Auth-fail spike** | `rate(auth_fail)` > 3× the 1h trailing baseline, or a hard rate (e.g. > 20/min) from one `route` | **TICKET** (PAGE if sustained + broad) | A 401 storm is credential stuffing, an expired-token wave after a Clerk config change, or a client-side auth bug. Per-`route` breakout tells which surface. Expected to be noisy at low volume — alert on the *spike*, not the absolute. |
| **Backup 409 rate** | `rate(backup_conflict_409)` > 5% of backup-blob PUTs over 30m | **TICKET** | A high optimistic-concurrency loss rate means clients are fighting over the same domain blob — a sync/merge bug degrading users' backups. Not a security event. |
| **HTTP 5xx rate** | `rate(http_5xx) / rate(all_requests) > 1%` over 5m | **PAGE** | The top-line "is the API broken" signal. Pair with `/api/healthz` (db ping + per-seam booleans) to separate an app bug from a dependency outage. |
| **Liveness** | `/api/healthz` returns 503 (db ping false) for > 1m | **PAGE** | Neon down / connection exhausted. (Probe, not a metric — wire in the uptime monitor.) |

The whole Tier-B API is **enrichment, not the critical path** (D4/D18): the app works fully with every endpoint down. So a transient backend blip is a TICKET, not a 3am PAGE — except the two **PAGE** rows that touch money (`stripe_*`) or signal a total outage (`http_5xx` rate, liveness).

---

## 3. Correlation-id + PII-redaction policy (already enforced in `log.ts`)

This is **policy of record** — the code already implements it; this section documents the invariant so it isn't regressed.

**Correlation id.** Every request may carry `x-request-id`; `handler.ts` reads it (`headerStr`) and passes it as `request_id` into `logLine`. The same id should be set on the response/Sentry scope at deploy so a client-reported error maps to exactly one server log line. The client only ever sees an **opaque reason** (e.g. `{error:"internal_error"}`) — no stack, no internal detail — so this id is the *sole* bridge between a user report and the server trail.

**PII redaction — what is NEVER logged or emitted:**
- ❌ request/response **bodies** (setup data, payloads, Stripe event objects)
- ❌ **tokens / signatures / secrets** (bearer, `stripe-signature`, any `sk_*` / signing key)
- ❌ **emails, user ids, or any user-derived string** as a metric tag
- ✅ logged instead: `level`, `msg`, `route`, `request_id`, `status`, and a **bounded** `err_name` + `err_msg` (capped at 300 chars, name/message only — `errFields` never extracts a stack).
- ✅ metric tags: fixed enums only (route, status, domain) — and `sanitizeTags` drops anything else as a backstop.

**Never logs values, never throws.** `logLine` and both metric impls wrap their write in `try/catch` — observability is best-effort and must never break a request. `requireAuth` turns a *throwing* verifier into a 401 (not a 500), so auth failures never masquerade as outages — meaning `auth_fail` and `http_5xx` stay cleanly separated.

> If a future change needs more context in a log/metric, add a **low-cardinality, non-PII dimension** (a code/enum), never a raw user value. A reviewer should reject any log/tag carrying a body, token, email, or id.

---

## 4. Sentry wiring (deploy seam)

Sentry is a **deploy concern**, identical posture to the db driver (`makeSqlDb`) and the Clerk verifier (`jose`) — installed at deploy time only, nothing committed to the repo. Wire it in `src/deploy.ts`:

```ts
// npm i @sentry/node   (deploy-time only)
import * as Sentry from "@sentry/node";
Sentry.init({
  dsn: process.env.SENTRY_DSN,            // secret — env only, NEVER logged
  tracesSampleRate: 0.1,
  // scrub anything that could carry PII before it leaves the process:
  beforeSend(event) {
    delete event.request?.data;           // no bodies
    delete event.request?.cookies;
    if (event.request?.headers) {
      delete event.request.headers["authorization"];
      delete event.request.headers["stripe-signature"];
    }
    return event;
  },
});
```

Then bridge the two existing seams onto Sentry at wiring time (no source change to `log.ts` / `metrics.ts`):

- **Logs → Sentry.** In `handler.ts`'s catch, alongside `logLine(...)`, call `Sentry.captureException(e, { tags: { route }, extra: { request_id } })`. Set `Sentry.setTag("request_id", reqId)` on each request so the **correlation id** is the join key between Sentry and the stderr log line.
- **Metrics → sink.** Replace the default `noopMetrics` in `AppCtx` with `makeConsoleMetrics()` (stderr JSON, scraped by the platform's log-based metrics) **or** a custom `Metrics` impl that calls `Sentry.metrics.increment(name, 1, { tags })` / a StatsD client. The five `ALERT_METRICS` names map 1:1 to the alert rules in §2.

**Secrets:** `SENTRY_DSN`, the Stripe signing secret, the Clerk JWKS url, and `DATABASE_URL` live in env only and are **never** passed to a log field or a metric tag.
