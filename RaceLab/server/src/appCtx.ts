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
}
