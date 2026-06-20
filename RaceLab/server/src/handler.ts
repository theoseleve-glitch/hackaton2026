/**
 * Tiny router: {method, path, headers, query, body} -> {status, json}.
 * Pure dispatch — handlers do their own auth so each is independently
 * testable. Unknown path -> 404, known path wrong method -> 405 (+ allow),
 * handler throw -> 500 (a bug must never leak a stack trace to the client).
 *
 * Each BACKEND.md module declares a MINIMAL ctx (its own seams). The route
 * entry is an adapter closure that slices the full AppCtx down to that shape —
 * this is also where the modules' colliding `store`/`sign`/`verify` field names
 * are disambiguated (stripeStore vs entitlementStore vs mediaStore, …).
 */

import type { HttpRequest, HttpResponse } from "./types";
import type { AppCtx } from "./appCtx";
import { subscriptionStatus } from "./handlers/subscriptionStatus";
import { trialStart } from "./handlers/trialStart";
import { backupPush } from "./handlers/backupPush";
import { backupRestore } from "./handlers/backupRestore";
import { accountDelete } from "./handlers/accountDelete";
import { stripeWebhook } from "./handlers/stripeWebhook";
import { entitlement } from "./handlers/entitlement";
import { uploadUrl } from "./handlers/uploadUrl";
import { backupBlobGet, backupBlobPut } from "./handlers/backupBlob";
import { sharePublish, shareGet, shareImport } from "./handlers/share";
import { content } from "./handlers/content";
import { dataExportCreate, dataExportStatus } from "./handlers/dataExport";
import { registerPushToken, unregisterPushToken } from "./handlers/pushToken";
import { mediaConfirm } from "./handlers/mediaConfirm";
import { cronWorkers } from "./handlers/cron";
import { health } from "./handlers/health";
import { logLine, errFields } from "./log";
import { rateLimit, compositeKey } from "./rateLimit";
import { emitHttp5xx, emitAuthFail, emitStripeSignatureFail, emitStripeWebhookFail, emitBackupConflict } from "./metrics";

type HandlerFn = (ctx: AppCtx, req: HttpRequest) => Promise<HttpResponse>;

/** Per-route fixed-window rate-limit policy (IP dimension). ONLY enforced when
 *  ctx.rateStore is wired (absent in tests / an unconfigured deploy). Keyed by
 *  "<METHOD> <path>". The auth-free + auth-sensitive surfaces the audit called
 *  out are covered: the Stripe webhook (forged-signature spray), the EdDSA
 *  entitlement/signing endpoint (token-mint abuse), and the backup restore read
 *  (whole-journal scrape). The limiter FAILS OPEN on a store outage (rateLimit's
 *  default) so a counter blip never locks legitimate callers out. */
interface RatePolicy {
  surface: string;
  limit: number;
  window_ms: number;
}
const MIN = 60_000;
const RATE_POLICY: Record<string, RatePolicy> = {
  "POST /api/webhooks/stripe": { surface: "stripe_webhook", limit: 120, window_ms: MIN },
  "GET /api/entitlement": { surface: "entitlement", limit: 60, window_ms: MIN },
  "POST /api/me/export": { surface: "export_create", limit: 10, window_ms: MIN },
  "GET /api/backup/restore": { surface: "backup_restore", limit: 60, window_ms: MIN },
  "POST /api/trial/start": { surface: "trial_start", limit: 30, window_ms: MIN },
  // auth-free surfaces — uncapped before (audit P2). share/get is a token-probing /
  // scrape vector; content/* mints an EdDSA signature per cold-cache hit (a distributed
  // signing-oracle / CPU burn). Per-IP caps bound abuse without hurting legit fork/update.
  "GET /api/share/get": { surface: "share_get", limit: 120, window_ms: MIN },
  "GET /api/content/rcdata": { surface: "content_get", limit: 60, window_ms: MIN },
  "GET /api/content/kb": { surface: "content_get", limit: 60, window_ms: MIN },
  // bearer-gated storage/quota writers — cap the storage-growth path too.
  "POST /api/share/publish": { surface: "share_publish", limit: 30, window_ms: MIN },
  "POST /api/share/import": { surface: "share_import", limit: 60, window_ms: MIN },
  "POST /api/media/upload-url": { surface: "media_upload_url", limit: 60, window_ms: MIN },
};

const ROUTES: Record<string, Partial<Record<string, HandlerFn>>> = {
  // ── pre-existing (B5/B6) — take the base ServerCtx (AppCtx extends it) ──────
  "/api/subscription/status": { GET: subscriptionStatus },
  "/api/trial/start": { POST: trialStart },
  "/api/backup/push": { POST: backupPush },
  "/api/backup/restore": { GET: backupRestore },
  "/api/account": { DELETE: accountDelete },

  // ── P0 — Stripe webhook (auth-free; Stripe SIGNATURE, raw body) + entitlement
  "/api/webhooks/stripe": {
    POST: (c, r) => stripeWebhook({ now: c.now, verify: c.stripeVerify, store: c.stripeStore }, r),
  },
  "/api/entitlement": {
    GET: (c, r) => entitlement({ now: c.now, verifier: c.verifier, sign: c.entitlementSign, store: c.entitlementStore }, r),
  },

  // ── P0.5 — media upload-url + confirm ──────────────────────────────────────
  "/api/media/upload-url": {
    POST: (c, r) => uploadUrl({ verifier: c.verifier, now: c.now, blobs: c.blobStore, store: c.mediaStore, newMediaId: c.newMediaId }, r),
  },
  "/api/media/confirm": {
    POST: (c, r) => mediaConfirm({ verifier: c.verifier, now: c.now, store: c.mediaStore }, r),
  },

  // ── P1 — backup domain-blobs (D11) ─────────────────────────────────────────
  "/api/backup/blob": {
    GET: (c, r) => backupBlobGet({ now: c.now, verifier: c.verifier, store: c.backupBlobStore }, r),
    PUT: (c, r) => backupBlobPut({ now: c.now, verifier: c.verifier, store: c.backupBlobStore }, r),
  },

  // ── P1 — share + fork (D10; GET is auth-free, token capability) ─────────────
  "/api/share/publish": {
    POST: (c, r) => sharePublish({ now: c.now, verifier: c.verifier, store: c.shareStore, render: c.shareRender }, r),
  },
  "/api/share/get": {
    GET: (c, r) => shareGet({ now: c.now, verifier: c.verifier, store: c.shareStore, render: c.shareRender }, r),
  },
  "/api/share/import": {
    POST: (c, r) => shareImport({ now: c.now, verifier: c.verifier, store: c.shareStore, render: c.shareRender }, r),
  },

  // ── P2 — content delivery (auth-free; one handler, name read from the path) ─
  "/api/content/rcdata": {
    GET: (c, r) => content({ now: c.now, sign: c.contentSign, store: c.contentStore }, r),
  },
  "/api/content/kb": {
    GET: (c, r) => content({ now: c.now, sign: c.contentSign, store: c.contentStore }, r),
  },

  // ── P2 — GDPR export ───────────────────────────────────────────────────────
  "/api/me/export": {
    POST: (c, r) => dataExportCreate({ verifier: c.verifier, now: c.now, store: c.exportStore }, r),
    GET: (c, r) => dataExportStatus({ verifier: c.verifier, now: c.now, store: c.exportStore }, r),
  },

  // ── P2 — push notification tokens ──────────────────────────────────────────
  "/api/push/token": {
    POST: (c, r) => registerPushToken({ verifier: c.verifier, now: c.now, store: c.pushStore }, r),
    DELETE: (c, r) => unregisterPushToken({ verifier: c.verifier, now: c.now, store: c.pushStore }, r),
  },

  // ── ops — liveness/readiness (auth-free, no secret values leaked) ──────────
  "/api/healthz": {
    GET: (c) => health({ now: c.now, ping: c.healthPing, seams: c.healthSeams }),
  },

  // ── cron — scheduled worker fan-out (secret-gated; fail-closed when absent) ─
  "/api/cron/workers": {
    POST: (c, r) =>
      cronWorkers(
        {
          now: c.now,
          cronSecret: c.cronSecret,
          runJobs: c.cronRunJobs ?? (async () => ({ ok: true, ran: [] })),
        },
        r,
      ),
  },
};

export function makeHandler(ctx: AppCtx): (req: HttpRequest) => Promise<HttpResponse> {
  return async (req) => {
    const reqId = headerStr(req.headers["x-request-id"]);
    const path = normalizePath(req.path);
    // server_time on EVERY response (CONTRACTS): inject it, but a handler's own
    // server_time wins (spread last). Errors carry it too — clients raise their
    // tamper-guard floor even on a 4xx/5xx.
    const stamp = (r: HttpResponse): HttpResponse => ({ status: r.status, json: { server_time: ctx.now(), ...r.json } });
    const methods = ROUTES[path];
    if (methods === undefined) return stamp({ status: 404, json: { error: "not_found" } });
    const method = req.method.toUpperCase();
    const fn = methods[method];
    if (fn === undefined) {
      return stamp({ status: 405, json: { error: "method_not_allowed", allow: Object.keys(methods) } });
    }

    // ── rate limit (IP dimension) — only when a store is wired ────────────────
    // Layered under the handlers' own auth: this caps abuse on the auth-free and
    // auth-sensitive surfaces BEFORE the handler runs (a forged-signature spray
    // never reaches signature verification; a token-mint storm is throttled). The
    // limiter fails open on a store outage, so a counter blip can't lock anyone
    // out. Keyed on the client IP; an absent IP collapses to a stable placeholder
    // so the limiter still namespaces the bucket per route.
    if (ctx.rateStore !== undefined) {
      const policy = RATE_POLICY[`${method} ${path}`];
      if (policy !== undefined) {
        const ip = req.ip !== undefined && req.ip !== "" ? req.ip : "unknown";
        const key = compositeKey(policy.surface, ["ip", ip]);
        const rl = await rateLimit(
          { store: ctx.rateStore, now: () => Date.parse(ctx.now()), log: ctx.rateLog },
          { key, limit: policy.limit, window_ms: policy.window_ms },
        );
        if (!rl.ok && rl.reason === "rate_limited") {
          return stamp({ status: 429, json: { error: "rate_limited", retry_after_ms: rl.retry_after_ms } });
        }
        if (!rl.ok && rl.reason === "store_unavailable") {
          return stamp({ status: 429, json: { error: "rate_limited", retry_after_ms: rl.retry_after_ms } });
        }
      }
    }

    try {
      const res = await fn(ctx, req);
      // Central alert-catalog emission — the security alerts (auth-fail, forged Stripe
      // signature, webhook failure, backup conflict) were DEFINED + tested but emitted by
      // NOTHING. Keying off the handler's own response makes them actually fire, without
      // threading a metrics sink into every handler.
      if (ctx.metrics !== undefined) {
        const m = ctx.metrics;
        if (res.status === 401) emitAuthFail(m, path);
        else if (path === "/api/webhooks/stripe") {
          if (res.status === 400 && res.json.error === "invalid_signature") emitStripeSignatureFail(m);
          else if (res.status >= 500) emitStripeWebhookFail(m);
        } else if (path === "/api/backup/blob" && res.status === 409) emitBackupConflict(m);
      }
      return stamp(res);
    } catch (e) {
      // The client gets an opaque reason (no stack leak); the server gets the
      // only diagnostic trail. Never log bodies/tokens/PII (see log.ts).
      logLine({ level: "error", msg: "handler_threw", route: path, request_id: reqId, status: 500, ...errFields(e) });
      if (ctx.metrics !== undefined) emitHttp5xx(ctx.metrics, path, 500);
      return stamp({ status: 500, json: { error: "internal_error" } });
    }
  };
}

function headerStr(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function normalizePath(p: string): string {
  const noTrail = p.replace(/\/+$/, "");
  return noTrail === "" ? "/" : noTrail;
}
