# RaceLab — Backend Status (William's answer to `docs/BACKEND.md`)

> Maps every task in Théo's `BACKEND.md` to its real state on `racelab`
> (2026-06-13). The whole Tier-B server is **code-ready and tested, NOT
> deployed** — deploy is gated on accounts/keys/money, which are yours (D17/D29).
> Companion to `BACKEND.md` (the spec) and `CONTRACTS.md` (the frozen surfaces).

**Legend:** ✅ built + tested (code-ready) · 🟡 partial (seam built, real impl or worker deferred) · 🔒 blocked on William (account / key / spend / sign-off) · ⬜ not started (later phase)

All handlers are pure `(ctx, req) → {status, json}`, zero committed runtime deps (every external capability injected as a seam), owner-scoped, never throw across the boundary, echo `server_time`. Each lives in `server/src/handlers/*` + `server/src/stores/*` with a standalone `server/src/test-*.ts`. `cd server && npm test` = router + all module suites green; `npm run typecheck` clean.

---

## P0 — Identity & accounts
| Task | Status | Where / note |
|---|---|---|
| Bearer verification boundary (Clerk JWKS) | ✅ | `src/auth.ts` `TokenVerifier`; `src/deploy.ts` wires `jose` JWKS verify |
| `/auth/signup,login,me,forgot,reset`, email verify | 🔒🟡 | **Provider-hosted** (Clerk / Supabase Auth — gets reset/verify/rate-limit for free, per BACKEND.md §6 recommendation). The app holds a Clerk token; the server only *verifies* it. Custom endpoints not built by design |
| Rate-limit `/auth/*`, token rotation + reuse detection | 🔒 | Provider responsibility (Clerk). If we self-host auth later, a token-bucket util is a small add |
| Offline fallback to local account | ✅ | `packages/account` `canUse` returns before any I/O for free features (airplane-mode invariant) |

## P0 — Subscription, trial & entitlement
| Task | Status | Where / note |
|---|---|---|
| `GET /api/subscription/status` | ✅ | `handlers/subscriptionStatus.ts`; now reads `stripe_subscriptions` (single source of truth post-Stripe) |
| `POST /api/trial/start` (server first-seen) | ✅ | `handlers/trialStart.ts` — server owns `trial_started_at`, later claims can't move it |
| **`POST /api/webhooks/stripe`** | ✅ | `handlers/stripeWebhook.ts` — signature-verified (raw body), **idempotent on `event.id`**, **out-of-order watermark** (canceled never downgraded to active even on equal-second races), maps checkout/subscription/payment_failed; try/catch → 500-retryable, never marks processed on failure |
| **`GET /api/entitlement`** (signed offline token) | ✅ | `handlers/entitlement.ts` — EdDSA JWT (public key pinned in app), claims `status/plan/current_period_end/trial_ends_at/exp`; 24h TTL = accepted offline over-grant; **gates Pro only, never the advisor** (D18/D20) |
| Stripe Checkout + EU VAT (Stripe Tax) | 🔒 | Stripe account + `STRIPE_*` keys; VAT-inclusive vs -exclusive on 9.99€ = your call |
| Pricing 9.99€/mo · 99.99€/yr · 15-day trial | 🔒 | **D29 — awaiting your sign-off.** No number is hard-coded server-side; `TRIAL_DAYS=15` only |

## P0.5 — Media / blob storage
| Task | Status | Where / note |
|---|---|---|
| `POST /api/media/upload-url` (presigned PUT) | ✅ | `handlers/uploadUrl.ts` — mime allowlist, **per-user quota enforced atomically** (single conditional INSERT, no TOCTOU), **declared-bytes ceiling** on the presign, **user_id charset-guarded** before the blob key (no IDOR path-escape) |
| Local-URI → media-reference rewrite, EXIF GPS strip | 🟡 | Reference model is in place; EXIF strip happens at render/processing before a photo enters a shared artifact (worker) |
| S3 / Supabase Storage presign | 🔒 | `BlobStore` seam; `BLOB_PUT_BASE` + creds at deploy |

## P1 — Cloud backup & restore (NOT sync, D11)
| Task | Status | Where / note |
|---|---|---|
| Outbox push / restore (server seq cursor) | ✅ | `handlers/backupPush.ts` + `backupRestore.ts` — idempotent on client `entry_id`, per-user |
| `GET/PUT /api/backup/blob` (whole-domain `{format,state}`) | ✅ | `handlers/backupBlob.ts` — envelope stored **verbatim/opaque** (no server migration), optimistic concurrency → **409 server-newer**, owner-scoped |
| Per-entity reconciliation | ⬜ | **V2 by design (D11)** — explicitly NOT built |
| Neon Postgres | 🔒 | `DATABASE_URL`; `db/schema.sql` applies every table |

## P1 — Share link + fork (all of "social" for V1.0, D10)
| Task | Status | Where / note |
|---|---|---|
| `POST /api/share/publish` (immutable snapshot) | ✅ | `handlers/share.ts` — **server-side allow-list scrub** of payload (no owner PII can be published), per-kind fields only |
| `GET /api/share/get` (auth-free static data) | ✅ | Auth-free token capability; owner identity **never** serialized; install-CTA shell |
| `POST /api/share/import` (fork + lineage) | ✅ | Records `forked_from`; snapshots immutable; token = 100-bit CSPRNG (throws if no CSPRNG) |
| Public browse / discovery / comments | ⬜ | **V1.1+ (D10)** — only the unlisted link is wired |

## P1 — PDF / PNG render (D12 fill-never-redraw)
| Task | Status | Where / note |
|---|---|---|
| Render seam in the publish path | ✅ | `RenderSeam`; publish degrades gracefully (201 + empty artifacts) if render is down |
| Real AcroForm-fill / overlay service | 🟡🔒 | `packages/pdf` is the verified PoC (MP11, 51 fields); a Vercel render function over it + `RENDER_URL` is the deploy step |

## P2 — Reference data & KB content delivery
| Task | Status | Where / note |
|---|---|---|
| `GET /api/content/rcdata`, `/api/content/kb` (signed manifest) | ✅ | `handlers/content.ts` — version + content-hash + EdDSA signature; **monotonic version** (no downgrade); app re-verifies against pinned key + the in-app baseline floor |
| Wire `rc-setup-fields.json` → per-category templates | 🟡 | **KB/content task (my zone), not server** — researched (16 groups / ~900 fields), not yet in the runtime bundle; next KB session |
| Signing key + CDN/blob for bytes | 🔒 | `ENTITLEMENT_SIGNING_KEY` (shared signer) + blob |

## P2 — Privacy & compliance (GDPR, D17)
| Task | Status | Where / note |
|---|---|---|
| `DELETE /api/account` (wipe + tombstone) | ✅ | `handlers/accountDelete.ts` — atomic wipe, deletion tombstone survives (legit-interest), idempotent |
| `POST/GET /api/me/export` (async archive job) | ✅ | `handlers/dataExport.ts` — owner-scoped job; **the archive-assembly worker** (blobs + media + billing) is deferred 🟡 |
| Privacy policy endpoint, PII-redacted logs | 🟡🔒 | Policy page + log redaction at deploy |

## P2 — Speedhive
| Task | Status | Where / note |
|---|---|---|
| Practice-API client (Origin-gated) | ✅ | `packages/speedhive` (adapter) + app `speedhive.ts` (mock flag on until a real chip is tested) |
| `POST /speedhive/link`, `GET /speedhive/sessions` (server proxy + circuit breaker) | ⬜🔒 | Deferred (D31/D38) — server-side polling needs MYLAPS partner access; client-pull is the V1 fallback |

## P2 — Push notifications
| Task | Status | Where / note |
|---|---|---|
| `POST/DELETE /api/push/token` (device-scoped, consent-gated) | ✅ | `handlers/pushToken.ts` — many devices/user, marketing-consent flag (GDPR), idempotent |
| Expo receipt processing + `DeviceNotRegistered` prune, triggers | 🟡 | Worker deferred; trigger types constrained to Speedhive/trial/social |

## P3 — Social V1.1+
⬜ Profiles, follows, props, comments, discovery, leaderboards (`driverStats` already client-side) + **UGC moderation** (Apple 1.2: filter + report + block + takedown) + n≥8 anonymity floor. After launch (D10 phasing).

## Cross-cutting — Observability
🟡 `/healthz`, structured request logging + correlation ids, Sentry, alerts on Stripe-webhook + auth + backup-409 rates — small adds at deploy; not built yet.

---

## What landed this session (code-ready, tested)
**8 new server modules** + integration: `stripeWebhook · entitlement · uploadUrl(media) · backupBlob · share · content · dataExport · pushToken`. Router (`handler.ts`) wires 14 new routes via AppCtx adapters; `db/schema.sql` gains 9 tables; `deploy.ts` builds the full `AppCtx` (DB stores + Stripe/EdDSA/blob/render seams with **graceful per-seam degradation** — one missing key never takes down the core tier). An adversarial security audit (5 reviewers) found 4 must-fixes (entitlement read-the-wrong-table, media IDOR/quota-TOCTOU/declared-bytes, share PII leak, stripe equal-second downgrade) — **all applied and regression-tested**.

## 🔒 Blocked on William (the deploy critical path)
1. **Pricing sign-off (D29):** 9.99€/99.99€, and VAT-inclusive or -exclusive.
2. **Accounts/keys:** Vercel + Neon (`DATABASE_URL`), Clerk (`CLERK_JWKS_URL`), **Stripe** (`STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`), an **EdDSA signing keypair** (`ENTITLEMENT_SIGNING_KEY`; pin the public half in the app), **S3/Supabase Storage** (`BLOB_*`), a **render service** (`RENDER_URL`).
3. **Speedhive:** pursue a MYLAPS partner/OAuth path, or ship client-pull-only for V1.

## Deferred (next sessions, no human prereq)
- `api/*.ts` thin Vercel entry files for the 14 new routes + Stripe raw-body (`bodyParser:false`) — deploy plumbing.
- The async workers (GDPR archive assembly, Expo receipts, media EXIF strip).
- Wire `rc-setup-fields.json` into the runtime KB bundle (KB/content session).
- `/healthz` + structured logging + a rate-limit util.
- Minor audit should-fixes: media orphaned-presign sweep, a `makeSql*` contract test against a stub QueryFn for backup-blob.
