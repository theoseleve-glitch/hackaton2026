# Party Mini-Game Platform — Backbone Architecture Design

**Date:** 2026-06-09
**Status:** Approved (design); implementation plan pending
**Owners:** Théo (+ William)

## 1. Product summary

A mobile app (iOS + Android) for playing short multiplayer mini-games with friends who are
physically together — at a party, at night, on a chill afternoon. The catalog borrows viral
formats popularized by YouTubers: hidden-role/impostor games, "rank your friends" social voting,
quizzes, prompt-and-guess games. New mini-games ship regularly; adding a game must be a
content/module drop, never a rearchitecture. Revenue is advertising only.

## 2. Locked decisions

These were decided explicitly and are not open for relitigation during implementation:

| Decision | Choice |
|---|---|
| Scope | Long-term production product (not a hackathon throwaway), built by a 2-dev TypeScript team |
| Multiplayer model | Same-room first: each player on their own phone, joining via room code/QR. Remote play must be addable later with zero realtime-layer rearchitecture |
| Client | React Native + Expo, single TypeScript codebase, app-only (every player installs). EAS Update for OTA |
| Identity | **Fully anonymous forever.** Nickname + avatar stored on-device only. No accounts, no server-side user profiles, no friend graph. Permanent constraint, not a v1 shortcut |
| Monetization | Ads only (AdMob): interstitials between rounds, possibly rewarded later. GDPR/UMP consent for EEA |
| Backend architecture | Cloudflare Durable Objects room-actors ("DO hybrid") — chosen over Colyseus-on-Fly and Firebase serverless after a 4-proposal / 3-judge architecture review |

### Why the DO hybrid won (summary of the review)

- The product's domain model — an isolated, server-authoritative, timer-driven state machine
  per room of 2–16 phones that lives ~45 minutes and then vanishes — maps exactly onto the
  Durable Object primitive (single-threaded actor, durable alarms, hibernatable WebSockets,
  embedded SQLite).
- Ops ≈ zero for a 2-dev team: one `wrangler deploy`, no fleet, no Redis, no capacity planning.
  A viral spike from 100 to 50,000 concurrent rooms requires no human action.
- Cost shape fits thin ad margins: scale-to-zero on quiet weekdays, ~$5/mo at 1k MAU,
  ~$110–280/mo realtime at 100k MAU (see §11).
- The honest price is Cloudflare lock-in — fenced by the GameModule purity rule and a
  CI-tested Node fallback shell (see §10).
- Colyseus/Fly lost on permanent ops burden (drain scripts, 3am pages, crash kills all rooms
  on a machine). Firebase lost on genre fit (state machine smeared across five managed
  services, cold starts mid-reveal, deepest plumbing lock-in) — and every new game pays that
  tax, while shipping many games is the whole thesis.

## 3. System overview

```
┌─────────────────────────── PHONES (same room) ───────────────────────────┐
│  Expo app (React Native, TS)  ×  every player                            │
│  nickname+avatar on device · AdMob+UMP · PostHog/Sentry SDKs · OTA       │
└────────────┬──────────────────────────────────────────────┬──────────────┘
             │ HTTPS (create room, config)                  │ WebSocket (gameplay)
             ▼                                              ▼
┌─ Cloudflare ───────────────────────────────────────────────────────────────┐
│  Front-door Worker (Hono)          RoomDO — ONE Durable Object PER ROOM    │
│  · POST /rooms → 4-char code       · holds all 2–16 sockets (hibernatable) │
│  · config endpoint (KV-cached)     · runs GameModule reducers (authority)  │
│                                    · alarms = phase timers                 │
│  Workers KV: game catalog,         · SQLite: event log + snapshots         │
│  flags, min versions               · TTL janitor wipes room after party    │
│  R2: content packs (JSON)                                                  │
└────────────────────────────────────────────────────────────────────────────┘
   PostHog EU (anonymous analytics) · Sentry (crashes) · EAS Update (OTA)
```

**There is no global database.** The only persistent state is per-room SQLite with a TTL.
"Fully anonymous forever" is enforced by architecture, not policy.

### Stack components

- **Realtime transport:** WebSockets via Durable Objects WebSocket Hibernation API
  (`ctx.acceptWebSocket` — never `ws.accept()`); client uses PartySocket (auto-reconnect).
- **Room hosting:** one SQLite-backed `RoomDO` per room via PartyServer; `idFromName(roomCode)`
  is the global room registry — no DB row, no cleanup job.
- **Front door:** stateless Hono Worker — `POST /rooms` (code generation, collision-checked),
  config fetch, health.
- **Game logic:** pure TypeScript reducer modules (see §4), executed inside the RoomDO.
- **Config/content:** Workers KV (game catalog manifest, feature flags, kill switches,
  min-supported versions); R2 + CDN for content packs (prompts, quiz banks) as versioned JSON.
- **Analytics:** PostHog EU Cloud, anonymous-class events only (no person profiles; a
  rotatable per-install UUID stored on-device). Workers Analytics Engine for near-free
  server-side metrics at scale. Crash: Sentry (`@sentry/react-native` + Workers SDK),
  PII scrubbing on.
- **Ads:** AdMob via `react-native-google-mobile-ads` (Expo config plugin; requires dev
  builds, which we need anyway). Its `AdsConsent` wraps Google UMP for GDPR/EEA + iOS ATT.
  `delayAppMeasurementInit: true` until consent. Ads are entirely client-side; the game
  server never sees ad identifiers.
- **OTA:** EAS Update; self-hosted `expo-updates` server (open protocol, ~$10/mo on R2) is a
  pre-planned migration before ~30k MAU (see §11).
- **Profanity filter:** `obscenity` (pure TS, runs in workerd) at the DO input boundary.

## 4. The centerpiece: the `GameModule` contract

Every mini-game is one pure TypeScript package implementing:

```ts
interface GameModule<State, Action, View, Content = unknown> {
  id: string;
  version: number;
  minPlayers: number;
  maxPlayers: number;
  init(seed: string, players: PlayerId[], content: ContentPack<Content>): State;
  reduce(state: State, event: GameEvent<Action>): { state: State; effects: Effect[] }; // pure
  view(state: State, viewer: PlayerId): View;        // per-player redaction
  phaseDurationMs(state: State): number | null;      // current phase duration, ms
}
```

(`phaseDurationMs` is a pure per-phase duration — modules never see wall-clock
time; the shell converts it to an absolute deadline on phase entry, persists it,
and re-arms alarms after rehydration.)

Rules that make the contract load-bearing:

1. **Purity:** `reduce` is pure and synchronous. Zero Cloudflare imports in game packages.
   Modules are unit-testable with plain Vitest, no emulation.
2. **Hidden state by construction:** `reduce` runs only in the RoomDO. Clients never receive
   `State`; each phone receives only `view(state, itsPlayerId)`. The impostor's identity is
   physically absent from the other phones' network traffic.
3. **Client import firewall:** a CI/lint rule forbids the mobile bundle from importing game
   server logic — types and `ClientView` selectors only.
4. **Effects, not side effects:** reducers return effect descriptions (`setTimer`, `broadcast`,
   `emitAnalytics`); the RoomDO shell executes them. This keeps timers, persistence, and
   transport out of game code.

**Adding a game (the pipeline):**
1. `pnpm create-game <id>` scaffolds `packages/games/<id>/{server,client,shared}`.
2. Write reducer + views with pure unit tests; client screens against typed `ClientView`.
3. Upload content pack JSON to R2.
4. Register in the KV game-catalog manifest with `minAppVersion` and a feature flag.
5. Ship: `wrangler deploy` + `eas update`; flag 5% → 100%.

No new infra, no schema migration, no per-game backend. Ever.

## 5. Monorepo layout

```
party-app/
  apps/mobile/          # Expo app (screens, navigation, ads, analytics glue)
  apps/server/          # Workers project: Hono front door + RoomDO shell
  packages/protocol/    # zod schemas: wire messages, events, ClientViews (shared)
  packages/engine/      # GameModule contract, PhaseMachine helper, alarm multiplexer types
  packages/games/*      # one package per mini-game
  packages/shell-node/  # CI-tested Node+ws fallback host (lock-in firewall, see §10)
```

The zod-typed `protocol` package is shared end-to-end so client and server cannot drift —
the compiler enforces the wire format.

## 6. Room lifecycle & protocol

- **Create:** app → `POST /rooms` → Worker generates an unused 4-char code (collision-checked
  against the DO), creates the RoomDO, pins the room's `protocolVersion` at creation.
- **Join:** QR or deep link `partyapp://join/ABCD` → WS connect carrying
  `{nickname, avatar, protocolVersion, reconnectToken}`. Nickname passes the profanity filter
  server-side before any other client sees it.
- **Version handshake:** out-of-range clients get a typed `UPGRADE_REQUIRED` →
  `Updates.fetchUpdateAsync()` + `reloadAsync()` (seconds), then rejoin. A room never sees
  mixed protocols mid-game; the server supports a 2-version window during transitions.
- **Phase timers — single-alarm multiplexer:** DOs support ONE alarm at a time. The shell
  maintains an earliest-deadline-first queue over (a) game phase deadlines, (b) disconnect
  grace timers, (c) the room TTL janitor, and re-arms the alarm to the earliest. All timer
  firings are idempotent (guarded by a `phaseSeq` check).
- **Votes / simultaneous actions:** buffered into hidden state (acked privately, never
  broadcast); the reveal fires on all-votes-in or alarm; results are promoted into public
  views in one atomic broadcast so all phones reveal simultaneously.
- **Presence/reconnect:** hibernatable sockets give connection-level presence natively.
  Disconnect starts a 60–120s grace alarm (seat greyed, not freed); the on-device
  `reconnectToken` reclaims the seat with a full view resync. `ws.serializeAttachment()`
  carries playerId across hibernation (store IDs only — ~2KB limit).
- **Host migration:** "host" is a permissions flag in room state (start game, kick, pick
  game). On grace expiry the reducer reassigns it to the longest-connected player. Nothing
  migrates because no game state ever lives on a phone.
- **End of life:** the TTL janitor alarm wipes room SQLite after the party. Ephemeral by design.

## 7. Resilience & error handling

- **Event sourcing as a hard rule:** every accepted event is appended to room SQLite *before*
  broadcast; a snapshot is written per phase transition. On hibernation wake, eviction, crash,
  or deploy (deploys restart live DOs), state = snapshot + replay of subsequent events.
- **Snapshot schema versioning:** snapshots and events carry a schema version; replay tests in
  CI guard forward compatibility. DO SQLite migrations are one-way — treated with the same
  review weight as a public API change.
- **Chaos tests in CI:** forcibly recreate a room from its event log mid-playthrough.
  `wrangler dev` never evicts locally, so this bug class only manifests in production unless
  hunted deliberately.
- **Billing guards:** hibernation-awareness is a code-review checklist item (always
  `ctx.acceptWebSocket`; no dangling `setInterval`/promises that pin the DO in memory —
  a careless pattern silently 5–10×es the GB-s bill). Cloudflare billing alert on DO duration
  from week one.
- **Input boundary:** rate limiting + zod validation + profanity filter at the single DO
  message entry point. All player-entered text is filtered before persistence or broadcast.
- **Failure modes accepted consciously:** a Cloudflare incident downs all active rooms (no
  in-flight failover) — "recreate the room" is an acceptable failure for 45-minute party
  sessions. A room is pinned to its creation region forever (fine for same-room; acceptable
  RTT for phase-based remote play later).

## 8. Backbone v0 build list

What gets built before any real game:

1. **Lobby:** create/join/leave, host controls (kick, start, pick game), nicknames + avatars
   (device-stored).
2. **Engine:** GameModule contract, PhaseMachine helper, view redaction, alarm multiplexer,
   event sourcing + snapshots.
3. **Protocol package:** zod-typed messages/views shared client↔server.
4. **Version handshake + remote config:** KV catalog, kill switches, min versions, staged
   rollout flags.
5. **Ads:** AdMob interstitial slot "between rounds" + UMP consent (EEA) + ATT (iOS);
   frequency caps driven by remote config.
6. **Analytics/crash:** PostHog anonymous events (`room_created`, `game_started`,
   `round_completed`, `ad_shown`), Sentry with PII scrubbing.
7. **Moderation/compliance:** server-side filter + report endpoint + host-kick + local block —
   satisfies Apple Guideline 1.2 (UGC: filter, report, block). Anonymous play also sidesteps
   the account-deletion requirement (no accounts).
8. **Tracer-bullet game:** one trivial vote round exercising every layer end-to-end
   (lobby → roles → timer → vote → reveal → score → interstitial). Scaffolding proof, not a
   product game.

**Out of scope for backbone v0:** the actual game catalog, name/logo/art direction,
remote-play UX (the architecture is already remote-ready), voice chat, push notifications.

## 9. Testing strategy

- **Unit:** game reducers are pure functions — plain Vitest on Node, no cloud emulation.
  Property-based tests on reducers (e.g., votes never exceed players; hidden state never
  appears in any `view()` output).
- **Integration:** scripted full-game playthroughs against `wrangler dev`
  (`@cloudflare/vitest-pool-workers` for in-runtime tests).
- **Chaos:** CI rehydration tests (kill + replay mid-game), deploy-restart simulation.
- **Load:** scripted N-room × 16-socket load test before launch and before big marketing pushes.
- **Redaction audit:** automated check that serialized `view()` outputs for non-impostor
  players never contain role assignments (the one leak class that matters most).

## 10. Lock-in firewall

Durable Objects are proprietary; the exit must stay a tested property, not a hope:

- Game packages and the engine have **zero Cloudflare imports**.
- `packages/shell-node` is a skeleton Node + `ws` host implementing the same shell contract
  (transport, timers, persistence) and runs the same GameModules in CI on every build.
- Estimated forced-exit cost: a 2–4 week shell port (to Fly/Hetzner + Redis/Postgres), with
  game code untouched. This estimate is kept honest by the CI shell.

## 11. Cost posture (verified 2026 pricing)

| Scale | Realtime (Cloudflare) | Analytics/crash | OTA (EAS Update) | Total |
|---|---|---|---|---|
| 1k MAU | $5/mo (Workers Paid covers it) | $0 (free tiers) | $0–19 | **~$5–25/mo** |
| 100k MAU | ~$110–280/mo | ~$25–75/mo | **~$449/mo** | **~$600–800/mo** |

- The dominant cost at scale is EAS Update, not the backend. Lever: self-hosted
  `expo-updates` (open protocol, ~$10/mo on R2) — schedule the migration **before ~30k MAU**.
- Revenue sanity check at 100k MAU: blended interstitial eCPM $2.50–5 (lower for EEA
  non-consent traffic) → roughly $2–6k/mo. Infra stays under ~10–25% of even pessimistic
  revenue. Cost scales to zero on quiet weekdays — matches spiky Friday-night usage.
- Honest framing for public/privacy claims: *our* backend keeps zero identity; the AdMob SDK
  still collects device signals under Google's policies. Say "no accounts, nothing stored
  about you on our servers" — not "no data collection."

## 12. Future: remote play (designed-for, not built)

Same-room play already routes every phone over WSS through Cloudflare — "same room" is purely
a UX framing. Adding remote play later is product work only: share-sheet deep links next to
the QR, remote-friendly phase timer defaults via config, optional room-placement hint,
push notifications for turn reminders, and a harder moderation posture for strangers. The
transport, room model, hidden-state redaction, reconnect, and game modules need no changes.

## 13. Top risks

1. **DO lock-in** — fenced by §10; priced as a 2–4 week shell swap.
2. **Deploy-during-game correctness** — event-sourced rehydration must be built and chaos-
   tested from day one (most likely source of subtle production bugs).
3. **Duration-billing foot-guns** — hibernation discipline + billing alerts from week one.
4. **EAS Update cost curve** — pre-planned self-hosting lever before ~30k MAU.
5. **Ecosystem maturity** — PartyServer is 0.x (Cloudflare-maintained since the PartyKit
   acquisition); our shell surface over it is deliberately thin.
