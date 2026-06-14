/**
 * push notification token endpoints (P2).
 *
 *   POST   /api/push/token  — bearer; register/rotate this device's token.
 *   DELETE /api/push/token  — bearer; unregister this device (idempotent).
 *
 * OWNER-SCOPED: every row is keyed to auth.user_id (PK user_id+device_id). A
 * user can only register/unregister their OWN device rows — device_id comes
 * from the body, but it is ALWAYS scoped under the authenticated user_id, so it
 * can never address another user's row (no IDOR).
 *
 * Many devices per user: each (user_id, device_id) is independent; registering
 * a device is an upsert (rotates the Expo push token + replaces prefs).
 *
 * D29: web-Stripe only, no IAP — nothing here touches purchases. The
 * trial-ending nudge carried by prefs.trial is MARKETING (GDPR): the send-side
 * worker gates it on prefs.marketing_consent. Notification types are restricted
 * to: speedhive new-run, trial-ending, and the 2 social types. Expo receipt
 * processing + DeviceNotRegistered pruning are worker concerns, not here.
 */

import type { HttpRequest, HttpResponse } from "../types";
import type { TokenVerifier } from "../auth";
import type { PushStore, PushPrefs } from "../stores/pushStore";
import { requireAuth } from "../auth";

/** Minimal seams this module consumes (mirrors ServerCtx, narrowed). */
export interface PushCtx {
  verifier: TokenVerifier;
  now: () => string;
  store: PushStore;
}

const MAX_FIELD_LEN = 4096; // sanity bound on client-supplied strings

/** POST /api/push/token — register or rotate this device's push token. */
export async function registerPushToken(ctx: PushCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;
  const server_time = ctx.now();

  const body = req.body;
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, json: { error: "bad_request" } };
  }
  const r = body as Record<string, unknown>;

  const device_id = typeof r.device_id === "string" ? r.device_id.trim() : "";
  if (device_id === "" || device_id.length > MAX_FIELD_LEN) {
    return { status: 400, json: { error: "bad_request" } };
  }
  const token = typeof r.token === "string" ? r.token.trim() : "";
  if (token === "" || token.length > MAX_FIELD_LEN) {
    return { status: 400, json: { error: "bad_request" } };
  }

  const prefs = parsePrefs(r.prefs);
  if (prefs === null) return { status: 400, json: { error: "bad_request" } };

  await ctx.store.register(auth.user_id, device_id, token, prefs, server_time);
  return { status: 200, json: { ok: true, server_time } };
}

/** DELETE /api/push/token — unregister this device (idempotent). device_id may
 *  come from the body or, for a query-only DELETE, the query string. */
export async function unregisterPushToken(ctx: PushCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;
  const server_time = ctx.now();

  const device_id = readDeviceId(req);
  if (device_id === "" || device_id.length > MAX_FIELD_LEN) {
    return { status: 400, json: { error: "bad_request" } };
  }

  // owner-scoped delete: no-op when the device isn't this user's -> idempotent
  await ctx.store.unregister(auth.user_id, device_id);
  return { status: 200, json: { ok: true, server_time } };
}

/** device_id from body first (DELETE-with-body), else the query string. */
function readDeviceId(req: HttpRequest): string {
  const body = req.body;
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    const v = (body as Record<string, unknown>).device_id;
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  const q = req.query.device_id;
  const raw = Array.isArray(q) ? q[0] : q;
  return typeof raw === "string" ? raw.trim() : "";
}

/** Validate the optional prefs object. Returns parsed prefs, or null on a
 *  malformed prefs value (so the handler can 400). Absent prefs -> {}. */
function parsePrefs(v: unknown): PushPrefs | null {
  if (v === undefined || v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) return null;
  const src = v as Record<string, unknown>;
  const out: PushPrefs = {};
  // restrict to the notification types this product supports
  for (const key of ["speedhive", "trial", "social", "marketing_consent"] as const) {
    const val = src[key];
    if (val === undefined) continue;
    if (typeof val !== "boolean") return null;
    out[key] = val;
  }
  return out;
}
