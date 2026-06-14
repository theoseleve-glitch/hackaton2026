/**
 * media upload-url test suite — the handler exercised against in-memory fakes
 * (MediaStore + BlobStore) and a fake token verifier. No HTTP, no Postgres, no
 * blob provider. Assertion style mirrors src/test-server.ts.
 *
 * Run from server/:  npx tsx src/test-media.ts
 */

import type { HttpRequest } from "./types";
import type { TokenVerifier } from "./auth";
import type { BlobStore, MediaStore } from "./stores/mediaStore";
import {
  uploadUrl,
  type UploadUrlCtx,
  MAX_BYTES,
  QUOTA_BYTES,
  ALLOWED_MIME,
} from "./handlers/uploadUrl";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

// ── in-memory MediaStore fake (same contract as makeSqlMediaStore) ────────────

interface MediaRow {
  media_id: string;
  user_id: string;
  mime: string;
  bytes: number;
  created_at: string;
}

class FakeMediaStore implements MediaStore {
  rows = new Map<string, MediaRow>(); // media_id -> row

  /** Mirrors the SQL atomic conditional insert: the quota SUM is re-read and the
   *  row written in one indivisible step (single-threaded JS == no interleave),
   *  so used(user) + bytes <= quotaBytes is checked against the live table at
   *  insert time — exactly the SQL guarantee. */
  async tryRecord(
    userId: string,
    mediaId: string,
    mime: string,
    bytes: number,
    quotaBytes: number,
    atIso: string,
  ): Promise<boolean> {
    if (this.rows.has(mediaId)) return false; // ON CONFLICT DO NOTHING -> no insert
    if (this.usedSync(userId) + bytes > quotaBytes) return false; // WHERE … <= quota fails
    this.rows.set(mediaId, { media_id: mediaId, user_id: userId, mime, bytes, created_at: atIso });
    return true;
  }

  /** Test-only helper (the production interface no longer exposes a read seam). */
  usedSync(userId: string): number {
    let sum = 0;
    for (const r of this.rows.values()) if (r.user_id === userId) sum += r.bytes;
    return sum;
  }
}

// ── in-memory BlobStore fake: records every presign call, owner-scoped key ────

class FakeBlobStore implements BlobStore {
  calls: { key: string; mime: string; maxBytes: number }[] = [];

  async presignPut(
    key: string,
    mime: string,
    maxBytes: number,
  ): Promise<{ url: string; headers?: Record<string, string>; expires_at: string }> {
    this.calls.push({ key, mime, maxBytes });
    return {
      url: `https://blob.example/${key}?sig=abc`,
      headers: { "content-type": mime, "x-amz-meta-max": String(maxBytes) },
      expires_at: EXPIRES,
    };
  }
}

/** A BlobStore that omits headers — to prove upload_headers is optional. */
class NoHeaderBlobStore implements BlobStore {
  async presignPut(key: string): Promise<{ url: string; expires_at: string }> {
    return { url: `https://blob.example/${key}`, expires_at: EXPIRES };
  }
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW = "2026-06-13T12:00:00.000Z";
const EXPIRES = "2026-06-13T12:15:00.000Z";

const verifier: TokenVerifier = {
  verify: async (token) => {
    if (token === "tok-A") return { user_id: "user_A" };
    if (token === "tok-B") return { user_id: "user_B" };
    if (token === "tok-throws") throw new Error("verifier exploded");
    return null;
  },
};

let idCounter = 0;
const newMediaId = () => `m_test_${++idCounter}`;

function makeCtx(over?: Partial<UploadUrlCtx>): { ctx: UploadUrlCtx; store: FakeMediaStore; blobs: FakeBlobStore } {
  const store = new FakeMediaStore();
  const blobs = new FakeBlobStore();
  const ctx: UploadUrlCtx = {
    verifier,
    now: () => NOW,
    blobs,
    store,
    newMediaId,
    ...over,
  };
  return { ctx, store, blobs };
}

function req(opts?: { token?: string; body?: unknown }): HttpRequest {
  return {
    method: "POST",
    path: "/api/media/upload-url",
    headers: opts?.token !== undefined ? { authorization: `Bearer ${opts.token}` } : {},
    query: {},
    body: opts?.body,
  };
}

// ═══ happy path ════════════════════════════════════════════════════════════════

console.log("— happy path —");
{
  const { ctx, store, blobs } = makeCtx();
  const r = await uploadUrl(ctx, req({ token: "tok-A", body: { mime: "image/jpeg", bytes: 1024 } }));
  check("happy: 200", r.status === 200);
  check("happy: media_id returned", typeof r.json.media_id === "string" && (r.json.media_id as string).length > 0);
  check("happy: upload_url returned", typeof r.json.upload_url === "string" && (r.json.upload_url as string).startsWith("https://"));
  check("happy: upload_headers passed through", typeof r.json.upload_headers === "object" && (r.json.upload_headers as Record<string, string>)["content-type"] === "image/jpeg");
  check("happy: expires_at echoed from presign", r.json.expires_at === EXPIRES);
  check("happy: server_time present", r.json.server_time === NOW);
  check("happy: presign got owner-scoped key u/<user>/<id>", blobs.calls.length === 1 && blobs.calls[0].key === `u/user_A/${r.json.media_id}`);
  // Fix 3: the presigned PUT's content-length ceiling is the DECLARED bytes, not
  // MAX_BYTES — so a 1-byte declaration cannot be used to upload 10 MiB.
  check("happy: presign maxBytes is the DECLARED bytes (not MAX_BYTES)", blobs.calls[0].maxBytes === 1024);
  check("happy: accounting row recorded with declared bytes", store.rows.get(r.json.media_id as string)?.bytes === 1024 && store.rows.get(r.json.media_id as string)?.user_id === "user_A");

  // every allowlisted mime is accepted
  for (const mime of ALLOWED_MIME) {
    const { ctx: c2 } = makeCtx();
    const rr = await uploadUrl(c2, req({ token: "tok-A", body: { mime, bytes: 10 } }));
    check(`happy: allowlisted mime ${mime} accepted`, rr.status === 200);
  }

  // boundary: exactly MAX_BYTES is allowed, and the presign ceiling is that same
  // declared value (MAX_BYTES is the upper clamp on the declared bytes — here the
  // declared value IS the clamp, so the ceiling equals MAX_BYTES).
  const { ctx: cMax, blobs: bMax } = makeCtx();
  const rMax = await uploadUrl(cMax, req({ token: "tok-A", body: { mime: "application/pdf", bytes: MAX_BYTES } }));
  check("happy: bytes == MAX_BYTES allowed (inclusive)", rMax.status === 200);
  check("happy: at MAX_BYTES the declared ceiling == MAX_BYTES", bMax.calls[0].maxBytes === MAX_BYTES);

  // a small declaration -> a small ceiling (independent of MAX_BYTES)
  const { ctx: cSmall, blobs: bSmall } = makeCtx();
  await uploadUrl(cSmall, req({ token: "tok-A", body: { mime: "image/webp", bytes: 7 } }));
  check("happy: small declared bytes -> small presign ceiling", bSmall.calls[0].maxBytes === 7);

  // optional headers: presign may omit them -> no upload_headers key
  const { store: s3, blobs: _b } = makeCtx();
  void _b;
  const ctxNoHeader: UploadUrlCtx = { verifier, now: () => NOW, blobs: new NoHeaderBlobStore(), store: s3, newMediaId };
  const rNoHdr = await uploadUrl(ctxNoHeader, req({ token: "tok-A", body: { mime: "image/png", bytes: 5 } }));
  check("happy: presign without headers -> upload_headers omitted", rNoHdr.status === 200 && rNoHdr.json.upload_headers === undefined);
}

// ═══ auth required (401) ═══════════════════════════════════════════════════════

console.log("\n— auth —");
{
  const { ctx, store, blobs } = makeCtx();
  const noTok = await uploadUrl(ctx, req({ body: { mime: "image/jpeg", bytes: 10 } }));
  check("auth: no token -> 401 unauthorized", noTok.status === 401 && noTok.json.error === "unauthorized");

  const badTok = await uploadUrl(ctx, req({ token: "tok-garbage", body: { mime: "image/jpeg", bytes: 10 } }));
  check("auth: unknown token -> 401", badTok.status === 401);

  const throwTok = await uploadUrl(ctx, req({ token: "tok-throws", body: { mime: "image/jpeg", bytes: 10 } }));
  check("auth: throwing verifier -> 401 (not 500)", throwTok.status === 401);

  check("auth: no presign / no record on rejected auth", blobs.calls.length === 0 && store.rows.size === 0);
}

// ═══ owner-scoping / IDOR ══════════════════════════════════════════════════════

console.log("\n— owner-scoping / IDOR —");
{
  const { ctx, store, blobs } = makeCtx();
  // user_A uploads
  const rA = await uploadUrl(ctx, req({ token: "tok-A", body: { mime: "image/jpeg", bytes: 100 } }));
  // user_B uploads (same store/blobs) — body cannot carry a user/key, so nothing
  // user_B sends could ever target user_A's space.
  const rB = await uploadUrl(ctx, req({ token: "tok-B", body: { mime: "image/png", bytes: 200, user_id: "user_A", media_id: "evil", key: "u/user_A/evil" } as unknown }));
  check("idor: B's key is scoped to B even when body forges user_A/media_id/key", blobs.calls[1].key.startsWith("u/user_B/") && !blobs.calls[1].key.includes("user_A"));
  check("idor: B's row is owned by user_B, not the forged user_A", store.rows.get(rB.json.media_id as string)?.user_id === "user_B");
  check("idor: A's key untouched / scoped to A", blobs.calls[0].key === `u/user_A/${rA.json.media_id}`);

  // quota is per-user: B's spend doesn't draw down A and vice versa
  const usedA = store.usedSync("user_A");
  const usedB = store.usedSync("user_B");
  check("idor: per-user quota accounting isolated", usedA === 100 && usedB === 200);
}

// ═══ hostile verifier: owner-prefix escape (Fix 1) ═══════════════════════════════
// A buggy/compromised TokenVerifier hands back a `sub` that path-escapes the
// owner prefix (e.g. 'a/../b' or '../victim'). Raw-interpolated into the key
// `u/<user_id>/<media_id>` it would presign into another user's space. The
// charset guard must reject it as 401 BEFORE any presign/record.

console.log("\n— hostile verifier / key escape —");
{
  const escapingSubs = ["a/../b", "../victim", "user_A/x", "u/user_A/evil", "..", ".", "a b", "a.b", "a%2f", ""];
  for (const sub of escapingSubs) {
    const hostile: TokenVerifier = { verify: async () => ({ user_id: sub }) };
    const { ctx, store, blobs } = makeCtx({ verifier: hostile });
    const r = await uploadUrl(ctx, req({ token: "tok-A", body: { mime: "image/jpeg", bytes: 10 } }));
    check(`escape: verifier sub ${JSON.stringify(sub)} -> 401`, r.status === 401 && r.json.error === "unauthorized");
    check(`escape: no presign / no record for sub ${JSON.stringify(sub)}`, blobs.calls.length === 0 && store.rows.size === 0);
  }

  // a clean sub still works through the same path (guard isn't over-broad)
  const clean: TokenVerifier = { verify: async () => ({ user_id: "Clean-User_9" }) };
  const { ctx: cClean, store: sClean, blobs: bClean } = makeCtx({ verifier: clean });
  const rClean = await uploadUrl(cClean, req({ token: "tok-A", body: { mime: "image/jpeg", bytes: 10 } }));
  check("escape: clean charset sub still 200", rClean.status === 200);
  check("escape: clean sub presigns under its own owner prefix", bClean.calls[0].key.startsWith("u/Clean-User_9/") && sClean.usedSync("Clean-User_9") === 10);

  // an injected media_id that path-escapes is also rejected (same key interpolation)
  const evilId: UploadUrlCtx["newMediaId"] = () => "../../etc/passwd";
  const { ctx: cEvilId, store: sEvilId, blobs: bEvilId } = makeCtx({ newMediaId: evilId });
  const rEvilId = await uploadUrl(cEvilId, req({ token: "tok-A", body: { mime: "image/jpeg", bytes: 10 } }));
  check("escape: injected media_id with '/' -> 401", rEvilId.status === 401 && rEvilId.json.error === "unauthorized");
  check("escape: no presign / no record for escaping media_id", bEvilId.calls.length === 0 && sEvilId.rows.size === 0);
}

// ═══ quota TOCTOU: concurrent reserves can't both win (Fix 2) ═════════════════════
// Pre-fill to QUOTA - 5. Two in-flight requests each declaring 5 bytes would, in a
// usedBytes()-then-record() design, both read "5 left" and both insert -> 5 over
// quota. With the atomic conditional insert exactly ONE must win.

console.log("\n— quota TOCTOU —");
{
  const { ctx, store, blobs } = makeCtx();
  await store.tryRecord("user_A", "seed", "image/jpeg", QUOTA_BYTES - 5, QUOTA_BYTES, NOW);

  const [r1, r2] = await Promise.all([
    uploadUrl(ctx, req({ token: "tok-A", body: { mime: "image/jpeg", bytes: 5 } })),
    uploadUrl(ctx, req({ token: "tok-A", body: { mime: "image/jpeg", bytes: 5 } })),
  ]);
  const oks = [r1, r2].filter((r) => r.status === 200).length;
  const conflicts = [r1, r2].filter((r) => r.status === 409).length;
  check("toctou: exactly one of two concurrent reserves wins", oks === 1 && conflicts === 1);
  check("toctou: total recorded never exceeds QUOTA", store.usedSync("user_A") <= QUOTA_BYTES);
  check("toctou: presign count matches the single winner", blobs.calls.length === oks);
}

// ═══ quota (409) ═══════════════════════════════════════════════════════════════

console.log("\n— quota —");
{
  const { ctx, store, blobs } = makeCtx();
  // Pre-load user_A to exactly QUOTA - 5 bytes used (seed straight into the row
  // map — the seed itself fits under quota, so tryRecord would also accept it).
  await store.tryRecord("user_A", "seed", "image/jpeg", QUOTA_BYTES - 5, QUOTA_BYTES, NOW);

  const okFit = await uploadUrl(ctx, req({ token: "tok-A", body: { mime: "image/jpeg", bytes: 5 } }));
  check("quota: request that exactly fills the quota -> 200", okFit.status === 200);

  // now at the cap; +1 must fail
  const over = await uploadUrl(ctx, req({ token: "tok-A", body: { mime: "image/jpeg", bytes: 1 } }));
  check("quota: over quota -> 409 quota_exceeded", over.status === 409 && over.json.error === "quota_exceeded");
  check("quota: 409 still carries server_time", over.json.server_time === NOW);

  const presignsBefore = blobs.calls.length;
  await uploadUrl(ctx, req({ token: "tok-A", body: { mime: "image/jpeg", bytes: 1 } }));
  check("quota: rejected request did NOT presign or record", blobs.calls.length === presignsBefore);

  // a DIFFERENT user with an empty ledger is unaffected
  const freshB = await uploadUrl(ctx, req({ token: "tok-B", body: { mime: "image/jpeg", bytes: 999 } }));
  check("quota: other user with empty ledger unaffected", freshB.status === 200);
}

// ═══ bad input ═════════════════════════════════════════════════════════════════

console.log("\n— bad input —");
{
  const { ctx } = makeCtx();

  const noBody = await uploadUrl(ctx, req({ token: "tok-A" }));
  check("bad: missing body -> 400 bad_request", noBody.status === 400 && noBody.json.error === "bad_request");

  const strBody = await uploadUrl(ctx, req({ token: "tok-A", body: "nope" }));
  check("bad: string body -> 400", strBody.status === 400 && strBody.json.error === "bad_request");

  const arrBody = await uploadUrl(ctx, req({ token: "tok-A", body: [1, 2] }));
  check("bad: array body -> 400", arrBody.status === 400 && arrBody.json.error === "bad_request");

  const noMime = await uploadUrl(ctx, req({ token: "tok-A", body: { bytes: 10 } }));
  check("bad: missing mime -> 400", noMime.status === 400 && noMime.json.error === "bad_request");

  const emptyMime = await uploadUrl(ctx, req({ token: "tok-A", body: { mime: "", bytes: 10 } }));
  check("bad: empty mime -> 400", emptyMime.status === 400 && emptyMime.json.error === "bad_request");

  const badMime = await uploadUrl(ctx, req({ token: "tok-A", body: { mime: "image/gif", bytes: 10 } }));
  check("bad: disallowed mime -> 415 unsupported_media_type", badMime.status === 415 && badMime.json.error === "unsupported_media_type");

  const execMime = await uploadUrl(ctx, req({ token: "tok-A", body: { mime: "application/x-msdownload", bytes: 10 } }));
  check("bad: executable mime -> 415", execMime.status === 415);

  const noBytes = await uploadUrl(ctx, req({ token: "tok-A", body: { mime: "image/jpeg" } }));
  check("bad: missing bytes -> 400", noBytes.status === 400 && noBytes.json.error === "bad_request");

  const strBytes = await uploadUrl(ctx, req({ token: "tok-A", body: { mime: "image/jpeg", bytes: "10" } }));
  check("bad: non-number bytes -> 400", strBytes.status === 400 && strBytes.json.error === "bad_request");

  const floatBytes = await uploadUrl(ctx, req({ token: "tok-A", body: { mime: "image/jpeg", bytes: 10.5 } }));
  check("bad: non-integer bytes -> 400", floatBytes.status === 400 && floatBytes.json.error === "bad_request");

  const nanBytes = await uploadUrl(ctx, req({ token: "tok-A", body: { mime: "image/jpeg", bytes: NaN } }));
  check("bad: NaN bytes -> 400", nanBytes.status === 400 && nanBytes.json.error === "bad_request");

  const zeroBytes = await uploadUrl(ctx, req({ token: "tok-A", body: { mime: "image/jpeg", bytes: 0 } }));
  check("bad: zero bytes -> 413 payload_too_large", zeroBytes.status === 413 && zeroBytes.json.error === "payload_too_large");

  const negBytes = await uploadUrl(ctx, req({ token: "tok-A", body: { mime: "image/jpeg", bytes: -5 } }));
  check("bad: negative bytes -> 413", negBytes.status === 413 && negBytes.json.error === "payload_too_large");

  const tooBig = await uploadUrl(ctx, req({ token: "tok-A", body: { mime: "image/jpeg", bytes: MAX_BYTES + 1 } }));
  check("bad: bytes > MAX_BYTES -> 413", tooBig.status === 413 && tooBig.json.error === "payload_too_large");

  // ordering: an UNSUPPORTED mime with oversized bytes -> mime check first (415)
  const mimeBeforeSize = await uploadUrl(ctx, req({ token: "tok-A", body: { mime: "image/gif", bytes: MAX_BYTES + 1 } }));
  check("bad: mime validated before size (415 wins over 413)", mimeBeforeSize.status === 415);
}

// ═══ verdict ═════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nMEDIA: all checks passed" : `\nMEDIA: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
