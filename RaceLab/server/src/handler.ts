/**
 * Tiny router: {method, path, headers, query, body} -> {status, json}.
 * Pure dispatch — handlers do their own auth so each is independently
 * testable. Unknown path -> 404, known path wrong method -> 405 (+ allow),
 * handler throw -> 500 (a bug must never leak a stack trace to the client).
 */

import type { HttpRequest, HttpResponse, ServerCtx } from "./types";
import { subscriptionStatus } from "./handlers/subscriptionStatus";
import { trialStart } from "./handlers/trialStart";
import { backupPush } from "./handlers/backupPush";
import { backupRestore } from "./handlers/backupRestore";
import { accountDelete } from "./handlers/accountDelete";
import { stripeWebhook } from "./handlers/stripeWebhook";

type HandlerFn = (ctx: ServerCtx, req: HttpRequest) => Promise<HttpResponse>;

const ROUTES: Record<string, Partial<Record<string, HandlerFn>>> = {
  "/api/subscription/status": { GET: subscriptionStatus },
  "/api/trial/start": { POST: trialStart },
  "/api/backup/push": { POST: backupPush },
  "/api/backup/restore": { GET: backupRestore },
  "/api/account": { DELETE: accountDelete },
  "/api/stripe/webhook": { POST: stripeWebhook },
};

export function makeHandler(ctx: ServerCtx): (req: HttpRequest) => Promise<HttpResponse> {
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
