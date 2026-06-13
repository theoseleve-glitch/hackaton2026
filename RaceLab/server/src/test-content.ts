/**
 * content-delivery test suite — the public GET /api/content/{rcdata,kb}
 * handler exercised directly against an in-memory ContentStore fake and a
 * deterministic fake ManifestSigner. No HTTP, no Postgres, no Vercel.
 * Assertion style mirrors src/test-server.ts.
 *
 * Run from C:/Users/willy/hackaton2026/RaceLab/server:
 *   npx tsx src/test-content.ts
 */

import type { HttpRequest } from "./types";
import type { ContentName, ContentStore, ContentVersionRow, ManifestSigner } from "./stores/contentStore";
import { content, type ContentCtx } from "./handlers/content";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

// ── in-memory ContentStore fake (same contract as makeSqlContentStore) ───────
// Stores many versions per name; latest() returns MAX(version) — proving the
// monotonic guarantee independent of insertion order.

class FakeContentStore implements ContentStore {
  rows = new Map<ContentName, ContentVersionRow[]>();

  put(name: ContentName, row: ContentVersionRow): void {
    const list = this.rows.get(name) ?? [];
    list.push(row);
    this.rows.set(name, list);
  }

  async latest(name: ContentName): Promise<ContentVersionRow | null> {
    const list = this.rows.get(name);
    if (list === undefined || list.length === 0) return null;
    // MAX(version), not most-recently-inserted
    return list.reduce((a, b) => (b.version > a.version ? b : a));
  }
}

// ── fake signer: deterministic, records exactly what it signed ───────────────

class FakeSigner implements ManifestSigner {
  lastPayload: Record<string, unknown> | null = null;
  calls = 0;
  async sign(payload: Record<string, unknown>): Promise<string> {
    this.calls++;
    this.lastPayload = payload;
    // stable, key-sorted encoding so the test can assert the covered bytes
    return `sig:${canon(payload)}`;
  }
}

function canon(o: Record<string, unknown>): string {
  return JSON.stringify(o, Object.keys(o).sort());
}

// ── fixtures ─────────────────────────────────────────────────────────────────

const NOW = "2026-06-13T12:00:00.000Z";

function req(path: string, opts?: { token?: string }): HttpRequest {
  return {
    method: "GET",
    path,
    headers: opts?.token !== undefined ? { authorization: `Bearer ${opts.token}` } : {},
    query: {},
    body: undefined,
  };
}

function freshCtx(): { ctx: ContentCtx; store: FakeContentStore; signer: FakeSigner } {
  const store = new FakeContentStore();
  const signer = new FakeSigner();
  const ctx: ContentCtx = { now: () => NOW, sign: signer, store };
  return { ctx, store, signer };
}

// ═══ happy path: rcdata ════════════════════════════════════════════════════════

console.log("— content rcdata happy path —");
{
  const { ctx, store, signer } = freshCtx();
  store.put("rcdata", {
    version: 7,
    content_hash: "sha256-rcdata-7",
    url: "https://cdn.racelab.app/rcdata/7.json",
    published_at: "2026-06-10T00:00:00.000Z",
  });

  const r = await content(ctx, req("/api/content/rcdata"));
  check("rcdata: 200", r.status === 200);
  check("rcdata: name from route", r.json.name === "rcdata");
  check("rcdata: version echoed", r.json.version === 7);
  check("rcdata: content_hash echoed", r.json.content_hash === "sha256-rcdata-7");
  check("rcdata: url echoed", r.json.url === "https://cdn.racelab.app/rcdata/7.json");
  check("rcdata: published_at present", r.json.published_at === "2026-06-10T00:00:00.000Z");
  check("rcdata: server_time stamped", r.json.server_time === NOW);
  check("rcdata: signature present", typeof r.json.signature === "string" && (r.json.signature as string).startsWith("sig:"));

  // the signature must cover EXACTLY the manifest, not server_time/signature
  check("rcdata: signer called once", signer.calls === 1);
  const signed = signer.lastPayload!;
  check(
    "rcdata: signed payload is the manifest only (no server_time/signature)",
    signed.name === "rcdata" &&
      signed.version === 7 &&
      signed.content_hash === "sha256-rcdata-7" &&
      signed.url === "https://cdn.racelab.app/rcdata/7.json" &&
      signed.published_at === "2026-06-10T00:00:00.000Z" &&
      (signed as Record<string, unknown>).server_time === undefined &&
      (signed as Record<string, unknown>).signature === undefined,
  );
  check("rcdata: signature equals sign(manifest)", r.json.signature === `sig:${canon(signed)}`);
}

// ═══ happy path: kb (name routing) ═════════════════════════════════════════════

console.log("\n— content kb routing —");
{
  const { ctx, store } = freshCtx();
  store.put("kb", { version: 2, content_hash: "sha256-kb-2", url: "https://cdn.racelab.app/kb/2.json", published_at: null });
  store.put("rcdata", { version: 99, content_hash: "sha256-rcdata-99", url: "https://cdn.racelab.app/rcdata/99.json", published_at: null });

  const r = await content(ctx, req("/api/content/kb"));
  check("kb: 200 with kb name (route picks the bundle, not rcdata)", r.status === 200 && r.json.name === "kb" && r.json.version === 2);
  check("kb: did NOT bleed the rcdata row", r.json.content_hash === "sha256-kb-2");
}

// ═══ published_at omitted when null ════════════════════════════════════════════

console.log("\n— published_at handling —");
{
  const { ctx, store, signer } = freshCtx();
  store.put("kb", { version: 1, content_hash: "h", url: "u", published_at: null });
  const r = await content(ctx, req("/api/content/kb"));
  check("null published_at: key omitted from response", r.status === 200 && !("published_at" in r.json));
  check("null published_at: key omitted from signed payload", signer.lastPayload!.published_at === undefined && !("published_at" in signer.lastPayload!));
}

// ═══ monotonic: latest = MAX(version), downgrade can never be served ═══════════

console.log("\n— monotonic (no downgrade) —");
{
  const { ctx, store } = freshCtx();
  // insert OUT OF ORDER, and insert a lower version AFTER a higher one
  store.put("rcdata", { version: 3, content_hash: "h3", url: "u3", published_at: null });
  store.put("rcdata", { version: 10, content_hash: "h10", url: "u10", published_at: null });
  store.put("rcdata", { version: 1, content_hash: "h1", url: "u1", published_at: null }); // late low-version insert
  store.put("rcdata", { version: 5, content_hash: "h5", url: "u5", published_at: null });

  const r = await content(ctx, req("/api/content/rcdata"));
  check("monotonic: serves MAX(version)=10 regardless of insert order", r.status === 200 && r.json.version === 10 && r.json.content_hash === "h10");
  check("monotonic: a later low-version insert never downgrades the served version", r.json.version === 10);
}

// ═══ 404: no content published for this name ═══════════════════════════════════

console.log("\n— 404 no content —");
{
  const { ctx, store, signer } = freshCtx();
  store.put("kb", { version: 1, content_hash: "h", url: "u", published_at: null }); // kb exists, rcdata does not
  const r = await content(ctx, req("/api/content/rcdata"));
  check("no content: rcdata -> 404 not_found", r.status === 404 && r.json.error === "not_found");
  check("no content: signer NOT called (nothing to sign)", signer.calls === 0);
  check("no content: kb still serves independently", (await content(ctx, req("/api/content/kb"))).status === 200);
}

// ═══ 404: unknown content name (defensive — router would normally not route here) ═

console.log("\n— unknown name —");
{
  const { ctx, store } = freshCtx();
  store.put("rcdata", { version: 1, content_hash: "h", url: "u", published_at: null });
  const r = await content(ctx, req("/api/content/bogus"));
  check("unknown name: -> 404 not_found", r.status === 404 && r.json.error === "not_found");
  const r2 = await content(ctx, req("/api/content"));
  check("bare /api/content: -> 404 not_found", r2.status === 404 && r2.json.error === "not_found");
}

// ═══ trailing slash normalization (matches router behavior) ════════════════════

console.log("\n— path normalization —");
{
  const { ctx, store } = freshCtx();
  store.put("rcdata", { version: 4, content_hash: "h4", url: "u4", published_at: null });
  const r = await content(ctx, req("/api/content/rcdata/"));
  check("trailing slash: /api/content/rcdata/ resolves to rcdata", r.status === 200 && r.json.name === "rcdata" && r.json.version === 4);
}

// ═══ auth-free: no bearer required, no auth-shaped rejection ════════════════════

console.log("\n— auth-free (public) —");
{
  const { ctx, store } = freshCtx();
  store.put("kb", { version: 1, content_hash: "h", url: "u", published_at: "2026-01-01T00:00:00.000Z" });

  const anon = await content(ctx, req("/api/content/kb")); // no token at all
  check("public: serves WITHOUT any Authorization header (never 401)", anon.status === 200 && anon.json.error === undefined);

  const garbage = await content(ctx, req("/api/content/kb", { token: "totally-bogus" }));
  check("public: a garbage bearer is ignored, not rejected (auth-free path)", garbage.status === 200);
}

// ═══ no IDOR surface: no body/id/query path can change WHAT is served ═══════════

console.log("\n— no user-controlled selection (D18 safety) —");
{
  const { ctx, store } = freshCtx();
  store.put("rcdata", { version: 2, content_hash: "h2", url: "u2", published_at: null });
  // try to smuggle selection via query + body — handler must ignore both
  const tampered: HttpRequest = {
    method: "GET",
    path: "/api/content/rcdata",
    headers: {},
    query: { name: "kb", version: "999" },
    body: { name: "kb", url: "https://evil.example/inject" },
  };
  const r = await content(ctx, tampered);
  check("safety: name comes ONLY from the route, never query/body", r.status === 200 && r.json.name === "rcdata" && r.json.version === 2);
  check("safety: url comes ONLY from the store row, never the body", r.json.url === "u2");
}

// ═══ never throws across the boundary on a store fault is the router's job, but ══
// ═══ confirm the handler propagates store nulls/values cleanly (no throw here). ══

console.log("\n— store value passthrough —");
{
  const { ctx, store } = freshCtx();
  store.put("kb", { version: 0, content_hash: "h0", url: "u0", published_at: null });
  const r = await content(ctx, req("/api/content/kb"));
  check("edge: version 0 is a valid published version (served, not treated as falsey-missing)", r.status === 200 && r.json.version === 0);
}

// ═══ verdict ═══════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nCONTENT: all checks passed" : `\nCONTENT: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
