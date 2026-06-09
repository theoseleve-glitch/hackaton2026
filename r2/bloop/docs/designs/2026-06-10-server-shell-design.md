# Bloop Server Shell — Cloudflare Durable Objects Room Server (Plan 2)

**Date:** 2026-06-10
**Status:** Design (ready for implementation planning)
**Owner:** Server architect (Plan 2)
**Depends on:** Approved backbone architecture (`docs/specs/2026-06-09-party-game-platform-architecture-design.md`), implemented `@bloop/engine` contract (50 tests green), `@bloop/protocol` wire schemas.

This document specifies the **server shell**: the Cloudflare front-door Worker plus the `RoomDO` Durable Object that hosts a single room, drives `GameModule`s, and owns all realtime/persistence/timer concerns. Game logic stays pure and Cloudflare-free (spec §4 / §10); the shell is the only place that touches workerd, SQLite, alarms, and sockets.

It is decisive: every choice has a picked default. Genuinely undecided items are collected in **§9 Open Questions** and nowhere else.

---

## 0. Scope, invariants, and the contract amendment

**The shell owns:** transport (hibernatable WebSockets), join/handshake/auth, the single input boundary (validation + rate limit + profanity filter), the game loop (validate → reduce → persist → broadcast), event sourcing in DO SQLite, the single-alarm multiplexer, reconnect/grace/host-migration, and the TTL janitor. **The shell never owns:** game rules, view shape, or phase durations — those are the module's.

**Hard invariants carried from the spec and engine contract:**

- `ctx.acceptWebSocket(...)` ONLY — never `server.accept()`. Hibernation is mandatory for the billing model (spec §7, §13).
- `reduce` is pure/sync; no `Date.now()`/`Math.random()` reaches a module. The shell stamps every `GameEvent.at` and supplies the `seed`.
- Clients receive **only** `view(state, viewerId)` — never `State`. Redaction is by construction (spec §4 rule 2).
- **Persist before broadcast.** Every accepted event is appended to SQLite before any socket send (spec §7).
- Effects are descriptions the shell executes; reducers never do I/O.
- JSON-serializable state only; player-keyed maps are null-prototype (the `tracer.ts` rule). The shell stores state as JSON and must never reconstruct it with a default-prototype merge that could be polluted by an untrusted `playerId`.

### 0.1 Contract amendment: `phaseKey(state): string`

**Problem (from final review):** the shell cannot generically detect a phase transition. After `reduce`, the shell must know "did we enter a new timed phase?" so it can (a) compute a fresh absolute `deadlineAt = at + phaseDurationMs(state)` and (b) re-arm the alarm. Comparing `phaseDurationMs` is insufficient (two distinct phases can share a duration; a re-entered phase of equal duration must re-arm). Deep-equality on `State` is too broad (a vote arriving must NOT reset the vote-phase deadline).

**Amendment — add one pure method to `GameModule`:**

```ts
// PROPOSED addition to packages/engine/src/types.ts (GameModule<S, A, V, C>)
export interface GameModule<S, A, V, C = unknown> {
  // ...existing: id, version, minPlayers, maxPlayers, init, reduce, view, phaseDurationMs
  /**
   * A stable, pure identifier for the *current timed phase*. The shell re-arms
   * its alarm iff phaseKey changes across a reduce(). Must change whenever a NEW
   * deadline should start (entering a phase, or re-entering the same phase kind
   * for a new round), and must NOT change for in-phase progress that should keep
   * the running deadline (e.g. a vote arriving during a vote phase).
   * Convention: "<phase>:<roundOrSeq>", e.g. "vote:2", "reveal:2", "over".
   * MUST be deterministic from state (no clock, no randomness).
   */
  phaseKey(state: S): string;
}
```

For `tracer` this is a one-liner: `phaseKey: (s) => `${s.phase}:${s.round}``. It is purely additive (no existing call site changes), unit-testable with plain Vitest, and stays inside the purity firewall. The shell's transition rule is precisely: **`phaseKey(before) !== phaseKey(after)` ⇒ this is a phase entry**.

This amendment is a prerequisite for §4 and §6. It is the only change to an existing package and must land first (as `@bloop/engine` v0.0.2) before the shell can compile against it.

---

## 1. Workers project layout, config, dependencies, dev/test

### 1.1 Monorepo placement

`apps/server/` joins the existing pnpm workspace. `pnpm-workspace.yaml` currently globs `packages/*` and `packages/games/*`; add one line:

```yaml
# pnpm-workspace.yaml (ADD)
packages:
  - "packages/*"
  - "packages/games/*"
  - "apps/*"          # <-- add
allowBuilds:
  esbuild: true
  workerd: true        # <-- wrangler/miniflare pull workerd binary
```

```
apps/server/
  wrangler.jsonc              # bindings, migrations, DO class, KV/R2
  package.json                # deps below
  tsconfig.json              # extends ../../tsconfig.base.json + workers types
  vitest.config.ts           # vitest-pool-workers for DO/integration tests
  worker-configuration.d.ts  # generated: wrangler types (Env bindings)
  src/
    index.ts                 # Worker entry: Hono app + `export { RoomDO }`
    front-door/
      app.ts                 # Hono routes: POST /rooms, /health, /config
      room-code.ts           # alphabet, generation, collision protocol
    room/
      room-do.ts             # RoomDO class (the shell)
      connections.ts         # attachment <-> live socket registry (ids only)
      handshake.ts           # hello/version/profanity/reconnect
      game-loop.ts           # validate -> reduce -> persist -> broadcast
      alarm-mux.ts           # single-alarm multiplexer (EDF queue)
      store.ts               # SQLite: events, snapshots, room meta
      registry.ts            # GameModule lookup by id+version
      profanity.ts           # obscenity matcher (singleton)
      ratelimit.ts           # per-connection token bucket
    schemas/
      action.ts              # per-game zod action schemas registry
  test/
    *.test.ts                # vitest-pool-workers (in-runtime)
```

Game modules stay where they are (`packages/games/*`); the shell imports them through a **registry** (§4.1). The CI Node fallback shell (`packages/shell-node/`, spec §10) is a sibling host that implements the same internal contracts — out of scope for this doc but the shell's seams (§1.5) are drawn so it can.

### 1.2 `wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "bloop-room-server",
  "main": "src/index.ts",
  "compatibility_date": "2026-05-01",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },

  "durable_objects": {
    "bindings": [{ "name": "ROOM", "class_name": "RoomDO" }]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["RoomDO"] }
  ],

  "kv_namespaces": [
    { "binding": "CONFIG", "id": "<catalog/flags/min-versions kv id>" }
  ],
  "r2_buckets": [
    { "binding": "CONTENT", "bucket_name": "bloop-content-packs" }
  ],

  "analytics_engine_datasets": [
    { "binding": "METRICS", "dataset": "bloop_metrics" }
  ],

  "vars": { "ENV": "production" }
}
```

Decisions:
- **SQLite-backed DO** (`new_sqlite_classes`) — required for the event log + `ctx.storage.sql` (spec §7). Never `new_classes` (KV-only) for `RoomDO`.
- `compatibility_date` recent enough for RPC + WebSocket Hibernation + `ctx.acceptWebSocket`. `nodejs_compat` is on defensively; obscenity needs none of it (§3.4), but `hono` and future libs may want `node:` shims.
- **Analytics Engine** is the sink for `Effect{type:'analytics'}` (server-side, near-free at scale; spec §3). PostHog stays client-side and is never called from the DO.
- KV holds the **game catalog manifest, feature flags, kill switches, min app/protocol versions**. R2 holds **versioned content-pack JSON** (`<gameId>/<contentId>@<version>.json`).

### 1.3 `package.json` (apps/server)

```jsonc
{
  "name": "@bloop/server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "typegen": "wrangler types",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4",
    "partyserver": "^0.0.x",       // thin DO/WebSocket helper (Cloudflare-maintained, 0.x — spec §13)
    "obscenity": "^0.4",            // pure-TS profanity filter, zero deps, ships ESM (verified §3.4)
    "@bloop/engine": "workspace:*",
    "@bloop/protocol": "workspace:*",
    "@bloop/game-tracer": "workspace:*",
    "zod": "^4"
  },
  "devDependencies": {
    "wrangler": "^4",
    "@cloudflare/vitest-pool-workers": "^0.x",
    "@cloudflare/workers-types": "^4",
    "typescript": "^5.7.3",
    "vitest": "^3.2.0"
  }
}
```

**On `partyserver`:** spec §3/§13 names it. The shell's surface over it stays "deliberately thin": I use it only for the `routePartykitRequest`-style ergonomics and `Server`/`Connection` typing where convenient, but **all hibernation-critical calls go straight to `ctx.acceptWebSocket` / `ws.serializeAttachment` / `ctx.storage`** so a partyserver 0.x change can't silently break the billing-critical path. If partyserver's hibernation story ever diverges from raw `DurableObject`, we drop it and extend `DurableObject<Env>` directly — the shell is written so that swap is local to `room-do.ts`. **Default: extend `DurableObject<Env>` directly and use partyserver only for the front-door request routing helper.** This keeps the 0.x dependency off the load-bearing path entirely.

### 1.4 tsconfig

```jsonc
// apps/server/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["@cloudflare/workers-types", "./worker-configuration.d.ts"],
    "moduleResolution": "bundler"
  },
  "include": ["src", "test"]
}
```

`tsconfig.base.json` already sets `strict`, `ES2022`, `ESNext`, `moduleResolution: bundler` — compatible with workspace `*.ts` source exports (the engine/protocol packages export raw `./src/index.ts`; wrangler/esbuild bundles them).

### 1.5 Dev + test strategy (what stays pure Node, what needs workerd)

Two test tiers, matching spec §9:

**Tier A — pure Node, plain Vitest (root `vitest.config.ts`, pattern `packages/**/test/**/*.test.ts`).** Anything not touching workerd lives in `packages/*` and is tested with no emulation:
- Game reducers (already done — 50 tests).
- **Pure shell logic factored out of the DO**: the alarm-mux EDF queue (`alarm-mux.ts` exports a pure `AlarmQueue` class — §6), the room-code alphabet/entropy math, the action-schema registry, the snapshot/replay fold (already `replay()` in engine), and the profanity-boundary function (obscenity runs fine in Node). These are the bulk of the bug surface and they get fast, deterministic, no-network unit tests.

**Tier B — `@cloudflare/vitest-pool-workers`, in `apps/server/test/`.** Anything that needs the real runtime — DO instances, `ctx.storage.sql`, hibernation, alarms, real WebSocket upgrade:

```ts
// apps/server/vitest.config.ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          // give tests SQLite-backed DOs + isolated storage per test file
          durableObjects: { ROOM: 'RoomDO' },
        },
      },
    },
  },
});
```

Tier B covers: join/handshake end-to-end, persist-before-broadcast ordering, **alarm firing and idempotency** (`runDurableObjectAlarm` test helper), **rehydration after forced eviction** (the chaos class spec §7 calls out — only reproducible in-runtime since `wrangler dev` never evicts), and the single-alarm re-arm on `phaseKey` change.

**Design rule that makes this split possible:** the DO class is a thin orchestrator. Decision logic is pure functions/classes it calls. Tier A tests the decisions; Tier B tests the wiring. This is also exactly the seam the Node fallback shell (spec §10) reuses.

---

## 2. Front-door Worker (Hono)

Stateless. Three routes. No game logic.

```ts
// apps/server/src/front-door/app.ts
import { Hono } from 'hono';
import { generateRoomCode } from './room-code.js';

type Env = { ROOM: DurableObjectNamespace<RoomDO>; CONFIG: KVNamespace };
const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

// Client config: min versions, kill switches, ad cadence, catalog manifest.
// KV-cached at the edge; this is the ONLY thing the app fetches over HTTPS before WS.
app.get('/config', async (c) => {
  const body = await c.env.CONFIG.get('client-config', 'json'); // {} fallback
  return c.json(body ?? {}, 200, { 'cache-control': 'public, max-age=60' });
});

// Create a room: generate an unused code, init the DO, pin protocolVersion.
app.post('/rooms', async (c) => {
  const code = await reserveRoomCode(c.env);           // collision-checked (§2.2)
  const stub = c.env.ROOM.getByName(code);             // idFromName(code) == registry
  const init = await stub.createRoom({                  // RPC, returns pinned meta
    code,
    protocolVersion: PROTOCOL_VERSION,                  // from @bloop/protocol
    createdAt: Date.now(),
  });
  return c.json({ code, protocolVersion: init.protocolVersion, wsPath: `/rooms/${code}` }, 201);
});

export default app;
```

The Worker entry composes Hono + the DO export and routes the WS upgrade:

```ts
// apps/server/src/index.ts
import app from './front-door/app.js';
export { RoomDO } from './room/room-do.js';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    // WS upgrade path -> straight to the DO (no Hono middleware on the hot path)
    const m = url.pathname.match(/^\/rooms\/([A-Z2-9]{4})\/ws$/);
    if (m && req.headers.get('upgrade') === 'websocket') {
      const stub = env.ROOM.getByName(m[1]);
      return stub.fetch(req);                 // DO does ctx.acceptWebSocket
    }
    return app.fetch(req, env, ctx);
  },
};
```

### 2.1 Room codes: alphabet / length / entropy

- **Alphabet:** `ABCDEFGHJKMNPQRSTUVWXYZ23456789` — 31 chars (Crockford-ish: drop `I L O 0 1` to avoid OCR/QR-readback ambiguity; drop vowels? **No** — keeping vowels but dropping confusables is the better tradeoff; we are not avoiding words because the profanity filter doesn't run on codes — see below).
- **Length:** **4** (spec-mandated "4-char code/QR").
- **Entropy:** 31⁴ = **923,521** codes. At a pessimistic 5,000 *concurrent* rooms, occupancy is ~0.5%, so a random pick collides ~0.5% of the time — one retry essentially always succeeds. Codes are **case-insensitive on input, uppercased server-side**; QR encodes the full deep link so users never type when scanning.
- **Profanity in codes:** with a 4-char no-vowel-confusable alphabet, accidental slurs are rare; we keep a small static **blocklist of generated codes** (a few dozen 4-char sequences) that `reserveRoomCode` rejects and regenerates. This is a constant set, not the obscenity runtime filter.
- **Codes are ephemeral and reusable** — once a room's DO is TTL-janitored, the code is free again. No global code table; see collision check below.

### 2.2 Collision check (no global DB)

There is no rooms table (spec: "`idFromName(roomCode)` is the global room registry — no DB row"). Collision is detected by asking the DO itself whether it is already a *live* room:

```ts
// front-door/room-code.ts
async function reserveRoomCode(env: Env): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateRoomCode();                 // random over the alphabet
    if (isBlockedCode(code)) continue;
    const stub = env.ROOM.getByName(code);
    const claimed = await stub.tryClaim(env);         // RPC: atomic test-and-set in DO
    if (claimed) return code;                          // we own a fresh room
  }
  throw new HTTPException(503, { message: 'code-space-busy' });
}
```

`tryClaim()` inside the DO: in a `blockConcurrencyWhile` it reads its own `room_meta`; if `status` is already `active`/`playing` it returns `false` (collision with a live room), otherwise it writes `status='reserved'`, `reservedAt=now` and returns `true`. A `reserved` room that never receives a `createRoom`+first join within, say, 2 minutes is reclaimable (a tiny grace handled by the janitor). This makes code reservation **idempotent and race-free** because the DO is single-threaded — two front-door Workers racing on the same code serialize through the one DO.

---

## 3. RoomDO shell: connections, join, handshake, profanity, host

### 3.1 Class skeleton

```ts
// room/room-do.ts
import { DurableObject } from 'cloudflare:workers';

export class RoomDO extends DurableObject<Env> {
  private store: Store;            // SQLite wrapper (§5)
  private mux: AlarmQueue;         // single-alarm multiplexer (§6), pure, rehydrated
  private conns: ConnectionRegistry; // live ws <-> ids (§3.2)
  private game: GameRuntime | null;  // module+state cache, rebuilt lazily (§4)

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.store = new Store(ctx.storage.sql);
      this.store.migrate();                    // CREATE TABLE IF NOT EXISTS (§5)
      this.mux = AlarmQueue.load(this.store);  // rebuild EDF queue from persisted timers
      this.conns = ConnectionRegistry.fromHibernation(ctx); // re-attach ids to live sockets
    });
  }

  // RPC from front door
  async tryClaim(): Promise<boolean> { /* §2.2 */ }
  async createRoom(meta: CreateRoomInput): Promise<RoomMeta> { /* persist pinned meta */ }

  // WebSocket upgrade
  async fetch(req: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);          // HIBERNATABLE — never server.accept()
    // No attachment yet: identity is unknown until `hello`. We tag with a temp id.
    server.serializeAttachment({ cid: crypto.randomUUID(), state: 'pending' } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Hibernation handlers (these wake the DO; see §7)
  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> { /* §3.3, §4 */ }
  async webSocketClose(ws: WebSocket, code: number): Promise<void> { /* §3.5 grace */ }
  async webSocketError(ws: WebSocket): Promise<void> { /* treat as close */ }
  async alarm(): Promise<void> { /* §6 mux fire */ }
}
```

### 3.2 Connection attachments (~2KB limit — IDs only)

`ws.serializeAttachment()` survives hibernation but is capped (~2KB). **We store IDs only**, never profiles or game state:

```ts
// room/connections.ts
interface Attachment {
  cid: string;             // connection id (uuid) — stable across one socket's life
  playerId?: PlayerId;     // assigned at hello; absent while 'pending'
  state: 'pending' | 'joined';
}
```

Everything else (nickname, avatar, host flag, connected/grace status, reconnectToken hash) lives in **SQLite `roster`** keyed by `playerId`, NOT on the socket. The live `ConnectionRegistry` is an in-memory `Map<cid, WebSocket>` rebuilt on wake from `ctx.getWebSockets()` (each socket's attachment yields its `cid`/`playerId`). Rebuild is cheap and idempotent:

```ts
static fromHibernation(ctx: DurableObjectState): ConnectionRegistry {
  const reg = new ConnectionRegistry();
  for (const ws of ctx.getWebSockets()) {
    const att = ws.deserializeAttachment() as Attachment;
    reg.bind(att.cid, ws, att.playerId);
  }
  return reg;
}
```

### 3.3 Join / hello flow (the single input boundary)

Every inbound message funnels through one validated entry point. Order is deliberate: **rate-limit → parse/validate (zod) → route → (for text) profanity filter → mutate → persist → broadcast.**

```ts
async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
  const att = ws.deserializeAttachment() as Attachment;

  // 1. Rate limit at the boundary (§7.4). Cheap, per-connection.
  if (!this.conns.rateLimiter(att.cid).take()) { return this.kick(ws, 'BAD_MESSAGE'); }

  // 2. Size cap + JSON + zod (protocol schema). Unknown shape => BAD_MESSAGE.
  if (typeof raw !== 'string' || raw.length > MAX_MSG_BYTES) return this.send(ws, err('BAD_MESSAGE'));
  const parsed = clientMessageSchema.safeParse(safeJson(raw));
  if (!parsed.success) return this.send(ws, err('BAD_MESSAGE'));
  const msg = parsed.data;

  switch (msg.type) {
    case 'hello':     return this.onHello(ws, att, msg);
    case 'startGame': return this.onStartGame(ws, att, msg);
    case 'action':    return this.onAction(ws, att, msg);   // §4
    case 'leave':     return this.onLeave(ws, att);
  }
}
```

`onHello` — version handshake, profanity on nickname, seat assignment or reconnect:

```ts
private async onHello(ws: WebSocket, att: Attachment, msg: HelloMessage): Promise<void> {
  const meta = this.store.getMeta();

  // (a) Version handshake — room PINS protocolVersion at creation (spec §6).
  if (!this.acceptsProtocol(msg.protocolVersion, meta.protocolVersion)) {
    this.send(ws, err('UPGRADE_REQUIRED'));
    return ws.close(4426, 'UPGRADE_REQUIRED');   // app maps -> Updates.fetchUpdateAsync()
  }

  // (b) Profanity filter at THE boundary — nickname before any other client sees it.
  const nickname = sanitizeNickname(msg.profile.nickname); // §3.4: censor or reject
  if (nickname === null) return this.send(ws, err('BAD_MESSAGE')); // rejected name

  // (c) Reconnect vs fresh join.
  if (msg.reconnectToken) {
    const seat = this.store.findSeatByToken(hashToken(msg.reconnectToken));
    if (seat && seat.graceActive) return this.reclaimSeat(ws, att, seat); // §3.5 resync
    // token invalid/expired -> fall through to fresh join (or reject if game started)
  }

  // (d) Fresh join. Lobby only; mid-game roster is fixed (engine contract).
  if (meta.status === 'playing') return this.send(ws, err('ROOM_FULL')); // no mid-game join
  if (this.store.rosterSize() >= MAX_PLAYERS) return this.send(ws, err('ROOM_FULL'));

  const playerId = crypto.randomUUID();
  const reconnectToken = crypto.randomUUID() + crypto.randomUUID(); // opaque, on-device only
  const isHost = this.store.rosterSize() === 0;     // first joiner is host
  this.store.addPlayer({ playerId, profile: { ...msg.profile, nickname }, isHost,
                         reconnectTokenHash: hashToken(reconnectToken), connected: true });

  ws.serializeAttachment({ ...att, playerId, state: 'joined' } satisfies Attachment);
  this.conns.bind(att.cid, ws, playerId);

  this.send(ws, { type: 'welcome', playerId, reconnectToken });
  this.broadcastLobby();   // everyone sees the new RoomPlayer
}
```

Notes:
- **`playerId` is server-minted** (uuid), never client-supplied — the roster is fixed at game `init` from these ids, and untrusted strings never become object keys without the null-proto discipline (carried into `store.ts`).
- **`reconnectToken` is opaque and lives only on the device** (spec §6); the DO stores only a hash. This preserves "fully anonymous" — the token is a bearer capability for one seat in one ephemeral room, not an identity.
- **Version window:** `acceptsProtocol` accepts the pinned version and supports a **2-version window during transitions** (spec §6): `Math.abs(client - pinned) <= 1` is rejected only when the client is *below* the room's minimum; we never mix protocols mid-game because the room is pinned at creation and a room never spans a deploy boundary it can't replay (§5, §7).

### 3.4 Profanity filter — `obscenity`, verified workerd-compatible

**Verification (done):** `obscenity` has **zero runtime dependencies**, is pure TypeScript, ships a real **ESM build** (`dist/index.mjs`), and even declares a `react-native` export condition — i.e. it uses no `node:` builtins and no native/`node-gyp` binaries. That is the exact profile that runs unmodified in workerd. **Decision: adopt `obscenity` at the input boundary.** (If a future audit ever surfaces an incompatibility, the fallback is `bad-words`, also pure-JS, but obscenity's transformer-based variant matching — `fuuuuuck`, leet, padding — is materially better for UGC moderation and worth keeping.)

Singleton matcher, built once per isolate (not per message), reused across hibernation wakes:

```ts
// room/profanity.ts
import { RegExpMatcher, englishDataset, englishRecommendedTransformers, TextCensor } from 'obscenity';

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
const censor = new TextCensor();

/** Returns censored text, or null if the whole name is profane (reject). */
export function sanitizeNickname(input: string): string | null {
  const trimmed = input.trim().slice(0, 20);
  const matches = matcher.getAllMatches(trimmed);
  if (matches.length === 0) return trimmed;
  const censored = censor.applyTo(trimmed, matches);
  // If censoring nuked essentially the whole name, reject so users don't ship "****".
  if (censored.replace(/[*]/g, '').trim().length === 0) return null;
  return censored;
}

/** For free-text game actions: censor in place (never reject mid-game UX). */
export function sanitizeGameText(input: string): string {
  const matches = matcher.getAllMatches(input);
  return matches.length ? censor.applyTo(input, matches) : input;
}
```

**This is the single text boundary** (spec §6/§7): nicknames at hello, and any player-entered free text inside a game `action` payload (prompt-and-guess games later). Game modules never see raw text — the shell filters *before* the value is handed to `reduce`, so the censored text is what gets event-sourced and is therefore deterministic on replay. Filter language packs default to English; additional locale datasets are a config concern (§9).

### 3.5 Host flag + host migration; reconnect tokens + grace

- **Host is a roster flag**, not a connection property (spec §6). First joiner is host. Host-gated actions (`startGame`, and Plan-2 kick/pick) check `roster[playerId].isHost` at the boundary; non-host → `err('NOT_HOST')`.
- **Disconnect** (`webSocketClose`): mark `roster[playerId].connected=false`, start a **disconnect-grace timer** in the mux (default **90s**, in the 60–120s band of spec §6), broadcast updated lobby (seat greyed, **not freed**). The seat and any game-relevant state are untouched.
- **Reconnect within grace:** `hello` with a valid `reconnectToken` → `reclaimSeat`: re-bind the socket, cancel the grace timer in the mux, mark connected, and **resync** — send a fresh `welcome` (same `playerId`, optionally rotated token) followed immediately by the current `view`/`lobby` so the phone catches up with zero game-state migration (nothing game-relevant ever lived on the phone).
- **Grace expiry** (mux fires the grace timer): emit a `playerLeft` **game event** into the loop (the module decides consequences — e.g. tracer treats a missing voter via its deadline path) and, **if the leaver was host**, the shell reassigns host to the **longest-connected** still-present player and re-broadcasts the lobby. Host migration is pure roster bookkeeping; "nothing migrates because no game state ever lives on a phone" (spec §6).

---

## 4. THE GAME LOOP — how the shell drives `GameModule`

The loop is the heart of the shell. One ordered pipeline per accepted action; the same pipeline runs for deadline and playerLeft/playerRejoined events.

### 4.1 Module registry + per-game action schema

The shell looks up the immutable `(id, version)` module and its **action zod schema**. The protocol leaves `action.payload` as `z.unknown()` on purpose — each game validates it server-side.

```ts
// room/registry.ts
import { tracer } from '@bloop/game-tracer';
import type { GameModule } from '@bloop/engine';
import { tracerActionSchema } from '../schemas/action.js';
import { z } from 'zod';

interface GameEntry<S, A, V, C> {
  module: GameModule<S, A, V, C>;
  actionSchema: z.ZodType<A>;     // validates action.payload at the boundary
}
const REGISTRY: Record<string, GameEntry<any, any, any, any>> = {
  'tracer@1': { module: tracer, actionSchema: tracerActionSchema },
};
export function lookupGame(id: string, version: number) {
  return REGISTRY[`${id}@${version}`] ?? null; // null => err('UNKNOWN_GAME')
}
```

`GameRuntime` caches the live `(entry, state, meta)` in memory between messages; it is rebuilt on wake by replay (§5).

### 4.2 The pipeline (action path)

```ts
private async onAction(ws: WebSocket, att: Attachment, msg: ActionMessage): Promise<void> {
  const rt = await this.runtime();                  // load/rehydrate game (§5)
  if (!rt) return this.send(ws, err('BAD_MESSAGE')); // no game running
  if (!att.playerId) return this.send(ws, err('BAD_MESSAGE'));

  // (1) Per-game action validation. Unknown payload shape => BAD_MESSAGE, no reduce.
  const a = rt.entry.actionSchema.safeParse(msg.payload);
  if (!a.success) return this.send(ws, err('BAD_MESSAGE'));

  // (1b) Free-text inside the action is profanity-filtered HERE, before reduce,
  //      so the censored value is what gets event-sourced (deterministic replay).
  const action = scrubActionText(a.data);            // no-op for tracer (vote target)

  // (2) Build the server-stamped GameEvent. `at` is the ONLY clock the module sees.
  const at = Date.now();
  const event: GameEvent<typeof action> = { type: 'action', playerId: att.playerId, action, at };

  await this.applyEvent(rt, event);                  // shared with deadline/leave paths
}
```

`applyEvent` is the single funnel — **persist before broadcast**, then run effects, then re-arm the alarm iff `phaseKey` changed:

```ts
private async applyEvent(rt: GameRuntime, event: GameEvent<unknown>): Promise<void> {
  const before = rt.state;
  const keyBefore = rt.entry.module.phaseKey(before);

  // (3) Pure reduce.
  const { state: after, effects } = rt.entry.module.reduce(before, event);

  // No-op events (rejected by the module) don't touch the log — keeps replay clean.
  if (after === before) { /* still run idempotent acks if any */ return; }

  // (4) PERSIST BEFORE BROADCAST (spec §7): append event, then maybe snapshot.
  this.store.appendEvent(event);                     // atomic insert into events table
  rt.state = after;
  rt.seq += 1;

  const keyAfter = rt.entry.module.phaseKey(after);
  const phaseChanged = keyAfter !== keyBefore;

  // (5) On phase entry: compute absolute deadline, persist it, re-arm the alarm (§6).
  let deadlineAt: number | null = null;
  if (phaseChanged) {
    const dur = rt.entry.module.phaseDurationMs(after);     // pure, ms or null
    deadlineAt = dur === null ? null : event.at + dur;       // absolute, persisted
    this.store.setMeta({ phaseKey: keyAfter, deadlineAt });
    this.mux.replacePhaseDeadline(deadlineAt, keyAfter);     // EDF re-arm (§6)
    this.store.maybeSnapshot(rt);                            // snapshot per phase transition
  } else {
    deadlineAt = this.store.getMeta().deadlineAt;            // keep the running deadline
  }

  // (6) Execute effects (analytics -> Analytics Engine; gameOver -> end-of-round + ad slot).
  for (const eff of effects) this.runEffect(rt, eff);

  // (7) Per-player redacted broadcast WITH deadlineAt (spec wire `view` message).
  this.broadcastViews(rt, deadlineAt);
}
```

### 4.3 Effects: analytics + gameOver

```ts
private runEffect(rt: GameRuntime, eff: Effect): void {
  switch (eff.type) {
    case 'analytics':
      // server-side, near-free; never PostHog from the DO (anonymity: spec §3)
      this.env.METRICS.writeDataPoint({
        blobs: [eff.name, rt.meta.code, rt.entry.module.id],
        doubles: [rt.seq],
        indexes: [rt.entry.module.id],
      });
      break;
    case 'gameOver':
      // freeze the room into a between-rounds state: persist final scores, mark
      // status='ended-round', arm the interstitial-ad cadence flag for clients.
      this.store.setMeta({ status: 'roundOver', finalScores: eff.scores });
      // The ad slot is purely a client concern (spec §3): the server just signals
      // round completion; the app shows the AdMob interstitial, then host re-picks.
      break;
  }
}
```

The **interstitial ad slot "between rounds"** (spec constraint) is realized as a server *signal*, not server-rendered: `gameOver` → the `view` broadcast carries the terminal view + `deadlineAt: null`; the client shows the AdMob interstitial (frequency-capped by remote config from `/config`), then the host starts the next game. The server never sees ad identifiers.

### 4.4 Per-player view broadcast

```ts
private broadcastViews(rt: GameRuntime, deadlineAt: number | null): void {
  for (const [playerId, ws] of this.conns.joined()) {
    const view = rt.entry.module.view(rt.state, playerId);   // per-player redaction
    this.send(ws, { type: 'view', gameId: rt.entry.module.id, view, deadlineAt });
  }
  // Spectators / not-yet-joined sockets get view(state, <theirCid>) which the
  // module is contractually required to render non-leaking (engine view() doc).
}
```

This is where redaction is enforced: each socket gets **only** `view(state, itsPlayerId)`. `deadlineAt` is the **absolute** timestamp (or null) so every phone shows the same countdown without trusting client clocks for authority — the server's alarm is the only authority; `deadlineAt` is display + optimistic local timeout.

### 4.5 Shell-owned persisted metadata

The shell persists its own room metadata, distinct from game `State` (which is reconstructed via the event log):

```ts
interface RoomMeta {
  code: string;                 // 4-char, == idFromName
  protocolVersion: number;      // pinned at creation (spec §6)
  status: 'reserved' | 'lobby' | 'playing' | 'roundOver' | 'ended';
  createdAt: number;
  lastActivityAt: number;       // drives TTL janitor (§5.4)

  // Game binding (set on startGame):
  gameId: string | null;
  gameVersion: number | null;
  seed: string | null;          // shell-generated at startGame; feeds module.init + replay
  contentRef: { gameId: string; contentId: string; version: number } | null; // R2 pack
  roster: PlayerId[] | null;    // FROZEN player order at init (engine: roster fixed at init)

  // Phase/timer authority (set on every phase entry):
  phaseKey: string | null;      // last entered phaseKey (idempotency guard, §6)
  deadlineAt: number | null;    // absolute ms; re-armed after rehydration
  schemaVersion: number;        // SQLite/event schema version (§5.3)
}
```

`seed` is generated once at `startGame` (`crypto.randomUUID()`), persisted, and reused for both the initial `init` and every rehydration `replay` — guaranteeing deterministic reconstruction. The `roster` is frozen at `startGame` from the connected players (2–16; reject `startGame` outside `[module.minPlayers, module.maxPlayers]`).

---

## 5. Event sourcing in DO SQLite

State is durable as **snapshot + event log**, never as in-memory-only data (spec §7).

### 5.1 Schema

```sql
-- room/store.ts migrate()
CREATE TABLE IF NOT EXISTS room_meta (
  k TEXT PRIMARY KEY,            -- single-row meta stored as k/v JSON, or one JSON blob
  v TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roster (
  player_id TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL,     -- {nickname, avatar} (nickname already filtered)
  is_host INTEGER NOT NULL,
  connected INTEGER NOT NULL,
  reconnect_hash TEXT NOT NULL,   -- hash(token); token itself never stored
  joined_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,  -- total order; replay order
  at INTEGER NOT NULL,                     -- server timestamp (GameEvent.at)
  kind TEXT NOT NULL,                      -- 'action'|'deadline'|'playerLeft'|'playerRejoined'
  payload_json TEXT NOT NULL,              -- the full GameEvent<A>, JSON
  schema_version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
  seq INTEGER PRIMARY KEY,        -- event seq this snapshot reflects (state AFTER seq)
  state_json TEXT NOT NULL,        -- full game State (JSON-serializable, null-proto safe)
  phase_key TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

### 5.2 Append-before-broadcast + rehydration

- **Append:** `appendEvent` is a single synchronous `sql.exec("INSERT INTO events ...")` — it commits before `broadcastViews` runs (§4.2 step 4 precedes step 7). DO storage writes are transactional within the turn; the send happens after.
- **Snapshot cadence:** `maybeSnapshot` writes a snapshot **on every phase transition** (spec §7) and, defensively, every N events (default N=64) to cap replay length for long games. Snapshots store the *full* `State` JSON.
- **Rehydration (`runtime()`):** on first use after wake/eviction/crash/deploy:

```ts
private async runtime(): Promise<GameRuntime | null> {
  if (this.game) return this.game;
  const meta = this.store.getMeta();
  if (!meta.gameId) return null;               // still in lobby

  const entry = lookupGame(meta.gameId, meta.gameVersion!);
  if (!entry) return null;                       // catalog/kill-switch removed it

  const content = await this.loadContent(meta.contentRef!);   // R2, cached
  const snap = this.store.latestSnapshot();      // {seq, state} | null
  const events = this.store.eventsAfter(snap?.seq ?? 0);      // tail only

  // Rebuild: snapshot state + fold the tail. If no snapshot, fold from init via replay().
  const state = snap
    ? events.reduce((s, e) => entry.module.reduce(s, e).state, snap.state)
    : replay(entry.module, meta.seed!, meta.roster!, content, events); // engine.replay

  this.game = { entry, state, meta, seq: this.store.maxSeq() };
  // Effects from replayed events are DROPPED (engine.replay contract) — no double analytics.
  return this.game;
}
```

This reuses `@bloop/engine`'s `replay()` (which already drops historical effects — exactly right, so eviction never re-emits analytics/gameOver). The deadline is **not** recomputed from scratch: `meta.deadlineAt` was persisted at phase entry, so the mux re-arms to the same absolute time after wake (§6) — the countdown survives eviction.

### 5.3 Schema versioning

Both `events` and `snapshots` carry `schema_version`. Migrations of the event/state shape are **one-way and reviewed like a public API change** (spec §7). On wake, if a persisted `schema_version` is older than the code's current version, an explicit, tested **upcaster** maps old events/snapshots forward before replay; absence of an upcaster for a gap is a hard error (room is unrecoverable → janitor wipes it, party is over anyway — an acceptable failure per spec §7). CI **rehydration/chaos tests** (spec §9) replay golden event logs from each prior schema version.

### 5.4 Room TTL janitor

`lastActivityAt` updates on every accepted event and lobby change. The janitor is a timer in the mux (§6) set to `lastActivityAt + ROOM_TTL` (default **45 min idle**, matching the "~45-minute session" framing in spec §2/§7; refreshed on activity). When it fires and the room is genuinely idle, the DO **deletes all storage** (`ctx.storage.deleteAll()` — drops the SQLite tables) and closes any stragglers; the code becomes reusable. A separate short **reserved-but-unborn** sweep reclaims codes reserved (§2.2) but never joined within 2 min.

---

## 6. SINGLE-ALARM MULTIPLEXER

A DO has exactly one alarm; `setAlarm` replaces it. The shell multiplexes three timer classes over it with **earliest-deadline-first**: (a) phase deadlines, (b) disconnect-grace timers, (c) the TTL janitor. The queue is a **pure data structure** (Tier-A unit-tested) plus a thin DO adapter that calls `ctx.storage.setAlarm`.

### 6.1 Persisted timer model + pure queue

```ts
// room/alarm-mux.ts
type TimerKind = 'phase' | 'grace' | 'ttl';
interface Timer {
  kind: TimerKind;
  fireAt: number;          // absolute ms
  key: string;             // phase: phaseKey ('vote:2'); grace: playerId; ttl: 'ttl'
}

/** Pure EDF queue. No Cloudflare, no clock — caller passes `now` and persists. */
export class AlarmQueue {
  private timers = new Map<string, Timer>();   // id() -> Timer (one per kind+key)
  private id(t: Pick<Timer,'kind'|'key'>) { return `${t.kind}:${t.key}`; }

  static load(store: Store): AlarmQueue {
    const q = new AlarmQueue();
    for (const t of store.loadTimers()) q.timers.set(q.id(t), t);  // rehydrate
    return q;
  }

  set(store: Store, t: Timer): void { this.timers.set(this.id(t), t); store.putTimer(t); }
  clear(store: Store, kind: TimerKind, key: string): void {
    this.timers.delete(this.id({ kind, key })); store.deleteTimer(kind, key);
  }

  /** Phase deadline is singular: replace any existing phase timer. null clears it. */
  replacePhaseDeadline(store: Store, fireAt: number | null, phaseKey: string): void {
    for (const t of [...this.timers.values()]) if (t.kind === 'phase') this.clear(store, 'phase', t.key);
    if (fireAt !== null) this.set(store, { kind: 'phase', fireAt, key: phaseKey });
  }

  earliest(): Timer | null {
    let best: Timer | null = null;
    for (const t of this.timers.values()) if (!best || t.fireAt < best.fireAt) best = t;
    return best;
  }

  /** All timers due at or before `now`, earliest first (idempotent fire set). */
  due(now: number): Timer[] {
    return [...this.timers.values()].filter(t => t.fireAt <= now).sort((a,b)=>a.fireAt-b.fireAt);
  }
}
```

### 6.2 DO adapter: arm + fire (idempotent, phaseKey-guarded)

```ts
// inside RoomDO
private async armAlarm(): Promise<void> {
  const next = this.mux.earliest();
  if (next) await this.ctx.storage.setAlarm(next.fireAt);   // single alarm = earliest
  else await this.ctx.storage.deleteAlarm();                // nothing pending -> no dangling timer (§7)
}

async alarm(): Promise<void> {
  const now = Date.now();
  for (const t of this.mux.due(now)) {
    switch (t.kind) {
      case 'phase': {
        const rt = await this.runtime();
        if (!rt) break;
        // IDEMPOTENCY GUARD: only fire if the room is still in the phase this timer
        // was armed for. A late/duplicate alarm whose phaseKey != current is a no-op.
        if (rt.entry.module.phaseKey(rt.state) !== t.key) { this.mux.clear(this.store, 'phase', t.key); break; }
        await this.applyEvent(rt, { type: 'deadline', at: now });   // module advances phase
        // applyEvent re-arms the phase timer via replacePhaseDeadline on the new phaseKey.
        break;
      }
      case 'grace': {
        this.mux.clear(this.store, 'grace', t.key);
        await this.onGraceExpired(t.key /* playerId */, now);        // §3.5 leave + host migrate
        break;
      }
      case 'ttl': {
        if (this.isIdleSince(t.fireAt)) return this.destroyRoom();   // §5.4 wipe; returns early
        this.mux.set(this.store, { kind:'ttl', key:'ttl', fireAt: this.store.getMeta().lastActivityAt + ROOM_TTL });
        break;
      }
    }
  }
  await this.armAlarm();   // re-arm to the new earliest (or delete if empty)
}
```

**Why this is correct and cheap:**
- **One alarm at a time**, always the earliest pending deadline — `armAlarm` is called after every mutation that touches timers and at the end of every `alarm()`.
- **Idempotent firing:** the `phaseKey` guard makes a stale phase alarm a no-op (if a vote already advanced the phase before the alarm fired, the timer's `key` no longer matches current `phaseKey`). This is the same `phaseSeq`-style guard the spec §6 mandates, expressed through the §0.1 `phaseKey` contract.
- **Survives hibernation/eviction:** timers are persisted (`store.putTimer`), the queue is rebuilt in the constructor, and `deadlineAt` is absolute — so after a wake the alarm re-arms to the original fire time, not "now + duration."
- **Grace and TTL** ride the same alarm; a disconnect simply `set`s a `grace` timer and re-arms; nothing requires a second alarm or a `setInterval`.

---

## 7. Hibernation discipline, billing guards, deploy handling, rate limiting

### 7.1 Hibernation discipline (the billing-critical rules)

The DO is billed for wall-clock time it is **kept in memory**. A dangling timer/promise pins it and silently 5–10×'s the GB-s bill (spec §7/§13). Enforced rules (code-review checklist):

1. **Always `ctx.acceptWebSocket(ws)`** — never `ws.accept()`. With hibernation, an idle room with open sockets bills ~nothing; the runtime evicts it and wakes it on the next message/alarm.
2. **No `setInterval`/`setTimeout`** anywhere in the DO. *All* time-based work goes through the alarm mux (§6). A lingering `setInterval` is the canonical foot-gun.
3. **No unawaited "fire-and-forget" promises** left running after a handler returns. Effects (§4.3) are synchronous (Analytics Engine `writeDataPoint` is sync-ish/non-blocking; R2 content fetch is awaited inside `runtime()` and cached). If async work is unavoidable, wrap it in `ctx.waitUntil` so it doesn't pin the object beyond its lifetime.
4. **State only in storage**, never memory-only: in-memory `this.game`/`this.conns`/`this.mux` are *caches* rebuilt from SQLite + `ctx.getWebSockets()` on wake. Losing them to eviction is correct, not a bug.
5. **Attachments hold IDs only** (§3.2) — staying under ~2KB.

**What wakes the DO:** an inbound `webSocketMessage`, a `webSocketClose`/`Error`, the single `alarm()` firing, or an RPC/`fetch` from the front door. Between those, with hibernation on, it sleeps. A room sitting in a lobby with players connected but silent costs essentially nothing until someone acts or a timer fires.

**Billing alerts from week one** (spec §7): a Cloudflare billing alert on DO active duration; `observability.enabled` for request/duration telemetry; a CI lint that greps the DO source for `setInterval`/`setTimeout`/`ws.accept(` and fails the build.

### 7.2 Deploy-restarts-DO handling

Deploys restart live DOs (spec §7). Because all state is event-sourced (§5) and timers + `deadlineAt` are persisted (§6), a restarted DO:
1. Runs its constructor → `migrate()` (idempotent `IF NOT EXISTS`) → `AlarmQueue.load` → `ConnectionRegistry.fromHibernation`.
2. Lazily rehydrates `runtime()` (snapshot + tail fold) on the next message/alarm.
3. Re-arms the alarm to the persisted earliest deadline — **the countdown resumes at the right absolute time**, not reset.

Sockets are dropped by the restart; clients auto-reconnect (PartySocket) and `hello`-with-`reconnectToken` resyncs within grace (§3.5). A mid-reveal deploy therefore costs a sub-second reconnect blip, not a lost room. CI **chaos tests** (spec §9) simulate this by forcing eviction (`vitest-pool-workers`) and asserting state + deadline equality.

### 7.3 Protocol/version pinning across deploys

The room pins `protocolVersion` at creation; a deploy that bumps the protocol does **not** repin a live room. New rooms get the new version; existing rooms finish on their pinned version (2-version support window, §3.3). A client that updated mid-session and now speaks a version outside the room's window gets `UPGRADE_REQUIRED` only if genuinely incompatible — otherwise the window absorbs it.

### 7.4 Rate limiting at the message boundary

Per-connection **token bucket**, in memory (rebuilt on wake; abuse across a wake boundary is bounded by the wake itself):

```ts
// room/ratelimit.ts
class TokenBucket {
  constructor(private cap = 20, private refillPerSec = 10, private tokens = cap, private last = Date.now()) {}
  take(now = Date.now()): boolean {
    this.tokens = Math.min(this.cap, this.tokens + ((now - this.last) / 1000) * this.refillPerSec);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1; return true;
  }
}
```

Defaults: **burst 20, ~10 msg/s sustained** per connection (party games are low-rate: a vote, a tap). Plus a hard **per-message size cap** (`MAX_MSG_BYTES`, default 4KB) and the zod parse (§3.3) — a message failing the bucket is dropped (optionally one `BAD_MESSAGE` then silence); repeated abuse closes the socket. This is the single choke point, co-located with validation and the profanity filter (spec §7: "rate limiting + zod validation + profanity filter at the single DO message entry point").

---

## 8. Task-level build plan (ordered, bite-sized, TDD-able)

Each task is a small PR with tests written first. Tier-A = pure Vitest; Tier-B = `vitest-pool-workers`.

**Phase 0 — contract + scaffold**
1. **`phaseKey` amendment** to `@bloop/engine` (+ bump to 0.0.2); add `phaseKey` to `tracer`; Tier-A tests asserting `phaseKey` changes on phase entry and is stable within a vote phase. *(blocks everything)*
2. **`apps/server` scaffold**: wrangler.jsonc, package.json, tsconfig, `wrangler types`, empty `RoomDO` + Hono `/health`. Tier-B smoke test (`/health` 200; DO instantiates).

**Phase 1 — front door**
3. **Room-code module** (alphabet, `generateRoomCode`, `isBlockedCode`, entropy doc). Tier-A: distribution, blocklist, length/charset.
4. **`POST /rooms` + `tryClaim`/`createRoom` RPC** with collision retry. Tier-B: two creates collide deterministically (seeded RNG) and resolve; meta pinned.
5. **`/config` (KV)**. Tier-B with miniflare KV.

**Phase 2 — connection + join**
6. **WS upgrade + `ctx.acceptWebSocket` + Attachment** (ids only). Tier-B: upgrade succeeds, attachment round-trips through a simulated wake.
7. **Boundary pipeline**: size cap + `clientMessageSchema` zod + `TokenBucket`. Tier-A on bucket; Tier-B on parse/limit rejecting `BAD_MESSAGE`.
8. **`hello` flow**: version handshake (`UPGRADE_REQUIRED`), seat assignment, `welcome`+`reconnectToken`, `lobby` broadcast. Tier-B end-to-end.
9. **Profanity boundary** (`obscenity` singleton, `sanitizeNickname`/`sanitizeGameText`). Tier-A (runs in Node) + Tier-B (workerd import smoke — proves it loads in the isolate).

**Phase 3 — persistence**
10. **`Store`**: `migrate`, `room_meta`, `roster`, `events`, `snapshots`, timer CRUD. Tier-B: schema creation, append, query tail.
11. **Event sourcing wiring**: `appendEvent` before broadcast; `maybeSnapshot` on phase change. Tier-B: append-before-send ordering assertion.
12. **Rehydration** (`runtime()` snapshot+fold, falling back to `replay()`); drop replayed effects. Tier-B **chaos**: force eviction mid-game, assert state equality and no duplicate analytics.

**Phase 4 — game loop + alarms**
13. **Registry + per-game action schema** (`tracerActionSchema`). Tier-A schema tests.
14. **`applyEvent` pipeline**: reduce → persist → effects → `phaseKey` re-arm → broadcast `view`+`deadlineAt`. Tier-B: a full tracer round (vote → reveal → next round → over) over sockets, asserting per-player redaction (reuse `leakedSecrets`).
15. **`AlarmQueue`** (pure EDF). Tier-A: EDF ordering, `replacePhaseDeadline`, `due`, rehydrate from timers.
16. **DO alarm adapter**: `armAlarm`/`alarm()` with `phaseKey` idempotency guard. Tier-B: deadline fires `deadline` event; duplicate/stale alarm is a no-op; alarm re-arms to next phase.

**Phase 5 — lifecycle**
17. **Disconnect grace + reconnect resync** (`webSocketClose` → grace timer; `hello`+token → `reclaimSeat`). Tier-B: disconnect, reconnect within grace, full resync; expiry → `playerLeft`.
18. **Host flag + migration** on grace expiry. Tier-B: host leaves → longest-connected becomes host; `NOT_HOST` enforcement.
19. **TTL janitor** + reserved-code sweep + `destroyRoom` (`deleteAll`). Tier-B: idle room wipes; code reusable.

**Phase 6 — hardening**
20. **Effects → Analytics Engine**; `gameOver` → `roundOver` + interstitial signal. Tier-B: `writeDataPoint` called once per analytics effect (not on replay).
21. **Billing-discipline CI lint** (grep for `setInterval`/`setTimeout`/`ws.accept(`), deploy-restart chaos test, schema-version upcaster test harness.
22. **Load smoke**: N-room × 16-socket script against `wrangler dev` (pre-launch gate, spec §9).

---

## 9. Open questions (genuinely undecided)

1. **partyserver depth.** Default chosen: extend `DurableObject<Env>` directly, use partyserver only for front-door routing. Open: whether partyserver's connection/room ergonomics are worth adopting on the non-critical path, or whether to drop the dependency entirely (it's 0.x — spec §13 flags ecosystem maturity).
2. **Profanity locales.** Default English dataset only. Open: do we ship additional `obscenity` language packs at launch, and is the filter list itself remote-configurable (KV) so we can tune it without a deploy? Censor-vs-reject threshold for nicknames is also tunable.
3. **Reconnect-token rotation.** Default: stable token for the seat's life. Open: rotate on each reclaim (better against token theft, slightly more client bookkeeping) — security-vs-simplicity for an ephemeral anonymous capability.
4. **Snapshot cadence N.** Default: every phase transition + every 64 events. Open: tune N from real game lengths; most party games are short enough that per-phase alone may suffice.
5. **Mid-game rejoin vs roster-fixed.** Engine fixes the roster at `init`; we reject fresh joins once `status='playing'`. Open: do any planned games want late spectators (view-only sockets that never enter the roster)? The `view()` spectator-safe contract already supports it; the only question is product/UX, not architecture.
6. **Room TTL value.** Default 45 min idle. Open: confirm against analytics once real sessions exist; possibly remote-config it per game.
7. **`ROOM_FULL` vs a dedicated mid-game-join error.** We currently reuse `ROOM_FULL` for "game already started." A distinct code (e.g. `GAME_IN_PROGRESS`) would be clearer but is an additive protocol change — defer unless the client needs to distinguish the two UX paths.

---

## 10. Summary of decisions (quick reference)

| Area | Decision |
|---|---|
| Project | `apps/server` in the pnpm workspace; `DurableObject<Env>` direct; hono + obscenity + engine + protocol |
| Room codes | 31-char unambiguous alphabet, length 4, 923k space, collision via per-DO `tryClaim` (no global DB) |
| Sockets | Hibernatable only (`ctx.acceptWebSocket`); attachments hold IDs only (~2KB) |
| Boundary | rate-limit → zod → route → profanity → reduce → persist → broadcast, one entry point |
| Profanity | `obscenity` (verified zero-dep pure-TS ESM, workerd-safe), singleton, censor nicknames + game text before reduce |
| Contract change | add pure `phaseKey(state): string` to `GameModule`; shell re-arms alarm iff `phaseKey` changes |
| Game loop | server-stamped `GameEvent.at`; pure `reduce`; per-player `view`+absolute `deadlineAt`; effects→Analytics Engine/gameOver |
| Persistence | DO SQLite: `events` + `snapshots` + `room_meta` + `roster`; append-before-broadcast; snapshot per phase; `replay()` rehydrate; schema-versioned upcasters |
| Alarms | single-alarm EDF multiplexer over phase/grace/ttl; idempotent via `phaseKey` guard; absolute `deadlineAt` survives eviction |
| Lifecycle | 90s disconnect grace, reconnect-token resync, host = roster flag with migration, 45-min TTL janitor wipes the room |
| Billing | no `setInterval`/dangling promises; state in storage; billing alert + CI lint from week one |

---

## Adversarial review

Reviewer: adversarial Cloudflare Workers/Durable Objects pass, 2026-06-10. Scope: hunt for real Cloudflare-specific flaws before any code is written. Claims below were verified against current Cloudflare docs (Durable Objects limits, alarms, WebSocket hibernation), the engine source (`packages/engine/src/{types,replay}.ts`), and the tracer module (`packages/games/tracer/src/{tracer,state}.ts`). The overall shape is sound — event-sourced, hibernation-first, single-alarm EDF, pure-module firewall are all the right calls. The findings are about specific mechanisms that will bite in production, plus three factual errors in load-bearing constraints.

### Critical

**C1. Snapshot rehydration silently destroys the null-prototype invariant — reintroducing the exact prototype-pollution hole §0 calls load-bearing.**
The design stores game `State` as `state_json` (§5.1) and rehydrates the snapshot path as `events.reduce((s, e) => reduce(s, e).state, snap.state)` where `snap.state` comes from the snapshots table (§5.2). But the doc never says how `state_json` becomes `snap.state`. The only mechanism is `JSON.parse(state_json)`. `JSON.parse` **always produces default-prototype objects** — it cannot reconstruct `Object.create(null)`. Tracer's `votes`/`scores` are explicitly null-proto maps (`emptyPlayerMap`, `tracer.ts`), and §0 invariant 6 + line 25 make "player-keyed maps are null-prototype" a hard rule because `playerId` is an untrusted string that could be `"__proto__"`/`"constructor"`. After the *first snapshot rehydration*, every player-keyed map in the live state is a normal-prototype object again, and the very next `reduce` that does `Object.assign(emptyPlayerMap(), state.votes, {[playerId]: target})` is fine for the *new* object but `state.votes['__proto__']` reads/writes now hit the prototype. The pollution firewall holds in pure unit tests (which never round-trip through JSON) and holds on the *replay-from-init* path (which rebuilds via `init`), but breaks specifically on the snapshot path — which is the common path for any game longer than one phase. This is a redaction/integrity hole that Tier-A tests will never catch because they don't serialize. Fix: the snapshot path must NOT be a generic `JSON.parse`. Either (a) require modules to expose a `revive(json): State` (additive contract method) that reconstructs null-proto maps, or (b) drop snapshots entirely for null-proto-bearing state and always rehydrate via `replay()` from init (correctness over replay-length optimization — most party games are short, §9.4 already suspects per-phase snapshots are overkill), or (c) deep-rebuild known map fields. Whatever the choice, add a chaos test that snapshots, rehydrates, then feeds a `__proto__`-keyed action and asserts no pollution. As written the doc ships the bug it claims to have fenced.

**C2. Alarm at-least-once + the EDF `due()` loop is not idempotent for grace/ttl/gameOver, only for phase.**
Verified: DO alarms are at-least-once with automatic retry (exponential backoff, up to 6 retries) whenever `alarm()` throws. The design's idempotency story (§6.2) only protects the `phase` kind via the `phaseKey` guard. The `alarm()` handler processes the *entire* `due(now)` set in one turn and re-arms at the end. If anything in that loop throws *after* some timers already produced durable side effects — e.g. `onGraceExpired` appended a `playerLeft` event and migrated host, then the `ttl` branch or a later `phase` branch throws — the whole `alarm()` is retried from the top. On retry, the already-cleared `grace` timer is gone (good), but `onGraceExpired`'s effects (the `playerLeft` event, host reassignment broadcast) may double-apply if `clear` was the last durable write before the throw, or the `playerLeft` event gets appended twice if `appendEvent` succeeded but `clear` did not (writes within a turn are coalesced and committed together on success, but a *throw* rolls the turn back — so the risk is the opposite: a partially-effected turn that the module is not built to make idempotent). Worse: the `gameOver` effect (§4.3) sets `status='roundOver'` and is fired from `applyEvent`, which is called from the `deadline`/`phase` branch inside `alarm()`. A `deadline` that triggers `gameOver`, persists, broadcasts, then the handler throws during `armAlarm` → retry → `phaseKey` is now `over`, the phase timer was cleared, so the `deadline` event is NOT re-applied (guard makes it a no-op) — meaning the **alarm is never re-armed for whatever else was pending**, because the retried run's `due()` set may now be empty and `armAlarm` runs against an empty queue. Net: a throw at the wrong instant can either double-fire grace/host-migration or drop a pending ttl/grace re-arm. Fix: (1) wrap the body of each `due()` branch so a throw in one timer cannot abort the others (catch per-timer, log, continue); (2) make `onGraceExpired` and `gameOver` idempotent against the persisted log (check "did I already emit playerLeft for this playerId at this seq?" before appending); (3) follow Cloudflare's own guidance — catch inside `alarm()` and explicitly re-`setAlarm` rather than letting the handler throw and relying on the 6-retry budget; (4) test "alarm handler throws after partial effect, retry, assert no double playerLeft and alarm still armed."

**C3. `destroyRoom`/`deleteAll()` does not delete the alarm or close hibernating sockets, and the DO id is immortal — a wiped room can be woken by its own dangling alarm and a reused code lands on stale state.**
`ctx.storage.deleteAll()` drops SQLite tables but (a) does **not** clear the alarm and (b) does not evict the object or terminate hibernated WebSockets. The janitor's `ttl` branch calls `destroyRoom()` and `return`s *before* the trailing `armAlarm()` (§6.2), so whatever alarm was set persists and will wake a now-empty DO; on wake the constructor re-runs `migrate()` (recreating empty tables) and the room looks "reserved/blank" rather than gone. Separately, `idFromName(code)` is permanent — once the code is "reusable," the next `tryClaim` for that code hits the **same** DO instance. If that instance still holds hibernating sockets from the previous party (deleteAll doesn't close them) or a residual alarm, the new room inherits ghosts. Fix: `destroyRoom()` must, in order, `for (const ws of ctx.getWebSockets()) ws.close(1000)`, then `ctx.storage.deleteAlarm()`, then `ctx.storage.deleteAll()`, then clear all in-memory caches; and `tryClaim` must treat "tables exist but status is missing/ended" as claimable while explicitly closing any leftover sockets. Also document that `deleteAll()` is a same-turn op and that the code-reuse window depends on the janitor having run — two parties racing the same freed code serialize through the one DO (correct) but the second must see a fully wiped state.

### Important

**I1. Factual error: `serializeAttachment` limit is 16 KiB (16,384 bytes), not "~2KB".** The doc repeats "~2KB limit" four times (§3.2 heading, §3.2 body, §7.1 rule 5, §10 summary) and treats it as the constraint justifying "IDs only." Verified limit is **16,384 bytes**. Storing IDs only is still the right call, but a design that states a load-bearing platform constraint wrong by 8× will mislead the implementer (e.g. someone may over-engineer to fit a phantom 2 KB budget, or a reviewer may wave through something that violates the *real* 16 KB). Fix: correct the number everywhere; keep the "IDs only" decision (it's correct for a different reason — attachments are per-socket and you don't want roster/profile drift between attachment and SQLite).

**I2. Room-code case handling is internally inconsistent and will reject valid joins.** §2.1 says codes are "case-insensitive on input, uppercased server-side." But the WS upgrade route in `src/index.ts` is `/^\/rooms\/([A-Z2-9]{4})\/ws$/` — it matches **only uppercase**, so a lowercase deep link (`partyapp://join/abcd`, or any client that doesn't pre-uppercase) 404s *before* any server-side uppercasing can run. The `POST /rooms` response hands back `wsPath: /rooms/${code}` (already uppercase) so the happy path works, but QR/deep-link/manual-entry paths that the spec explicitly supports ("4-char code/QR", deep link) can produce lowercase. There is no normalization layer; `getByName(m[1])` uses the raw matched segment. Fix: normalize at the single front-door entry (`code = raw.toUpperCase()`) and make the route regex case-insensitive (`/i`) or `[A-Za-z2-9]`, then uppercase before `getByName`. Otherwise `idFromName('abcd') !== idFromName('ABCD')` routes the creator and a joiner to two different DOs.

**I3. `tryClaim()` does I/O-free local storage only, but the constructor's `blockConcurrencyWhile` + the reserve/create split has a lost-reservation window.** The reservation (`tryClaim` → `status='reserved'`) and `createRoom` are two separate RPCs from possibly two different front-door isolates. A front-door Worker that successfully `tryClaim`s can die (or its request can be cancelled) before calling `createRoom`, leaving a `reserved` DO occupying the code until the 2-minute sweep. Under a viral spike that's a slow code-space leak, not just a rare event. More subtly: `tryClaim` reads `room_meta` inside `blockConcurrencyWhile`, but the docs warn `blockConcurrencyWhile` should wrap only fast local storage ops — that's fine here, but note the constructor *also* uses `blockConcurrencyWhile` for `migrate()` + `AlarmQueue.load` + `fromHibernation`, and `fromHibernation` iterates `ctx.getWebSockets()`. Keep all of that synchronous/local; if `loadContent` (R2) ever creeps into the constructor it will serialize and stall every request. Fix: fold reserve+create into a single `createRoom` RPC (the front door generates the code, calls one idempotent `createRoom(code)` that does test-and-set-and-init atomically, retries on `false`); drop the separate `tryClaim` round-trip. This also closes the orphaned-reservation window.

**I4. `after === before` reference-equality no-op detection is a fragile, unspecified contract.** §4.2 skips logging when `after === before`. This depends on every module returning the *same object reference* on a rejected/no-op event. Tracer happens to (`return { state, effects: [] }`), but the `GameModule` interface (`packages/engine/src/types.ts`) does **not** require it — a module that returns `{ state: {...state}, effects: [] }` on a no-op (a very natural thing to write) would defeat the check, log a no-op event, snapshot needlessly, and — combined with C1 — round-trip extra state through JSON. Fix: either make reference-stable-on-no-op an explicit, tested clause of the engine contract (and add a property test across all registered modules), or have the shell detect no-ops structurally/explicitly (e.g. modules return an `accepted: boolean`, or the shell diffs `phaseKey`+a cheap `seq` the module bumps). Don't leave correctness riding on an undocumented identity coincidence.

**I5. The `view`/`deadlineAt` redaction guarantee is asserted but the broadcast path can leak via spectator sockets, and there's no enforcement.** §4.4 sends `view(state, playerId)` to joined sockets and notes spectators "get `view(state, <theirCid>)` which the module is contractually required to render non-leaking." But the engine `view` contract only promises non-leaking for *unknown viewers*; passing a raw `cid` (a UUID that is not a roster `playerId`) relies on the module treating any non-roster string as a spectator. Tracer's `view` does handle this (it indexes `votes[viewer]`/`scores[viewer]` with `?? null`/default), but again this is an unenforced cross-cutting requirement. The spec calls the redaction audit "the one leak class that matters most." Fix: add the automated redaction audit (spec §9) as a Tier-A test that serializes `view()` for a non-player id and asserts no hidden field (e.g. `votes`) appears — and run it for every registered module in the registry, not just hand-written per game.

**I6. zod v4 bundle-size and import-path risk against the Worker size limit.** The doc pins `"zod": "^4"`. Verified: zod v4 is ~4× larger than v3 in bundled output, and the Worker bundle limit is 3 MiB (free) / 10 MiB (paid). hono + obscenity (ships a full English dataset) + zod v4 + engine/protocol is probably under 10 MiB, but this is unmeasured and the doc treats it as free. Also zod v4 has a subpath story (`zod` vs `zod/v4`/`zod/mini`) that affects tree-shaking; `z.unknown()` payloads + per-game schemas are cheap, but obscenity's dataset is the real weight. Fix: add a Phase-0 bundle-size gate (`wrangler deploy --dry-run --outdir` and assert size budget in CI), and evaluate `zod/mini` for the hot-path schemas. This is a watch-item, not a blocker, but it should be a measured number before launch, not an assumption.

### Minor

**M1. partyserver 0.x API drift is already half-acknowledged but the doc still references `getByName` as if it's partyserver's.** §2 uses `env.ROOM.getByName(code)` — that's the native `DurableObjectNamespace.getByName` (confirmed to exist, shorthand for `idFromName`+`get`), which is good and keeps partyserver off the path. But the §1.3 note and §9.1 leave partyserver's role fuzzy ("front-door routing helper"). Given the default is "extend `DurableObject<Env>` directly," consider dropping partyserver entirely for v0 — `routePartykitRequest` adds a `/parties/:server/:name` URL convention you don't use (you use `/rooms/:code/ws`), so it earns nothing on the front door either. One fewer 0.x dependency on the critical path.

**M2. `MAX_MSG_BYTES` is checked as `raw.length` (UTF-16 code units), not bytes.** §3.3 does `raw.length > MAX_MSG_BYTES`. For a JS string, `.length` is code-unit count, not byte count; multibyte chars (emoji nicknames) make this an under-count vs a true byte cap. Harmless for a 4 KB cap, but if the intent is a byte budget, measure bytes. Also the 32 MiB *received* WebSocket frame limit means the runtime won't pre-reject large frames the way the design implies — your 4 KB cap is the real first line of defense, so make it actually count bytes.

**M3. `acceptsProtocol` logic in §3.3 is self-contradictory.** The prose says "supports a 2-version window … `Math.abs(client - pinned) <= 1` is rejected only when the client is *below* the room's minimum" — `Math.abs(...) <= 1` and "below minimum" are different predicates mashed together. Pin down the actual rule (likely: accept iff `client >= roomMin && client <= pinned + window`) and unit-test the boundaries; as written it's ambiguous about a client one version *above* the pinned room.

**M4. Analytics Engine `writeDataPoint` is described as "sync-ish/non-blocking" — fine, but confirm it doesn't need `waitUntil`.** §4.3/§7.1 lean on it being effectively fire-and-forget that doesn't pin the DO. That's accurate (it's buffered, non-blocking), but the doc should state the rule explicitly: never `await` it, never wrap it in a promise the handler returns. Equally, the R2 `loadContent` fetch IS awaited inside `runtime()` — confirm that only happens on the cold-rehydration path and is cached, otherwise it stalls the first message after every wake (acceptable once, but document the cache lifetime tied to the isolate, not the DO).

**M5. Content/`ContentPack` shape mismatch in the rehydration call.** §5.2's `replay(entry.module, meta.seed!, meta.roster!, content, events)` passes `content` from `loadContent(meta.contentRef!)`, but `replay`/`init` expect a `ContentPack<C>` (`{id, version, data}`), while tracer reads `content.data.prompts`. Make sure `loadContent` returns the wrapped `ContentPack`, not the raw R2 JSON body — otherwise `init` dereferences `content.data` on an unwrapped object. Trivial, but it's the kind of shape slip that only surfaces in the Tier-B rehydration test.

### Verdict

Architecture is **sound with fixes**. The event-sourced + single-alarm-EDF + hibernation-first design is correct for this domain and the seams are drawn well. C1 (null-proto loss on snapshot rehydration) is a genuine security-relevant defect that must be fixed before any snapshot code lands, C2 (alarm at-least-once non-idempotency for grace/ttl/gameOver) and C3 (`deleteAll` leaves alarm + sockets + immortal id) are real Cloudflare-semantics bugs that the current chaos-test plan would not necessarily catch. None require redesign — they're mechanism fixes plus three corrected facts (16 KiB attachment limit, code case-normalization, single-RPC create).
