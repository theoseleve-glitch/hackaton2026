# Social layer ("Strava of RC") — design

> Approved 2026-06-14. Builds the offline-first social slice now; designs the hosted
> parts for William's backend. Grounded in `05_SOCIAL_SPEC.md` + decisions D10/D11/D25.

## Goal

Setup sharing + official-track candidacy + (designed-only) the social network, the #2
differentiator. **Utility first, social wraps utility.** Real hosted sharing needs the
backend (not built) — so this session ships everything that works with **zero server**, and
specs the rest.

## Decisions reconciled

- **D10** — V1.0 social = unlisted share-link + fork/import only; profiles/follows/comments
  are V1.1. We honor this: build share + fork now; design the rest.
- **D11** — no bidirectional sync; publishing = server snapshot at publish time. Our share
  payload IS a self-contained snapshot; the candidacy submit writes a local outbox entry.
- **D25** — tracks are first-class with a public library "when sync ships". Official-track
  candidacy is that library, **admin-curated** (user choice, 2026-06-14).
- **D18** — unaffected; sharing is data transport, never the advice path.

## Resolved questions

- **Transports**: all four — deep link, QR, `.griplab` file, PNG share card (the
  Strava/IG-style "post your setup" artifact).
- **Import target**: pick an existing same-`template_id` car to fork onto; **auto-create a
  car from the snapshot typology as fallback**. Cross-template/version forks blocked with a
  clear message (spec §1.2).
- **Candidacy**: admin-curated — submit → `candidate` (local, queued) → curator approves →
  `official`/`rejected` (reflected on sync). Admin console = backend/design.

## Expo Go constraint (load-bearing)

The app runs in **Expo Go SDK 56** — only libraries bundled in Expo Go work (no custom
native). Therefore:
- Deep link → `expo-linking` (built-in) + a `scheme` in app.json.
- QR generate → `react-native-qrcode-svg` (JS-only, renders via `react-native-svg`, bundled).
- QR scan → `expo-camera` (bundled, supports barcode scanning).
- PNG card → render as **`react-native-svg`** and capture via the SVG ref's `toDataURL()`
  (NO `react-native-view-shot` — it's not in Expo Go). Save via `expo-file-system`, share via
  `expo-sharing`.
- File `.griplab` → `expo-file-system` write + `expo-sharing`.
- Install with `npx expo install` so versions match the SDK.

## Architecture

### `packages/social` (new, pure — no IO, tested)
- `src/types.ts` — `SharedPayload` (the snapshot), `TrackCandidacy`, `CandidacyState`.
- `src/share.ts` — `buildSetupPayload(...)`, `serializePayload(p): string` (compact,
  versioned, base64url-safe), `deserializePayload(raw): Result` (corrupt-safe, version
  switch), `payloadToLink(p)`/`linkToPayload(url)` (the `griplab://import?d=` scheme).
- `src/candidacy.ts` — state machine `none → candidate → official | rejected`,
  `submitCandidacy(state, trackId, now)`, pure transitions, outbox helper shape.
- `src/lineage.ts` — `forkProvenance(payload)` → the `forked_from` chain helpers.
- `src/index.ts`, `src/test-social.ts`. package.json/tsconfig copied from `packages/logbook`.

```ts
interface SharedPayload {
  v: 1; kind: "setup"; id: string; created_at: string;
  setup: { name: string; template_id: string; values: Record<string,string|number> };
  car: { brand: string; model: string; category: string; scale: string; power: "nitro"|"electric" };
  context?: {
    track_name?: string; surface?: string; grip?: string; date?: string;
    weather?: { air_temp_c?: number; humidity_pct?: number; wind_kmh?: number };
    result?: { position?: number; entrants?: number; best_lap_s?: number };
  };
  comment?: string; author?: { handle?: string }; forked_from?: string;
}
type CandidacyState = "none" | "candidate" | "official" | "rejected";
interface TrackCandidacy { track_id: string; state: CandidacyState; submitted_at?: string; }
```

### App layer (`apps/mobile/src`)
- `share.ts` — IO wrapper: `shareViaLink`, `shareViaFile`, `shareCardPng(svgRef)`,
  `openImportFromUrl` (Linking handler), `qrPayload`. Uses the packages/social serializers.
- `components/ShareSheet.tsx` — transport picker (Link · QR · File · Card) over a payload.
- `components/ShareCard.tsx` — the react-native-svg poster (setup + conditions + result +
  watermark), exposes a ref for `toDataURL()`.
- `components/QrScanner.tsx` — expo-camera barcode scanner → payload → Import.
- `screens/ImportPreviewScreen.tsx` — shows the snapshot, car picker (same-template) /
  create-fallback, diff vs current sheet (`packages/sheets` `diffValues`), Fork button.
- `candidacystore.ts` — persists `TrackCandidacy[]` + outbox; `submit`, reflects sync.
- `screens/OfficialTracksScreen.tsx` — browse official tracks + per-track leaderboard view
  (`LapRecord[]` aggregated; **n≥8 gated**); stubbed/local until backend.
- Wiring: a Share action on a setup version (Sheet detail) and on a run (Runs); a "Submit as
  official" action on a track (TrackForm/TracksScreen); deep-link handler in App.tsx; the
  `scheme` in app.json.

## Flows

1. **Share a setup**: Sheet detail / run → Share → ShareSheet → pick Link/QR/File/Card.
   Link/file/QR carry `SharedPayload`; card is an image.
2. **Import/fork**: tap `griplab://import?d=…` (or scan QR, or open `.griplab`) → App routes
   to ImportPreview → pick same-template car (or create) → see diff → Fork (provenance kept).
3. **Submit official track**: track → "Submit as official" → `candidate` + outbox + "Pending
   review" badge. Backend curator later → `official`/`rejected`.
4. **Official Tracks**: browse approved venues; tap one → leaderboard (n≥8 gated). Stub now.

## Design-only (backend, into BACKEND.md + 05_SOCIAL_SPEC.md)

- Hosted share page `griplab.app/s/<id>` (PDF/PNG embed + install CTA) — the deep link
  upgrades to this URL when live.
- Public library + search (chassis → track → conditions → recency/popularity).
- **Admin-curated candidacy**: `POST /tracks/candidacy`, curator review queue + admin
  console, GPS+name dedup/merge, `official`/`rejected` transitions pushed back to the app.
- Results/leaderboard aggregation across users, **n≥8** for any public aggregate.
- V1.1 social: profiles, follows, props 🔧🚀💥, threaded comments + the mandatory Apple-UGC
  moderation (filter + report + block + takedown + published contact).

## Build order (this session)

1. `packages/social` (+ tests, all green).
2. Deep-link share + ImportPreview + fork loop (end-to-end, no extra render deps).
3. PNG share card (react-native-svg `toDataURL`).
4. QR show + scan.
5. `.griplab` file export.
6. Candidacy submit + Official Tracks (stub).
7. Docs: extend `05_SOCIAL_SPEC.md` + `BACKEND.md` with the hosted/admin design.

## Out of scope

Hosted web pages, public discovery API, real leaderboard data, profiles/follows/comments,
the admin console — all designed, none built (need the backend).
