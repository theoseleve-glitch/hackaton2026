/**
 * GET /api/backup/restore?after_seq=&limit= — paginated journal read for
 * reinstall/new-device restore. seq is the SERVER-assigned cursor (client
 * seqs are per-device and collide). Strictly scoped to the authenticated
 * user — there is no parameter that can reach another user's rows.
 *
 * Response: { ok, entries: [{ seq, entry_id, ts, domain, op, payload,
 * received_at }], next_after_seq, has_more, server_time }. The client feeds
 * payloads back through schema parse.ts validators on load — the server
 * stores, it does not vouch.
 */

import type { HttpRequest, HttpResponse, ServerCtx } from "../types";
import { requireAuth } from "../auth";

export const DEFAULT_RESTORE_LIMIT = 200;
export const MAX_RESTORE_LIMIT = 500;

export async function backupRestore(ctx: ServerCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;
  const server_time = ctx.now();

  const after_seq = intParam(req.query.after_seq, 0);
  if (after_seq === null) return { status: 400, json: { error: "invalid_after_seq" } };
  const limitRaw = intParam(req.query.limit, DEFAULT_RESTORE_LIMIT);
  if (limitRaw === null || limitRaw < 1) return { status: 400, json: { error: "invalid_limit" } };
  const limit = Math.min(limitRaw, MAX_RESTORE_LIMIT);

  // fetch one extra row to compute has_more without a count query
  const rows = await ctx.db.listBackupEntries(auth.user_id, after_seq, limit + 1);
  const has_more = rows.length > limit;
  const page = has_more ? rows.slice(0, limit) : rows;
  const next_after_seq = page.length > 0 ? page[page.length - 1].seq : after_seq;

  return {
    status: 200,
    json: { ok: true, entries: page, next_after_seq, has_more, server_time },
  };
}

/** null = malformed; absent/empty = fallback. */
function intParam(v: string | string[] | undefined, fallback: number): number | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === undefined || s === "") return fallback;
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}
