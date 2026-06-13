/**
 * Share link + fork — the WHOLE of social for V1.0 (D10: an unlisted token; no
 * follows, no feed, no public profiles). Three handlers:
 *
 *   POST /api/share/publish  (bearer) — snapshot a track/setup, render its
 *                                       artifacts, mint an unguessable token.
 *   GET  /api/share/get      (AUTH-FREE, ?token=) — the static share-page data
 *                                       + install CTA (D10). Returns ONLY
 *                                       publishable fields — never owner PII.
 *   POST /api/share/import   (bearer, ?token=) — fork a snapshot into the
 *                                       caller's garage; record lineage.
 *
 * Invariants:
 *  - D11: a published share is an IMMUTABLE publish-time snapshot. publish
 *    renders + stores once; there is no edit/delete path here.
 *  - D12: artifacts are fill-never-redraw — render fills the kit template; a
 *    render failure yields null artifacts, never a 500.
 *  - D18 SAFE: this module ships data + a rendered sheet, it gives NO advice,
 *    recommendation, or report — nothing on the deterministic-engineer path.
 *  - The GET is auth-free BY DESIGN (the token is the capability) and exposes
 *    only the snapshot's public fields + lineage — owner_user_id / any owner
 *    identity is structurally dropped, never serialized.
 */

import type { HttpRequest, HttpResponse } from "../types";
import type { TokenVerifier } from "../auth";
import { requireAuth } from "../auth";
import type { ShareArtifacts, ShareKind, ShareStore, RenderSeam } from "../stores/shareStore";

/** Minimal seam set this module consumes (only what it uses). */
export interface ShareCtx {
  now: () => string;
  verifier: TokenVerifier;
  store: ShareStore;
  render: RenderSeam;
}

const KINDS: readonly ShareKind[] = ["track", "setup"];

// ── POST /api/share/publish (bearer) ────────────────────────────────────────

export async function sharePublish(ctx: ShareCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;
  const server_time = ctx.now();

  const body = req.body;
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, json: { error: "bad_request" } };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.kind !== "string" || !KINDS.includes(b.kind as ShareKind)) {
    return { status: 400, json: { error: "bad_request" } };
  }
  const kind = b.kind as ShareKind;
  if (b.payload === null || typeof b.payload !== "object" || Array.isArray(b.payload)) {
    return { status: 400, json: { error: "bad_request" } };
  }
  const rawPayload = b.payload as Record<string, unknown>;

  // DoS BOUND (BUILD-NOW #6): this path is reachable WITHOUT auth on the read
  // side (the GET echoes payload verbatim), so bound attacker JSON BEFORE the
  // recursive scrub walk can stack-exhaust us.
  //  (a) size: a giant payload is rejected outright — 413 payload_too_large.
  //  (b) depth: a pathologically nested payload is rejected — 400 bad_request —
  //      so the recursive denylist/scrub walk has a hard floor and can never
  //      blow the stack.
  if (JSON.stringify(rawPayload).length > MAX_PAYLOAD_BYTES) {
    return { status: 413, json: { error: "payload_too_large", server_time } };
  }
  if (exceedsMaxDepth(rawPayload, 0)) {
    return { status: 400, json: { error: "bad_request" } };
  }

  // PII GUARD (server-enforced publishability): the auth-free GET echoes payload
  // verbatim, so the SERVER — not the client — decides what is publishable.
  //  1) denylist: reject outright if the payload (at any depth) carries an
  //     identity-shaped key OR a string value with an embedded email — the
  //     client must never even attempt to publish owner identity.
  //  2) allow-list projection: keep ONLY the per-kind publishable top-level
  //     fields, dropping every other key (defence in depth — a key not on the
  //     denylist but also not on the allow-list still never reaches the GET).
  if (hasDenylistedKeyOrEmail(rawPayload)) {
    return { status: 400, json: { error: "bad_request" } };
  }
  const payload = projectPayload(kind, rawPayload);

  // D12: render is fill-never-redraw and best-effort — a failing renderer must
  // not block the share. Degrade to empty artifacts rather than 500.
  let artifacts: ShareArtifacts;
  try {
    artifacts = await ctx.render.render(kind, payload);
  } catch {
    artifacts = {};
  }

  const { token } = await ctx.store.create(auth.user_id, kind, payload, artifacts, server_time);
  return {
    status: 201,
    json: { token, share_url: `/s/${token}`, artifacts, server_time },
  };
}

// ── GET /api/share/get?token= (AUTH-FREE) ───────────────────────────────────

export async function shareGet(ctx: ShareCtx, req: HttpRequest): Promise<HttpResponse> {
  // AUTH-FREE on purpose (D10): the token IS the read capability. Do NOT call
  // requireAuth — the static share page is reachable without an account.
  const server_time = ctx.now();

  const token = strParam(req.query.token);
  if (token === null) return { status: 400, json: { error: "bad_request" } };

  const snap = await ctx.store.get(token);
  if (snap === null) return { status: 404, json: { error: "not_found" } };

  // PUBLIC PROJECTION: expose only publishable fields. owner_user_id (and any
  // owner identity/email/PII) is structurally never serialized here.
  return {
    status: 200,
    json: {
      kind: snap.kind,
      payload: snap.payload,
      artifacts: snap.artifacts,
      forked_from: snap.forked_from,
      install_cta: { ios: null, android: null },
      server_time,
    },
  };
}

// ── POST /api/share/import?token= (bearer) ──────────────────────────────────

export async function shareImport(ctx: ShareCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;
  const server_time = ctx.now();

  const token = strParam(req.query.token);
  if (token === null) return { status: 400, json: { error: "bad_request" } };

  const snap = await ctx.store.get(token);
  if (snap === null) return { status: 404, json: { error: "not_found" } };

  // Record the fork lineage (idempotent on (token, user_id)). The app forks the
  // returned snapshot into the caller's own garage/outbox; forked_from = token.
  await ctx.store.recordImport(token, auth.user_id, server_time);

  return {
    status: 200,
    json: {
      imported: true,
      kind: snap.kind,
      payload: snap.payload,
      forked_from: token,
      server_time,
    },
  };
}

/** First non-empty string value of a query param, else null (missing/empty). */
function strParam(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === undefined || s.trim() === "") return null;
  return s;
}

// ── server-enforced publishability (PII guard) ──────────────────────────────

/** Per-kind ALLOW-LIST of the only top-level payload fields that may be
 *  published. Everything else is dropped by projectPayload — the auth-free GET
 *  therefore structurally cannot echo a field the server did not publish. */
const ALLOWED_FIELDS: Record<ShareKind, readonly string[]> = {
  setup: ["title", "name", "car", "template_id", "values", "fields", "notes"],
  track: ["name", "layout", "surface", "corners", "traits", "notes"],
};

/** DoS bound (BUILD-NOW #6): the serialized payload may not exceed 64 KiB, and
 *  the scrub walk may not descend past MAX_DEPTH levels — both are checked
 *  BEFORE the recursion runs, so attacker JSON cannot stack-exhaust the
 *  auth-free-reachable publish path. */
const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_DEPTH = 32;

/** Identity-shaped key denylist, anchored to WHOLE keys (POLISH #9). A key is
 *  denied only when its ENTIRE name is an identity term — optionally carrying an
 *  identity-qualifier prefix/suffix (`owner_`, `auth_`, `_id`, …). This keeps
 *  composite identity keys caught (`owner_email`, `owner_user_id`, `auth_token`)
 *  while letting benign keys that merely happen to embed an identity word as a
 *  non-identity segment through (`setup_token_count`, `corner_count`, the
 *  `phone`-substring `microphone` etc. are NOT whole-key matches).
 *  Segments split on `_`/`-`/camelCase. */
const ID_CORE = "(?:email|user_?id|userid|owner|phone|token)";
const ID_QUAL = "(?:owner|auth|api|access|refresh|account|acct|session|login|contact|id)";
const DENY_KEY_RE = new RegExp(
  `^(?:${ID_QUAL}[_-]?)*${ID_CORE}(?:[_-]?(?:${ID_QUAL}|id))*$`,
  "i",
);

/** An embedded email — used to (a) reject any object KEY that is a literal email
 *  and (b) scan allow-listed free-text VALUES (notes/title) so an email tucked
 *  into a value can never reach the auth-free GET. */
const EMAIL_RE = /[^\s@]+@[^\s@]+/;

/** Keep only the per-kind allow-listed top-level fields; drop every other key
 *  (including any client-injected owner/identity field that slipped the deny
 *  regex). Returns a fresh object — never mutates the caller's payload. */
function projectPayload(kind: ShareKind, payload: Record<string, unknown>): Record<string, unknown> {
  const allowed = ALLOWED_FIELDS[kind];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) out[key] = payload[key];
  }
  return out;
}

/** True if the value nests deeper than MAX_DEPTH (BUILD-NOW #6 (b)). Runs as an
 *  iterative-by-recursion guard with an explicit depth counter BEFORE the scrub
 *  walk, so the scrub walk itself can never descend past a bounded floor.
 *  Arrays count as a level (an attacker can nest with arrays too). */
function exceedsMaxDepth(value: unknown, depth: number): boolean {
  if (depth > MAX_DEPTH) return true;
  if (Array.isArray(value)) {
    return value.some((v) => exceedsMaxDepth(v, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      if (exceedsMaxDepth(v, depth + 1)) return true;
    }
  }
  return false;
}

/** True if any (nested) object key is identity-shaped (DENY_KEY_RE, whole-key)
 *  OR is itself a literal email, OR any string VALUE carries an embedded email
 *  (POLISH #9) — so owner identity cannot reach the auth-free GET via either a
 *  key or an allow-listed free-text value. Arrays are walked element-wise.
 *  Depth is pre-bounded by exceedsMaxDepth, so this walk is stack-safe. */
function hasDenylistedKeyOrEmail(value: unknown): boolean {
  if (typeof value === "string") {
    return EMAIL_RE.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(hasDenylistedKeyOrEmail);
  }
  if (value !== null && typeof value === "object") {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (DENY_KEY_RE.test(key) || EMAIL_RE.test(key)) return true;
      if (hasDenylistedKeyOrEmail(v)) return true;
    }
  }
  return false;
}
