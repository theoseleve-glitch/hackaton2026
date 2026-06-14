# Driver profiles + social home — design

> Approved 2026-06-14. Continues the social layer (D32). Builds the full social home
> with a mock feed now; real feed/follow/others'-profiles need William's backend.

## Goal

Driver profiles + a social home (feed, discover, you), the V1.1 social layer from
`05_SOCIAL_SPEC.md` §1.3-1.4 — built offline-first with a deterministic mock for the
multi-user parts, isolated behind one flag so flipping to the real backend is one file.

## Decisions reconciled

- **D10/D11/D18** — sharing/social never touches the advice path; V1.0 hosted social is
  share-link+fork; profiles/follows/feed are V1.1 (designed for backend). The mock makes
  them demoable now without faking a server contract in committed product code.
- Closes a gap from D32: `SharedPayload.author.handle` is currently never set — the profile
  handle now flows into every share (attribution/provenance).

## Scope (chosen 2026-06-14: full social home + mock feed)

- **Real, offline:** your driver profile (identity + palmarès + garage showcase), the
  athlete share card, follow state (local), handle-on-shares, forking a feed post.
- **Mock (deterministic, → backend):** feed contents, discover drivers, others' profiles.
  Isolated in `apps/mobile/src/socialnet.ts` behind `SOCIAL_MOCK = true` (mirrors `speedhive.ts`).

## Architecture

### `packages/social` additions (pure, tested)
```ts
// types.ts
export interface DriverProfile {
  handle: string; display_name?: string; avatar_uri?: string;
  level?: "beginner"|"club"|"regional"|"pro"; country?: string;
  home_track?: string; classes?: string[];
  career?: { runs: number; races: number; podiums: number; wins: number; best_lap_s?: number; best_lap_track?: string };
}
export type FeedItemKind = "shared_setup" | "result";
export interface FeedItem {
  id: string; kind: FeedItemKind; created_at: string;
  author: { handle: string; avatar_uri?: string; level?: string };
  payload?: SharedPayload;   // shared_setup → forkable
  result?: { track_name: string; position?: number; entrants?: number; best_lap_s?: number; car?: string };
  text?: string;
}
export interface FollowData { handles: string[]; }
// follow.ts
initFollows(): FollowData
follow(s, handle): FollowData          // add if absent (new ref), else SAME ref
unfollow(s, handle): FollowData
isFollowing(s, handle): boolean
serializeFollows(s): string            // {format:1,state}
deserializeFollows(raw): {ok,state}|{ok:false,reason}
```

### App layer
- `socialnet.ts` — `SOCIAL_MOCK=true`; `fetchFeed(followed)`, `fetchDiscover()`,
  `fetchProfile(handle)`. Deterministic seed (fixed ISO literals, no clock/random); a few
  drivers (@alex/@sam/@mariko/@luca…) with realistic RC palmarès; shared_setup items carry a
  real `SharedPayload` (forkable via the existing ImportPreview).
- `followstore.ts` — `useFollows()` persisting `FollowData` (mirrors candidacystore).
- `components/ProfileCard.tsx` — athlete poster (react-native-svg, captured via Svg ref
  `toDataURL`, like ShareCard): avatar/handle, big palmarès, home track, classes, watermark.
- `screens/SocialScreen.tsx` — segmented **Feed · Discover · You**:
  - Feed: `fetchFeed(followed)` → cards; shared_setup → **Fork** (→ onFork(payload) reuses
    ImportPreview); result → podium/lap badge; per-author Follow toggle.
  - Discover: `fetchDiscover()` → driver cards + Follow.
  - You: own profile (account + `driverStats` + garage showcase + shared count), **Share my
    card**, **Edit profile**.
- `components/ProfileEditForm.tsx` (or inline) — handle, display name, avatar (image-picker),
  home track, classes chips → `setAccount`.
- `accountstore.ts` — add `handle?`, `display_name?`, `avatar_uri?`, `home_track?`,
  `classes?: string[]` to `Account` with strict parsing (like `prefs`).
- `App.tsx` — 6th **Social** tab (👥); header avatar → Social/You; **handle-into-shares**:
  wrap onShareSetup/onShareRun to inject `author: { handle: account.handle }` centrally;
  pass `onFork` to SocialScreen (→ setImportPayload).

## Flows
1. **Edit your profile** → handle/avatar/home track/classes saved on the account.
2. **Share** a setup/run → now attributed to your @handle (provenance in the import preview).
3. **Feed** → see followed drivers' shared setups + results; Fork a setup → existing import.
4. **Discover** → follow drivers (local follow state; syncs to backend later).
5. **Share my card** → athlete PNG poster via the OS share sheet.

## Design-only (backend, into 05_SOCIAL_SPEC + BACKEND)
Real feed/follow/profile endpoints, others' live profiles, props 🔧🚀💥 + comments with
Apple-UGC moderation (filter+report+block+takedown). Notifications: the 2 specced types.

## Build order
packages/social (follow+types) → socialnet mock + followstore → ProfileCard → SocialScreen →
account fields + Edit → App tab/avatar/handle wiring → emulator verify. New deps: none
(reuses react-native-svg, expo-image-picker, expo-sharing already installed).

## Out of scope
Real multi-user data, props/comments, notifications — designed, not built.
