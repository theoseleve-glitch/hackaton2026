/**
 * share+fork test suite (D10/D11/D12) — the three handlers exercised through
 * an in-memory ShareStore fake + a fake RenderSeam + a fake token verifier.
 * No HTTP, no Postgres, no Vercel. Assertion style mirrors src/test-server.ts.
 *
 * Run: npx tsx src/test-share.ts   (from server/)
 */

import type { TokenVerifier } from "./auth";
import type { HttpRequest, HttpResponse } from "./types";
import { sharePublish, shareGet, shareImport } from "./handlers/share";
import type { ShareCtx } from "./handlers/share";
import type {
  ShareArtifacts,
  ShareKind,
  ShareSnapshot,
  ShareStore,
  RenderSeam,
} from "./stores/shareStore";
import { newShareToken } from "./stores/shareStore";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

// ── in-memory ShareStore fake (same contract as makeSqlShareStore) ───────────

class FakeShareStore implements ShareStore {
  snapshots = new Map<string, ShareSnapshot>();
  imports = new Map<string, Set<string>>(); // token -> set of user_ids (idempotent)

  async create(
    ownerUserId: string,
    kind: ShareKind,
    payload: Record<string, unknown>,
    artifacts: ShareArtifacts,
    atIso: string,
  ): Promise<{ token: string }> {
    let token = newShareToken();
    while (this.snapshots.has(token)) token = newShareToken();
    this.snapshots.set(token, {
      token,
      owner_user_id: ownerUserId,
      kind,
      payload,
      artifacts,
      forked_from: null,
      created_at: atIso,
    });
    return { token };
  }
  async get(token: string): Promise<ShareSnapshot | null> {
    return this.snapshots.get(token) ?? null;
  }
  async recordImport(token: string, intoUserId: string, _atIso: string): Promise<void> {
    let s = this.imports.get(token);
    if (s === undefined) {
      s = new Set();
      this.imports.set(token, s);
    }
    s.add(intoUserId); // Set => idempotent on (token, user_id)
  }
}

// ── fake render seam (D12 fill-never-redraw stub) ────────────────────────────

let renderCalls = 0;
const fakeRender: RenderSeam = {
  render: async (kind, _payload) => {
    renderCalls++;
    return { png_url: `https://cdn.test/${kind}.png`, pdf_url: `https://cdn.test/${kind}.pdf` };
  },
};
const throwingRender: RenderSeam = {
  render: async () => {
    throw new Error("render service down");
  },
};

// ── fixtures ─────────────────────────────────────────────────────────────────

const NOW = "2026-06-13T12:00:00.000Z";

const verifier: TokenVerifier = {
  verify: async (token) => {
    if (token === "tok-A") return { user_id: "user_A" };
    if (token === "tok-B") return { user_id: "user_B" };
    if (token === "tok-throws") throw new Error("verifier exploded");
    return null;
  },
};

const store = new FakeShareStore();
const ctx: ShareCtx = { now: () => NOW, verifier, store, render: fakeRender };

function req(
  method: string,
  path: string,
  opts?: { token?: string; query?: Record<string, string>; body?: unknown },
): HttpRequest {
  return {
    method,
    path,
    headers: opts?.token !== undefined ? { authorization: `Bearer ${opts.token}` } : {},
    query: opts?.query ?? {},
    body: opts?.body,
  };
}

const setupPayload = (): Record<string, unknown> => ({
  title: "MP11 hot-asphalt baseline",
  car: "kyosho-mp11",
  fields: { front_camber: -1.5, ride_height: 24 },
});

// ═══ publish ═════════════════════════════════════════════════════════════════

console.log("— publish —");
let publishedToken = "";
{
  const r = await sharePublish(ctx, req("POST", "/api/share/publish", { token: "tok-A", body: { kind: "setup", payload: setupPayload() } }));
  publishedToken = r.json.token as string;
  check("publish: 201 with token + share_url + artifacts + server_time",
    r.status === 201 &&
    typeof r.json.token === "string" &&
    r.json.share_url === `/s/${r.json.token}` &&
    r.json.server_time === NOW);
  check("publish: artifacts come from the render seam (D12)",
    (r.json.artifacts as ShareArtifacts).png_url === "https://cdn.test/setup.png" &&
    (r.json.artifacts as ShareArtifacts).pdf_url === "https://cdn.test/setup.pdf");
  check("publish: token is unguessable-shaped (s_ + 20 base32)",
    publishedToken.startsWith("s_") && publishedToken.length === 22);
  check("publish: snapshot stored under owner with forked_from null (root)",
    store.snapshots.get(publishedToken)?.owner_user_id === "user_A" &&
    store.snapshots.get(publishedToken)?.forked_from === null);

  const rTrack = await sharePublish(ctx, req("POST", "/api/share/publish", { token: "tok-A", body: { kind: "track", payload: { name: "Silverstone RC" } } }));
  check("publish: kind=track accepted", rTrack.status === 201 && store.snapshots.get(rTrack.json.token as string)?.kind === "track");

  // auth required
  const rNoTok = await sharePublish(ctx, req("POST", "/api/share/publish", { body: { kind: "setup", payload: {} } }));
  check("publish: no token -> 401", rNoTok.status === 401 && rNoTok.json.error === "unauthorized");
  const rBadTok = await sharePublish(ctx, req("POST", "/api/share/publish", { token: "tok-garbage", body: { kind: "setup", payload: {} } }));
  check("publish: unknown token -> 401", rBadTok.status === 401);
  const rThrowTok = await sharePublish(ctx, req("POST", "/api/share/publish", { token: "tok-throws", body: { kind: "setup", payload: {} } }));
  check("publish: throwing verifier -> 401 (not 500)", rThrowTok.status === 401);

  // bad input
  const rNoBody = await sharePublish(ctx, req("POST", "/api/share/publish", { token: "tok-A" }));
  check("publish: missing body -> 400 bad_request", rNoBody.status === 400 && rNoBody.json.error === "bad_request");
  const rArr = await sharePublish(ctx, req("POST", "/api/share/publish", { token: "tok-A", body: [1, 2] }));
  check("publish: array body -> 400", rArr.status === 400 && rArr.json.error === "bad_request");
  const rBadKind = await sharePublish(ctx, req("POST", "/api/share/publish", { token: "tok-A", body: { kind: "engine", payload: {} } }));
  check("publish: unknown kind -> 400", rBadKind.status === 400 && rBadKind.json.error === "bad_request");
  const rNoKind = await sharePublish(ctx, req("POST", "/api/share/publish", { token: "tok-A", body: { payload: {} } }));
  check("publish: missing kind -> 400", rNoKind.status === 400);
  const rNoPayload = await sharePublish(ctx, req("POST", "/api/share/publish", { token: "tok-A", body: { kind: "setup" } }));
  check("publish: missing payload -> 400", rNoPayload.status === 400);
  const rPayloadArr = await sharePublish(ctx, req("POST", "/api/share/publish", { token: "tok-A", body: { kind: "setup", payload: [1] } }));
  check("publish: array payload -> 400", rPayloadArr.status === 400);

  // D12: render failure degrades to empty artifacts, never 500
  const ctxThrow: ShareCtx = { ...ctx, render: throwingRender };
  const rRenderFail = await sharePublish(ctxThrow, req("POST", "/api/share/publish", { token: "tok-A", body: { kind: "setup", payload: setupPayload() } }));
  check("publish: render failure -> 201 with empty artifacts (D12, no 500)",
    rRenderFail.status === 201 && Object.keys(rRenderFail.json.artifacts as object).length === 0);
}

// ═══ PII guard: server-enforced publishability ═══════════════════════════════
// The auth-free GET echoes payload verbatim — so the SERVER must scrub owner
// identity at PUBLISH time (denylist -> 400; allow-list projection -> drop).

console.log("\n— PII guard (publishability) —");
{
  // 1) denylist: identity-shaped keys at the top level are REJECTED, not stored.
  for (const badKey of ["owner_email", "user_id", "owner", "phone", "auth_token"]) {
    const r = await sharePublish(ctx, req("POST", "/api/share/publish", {
      token: "tok-A",
      body: { kind: "setup", payload: { title: "x", car: "kyosho-mp11", [badKey]: "leak" } },
    }));
    check(`publish: denylisted top-level key '${badKey}' -> 400 bad_request`,
      r.status === 400 && r.json.error === "bad_request");
  }

  // 1b) denylist is NESTED — owner identity buried deep is still rejected.
  const rNested = await sharePublish(ctx, req("POST", "/api/share/publish", {
    token: "tok-A",
    body: { kind: "setup", payload: { title: "x", fields: { meta: { owner_user_id: "user_A" } } } },
  }));
  check("publish: denylisted NESTED key (fields.meta.owner_user_id) -> 400", rNested.status === 400);

  // 1c) an '@' anywhere in a key (a literal email used as a key) -> 400.
  const rAtKey = await sharePublish(ctx, req("POST", "/api/share/publish", {
    token: "tok-A",
    body: { kind: "setup", payload: { title: "x", "alice@track.com": true } },
  }));
  check("publish: key containing '@' -> 400", rAtKey.status === 400);

  // 2) allow-list projection: a key that is neither denylisted nor allow-listed
  //    is SILENTLY DROPPED, and never reaches the auth-free GET.
  const rExtra = await sharePublish(ctx, req("POST", "/api/share/publish", {
    token: "tok-A",
    body: { kind: "setup", payload: { title: "kept", car: "kyosho-mp11", secret_internal_flag: "drop-me", contact: "drop-me-too" } },
  }));
  check("publish: non-allow-listed top-level keys are dropped at publish (201)",
    rExtra.status === 201);
  const piiToken = rExtra.json.token as string;
  const storedExtra = store.snapshots.get(piiToken)!;
  check("publish: stored payload keeps ONLY allow-listed fields",
    Object.keys(storedExtra.payload).sort().join(",") === "car,title" &&
    storedExtra.payload.title === "kept");

  // 3) the auth-free GET never echoes a dropped/denylisted field.
  const rGet = await shareGet(ctx, req("GET", "/api/share/get", { query: { token: piiToken } }));
  const getPayloadKeys = Object.keys(rGet.json.payload as object);
  check("get: scrubbed payload — no non-allow-listed keys leak through GET",
    !getPayloadKeys.includes("secret_internal_flag") && !getPayloadKeys.includes("contact") &&
    getPayloadKeys.sort().join(",") === "car,title");

  // 4) track kind has its OWN allow-list (setup-only fields dropped).
  const rTrack = await sharePublish(ctx, req("POST", "/api/share/publish", {
    token: "tok-A",
    body: { kind: "track", payload: { name: "Silverstone", surface: "asphalt", car: "kyosho-mp11", fields: { drop: 1 } } },
  }));
  const trackStored = store.snapshots.get(rTrack.json.token as string)!;
  check("publish: track allow-list keeps {name,surface}, drops setup-only {car,fields}",
    Object.keys(trackStored.payload).sort().join(",") === "name,surface");

  // 5) a clean, fully-allow-listed payload round-trips untouched.
  const rClean = await sharePublish(ctx, req("POST", "/api/share/publish", {
    token: "tok-A",
    body: { kind: "setup", payload: { title: "t", name: "n", car: "c", template_id: "tid", values: { a: 1 }, fields: { b: 2 }, notes: "hi" } },
  }));
  const cleanStored = store.snapshots.get(rClean.json.token as string)!;
  check("publish: a fully allow-listed payload survives intact",
    Object.keys(cleanStored.payload).sort().join(",") === "car,fields,name,notes,template_id,title,values");
}

// ═══ get (auth-free) ═════════════════════════════════════════════════════════

console.log("\n— get (auth-free) —");
{
  const r = await shareGet(ctx, req("GET", "/api/share/get", { query: { token: publishedToken } }));
  check("get: AUTH-FREE 200 (no bearer needed, D10)", r.status === 200);
  check("get: returns kind + payload + artifacts + forked_from + install_cta + server_time",
    r.json.kind === "setup" &&
    (r.json.payload as Record<string, unknown>).title === "MP11 hot-asphalt baseline" &&
    (r.json.artifacts as ShareArtifacts).pdf_url === "https://cdn.test/setup.pdf" &&
    r.json.forked_from === null &&
    r.json.server_time === NOW);
  check("get: install_cta present with null ios/android",
    typeof r.json.install_cta === "object" &&
    (r.json.install_cta as Record<string, unknown>).ios === null &&
    (r.json.install_cta as Record<string, unknown>).android === null);

  // PII: owner identity must NEVER appear in the public projection
  const keys = Object.keys(r.json);
  check("get: NO owner_user_id / owner PII leaked (public projection only)",
    !keys.includes("owner_user_id") && !keys.includes("owner") && !keys.includes("user_id") && !keys.includes("email"));
  check("get: payload itself round-trips without an injected owner field",
    !Object.keys(r.json.payload as object).includes("owner_user_id"));

  // missing / unknown token
  const rMissing = await shareGet(ctx, req("GET", "/api/share/get", {}));
  check("get: missing token -> 400 bad_request", rMissing.status === 400 && rMissing.json.error === "bad_request");
  const rEmpty = await shareGet(ctx, req("GET", "/api/share/get", { query: { token: "  " } }));
  check("get: blank token -> 400", rEmpty.status === 400);
  const rUnknown = await shareGet(ctx, req("GET", "/api/share/get", { query: { token: "s_doesnotexist000000" } }));
  check("get: unknown token -> 404 not_found", rUnknown.status === 404 && rUnknown.json.error === "not_found");
}

// ═══ import / fork (bearer) ══════════════════════════════════════════════════

console.log("\n— import / fork —");
{
  // user_B forks user_A's public setup
  const r = await shareImport(ctx, req("POST", "/api/share/import", { token: "tok-B", query: { token: publishedToken } }));
  check("import: 200 imported:true with kind + payload + lineage",
    r.status === 200 &&
    r.json.imported === true &&
    r.json.kind === "setup" &&
    (r.json.payload as Record<string, unknown>).car === "kyosho-mp11" &&
    r.json.forked_from === publishedToken &&
    r.json.server_time === NOW);
  check("import: lineage recorded in store", store.imports.get(publishedToken)?.has("user_B") === true);

  // idempotency: re-import is a no-op, still 200
  const r2 = await shareImport(ctx, req("POST", "/api/share/import", { token: "tok-B", query: { token: publishedToken } }));
  check("import: re-import idempotent (still 200, single lineage row)",
    r2.status === 200 && store.imports.get(publishedToken)?.size === 1);

  // owner can fork their own (allowed — it is a public capability, no owner check)
  const rOwn = await shareImport(ctx, req("POST", "/api/share/import", { token: "tok-A", query: { token: publishedToken } }));
  check("import: a second user (the owner) forks -> distinct lineage row",
    rOwn.status === 200 && store.imports.get(publishedToken)?.size === 2);

  // auth required
  const rNoTok = await shareImport(ctx, req("POST", "/api/share/import", { query: { token: publishedToken } }));
  check("import: no token -> 401", rNoTok.status === 401 && rNoTok.json.error === "unauthorized");
  const rThrowTok = await shareImport(ctx, req("POST", "/api/share/import", { token: "tok-throws", query: { token: publishedToken } }));
  check("import: throwing verifier -> 401 (not 500)", rThrowTok.status === 401);

  // missing / unknown token
  const rMissing = await shareImport(ctx, req("POST", "/api/share/import", { token: "tok-A" }));
  check("import: missing token -> 400", rMissing.status === 400 && rMissing.json.error === "bad_request");
  const rUnknown = await shareImport(ctx, req("POST", "/api/share/import", { token: "tok-A", query: { token: "s_nope0000000000000000" } }));
  check("import: unknown token -> 404", rUnknown.status === 404 && rUnknown.json.error === "not_found");
}

// ═══ immutability + isolation (D11) ══════════════════════════════════════════

console.log("\n— immutability + isolation —");
{
  // the snapshot is unchanged by gets and imports (publish-time immutable, D11)
  const snap = store.snapshots.get(publishedToken)!;
  check("immutable: snapshot kind/owner/forked_from unchanged after get+import",
    snap.kind === "setup" && snap.owner_user_id === "user_A" && snap.forked_from === null);
  check("immutable: store exposes no update path (compile-time)",
    typeof (store as unknown as { update?: unknown }).update === "undefined");

  // imports map keyed per (token, user) — A's import of its own does not bleed into B
  check("isolation: import ledger is per (token, user_id)",
    store.imports.get(publishedToken)?.has("user_A") === true &&
    store.imports.get(publishedToken)?.has("user_B") === true);

  // token uniqueness sanity over many mints (20 base32 chars = 100 bits entropy)
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i++) seen.add(newShareToken());
  check("token: 5000 mints all unique + well-shaped (s_ + 20 base32 = 100 bits)",
    seen.size === 5000 && [...seen].every((t) => /^s_[a-z2-7]{20}$/.test(t)));

  // distribution sanity: across 5000 mints every base32 symbol should appear
  // (catches a biased/broken RNG that collapses the alphabet).
  const symbols = new Set<string>();
  for (const t of seen) for (const ch of t.slice(2)) symbols.add(ch);
  check("token: full base32 alphabet exercised over 5000 mints (32 symbols)", symbols.size === 32);

  // CSPRNG required: if crypto.getRandomValues is unavailable, newShareToken
  // THROWS rather than silently minting a guessable Math.random token.
  const savedCrypto = (globalThis as { crypto?: unknown }).crypto;
  try {
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    let threw = false;
    try { newShareToken(); } catch { threw = true; }
    check("token: no CSPRNG -> throws (never downgrades to Math.random)", threw);
  } finally {
    Object.defineProperty(globalThis, "crypto", { value: savedCrypto, configurable: true });
  }

  check("render: was actually invoked on the happy publishes", renderCalls >= 2);
}

// ═══ verdict ═════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nSHARE: all checks passed" : `\nSHARE: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
