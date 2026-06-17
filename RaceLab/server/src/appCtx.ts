/**
 * AppCtx — the full server context: the base ServerCtx (db, verifier, now)
 * plus every injected seam the BACKEND.md Tier-B modules need. Each handler
 * declares a MINIMAL ctx interface (only the seams it uses); the router
 * (handler.ts) adapts AppCtx down to each handler's shape. Seam field names are
 * made UNIQUE here (stripeStore / entitlementStore / mediaStore / …) because
 * the modules all name their own field "store"/"sign"/"verify" — a single flat
 * context can't carry eight different `store`s, so the adapter maps them.
 *
 * Seam TYPES are owned by each module's store file. AppCtx is built by
 * getDeployCtx (deploy.ts) at deploy time and faked in test-server.ts. Nothing
 * deploys until accounts/keys exist (D29/D17): this is code-ready, not live.
 */

import type { ServerCtx } from "./types";
import type { StripeVerifier, StripeWebhookStore } from "./stores/stripeWebhookStore";
import type { JwtSigner, EntitlementReader } from "./stores/entitlementStore";
import type { BlobStore, MediaStore } from "./stores/mediaStore";
import type { BlobBackupStore } from "./stores/backupBlobStore";
import type { ShareStore, RenderSeam } from "./stores/shareStore";
import type { ManifestSigner, ContentStore } from "./stores/contentStore";
import type { ExportStore } from "./stores/exportStore";
import type { PushStore } from "./stores/pushStore";
import type { HealthSeams } from "./handlers/health";
import type { ClerkIdentityDeleter } from "./handlers/accountDelete";
import type { RateStore, RateLogger } from "./rateLimit";
import type { Metrics } from "./metrics";

export interface AppCtx extends ServerCtx {
  // P0 — Stripe webhook (D29 web Stripe, no IAP) + offline entitlement token
  stripeVerify: StripeVerifier;
  stripeStore: StripeWebhookStore;
  entitlementSign: JwtSigner;
  entitlementStore: EntitlementReader;
  // P0.5 — media blob storage
  blobStore: BlobStore;
  mediaStore: MediaStore;
  newMediaId?: () => string;
  // P1 — backup domain-blobs (D11) + share/fork (D10)
  backupBlobStore: BlobBackupStore;
  shareStore: ShareStore;
  shareRender: RenderSeam;
  // P2 — content delivery, GDPR export, push
  contentSign: ManifestSigner;
  contentStore: ContentStore;
  exportStore: ExportStore;
  pushStore: PushStore;
  // ops — /healthz: a db liveness ping + per-seam configured booleans (no secrets)
  healthPing: () => Promise<boolean>;
  healthSeams: HealthSeams;
  // cross-cutting — rate limiter + metrics sink. Both OPTIONAL: absent =
  // disabled (no limiter, no-op metrics) so tests and an unconfigured deploy
  // never break. When `rateStore` is present the router enforces the per-route
  // policy (RATE_POLICY in handler.ts) on the auth-free + auth-sensitive surfaces.
  rateStore?: RateStore;
  rateLog?: RateLogger;
  metrics?: Metrics;
  // cron — the scheduled worker fan-out (exportAssembler / pushReceipts /
  // mediaMaintenance). cronSecret gates POST /api/cron/workers (fail-closed when
  // absent); cronRunJobs is the injected fan-out (deploy wires the real workers).
  cronSecret?: string;
  cronRunJobs?: () => Promise<import("./handlers/cron").CronRunSummary>;
  // account deletion — OPTIONAL Clerk identity deleter (Apple 5.1.1(v)). Absent =>
  // the identity step is skipped (DELETE /api/account still wipes RaceLab's data).
  deleteClerkIdentity?: ClerkIdentityDeleter;
}
