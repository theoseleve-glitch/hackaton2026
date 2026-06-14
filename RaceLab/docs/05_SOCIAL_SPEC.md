# 05 — Sharing & Social · Spec

> The #2 differentiator ("Strava of RC"). **Per D10, V1.0 ships only §1.1–1.2 (share link + fork/import); §1.3–1.4 (profiles, follows, props, comments) are V1.1** — fully specced here so the schema is built for them from day one, but not in the launch build. **Principle: utility first, social wraps utility.** Strava worked because the GPS log was useful alone; our setup vault + AI must be useful alone.

## 1. Scope (§1.1–1.2 = V1.0 · §1.3–1.4 = V1.1)

### 1.1 Publishing a setup
- Visibility: **private** (default) · **unlisted** (share link) · **public** (discoverable).
- A published setup carries its context, because a sheet without conditions is noise: chassis + class, track (optional), surface, grip, weather snapshot, date, the author's comments, and — when the run was logged — **attached results** (finish position, best lap; manual in V1, transponder-verified once lap import B2 lands).
- **Embargo option**: "publish after the event" — racers hide their sheets before big races; respect the culture or the fast guys won't share.
- Share link opens a **static page embedding the rendered sheet (PDF/PNG from Blob) + install CTA** (D10). No public API, no schema-driven web renderer in V1.0 — the PDF pipeline already exists, the page is one template. The real read-only web view is V1.5. Publishing creates a **server-side snapshot at publish time** (D11) — shared sheets don't depend on live replication.

### 1.2 Browsing & importing ("fork")
- Search/filter public setups: chassis → track → surface/conditions → recency/popularity.
- **Import = fork**: the sheet copies into your garage with provenance kept ("forked from @driver's sheet, 2026-06-07, Track X"). The app immediately shows the **diff vs your current sheet** — and (exploratory C3) the AI explains which deltas matter for you.
- Same-template forks map 1:1. Cross-version forks (MP10 → MP11) come later with the field-mapping layer (A1) — V1 blocks them with a clear message rather than silently mismapping.

### 1.3 Profiles & following (V1.1)
- Profile = identity: avatar, home track, classes raced, **garage** (chassis owned, photos), shared setups, race history (public results only).
- **Follow** drivers. Notifications, deliberately scarce in V1 (2 types only): *driver you follow published a setup for a chassis you own* · *someone forked/commented your setup*. Chassis-scoped relevance beats a noisy firehose.
- Privacy defaults: profile public, garage public, setups private, results public. Everything toggleable.

### 1.4 Props & comments (V1.1)
- Threaded comments on shared setups — the pit-lane Q&A ("what pistons up front?") captured where the sheet lives. Author can pin an answer.
- Props with RC-native reactions: **Dialed** 🔧 (clean/fast), **Send it** 🚀, **Tough break** 💥 (DNF empathy — half of nitro racing is carnage and commiseration is the glue).
- Moderation (required by Apple UGC guideline 1.2 the moment comments ship): content filtering + report button + **block user** (hides their content, prevents interaction) + author-deletes-on-own-setup + admin tools + published contact info. This burden is exactly why comments are V1.1, not V1.0 (D10).

> **V1.1 offline mock (the app ships this now — D32 + design doc `docs/superpowers/specs/2026-06-14-driver-profiles-social-home-design.md`).** The §1.3/§1.4 multi-user surfaces are demoable without a backend: **your own profile is real and local** (identity + palmarès + garage on the account) and **follow state is local** (`FollowData`), while the **feed, discover and others' profiles are a deterministic mock** isolated in `apps/mobile/src/socialnet.ts` behind a single `SOCIAL_MOCK = true` flag (mirroring `speedhive.ts`). The mock's `fetchFeed` / `fetchDiscover` / `fetchProfile` call sites and the `packages/social` shapes (`DriverProfile`, `FeedItem`, `FollowData`) **swap 1:1 to the hosted endpoints** (`GET /me/profile` + `PUT /me/profile`, `GET /profiles/{handle}`, `POST`/`DELETE /follow/{handle}`, `GET /feed`, `GET /discover` — see `BACKEND.md` P3) when the backend lands, one flag flipped. Props (🔧🚀💥) and comments stay design-only until their Apple-UGC moderation gate ships. This closes a D32 gap: the **profile `handle` now flows into shared-setup provenance** — every share/import carries `author: { handle }`, so a forked sheet attributes back to the driver (`SharedPayload.author.handle`, previously unset).

## 2. Why this beats So Dialed's sharing

| So Dialed | RaceLab |
|---|---|
| Public/private flag on a sheet | Setups published **with conditions + results** context |
| No identity layer | Profiles, garages, follows, chassis-scoped notifications |
| Download a copy, provenance lost | **Fork with lineage** — diffs, ancestry, fork counts (status for creators) |
| No conversation | Comments + props where the sheet lives |
| No reason to return | Notification loops tied to *your* chassis and *your* setups |

## 3. The growth model (how the social layer acquires users)

1. **Share-link surface** (V1): every shared setup is a public web page circulating in club WhatsApp/Facebook groups → install CTA.
2. **Season Wrapped** (A3, V1.5): shareable cards posted to the social networks where racers already are.
3. **Club wedge** (A7/B17, V2): one club admin onboards a whole club; series standings = weekly retention for 40 people at once.
4. **Pro drops** (A9, V2): pros bring their Instagram audience; their sheets seed the content graph.
5. **Timing-data network** (B2 + A6, V2): once transponder import exists, leaderboards/rivals/feed generate themselves — Strava's zero-effort-content trick.

## 4. Cold-start plan (the empty-room problem)

- Seed content ourselves: every kit baseline + our own raced setups for the launch chassis, published with real conditions, from day one.
- Launch geographically dense: **our clubs first** (France offroad scene), not a thin worldwide sprinkle — density at one track beats 1000 scattered users.
- Recruit 5–10 fast local drivers pre-launch as founding creators (free Pro for life); their sheets are what club racers search for.
- Every AI debrief/wrapped card carries a tasteful watermark — organic loops over paid acquisition.

## 5. Data & safety notes (for the schema — Théo)

- Fork lineage is a DAG on setup versions (`forked_from_version_id`), not on cars — survives renames/deletions via tombstones.
- Anything public must be servable without auth (web view) → plan the public/private split at the API layer from day one, not as an afterthought.
- Aggregated stats shown publicly (later: Track Intel A2, fleet learning C9) always gated on minimum sample size (n ≥ 8) — small clubs are deanonymizable.
- GDPR: we're EU-based; export + full deletion paths planned in the schema (tombstones, not hard cascades).

## 6. Official tracks (candidacy)

> Hosted. **Designed only — needs William's backend** (not in V1.0; the app ships the offline half: submit → outbox + "Pending review" badge, plus a stubbed Official Tracks browser). This is the public track library D25 promised "when sync ships", made concrete as an **admin-curated** library (decision 2026-06-14). Honors D10 (no public browse/discovery API in V1.0) and D11 (server snapshot at publish, no live replication).

### 6.1 Submitting a candidate
- Any track in a user's garage can be **submitted as official** from the app. The app writes a `TrackCandidacy` (`packages/social`) and queues the submission in an **append-only outbox** (D11) — it works fully offline, like every other write, and flushes when the backend lands.
- A submission carries a **self-contained snapshot** of the `TrackEntity` (name, GPS, surface/surfaces, indoor, traits, corners, photos as media refs, lap records) — the snapshot is the candidate, not a live pointer (D11). EXIF GPS is stripped from photos before they enter any shared artifact (consistent with the blob rules).
- The user's local track stays theirs and editable; the candidate is a frozen copy under review. The app shows a **"Pending review"** badge until the backend reflects an outcome.

### 6.2 Curation (admin-curated approval)
- A track candidate is **not auto-published**. A curator (William, or a delegated admin) reviews each candidate in an admin console and approves it into the official library, or rejects it. **Curation is the moderation gate** — the same human-in-the-loop role comments/UGC will need in V1.1 (§1.4), here applied to track data.
- **State machine** (mirrors `packages/social` `CandidacyState`): `none → candidate → official | rejected`. `none` = an ordinary private track; `candidate` = submitted and queued/under review; `official` = approved into the library; `rejected` = declined (with an optional reason surfaced back to the submitter). Transitions past `candidate` are **server-authoritative** and reflected to the app on sync — the client never self-promotes.
- **Dedup / merge.** Before a candidate becomes official, the curator dedups against existing venues by **GPS proximity + name similarity** (the same physical track gets submitted by many drivers). The console proposes likely duplicates; approving a candidate can **merge** it into an existing official venue (its lap records fold into that venue's pool) rather than creating a parallel entry. This keeps one canonical venue per real-world track — load-bearing for the leaderboard below, which is only meaningful if records aggregate onto a single venue.

### 6.3 Community leaderboard (per venue)
- An official venue exposes a **community leaderboard** built by aggregating `LapRecord`s (and run results) **across users**, bucketed by **category + conditions** (e.g. *1/8 nitro buggy · high grip*). Different categories/conditions are different boards — a green-track 2WD time and a blue-groove 4WD time aren't comparable.
- **n ≥ 8 gate.** A leaderboard bucket is only shown publicly once it holds **at least 8 contributing entries** — the existing anti-deanonymization rule (§5): below that threshold a small club's times de-anonymize individuals, so the bucket stays hidden until the sample is large enough.
- Leaderboards are a **read-only aggregate**, computed server-side from the aggregated record pool. `driverStats()` already computes the per-driver career/podium/win numbers client-side; the server only does the cross-user roll-up the device can't see. **No advice, ever, on the server (D18)** — a leaderboard is timing data, not a recommendation.

### 6.4 Consistency with D10 / D11 / D25
- **D10**: candidacy is an *admin-curated submit + a gated read*, not a public browse/discovery API or web app — V1.0 still ships only the unlisted share-link + fork loop; the Official Tracks browser is designed and stubbed, not a live public surface.
- **D11**: the candidate is a publish-time snapshot in an append-only outbox; there is no bidirectional track sync, and approval/rejection arrive as a one-way server→client reflection.
- **D25**: this *is* the "public library when sync ships" for first-class tracks — now pinned as admin-curated so quality and dedup are enforced before anything goes public.
