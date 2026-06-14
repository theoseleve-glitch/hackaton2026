/**
 * Deploy wiring — the ONLY file that knows about real infrastructure. Nothing
 * deploys yet (no accounts exist, D17/D29); when they do, this is the complete
 * checklist. Builds the full AppCtx: base ServerCtx (db + Clerk verifier) plus
 * every BACKEND.md module seam.
 *
 *  1. Runtime deps (committed nowhere; loaded via dynamic import so tsc/tsx need none):
 *        npm i @neondatabase/serverless jose stripe
 *  2. Vercel env vars:
 *        DATABASE_URL            — Neon connection string (required — core tier)
 *        CLERK_JWKS_URL          — https://<clerk-frontend-api>/.well-known/jwks.json (required)
 *        CLERK_ISSUER            — https://<clerk-frontend-api>            (recommended)
 *        ENTITLEMENT_SIGNING_KEY — Ed25519 PKCS8 PEM; the PUBLIC half is PINNED in the app
 *                                  (EdDSA, asymmetric — an HMAC key would let any holder mint Pro)
 *        STRIPE_WEBHOOK_SECRET   — Stripe CLI/dashboard signing secret (whsec_…)
 *        BLOB_*                  — S3/Supabase Storage creds for presigned media PUTs
 *        RENDER_URL              — internal PDF/PNG render service (D12 fill-never-redraw)
 *  3. Apply db/schema.sql to Neon (covers every *_SCHEMA_SQL).
 *  4. RAW BODY: the /api/webhooks/stripe function MUST pass the unparsed body
 *     string (Stripe signs exact bytes) — see api/webhooks/stripe.ts (bodyParser off).
 *  5. `vercel deploy` from server/ — api/*.ts are the functions (vercel.json).
 *
 * GRACEFUL DEGRADATION: only DATABASE_URL + CLERK are hard-required. A missing
 * payments/signing/blob/render key degrades ONLY its own routes (their seam
 * returns/rejects cleanly → that route 500s → the app treats it as offline,
 * D4/D18); the core (auth/backup/account) stays up. Misconfig of the core
 * throws here → vercel.ts maps it to 500 server_misconfigured.
 */

import { makeSqlDb } from "./db";
import type { QueryFn } from "./db";
import type { TokenVerifier } from "./auth";
import type { AppCtx } from "./appCtx";
import { makeSqlStripeWebhookStore } from "./stores/stripeWebhookStore";
import type { StripeVerifier } from "./stores/stripeWebhookStore";
import { makeSqlEntitlementReader } from "./stores/entitlementStore";
import type { JwtSigner } from "./stores/entitlementStore";
import { makeSqlMediaStore } from "./stores/mediaStore";
import type { BlobStore } from "./stores/mediaStore";
import { makeSqlBackupBlobStore } from "./stores/backupBlobStore";
import { makeSqlShareStore } from "./stores/shareStore";
import type { RenderSeam } from "./stores/shareStore";
import { makeSqlContentStore } from "./stores/contentStore";
import type { ManifestSigner } from "./stores/contentStore";
import { makeSqlExportStore } from "./stores/exportStore";
import { makeSqlPushStore } from "./stores/pushStore";

export async function getDeployCtx(
  env: Record<string, string | undefined> = process.env,
): Promise<AppCtx> {
  const dbUrl = env.DATABASE_URL;
  const jwksUrl = env.CLERK_JWKS_URL;
  const issuer = env.CLERK_ISSUER;
  if (dbUrl === undefined || dbUrl === "" || jwksUrl === undefined || jwksUrl === "") {
    throw new Error("server_misconfigured: DATABASE_URL and CLERK_JWKS_URL are required");
  }

  // ── core: one query fn shared by makeSqlDb and every module store ──────────
  const neonSpec = "@neondatabase/serverless" as string;
  const { neon } = (await import(neonSpec)) as {
    neon: (url: string) => { query: (text: string, params?: readonly unknown[]) => Promise<unknown> };
  };
  const sql = neon(dbUrl);
  const query: QueryFn = async (text, params) => {
    const out = (await sql.query(text, params)) as unknown;
    // neon().query returns the row array directly; pg-style drivers return {rows}
    if (Array.isArray(out)) return { rows: out as Record<string, unknown>[] };
    return out as { rows: Record<string, unknown>[] };
  };
  const db = makeSqlDb(query);

  // ── Clerk bearer verification (JWKS) ───────────────────────────────────────
  const joseSpec = "jose" as string;
  const jose = (await import(joseSpec)) as {
    createRemoteJWKSet: (url: URL) => unknown;
    jwtVerify: (token: string, key: unknown, options?: { issuer?: string }) => Promise<{ payload: { sub?: unknown } }>;
    importPKCS8: (pem: string, alg: string) => Promise<unknown>;
    SignJWT: new (payload: Record<string, unknown>) => {
      setProtectedHeader(h: Record<string, unknown>): { sign(key: unknown): Promise<string> };
    };
  };
  const jwks = jose.createRemoteJWKSet(new URL(jwksUrl));
  const verifier: TokenVerifier = {
    verify: async (token) => {
      try {
        const { payload } = await jose.jwtVerify(token, jwks, issuer !== undefined && issuer !== "" ? { issuer } : undefined);
        return typeof payload.sub === "string" && payload.sub !== "" ? { user_id: payload.sub } : null;
      } catch {
        return null;
      }
    },
  };

  // ── EdDSA signer (entitlement token + content manifest). Public key pinned in app. ──
  const signingPem = env.ENTITLEMENT_SIGNING_KEY;
  let signer: JwtSigner & ManifestSigner;
  if (signingPem !== undefined && signingPem !== "") {
    // import ONCE at ctx build (fail-fast on a malformed key -> server_misconfigured)
    // instead of re-parsing the PEM on every entitlement/content request.
    const signingKey = await jose.importPKCS8(signingPem, "EdDSA");
    signer = {
      sign: async (claims) => new jose.SignJWT(claims).setProtectedHeader({ alg: "EdDSA", typ: "JWT" }).sign(signingKey),
    };
  } else {
    signer = { sign: async () => { throw new Error("signing_unconfigured: set ENTITLEMENT_SIGNING_KEY (EdDSA)"); } };
  }

  // ── Stripe signature verification (raw body) ───────────────────────────────
  const stripeSecret = env.STRIPE_WEBHOOK_SECRET;
  const stripeApiKey = env.STRIPE_SECRET_KEY;
  const stripeVerify: StripeVerifier = stripeSecret !== undefined && stripeSecret !== "" && stripeApiKey !== undefined && stripeApiKey !== ""
    ? await (async () => {
        const stripeSpec = "stripe" as string;
        const { default: Stripe } = (await import(stripeSpec)) as {
          default: new (k: string) => { webhooks: { constructEvent(body: string, sig: string, secret: string): unknown } };
        };
        const stripe = new Stripe(stripeApiKey);
        return {
          verify: (rawBody: string, sigHeader: string | undefined) => {
            try {
              const event = stripe.webhooks.constructEvent(rawBody, sigHeader ?? "", stripeSecret);
              return { ok: true as const, event: event as { id: string; type: string; created: number; data: { object: Record<string, unknown> } } };
            } catch {
              return { ok: false as const };
            }
          },
        };
      })()
    : { verify: () => ({ ok: false as const }) }; // unconfigured → every webhook 400s (safe; no false subscription)

  // ── Blob presign (media). Unconfigured → media route rejects cleanly. ──────
  const blobBase = env.BLOB_PUT_BASE; // deploy: S3/Supabase presign endpoint
  const blobStore: BlobStore = blobBase !== undefined && blobBase !== ""
    ? {
        presignPut: async (key, mime, maxBytes) => {
          // Deploy: replace with the real S3/Supabase presign (sign key, mime,
          // content-length-range [maxBytes,maxBytes]). The route already passes
          // the DECLARED bytes as maxBytes (per the media security fix).
          const expires_at = new Date(Date.now() + 5 * 60_000).toISOString();
          return { url: `${blobBase}/${encodeURIComponent(key)}`, headers: { "content-type": mime, "content-length": String(maxBytes) }, expires_at };
        },
      }
    : { presignPut: async () => { throw new Error("blob_unconfigured: set BLOB_PUT_BASE (S3/Supabase)"); } };

  // ── Render seam (share artifacts, D12). Unconfigured → no artifacts (share still works). ──
  const renderUrl = env.RENDER_URL;
  const shareRender: RenderSeam = {
    render: async (kind, payload) => {
      if (renderUrl === undefined || renderUrl === "") return {}; // graceful: publish succeeds with no preview
      try {
        const res = await fetch(`${renderUrl}/render`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, payload }),
        });
        if (!res.ok) return {};
        return (await res.json()) as { png_url?: string; pdf_url?: string };
      } catch {
        return {};
      }
    },
  };

  // server-generated media id (owner-scoped key segment; charset-guarded in the handler)
  const newMediaId = (): string =>
    "m_" + (globalThis.crypto?.randomUUID?.() ?? "").replace(/-/g, "");

  return {
    db,
    verifier,
    now: () => new Date().toISOString(),
    stripeVerify,
    stripeStore: makeSqlStripeWebhookStore(query),
    entitlementSign: signer,
    entitlementStore: makeSqlEntitlementReader(query),
    blobStore,
    mediaStore: makeSqlMediaStore(query),
    newMediaId,
    backupBlobStore: makeSqlBackupBlobStore(query),
    shareStore: makeSqlShareStore(query),
    shareRender,
    contentSign: signer,
    contentStore: makeSqlContentStore(query),
    exportStore: makeSqlExportStore(query),
    pushStore: makeSqlPushStore(query),
    // ops — /healthz: a liveness ping + per-seam configured booleans (no secret values)
    healthPing: async () => {
      try {
        await query("SELECT 1");
        return true;
      } catch {
        return false;
      }
    },
    healthSeams: {
      stripe: stripeSecret !== undefined && stripeSecret !== "" && stripeApiKey !== undefined && stripeApiKey !== "",
      signing: signingPem !== undefined && signingPem !== "",
      blob: blobBase !== undefined && blobBase !== "",
      render: renderUrl !== undefined && renderUrl !== "",
    },
  };
}
