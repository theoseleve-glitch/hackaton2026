/**
 * POST /api/backup/push — batch upload of client outbox entries
 * (packages/schema OutboxEntry; the client sends entriesAfter(last_acked)).
 *
 * Body: { entries: [{ entry_id|id, ts, domain, op, payload }, ...] }
 *  - entry_id is the client OutboxEntry.id ("ob-..."): the idempotency key.
 *    `id` is accepted as an alias so the client can push entries verbatim.
 *  - IDEMPOTENT on (user_id, entry_id): re-pushing after a lost ack returns
 *    ok with a skipped count — never an error, never a duplicate row.
 *  - Validation is structural only (strings parse, payload is an object);
 *    domain/op are NOT enum-checked so an older server accepts a newer
 *    client's domains (mirrors schema parse.ts forward-compat stance).
 *  - A malformed entry rejects the WHOLE batch with its index — we never
 *    silently drop part of a journal.
 * Response: { ok, inserted, skipped, server_time }.
 */

import type { HttpRequest, HttpResponse, ServerCtx } from "../types";
import type { BackupEntryInput } from "../db";
import { requireAuth } from "../auth";

export const MAX_PUSH_BATCH = 500;

export async function backupPush(ctx: ServerCtx, req: HttpRequest): Promise<HttpResponse> {
  const auth = await requireAuth(ctx, req);
  if (!auth.ok) return auth.response;
  const server_time = ctx.now();

  const body = req.body;
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, json: { error: "invalid_body" } };
  }
  const entries = (body as Record<string, unknown>).entries;
  if (!Array.isArray(entries)) return { status: 400, json: { error: "invalid_body" } };
  if (entries.length > MAX_PUSH_BATCH) {
    return { status: 400, json: { error: "batch_too_large", max: MAX_PUSH_BATCH } };
  }

  const parsed: BackupEntryInput[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e: unknown = entries[i];
    const bad = (field: string): HttpResponse => ({
      status: 400,
      json: { error: "invalid_entry", index: i, field },
    });
    if (e === null || typeof e !== "object" || Array.isArray(e)) return bad("entry");
    const r = e as Record<string, unknown>;
    const entry_id = typeof r.entry_id === "string" ? r.entry_id : typeof r.id === "string" ? r.id : "";
    if (entry_id.trim() === "") return bad("entry_id");
    if (typeof r.ts !== "string" || Number.isNaN(Date.parse(r.ts))) return bad("ts");
    if (typeof r.domain !== "string" || r.domain.trim() === "") return bad("domain");
    if (typeof r.op !== "string" || r.op.trim() === "") return bad("op");
    if (r.payload === null || typeof r.payload !== "object" || Array.isArray(r.payload)) {
      return bad("payload");
    }
    parsed.push({
      entry_id,
      ts: r.ts,
      domain: r.domain,
      op: r.op,
      payload: r.payload as Record<string, unknown>,
    });
  }

  if (parsed.length === 0) {
    return { status: 200, json: { ok: true, inserted: 0, skipped: 0, server_time } };
  }
  await ctx.db.ensureUser(auth.user_id, server_time);
  const { inserted, skipped } = await ctx.db.insertBackupEntries(auth.user_id, parsed, server_time);
  return { status: 200, json: { ok: true, inserted, skipped, server_time } };
}
