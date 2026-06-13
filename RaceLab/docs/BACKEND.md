# RaceLab — Backend Build Spec (for William)

> What the backend must provide to match where the **frontend** now stands
> (`theo/racelab` @ `fd07475`). Every data contract here is copied from the
> packages the app actually persists, so your API can match it field-for-field.
> Companion to `docs/FEATURES.md` (the frontend feature list).

---

## 0 · The one rule that shapes the whole backend — D18

**The race-engineer advice is 100% deterministic and computed ON-DEVICE. The backend
is NEVER on the advice path.** There is no `/advise`, `/report`, `/strategy-compute`
endpoint — ever. The engine (`packages/engine`) runs locally from a KB rule bundle.

The backend exists for everything *around* the advice: **identity, money, sync, the
shared track library, integrations (Speedhive), content delivery, push, social.** The
KB rules and chassis templates may be *served as data* and cached on-device (so content
updates ship without an app release) — but the computation stays local. Serving data ≠
computing advice; D18 holds.

Two more guardrails:
- **No in-app purchases.** Subscriptions are taken on the web (griplab.app) to skip the
  ~30% store cut — that is the entire reason accounts are web-first.
- **Don't migrate data formats server-side.** The client packages own format migrations
  (garage v2, tracks v2, logbook v2, sheets v1). Store the `{format, state}` envelope
  opaquely; let the app migrate on read, or you fork the migration logic.

---

## 1 · Where the frontend is today (your starting point)

- **100% local.** Everything is in AsyncStorage. The only network calls are weather
  (Open-Meteo, keyless) and Speedhive (behind a `SPEEDHIVE_MOCK = true` flag).
- **No real auth, no real billing.** `accountstore` holds the profile + a *local-only*
  `trialDaysLeft()` countdown. Nothing enforces expiry; nothing logs in.
- **Data is per-domain JSON blobs**, each wrapped in a `{ format, state }` envelope,
  each with corrupt-safe `:backup` on read. Entities carry stable client-generated
  `id`s and `created_at`.

| Domain | AsyncStorage key | Envelope format | Package |
|---|---|---|---|
| Garage (cars) | `racelab:garage` | 2 | `packages/garage` |
| Tracks | `racelab:tracks` | 2 | `packages/tracks` |
| Run log | `racelab:logbook` | 2 | `packages/logbook` |
| Setup sheets (per car) | `racelab:sheets:car:{carId}` | 1 | `packages/sheets` |
| Engineer reports | `racelab:engineer-reports` | (plain JSON) | `apps/.../reportstore` |
| Account | `racelab:account` | (plain JSON) | `apps/.../accountstore` |
| Speedhive cursor | `racelab:speedhive:last_check` | (ISO string) | `App.tsx` |

---

## 2 · What to build, in priority order

### P0 — Identity & accounts
The business model is blocked on this. Web signup on **griplab.app**; the app needs a
login that returns a token it sends as `Bearer`.

- `POST /auth/signup` *(web form on griplab.app)* — email + password (or magic link).
- `POST /auth/login` → `{ token, account }`.
- `GET /me` → the account. `PATCH /me` → update profile/prefs.
- Account model **must match `accountstore.Account`** (see §4) so the app can hydrate it.
- App-side: store the token, attach `Authorization: Bearer`, fall back to the local
  account when offline (the app must work at the track with no signal).

### P0 — Subscription, trial & entitlement
Move the source of truth for trial/subscription **off the device** (today it's local math).

- **Stripe Checkout on the web** (griplab.app). No StoreKit/Play Billing.
- Pricing (**D29**, pending your final OK): `9.99 €/mo`, `99.99 €/yr`, **15-day trial**.
- `GET /entitlement` → `{ status: "trial"|"active"|"expired"|"none", trial_ends_at?, plan?, current_period_end? }`.
- Stripe **webhook** handler → updates entitlement.
- Entitlement must be **cacheable offline** (signed token, short TTL) so the app can gate
  premium features (engineer / planner / strategy) without signal. *Today nothing locks at
  expiry — the app shows a countdown but never blocks; the backend becomes the gate.*

### P1 — Cloud sync & backup
Mirror each per-user domain blob. The app already namespaces and versions them.

- `GET /sync/{domain}` / `PUT /sync/{domain}` carrying the **`{ format, state }` envelope**
  verbatim (`domain` ∈ garage | tracks | logbook | reports | account, plus
  `sheets/{carId}` per car).
- **Conflict model:** last-write-wins on a whole blob will lose data when two devices edit
  different cars. Recommended: add a server `updated_at` per entity and reconcile by entity
  `id` (every entity already has a stable `id` + `created_at` — just add `updated_at`). If
  you start blob-level, key it by `(user, domain)` with an `updated_at` + a "server is
  newer" 409 so the client can merge.
- Store envelopes **opaquely** — do not parse/migrate them server-side (D18 guardrail #3).

### P1 — Public track library ("Strava of RC" foundation)
`TrackEntity.visibility` is already `private | public`; publishing should push public tracks
to a shared, searchable library.

- `POST /tracks/publish` (a `TrackEntity`), `GET /tracks/library?q=&surface=&near={lat,lon}`,
  `POST /tracks/library/{id}/import` → copies it into the caller's garage.
- **Dedup/moderation:** the same venue gets submitted many times — cluster by GPS + name,
  let users contribute corners/records to a canonical track.
- Lap records (`LapRecord[]`) become the seed for **per-track leaderboards** (see P3).

### P1 — Speedhive integration (server-side)
Today the client calls `practice-api.speedhive.com` directly with the mock flag on. Move it
server-side to kill the CORS/rate-limit fragility and enable push.

- `POST /speedhive/link { transponder }` — store the link (per car/user).
- `GET /speedhive/sessions?since=` → `SpeedhiveSession[]` (see §4).
- **Server-side poll + push** so "new run detected" works when the app is closed (the app
  currently only checks on launch and surfaces *one* session).
- Findings + working endpoints are in `docs/research/speedhive-api.md` (public practice API,
  gated on an `Origin` header). Once this is live, flip the client `SPEEDHIVE_MOCK` off.

### P2 — Reference data & KB content delivery (D18-safe)
Today bundled in the app: `rcdata.json` (autofill) and `packages/kb/bundle.json` (engine
rules + chassis templates). Serve + version them so content updates without an app release.

- `GET /content/rcdata?since={version}` → autofill datasets (brands/models/surfaces/tires/oils).
- `GET /content/kb?since={version}` → the KB bundle (rules + chassis templates). The app
  fetches the **data**, caches it, and still computes advice locally → **D18 intact**.
- **Biggest content gap:** `docs/research/rc-setup-fields.json` (16 category groups, ~900
  fields) is researched but *not wired* — the app ships only MP11 + generic-offroad templates.
  Serving per-category chassis templates from here makes setup sheets match each car's
  category/scale/motorisation. High leverage.
- Everything here must be **cache-first / offline** (ETag or version cursor; app keeps a
  last-known-good copy).

### P2 — Push notifications
- Expo push tokens: `POST /push/register { expo_token }`.
- Triggers: Speedhive new-run, trial-ending nudge, friend activity.

### P3 — Social / sharing (the Strava layer)
- Share cards (run / podium), friends, **leaderboards** by track + category.
- `driverStats()` already computes career/yearly/podiums/wins **client-side**; the backend
  aggregates across users for leaderboards and friend feeds.

---

## 3 · What NOT to build (so we don't break the product)

- ❌ No engine/advice on the server (D18). No setup-recommendation endpoint.
- ❌ No in-app purchases — web Stripe only (store-cut avoidance).
- ❌ No server-side format migration — store the `{format, state}` envelope opaquely.

---

## 4 · Exact data contracts (match these field-for-field)

These are the live TypeScript shapes the app persists. Mirror them in your schema. All
`id`/`created_at` are **client-generated**; add a server `updated_at` for sync.

```ts
// account — apps/mobile/src/accountstore.ts (plain JSON)
type ExperienceLevel = "beginner" | "club" | "regional" | "pro";
type Lang = "en" | "fr";
type Units = "metric" | "imperial";
interface Account {
  email?: string; age?: number; country?: string;
  level?: ExperienceLevel;
  trial_started_at?: string;        // ISO — becomes server-owned
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
  photo_uri?: string; notes?: string; created_at: string;
}

// tracks — packages/tracks  (envelope format 2)
type TrackVisibility = "private" | "public";
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
  surface: string; surfaces?: string[];   // surface = primary = surfaces[0]
  indoor: boolean; visibility: TrackVisibility;
  gps?: { lat: number; lon: number };
  length_m?: number; width_m?: number;     // legacy, not entered in the UI
  traits: string[]; corners: CornerSpec[];
  notes?: string; photo_uris?: string[];
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
    wind_kmh?: number; pressure_hpa?: number; sun_pct?: number;
  };
  tyres?: { brand?: string; compound?: string; insert?: string; sauce?: string; wear?: string; run_count?: number };
  result?: {
    best_lap_s?: number; avg_lap_s?: number; consistency_pct?: number;
    laps?: number; position?: number; entrants?: number; mistakes?: number;
    driver_confidence?: number; traffic?: string; tyre_state_after?: string;
    laps_list?: number[]; fuel_used_cc?: number;
    autonomy_test?: { time_s?: number; laps?: number };   // feeds pit strategy
  };
  feedback: { tags: { symptom: string; phase?: string; evolution?: string }[]; text?: string; corner_notes?: { corner: number; note: string }[] };
  note?: string; outcome?: "better"|"same"|"worse";
  feeling?: number;          // 0–100 driver-feel slider
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
```

---

## 5 · Suggested sequencing

1. **P0 auth + entitlement** — unblocks the whole business model; small surface (a user
   table + Stripe webhook).
2. **P1 sync** — protects user data; mostly per-user JSON blobs, trivial schema.
3. **P1 Speedhive + track library** — the features that need a server to shine.
4. **P2 content delivery** — then wire `rc-setup-fields.json` into served KB templates.
5. **P2 push, P3 social** — once there's a user base.

The data is small (per-user JSON + one shared track table) — a Postgres + a thin API (or
Supabase, which gives you auth + row-level-secured tables + storage in one) fits cleanly.
Your call on the stack.

---

## 6 · Open questions for you

- **Auth**: custom JWT, or a provider (Supabase Auth / Clerk)?
- **Sync granularity**: whole-domain blobs (simplest) vs per-entity (safer for multi-device)?
- **Speedhive**: server-poll + push, or keep the client pulling on launch for v1?
- **Entitlement caching**: signed offline token TTL — how long can the app trust a stale
  "active" before forcing a re-check?

*Generated 2026-06-13 from the live frontend contracts on `theo/racelab`.*
