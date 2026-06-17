# RaceLab — Backend Build Spec (for William)

> What the backend must provide to match where the **frontend** stands today
> (`theo/racelab`), **aligned to the decisions log** (`docs/00_CONTEXT.md`) and the
> social/AI specs. Every data contract is copied from the packages the app actually
> persists. Companion to `docs/FEATURES.md`.
>
> Reviewed adversarially (2026-06-13): this revision fixes a sync model that
> contradicted D11, adds the photo/blob, GDPR, render, and content-integrity domains
> that were missing, and corrects the entitlement framing (the **advisor is free** —
> Pro gates cars/setups/history/analytics, never the engineer).

---

## 0 · The rules that shape the whole backend (from the decisions log)

1. **D18 — the advisor never touches the server.** The race engineer is 100%
   deterministic and on-device. No `/advise`, `/report`, `/strategy` endpoint, ever. The
   KB rules ship in-app (and may be *served as data* + verified + cached — serving data ≠
   computing advice). The advisor is **free and unlimited** (D18/D20) — it's the hook that
   beats So Dialed. **Entitlement gates Pro only** (unlimited cars/setups, history,
   analytics), never the engineer/planner/strategy.
2. **D11 — no bidirectional sync in V1.** Local storage is the source of truth;
   **append-only outbox → cloud backup when online; restore on fresh install.** Publishing
   creates a **server-side snapshot at publish time**. Real per-entity sync is **V2**. (Do
   not build entity reconciliation — the team explicitly killed it.)
3. **D10 — V1.0 social = unlisted share link + fork/import only.** Share link = a static,
   auth-free page embedding a rendered sheet (PDF/PNG) + install CTA. **No public browse
   API, no web app, no comments/follows/profiles in V1.0** (→ V1.1+, and they pull in Apple
   UGC obligations: filter + report + **block** + takedown).
4. **D29 — web-first money, no IAP.** Subscriptions on griplab.app via Stripe (skips the
   store cut; supersedes D16's RevenueCat plan). ⚠ pricing pending William.
5. **D4 — offline-first is hard.** Tracks have terrible connectivity. Every endpoint is
   non-blocking/queueable; the app never waits on the network at the track.
6. **D12 — PDF export = fill, never redraw, server-side.** AcroForm fill / coordinate
   overlay with a per-chassis `pdf_map`.
7. **D17 — store/compliance from the start.** In-app account deletion (Apple 5.1.1(v)),
   privacy policy, Play data-safety, i18n.
8. **Don't migrate data formats server-side.** Store the `{format, state}` envelope
   opaquely; the client packages own migrations.

---

## 1 · Where the frontend is today

- **100% local.** Everything in AsyncStorage (note: D11 says "SQLite" — the principle is
  local-first; the storage is AsyncStorage JSON blobs today). Only network calls: weather
  (Open-Meteo, keyless) and Speedhive (behind `SPEEDHIVE_MOCK = true`).
- **No real auth, no real billing, no backup.** `accountstore` holds the profile + a
  *local-only* `trialDaysLeft()` — nothing logs in, nothing enforces expiry, nothing leaves
  the device.
- **Photos are local device URIs** (`file://`/`ph://` from expo-image-picker) — they do
  **not** survive a reinstall or mean anything on another device. See P0.5 (blob storage).

| Domain | AsyncStorage key | Envelope format | Package |
|---|---|---|---|
| Garage (cars) | `racelab:garage` | 2 | `packages/garage` |
| Tracks | `racelab:tracks` | 2 | `packages/tracks` |
| Run log | `racelab:logbook` | 2 | `packages/logbook` |
| Setup sheets (per car) | `racelab:sheets:car:{carId}` | 1 | `packages/sheets` |
| Engineer reports | `racelab:engineer-reports` | plain JSON | `apps/.../reportstore` |
| Account | `racelab:account` | plain JSON | `apps/.../accountstore` |
| Speedhive cursor | `racelab:speedhive:last_check` | ISO string | `App.tsx` |

---

## 2 · What to build, in priority order

### P0 — Identity & accounts (+ security hardening)
Web signup on **griplab.app**; the app sends a `Bearer` token.

- `POST /auth/signup` (web) · `POST /auth/login` → `{ token, account }` · `GET /me` · `PATCH /me`.
- `POST /auth/forgot-password` + `/auth/reset-password` (single-use, expiring) · email
  verification (or magic-link, which makes it moot).
- **Rate-limit `/auth/*`** per-IP and per-account with backoff/lockout (brute-force is a
  paid-product blocker).
- **Tokens:** short-lived access + refresh rotation with reuse detection; server-side
  revocation ("tokens before X invalid") on password change / logout. These decisions are
  load-bearing because entitlement is cached offline (P0).
- Account model **must match `accountstore.Account`** (§4).
- **Recommendation:** use a provider (Supabase Auth / Clerk) to get reset + verification +
  rate-limiting for free unless there's a reason not to.
- App falls back to the local account when offline.

### P0 — Subscription, trial & entitlement
Move the source of truth for trial/subscription **off the device** (today it's local math).
Entitlement gates **Pro** (unlimited cars/setups, history, analytics) — **never the advisor**.

- **Stripe Checkout on the web** (D29). No StoreKit/Play Billing.
- Pricing (**D29**, ⚠ pending William): `9.99 €/mo`, `99.99 €/yr`, **15-day trial**.
- `GET /api/entitlement` → `{ status: "trial"|"active"|"expired"|"none", plan?, current_period_end?, trial_ends_at?, token, server_time }` (`token` = the signed offline EdDSA grant below; `server_time` is on every response). *(As built — `server/src/handlers/entitlement.ts` + router `/api/entitlement`.)*
- **Webhook `/api/webhooks/stripe`:** verify the `Stripe-Signature`; **idempotent** on
  `event.id` (Stripe redelivers); handle **out-of-order** events by comparing the stored
  subscription timestamp (never downgrade on a stale event); consume
  `checkout.session.completed`, `customer.subscription.created/updated/deleted`,
  `invoice.payment_failed`; add a scheduled **reconcile** against the Stripe API as a
  backstop. **The server owns `trial_started_at`/`trial_ends_at`** — stop trusting the
  client value.
- **Offline entitlement token:** a short-lived **signed JWT** (EdDSA/RS256, public key
  **pinned** in the app; claims `status, plan, current_period_end, exp, iat`). The app honors
  **last-known-good for a generous grace window** (a dead-signal race weekend must never lock
  out a paying user — e.g. token TTL ~24h but trust last-good for ~7 days offline). Server
  clock is authority (compare `current_period_end`, not device `now`). Re-fetch on reconnect.
- **EU VAT:** enable Stripe Tax; store customer country; VAT-compliant invoices (also feeds
  the GDPR export). Confirm with William whether 9.99 € is VAT-inclusive.

### P0.5 — Media / blob storage  *(blocks backup + share — build before P1)*
`CarEntity.photo_uri` and `TrackEntity.photo_uris` are **local device URIs**. Without a blob
store, backup and the share-link silently lose every photo.

- `POST /media/upload-url` → pre-signed PUT URL + a stable `media_id` (Supabase Storage / S3).
- On the wire, photo fields become **canonical media references** (`media_id` / https URL),
  distinct from the local cache URI the app keeps. The backup layer rewrites local→reference
  on PUT and reference→cached-local on restore. **Upload blobs before the envelope PUT** or
  restore yields dangling references.
- Constraints: max size, allowed mime, per-user **quota**, re-encode (the app already
  downsizes at quality 0.7). **Strip EXIF GPS** before any photo enters a shared/public artifact.

### P1 — Cloud backup & restore  *(NOT sync — D11)*
- **Append-only outbox** the app flushes when online; **restore on fresh install** is the
  read path. Last-write-wins per `(user, domain)` blob with a server `updated_at` + a
  **`409 server-newer`** for the rare two-device case.
- `GET /api/backup/blob?domain=<domain>` / `PUT /api/backup/blob?domain=<domain>` carrying the
  **`{format, state}` envelope verbatim** — **`domain` is a query param, not a path segment**
  (`domain` ∈ garage|tracks|logbook|reports|account, plus `sheets:{carId}`). *(As built —
  `server/src/handlers/backupBlob.ts`: GET → `{domain, format, state, updated_at, server_time}`,
  PUT → `{domain, updated_at, server_time}` with a `409 server_newer` optimistic-concurrency
  conflict.)*
- **Idempotent / dedup'd** writes (a flaky reconnect must not double-apply outbox items).
- **Owner-scoped (RLS):** every backup/account/media/entitlement resource is strictly
  scoped to the token's user; validate `{carId}` belongs to the caller (avoid IDOR). The
  public library is the *only* intentionally cross-user-readable surface.
- **Per-entity reconciliation is explicitly V2** (D11) — do not build it now.

### P1 — Share link + fork/import  *(D10 — this is all of "social" for V1.0)*
- `POST /share/publish` (a `TrackEntity` or a `SetupVersion`+sheet) → creates an **immutable
  server-side snapshot** (D11) + renders artifacts (P1 render) + returns an **unlisted share
  URL**.
- Public, **auth-free** `GET /s/{token}` → a static page embedding the rendered PDF/PNG + an
  install CTA (social spec §5: anything public must be servable without auth).
- `POST /share/{token}/import` → forks the snapshot into the caller's garage (record
  `forked_from` lineage for the future DAG).
- **Not in V1.0:** public browse/search API, discovery feed, profiles, follows, comments,
  leaderboards → V1.1+ (see P3). Keep the `visibility` enum but only `unlisted` share is wired.

### P1 — Official-track candidacy + admin console  *(D25 public library, **admin-curated**; designed-only)*
The app's offline half ships now (submit → outbox + "Pending review" badge; stubbed Official
Tracks browser). The hosted half below is **design**, not a V1.0 build. This is D25's "public
library when sync ships" made concrete as an **admin-curated** library (2026-06-14). It stays
inside D10 (it's a curated submit + a gated read, **not** a public browse/discovery API) and
D11 (the candidate is a publish-time snapshot in the append-only outbox; approval is a one-way
server→client reflection, never live replication). Social spec §6.

- `POST /tracks/candidacy` → submit a **`TrackEntity` snapshot** (full envelope, photos as
  media refs, **EXIF GPS stripped** per P0.5) as a candidate. **Idempotent / dedup'd** like
  every outbox write (P1 backup) — a flaky reconnect must not double-submit. Returns the
  candidacy id + `state: "candidate"`. Owner-scoped: the submitter is recorded but the
  candidate is a frozen copy, decoupled from their still-editable local track.
- **Candidacy state machine** mirrors `packages/social` `CandidacyState`:
  `none → candidate → official | rejected`. `none` = ordinary private track; `candidate` =
  submitted/under review; `official` = approved into the library; `rejected` = declined
  (optional reason). **Past `candidate` is server-authoritative** — the client never
  self-promotes; outcomes are reflected to the app on the next sync (reuse the backup read
  path; no bidirectional track sync, D11).
- **Curator review queue + admin console** (not a public surface): list pending candidates;
  **dedup/merge by GPS proximity + name similarity** (the same physical track is submitted by
  many drivers — propose likely duplicates, and let *approve-as-merge* fold a candidate's lap
  records into an existing official venue rather than create a parallel entry, so there's one
  canonical venue per real-world track); approve → `official`, reject → `rejected`. This human
  gate is the **track-data analogue of the UGC moderation** comments will need in V1.1 (P3).
- `GET /tracks/official?near={lat,lon}&surface=` → approved venues only (geo + surface
  filter). Auth-free is acceptable here as a *curated, read-only* surface (still not the
  arbitrary public browse API D10 defers); paginate; serve photos as media refs.
- `GET /tracks/official/{id}/leaderboard?category=&conditions=` → aggregated `LapRecord`s +
  run results across users, bucketed by **category + conditions**, **gated at n ≥ 8** per
  bucket (social spec §5 anti-deanonymization — hide buckets below the threshold, don't show a
  thin list). Read-only aggregate computed server-side; `driverStats()` already does the
  per-driver client-side numbers. **No advice on the server (D18)** — a leaderboard is timing
  data, not a recommendation.
- **Moderation / takedown / tombstones:** a curator can **unpublish/takedown** an official
  venue (bad data, dispute, abuse); deletes use **tombstones, not hard cascades** (P2 GDPR) so
  merged lineage and other users' contributed records survive; on `DELETE /me`, anonymize the
  submitter on official venues / leaderboard entries (P2) — the venue and its aggregate
  outlive any one account. Contact info for takedown requests is published (Apple UGC, P3).

### P1 — PDF / PNG render pipeline  *(D12)*
- Server-side render **job**: **fill, never redraw** — AcroForm field fill where the
  manufacturer blank has form fields (MP11: 51 text + 49 checkbox, verified), else
  coordinate overlay-stamping; per-chassis `pdf_map` field-name mapping; generic RaceLab
  layout as fallback. Also render **PNG share cards** (run / podium).
- Artifacts written to blob storage **at publish time** (snapshot), not per view; served by
  the auth-free share page above. Document where `pdf_map`s live (seeded from the SETUP_RC
  MP11 work, §5 prior art).

### P2 — Reference data & KB content delivery  *(D13/D18-safe)*
Serve + version what's bundled today (`rcdata.json`; `packages/kb/bundle.json`) so content
updates without an app release — **the on-device baseline always ships as the floor**.

- `GET /content/rcdata` and `GET /content/kb` return a **signed manifest** (version +
  content hash + signature). The app **verifies the signature against a pinned key + the
  hash** before trusting/caching; else keeps last-known-good or the in-app baseline.
- **Version the bundle FORMAT**; the app **rejects a bundle whose format it can't parse**
  (engine packages own migrations — never silently consume a newer format). HTTPS only;
  **monotonic version cursor** so a downgrade can't push an older/worse KB.
- **High-leverage gap:** wire `docs/research/rc-setup-fields.json` (16 category groups, ~900
  fields) into served per-category chassis templates so sheets match each car's
  category/scale/motorisation (today only MP11 + generic-offroad ship).

### P2 — Privacy & compliance (GDPR)  *(D17 — store-rejection + legal blocker)*
- `GET /me/export` → async job producing an archive of all the user's domain blobs + media +
  billing history.
- `DELETE /me` → hard-delete personal data, **tombstones (not hard cascades)** for
  published/forked content so fork lineage survives; anonymize published tracks/setups /
  leaderboard entries; delete the Stripe customer; define retention windows.
- Privacy-policy endpoint the in-app "Data & privacy" screen links to. **PII redaction in
  logs** (no emails/tokens).

### P2 — Speedhive integration  *(D31 — deferred; build with these guardrails)*
Today client-side, mock on. D31: the official MYLAPS path is a registered app + OAuth2. The
researched **practice-api** path works but is unsanctioned — handle with care.

- `POST /speedhive/link { transponder }`; `GET /speedhive/sessions?since=` → `SpeedhiveSession[]`.
- If server-side polling: **low, adaptive cadence** (only active users; back off to daily for
  idle), centralized rate-limit + jitter + circuit breaker, send the required `Origin`
  header, **degrade to client-pull** on 401/throttle (keep the mock/null fallback). Email
  support.speedhive@mylaps.com for partner access before commercial scale.
- **Caveat:** second-hand transponders → identity mismatch; **never auto-import without user
  confirmation.**

### P2 — Push notifications
- `POST /api/push/token` + `DELETE /api/push/token` tied to a **device id** (many per user); process
  Expo **receipts** and prune `DeviceNotRegistered`; gate each trigger on a **per-user
  preference + marketing consent** (the trial-ending nudge is marketing — GDPR); quiet-hours
  / dedup. Constrain types to: Speedhive new-run, trial-ending, and the 2 social types in
  the social spec §1.3.

### P3 — Social V1.1+  *(after launch; D10 phasing)*
Profiles, follows, props, comments, public discovery, **leaderboards** by track + category
(`driverStats()` already computes career/yearly/podiums/wins client-side; the server
aggregates cross-user). The per-venue leaderboard is specced with the official-track candidacy
(P1 candidacy / social spec §6) since it hangs off an approved venue; the V1.1 work here adds
the *driver-facing* discovery, profile and following surfaces around it. **Hard
requirements:** UGC moderation (Apple 1.2 — content filter + **report** + **block user** +
admin takedown + published contact info) — the curator review queue (P1 candidacy) is the same
moderation gate applied to track data — and **n ≥ 8** sample size on any publicly shown
aggregate so small clubs aren't deanonymizable (social spec §5).

> **The app already ships the offline half of this** (D32 + design doc
> `docs/superpowers/specs/2026-06-14-driver-profiles-social-home-design.md`): your own
> `DriverProfile` is real and local (on the account); follow state is local (`FollowData`);
> the **feed, discover and others' profiles are a deterministic mock** behind
> `apps/mobile/src/socialnet.ts` (`SOCIAL_MOCK = true`, mirroring `speedhive.ts`). The
> endpoints below are what `socialnet.ts` swaps to when the backend lands — same shapes, same
> call sites (`fetchFeed` / `fetchDiscover` / `fetchProfile`), one flag flipped. **Mirror the
> `packages/social` types field-for-field** (`DriverProfile`, `FeedItem`, `FollowData`, and
> the existing `SharedPayload` a `shared_setup` item carries — §4).

#### P3 endpoints (the V1.1 driver-facing social API)

All authed (`Bearer`) except where noted; owner-scoped (RLS) for `/me/*`; paginate every list.

- **`GET /me/profile`** → the caller's own `DriverProfile`. **`PUT /me/profile`** ← a
  `DriverProfile` (handle, display_name, avatar as a **media ref** per P0.5, level, country,
  home_track, classes; `career` is **server-derived/read-only** — the client never writes it).
  The `handle` is the canonical identity for shares and attribution; enforce **uniqueness +
  format** (slug, reserved-name blocklist) and treat a handle change as a rename (old handle
  302s for a grace window). Today these fields live on `accountstore.Account` and back up via
  `PUT /backup/account`; promoting to a first-class profile resource is the V1.1 step that
  makes them *publicly readable* by handle.
- **`GET /profiles/{handle}`** → another driver's **public** `DriverProfile` (auth-free is
  acceptable — public profiles are a curated read surface, social spec §5 "anything public is
  servable without auth"). Honor that user's privacy toggles (profile/garage/results public
  flags, social spec §1.3) and the caller's **block** list (a blocked user's profile is hidden,
  P3 moderation). 404 on private/blocked rather than leaking existence.
- **`POST /follow/{handle}`** / **`DELETE /follow/{handle}`** → add/remove a follow edge for
  the caller. **Idempotent** (re-follow is a no-op, like the client's `follow()` returning the
  same ref when already present); mirrors the local `FollowData.handles[]`. On the wire the
  client reconciles its local `FollowData` with the server set; `GET /me/follows` →
  `{ handles: string[] }` for restore. Following triggers the chassis-scoped notification in
  social spec §1.3 (gated on the followee's privacy + the follower's push prefs, P2 push).
- **`GET /feed`** → activity from **followed** drivers as a paginated `FeedItem[]`
  (`kind: "shared_setup" | "result"`, newest first, cursor-paginated). A `shared_setup` item
  carries a real **`SharedPayload`** (forkable client-side via the existing import/diff flow —
  it reuses `POST /share/{token}/import` lineage); a `result` item carries the public run
  result summary (`track_name`, `position`, `entrants`, `best_lap_s`, `car`). Server filters by
  the caller's follow set + block list + each author's visibility flags; **never** include
  private setups or results the author kept private. Read-only aggregate of others' published
  content — **no advice, ever (D18)**: the feed ships setups and times, not recommendations.
- **`GET /discover`** → a paginated list of **suggested** `DriverProfile`s to follow (e.g. fast
  local drivers, same home_track/classes, founding creators — social spec §4 cold-start).
  Excludes already-followed + blocked + self. Ranking is server-side and **not** advice (D18) —
  it's a people-suggestion surface, not a setup recommendation.

**Moderation gate (reiterated — Apple UGC 1.2).** The endpoints above ship *read* surfaces for
profiles/feed/discover. **The moment props (🔧 Dialed / 🚀 Send it / 💥 Tough break) and
comments ship** (social spec §1.4), the full UGC obligation attaches and is a hard launch gate
for that slice: **content filtering + report button + block user** (hides their content,
prevents interaction — also enforced on `/profiles/{handle}`, `/feed`, `/discover` above) **+
author-deletes-on-own-setup + admin takedown tools + published contact info**. This is the same
human-in-the-loop gate the curator review queue (P1 candidacy) applies to track data. And
**`n ≥ 8`** still gates **any public aggregate** (career roll-ups across users, leaderboards,
fork/prop counts shown publicly) so small clubs aren't deanonymizable (social spec §5).

### Cross-cutting — Observability
Structured request logging with correlation ids, error tracking (Sentry), `/healthz`, and
alerts on the high-risk integrations: Speedhive non-200 rate (esp. the 401 Origin gate),
Stripe webhook signature/processing failures, auth-failure spikes, backup `409`/error rates.
PII-redacted logs.

---

## 3 · What NOT to build

- ❌ Engine/advice on the server (D18). No setup-recommendation endpoint. The advisor is
  free + on-device; entitlement never gates it.
- ❌ Bidirectional per-entity sync in V1 (D11) — backup/restore + outbox only.
- ❌ Public browse API / web app / comments in V1.0 (D10) — unlisted share link + fork only.
- ❌ In-app purchases (D29) — web Stripe only.
- ❌ Server-side format migration — store the `{format, state}` envelope opaquely.

---

## 4 · Exact data contracts (match these field-for-field)

Live TypeScript shapes the app persists. `id`/`created_at` are **client-generated**; add a
server `updated_at` for backup. **Wire note:** `photo_uri`/`photo_uris` are local device URIs
on the client — on the wire they become media references (see P0.5).

```ts
// account — apps/mobile/src/accountstore.ts (plain JSON)
type ExperienceLevel = "beginner" | "club" | "regional" | "pro";
type Lang = "en" | "fr"; type Units = "metric" | "imperial";
interface Account {
  email?: string; age?: number; country?: string;
  level?: ExperienceLevel;
  trial_started_at?: string;        // ISO — becomes SERVER-owned
  onboarded: boolean;
  prefs?: { lang?: Lang; units?: Units };
}
const PRICING = { monthly_eur: 9.99, annual_eur: 99.99, trial_days: 15 };

// garage — packages/garage  (envelope format 2)
type PowerType = "nitro" | "electric";
interface CarEntity {
  id: string; name: string; template_id: string;
  brand: string; model: string; category: string; scale: string;
  drivetrain?: "4wd" | "2wd"; power: PowerType;
  engine?: string; motor?: string; esc?: string; battery?: string;
  weight_g?: number;                // legacy, no longer entered in the UI
  options?: string;
  fuel_tank_cl?: number;            // centiliters — the pilot unit
  fuel_tank_cc?: number;            // @deprecated, migration only
  transponder?: string;             // Speedhive chip
  photo_uri?: string;               // local URI client-side → media ref on the wire
  notes?: string; created_at: string;
}

// tracks — packages/tracks  (envelope format 2)
type TrackVisibility = "private" | "public";   // V1.0 wires unlisted-share only (D10)
interface CornerSpec {
  n: number; name?: string;
  direction: "left" | "right";
  shape?: "hairpin"|"ninety"|"sweeper"|"chicane"|"kink"|"esses";
  features: ("bump"|"dip"|"kerb"|"slope_up"|"slope_down"|"off_camber"|"banked"|"jump"|"rut")[];
  surface?: string; note?: string;
}
interface LapRecord { category: string; conditions?: string; lap_s: number; holder?: string; date?: string; }
interface TrackEntity {
  id: string; name: string;
  surface: string; surfaces?: string[];   // surface = primary = surfaces[0] (engine reads surface)
  indoor: boolean; visibility: TrackVisibility;
  gps?: { lat: number; lon: number };
  length_m?: number; width_m?: number;     // legacy, not entered in the UI
  traits: string[]; corners: CornerSpec[];
  notes?: string; photo_uris?: string[];   // local URIs client-side → media refs on the wire
  records: LapRecord[]; created_at: string;
}

// run log — packages/logbook  (envelope format 2)
interface RunEntry {
  id: string; created_at: string;
  type: "practice" | "qualifier" | "main";
  car_template_id: string; car_id?: string;
  setup_version_id: string; setup_name: string;
  track_id?: string;
  track: { name: string; surface: string; indoor: boolean; layout?: string };
  conditions: {
    grip: "green"|"medium"|"high"|"blue_groove";
    bumpiness?: "smooth"|"medium"|"rough"; dusty?: boolean;
    sky?: "sunny"|"cloudy"|"rain_risk"|"raining";
    evolution?: "improving"|"stable"|"degrading";
    air_temp_c?: number; track_temp_c?: number; humidity_pct?: number;
    wind_kmh?: number; pressure_hpa?: number; sun_pct?: number;   // sun_pct 0–100
  };
  tyres?: { brand?: string; compound?: string; insert?: string; sauce?: string;
            wear?: "new"|"light"|"medium"|"worn"; run_count?: number };
  result?: {
    best_lap_s?: number; avg_lap_s?: number; consistency_pct?: number;  // consistency 0–100
    laps?: number; position?: number; entrants?: number; mistakes?: number;
    driver_confidence?: number;            // 1–5
    traffic?: "clear"|"some"|"heavy"; tyre_state_after?: string;
    laps_list?: number[]; fuel_used_cc?: number;
    autonomy_test?: { time_s?: number; laps?: number };   // feeds pit strategy
  };
  feedback: { tags: { symptom: string; phase?: string; evolution?: string }[];
              text?: string; corner_notes?: { corner: number; note: string }[] };
  note?: string; outcome?: "better"|"same"|"worse";
  feeling?: number;          // 0–100 driver-feel slider
  fatigue?: number;          // 1 (fresh) … 5 (exhausted)
  duration_min?: number;     // session length
}

// setup sheets — packages/sheets  (envelope format 1, one per car)
type SetupValues = Record<string, string | number>;
interface SetupVersion { id: string; name: string; parent_id: string | null; template_id: string; values: SetupValues; created_at: string; locked: boolean; note?: string; }
interface SheetsState { template_id: string; versions: SetupVersion[]; draft: SetupValues; draft_base_id: string; draft_name: string; starred: string[]; }

// engineer history — apps/mobile/src/reportstore.ts (plain JSON)
interface SavedReport {
  id: string; created_at: string;
  kind: "report" | "race_plan" | "strategy";
  run_ids: string[]; run_label: string; notes?: string;
  report?: EngineerReport; plan?: RacePlan; strategy?: PitPlan;  // engine/strategy output shapes
}

// speedhive — apps/mobile/src/speedhive.ts
interface SpeedhiveSession { id: string; date_iso: string; location?: string; best_lap_s?: number; avg_lap_s?: number; laps?: number[]; }

// social V1.1 — packages/social (P3 endpoints mirror these field-for-field; design doc
// docs/superpowers/specs/2026-06-14-driver-profiles-social-home-design.md). avatar_uri is a
// local URI client-side → media ref on the wire (P0.5). career is SERVER-derived/read-only.
interface DriverProfile {
  handle: string; display_name?: string; avatar_uri?: string;
  level?: "beginner"|"club"|"regional"|"pro"; country?: string;
  home_track?: string; classes?: string[];
  career?: { runs: number; races: number; podiums: number; wins: number; best_lap_s?: number; best_lap_track?: string };
}
type FeedItemKind = "shared_setup" | "result";
interface FeedItem {
  id: string; kind: FeedItemKind; created_at: string;
  author: { handle: string; avatar_uri?: string; level?: string };
  payload?: SharedPayload;   // shared_setup → forkable (reuses the share/import lineage)
  result?: { track_name: string; position?: number; entrants?: number; best_lap_s?: number; car?: string };
  text?: string;
}
interface FollowData { handles: string[]; }   // serialized {format:1,state}; GET /me/follows restore
```

*(Contracts verified field-for-field against source 2026-06-13. Storage keys + all four
envelope format versions in §1 are confirmed correct.)*

---

## 5 · Suggested sequencing (decision-aligned)

1. **P0 auth + entitlement + blob storage** — unblocks the business model and is the
   prerequisite for any photo to survive backup.
2. **P1 backup/restore (outbox)** — protects user data; per-user JSON blobs, trivial schema.
3. **P1 share-link + fork + render (D12)** — the V1.0 "social" growth loop (no public API).
   *(Official-track candidacy + admin console + leaderboard is designed alongside this but
   is post-V1.0 — the app's offline submit/outbox half ships now; the hosted half lands with
   the backend.)*
4. **P2 content delivery** (signed bundles) → then wire `rc-setup-fields.json`.
5. **P2 GDPR export/delete** (needed for store submission, D17) + **observability**.
6. **P2 Speedhive** (when API access is sorted, D31) + **push**.
7. **P3 social V1.1+** (profiles/follows/comments/discovery/leaderboards + UGC moderation).

Data is small (per-user JSON blobs + a shared snapshot table + blobs). **Supabase** fits
cleanly (Auth + RLS'd Postgres + Storage in one); your call.

---

## 6 · Open questions for you

- **Auth**: custom JWT or a provider (Supabase Auth / Clerk — gets you reset/verify/rate-limit free)?
- **Backup granularity**: whole-domain blobs (simplest, D11-aligned) confirmed for V1?
- **Offline entitlement grace**: how many days can the app trust a stale "active" with no
  signal? (proposed ~7 days to cover a race weekend — your call.)
- **Pricing**: 9.99 €/99.99 € VAT-inclusive or -exclusive? (D29 sign-off.)
- **Speedhive**: pursue MYLAPS partner/OAuth access (D31), or ship manual-laps-only for V1?

*Generated 2026-06-13 from the live frontend contracts + the decisions log; hardened by an adversarial backend review.*
