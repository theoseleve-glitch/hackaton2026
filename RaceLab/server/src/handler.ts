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

type HandlerFn = (ctx: AppCtx, req: HttpRequest) => Promise<HttpResponse>;

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

  // ── P0.5 — media upload-url ────────────────────────────────────────────────
  "/api/media/upload-url": {
    POST: (c, r) => uploadUrl({ verifier: c.verifier, now: c.now, blobs: c.blobStore, store: c.mediaStore, newMediaId: c.newMediaId }, r),
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
};

export function makeHandler(ctx: AppCtx): (req: HttpRequest) => Promise<HttpResponse> {
  return async (req) => {
    const path = normalizePath(req.path);
    const methods = ROUTES[path];
    if (methods === undefined) return { status: 404, json: { error: "not_found" } };
    const fn = methods[req.method.toUpperCase()];
    if (fn === undefined) {
      return { status: 405, json: { error: "method_not_allowed", allow: Object.keys(methods) } };
    }
    try {
      return await fn(ctx, req);
    } catch {
      return { status: 500, json: { error: "internal_error" } };
    }
  };
}

function normalizePath(p: string): string {
  const noTrail = p.replace(/\/+$/, "");
  return noTrail === "" ? "/" : noTrail;
}
