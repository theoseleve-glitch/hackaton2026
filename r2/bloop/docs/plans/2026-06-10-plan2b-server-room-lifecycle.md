# Bloop Plan 2b — `apps/server` Workers Scaffold + Room Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `apps/server` from the server-shell design (`docs/designs/2026-06-10-server-shell-design.md` §§1–3, §5.4) with rooms joinable over hibernatable WebSockets — NO game loop (reduce/effects/event-sourcing/alarm-mux are Plan 2c). Deliverables: wrangler scaffold (SQLite-backed `RoomDO` via `new_sqlite_classes`, KV `CONFIG`), Hono front door (`POST /rooms` with the adversarial review's **I3** single-RPC test-and-set, `/health`, `/config`), and room lifecycle: hello/version handshake (`UPGRADE_REQUIRED`, **M3** rule pinned), obscenity profanity boundary on nicknames (+ workerd import smoke test), host flag + migration on disconnect-grace expiry, hashed-at-rest reconnect tokens + 90s grace, lobby broadcasts, TTL janitor with the **C3** destroy ordering (close sockets → `deleteAlarm()` → `deleteAll()`), ghost-socket eviction on code reclaim, **I2** case-insensitive codes. Pure-Node suite grows 91 → **107**; a NEW in-runtime workerd suite lands at **28**.

**Architecture:** The DO is a thin orchestrator; decisions are pure modules (`room-code`, `tokens`, `protocol-window`, `profanity`, `host`) tested in plain Node (Tier A); wiring (sockets, SQLite, alarms) is tested in-runtime with `@cloudflare/vitest-pool-workers` (Tier B) — design §1.5's split. Per design §1.3 + review **M1**, `partyserver` is **dropped entirely**: hibernation-critical calls go straight to `ctx.acceptWebSocket`/`serializeAttachment`/`ctx.storage`, and front-door routing is a 10-line regex. 2c seams are explicit: `sweep(now)`/`armAlarm()` are the placeholder the §6 AlarmQueue EDF multiplexer replaces (adding the `phase` timer kind), `Store.migrate()` is where `events`/`snapshots` tables join, `onStartGame` is where the registry slots in. Attachments hold **IDs only** (real limit 16 KiB — review **I1**; profiles/host/grace live in SQLite `roster`, so attachment and roster can never drift).

**Tech Stack (verified against npm + Cloudflare docs, 2026-06-10):**
- `@cloudflare/vitest-pool-workers` **0.12.21 (exact pin)** — the LAST version with peer `vitest 2.0.x - 3.2.x`; 0.13.0+ requires vitest `^4.1.0` and would fork the repo's vitest major. The repo stays on vitest `^3.2.0`.
- `wrangler` `^4.72.0` (what pool-workers 0.12.21 pairs with), `@cloudflare/workers-types` `^4.20260610.1`.
- `compatibility_date` **2026-03-01** — must not exceed the workerd bundled with pool-workers 0.12.21 (miniflare `4.20260310.0`) or the test pool fails to start.
- `hono` `^4.12.0`; `obscenity` `^0.4.6` (verified zero-dep pure-TS ESM; censoring empirically checked in Node: `'fuck yeah'` → `'**** yeah'`, `'fuuuuck'` → fully censored).
- Cloudflare known issue: **WebSockets + Durable Objects do not work with per-test isolated storage** → Tier-B config MUST set `singleWorker: true` + `isolatedStorage: false`, so **every Tier-B test uses a unique room** (fresh `POST /rooms` code or a fixed never-reused literal).

**Conventions for every task:**
- Working directory is `C:\Users\Admin\Documents\Hacktaton26\r2\bloop` unless stated otherwise.
- pnpm is at `C:\Users\Admin\AppData\Roaming\npm\pnpm.cmd` (plain `pnpm` resolves to it in PowerShell). pnpm 11.5.2, Node 20+.
- Git: the repo root contains unrelated untracked files. ONLY ever `git add r2/bloop/<specific paths>` (from repo root) or `git add .` from inside `r2/bloop`. NEVER `git add -A` from the repo root.
- Branch: `r3`. Baseline before Task 1: `pnpm test` → 17 files, 91 tests, green (verified).
- **Two suites, two commands.** Tier A (pure Node): `pnpm test` from `r2/bloop`. Tier B (workerd): `pnpm --filter @bloop/server test`. Run BOTH at the end of every task. Tier B is slow on first run (workerd download/spawn) and serializes (singleWorker).
- DO source must NEVER contain `setInterval`/`setTimeout`/`ws.accept(` (billing §7.1). Test files may use `setTimeout` (client-side test code, not DO code).
- All relative imports use the `.js` extension (repo convention; esbuild/vitest resolve to `.ts`).

---

### Task 1: `apps/server` scaffold + Tier-B smoke test

**Files:** Modify `pnpm-workspace.yaml`. Create `apps/server/`: `package.json`, `wrangler.jsonc`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `test/env.d.ts`, `test/smoke.test.ts`; (step 3) `src/types.ts`, `src/front-door/app.ts`, `src/room/room-do.ts`, `src/index.ts`.

- [ ] **Step 1: Scaffold config + write the failing smoke test**

`pnpm-workspace.yaml` (replace whole file):
```yaml
packages:
  - "packages/*"
  - "packages/games/*"
  - "apps/*"
allowBuilds:
  esbuild: true
  workerd: true
```

`apps/server/package.json`:
```json
{
  "name": "@bloop/server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@bloop/protocol": "workspace:*",
    "hono": "^4.12.0",
    "obscenity": "^0.4.6"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "0.12.21",
    "@cloudflare/workers-types": "^4.20260610.1",
    "typescript": "^5.7.3",
    "vitest": "^3.2.0",
    "wrangler": "^4.72.0"
  }
}
```

`apps/server/wrangler.jsonc` (design §1.2 trimmed to 2b scope — R2 + Analytics Engine bindings join in 2c):
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "bloop-room-server",
  "main": "src/index.ts",
  // <= workerd bundled with vitest-pool-workers 0.12.21 (miniflare 4.20260310.0)
  "compatibility_date": "2026-03-01",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "durable_objects": { "bindings": [{ "name": "ROOM", "class_name": "RoomDO" }] },
  // SQLite-backed DO (event log lands in 2c). NEVER new_classes for RoomDO.
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["RoomDO"] }],
  // replace the placeholder id before the first real deploy
  "kv_namespaces": [{ "binding": "CONFIG", "id": "00000000000000000000000000000000" }],
  "vars": { "ENV": "dev" }
}
```

`apps/server/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["@cloudflare/workers-types/experimental", "@cloudflare/vitest-pool-workers"]
  },
  "include": ["src", "test", "test-node", "vitest.config.ts"]
}
```

`apps/server/vitest.config.ts`:
```ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    include: ['test/**/*.test.ts'], // test-node/** runs under the ROOT vitest config in plain Node
    poolOptions: {
      workers: {
        // Cloudflare known issue: WebSockets + DOs do not work with per-test
        // isolated storage; documented workaround = shared storage, one worker.
        // Consequence: EVERY test must use a unique room code.
        singleWorker: true,
        isolatedStorage: false,
        wrangler: { configPath: './wrangler.jsonc' },
      },
    },
  },
});
```

`apps/server/.gitignore`:
```
.wrangler/
dist/
worker-configuration.d.ts
```

`apps/server/test/env.d.ts`:
```ts
import type { Env } from '../src/types.js';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}
```

`apps/server/test/smoke.test.ts`:
```ts
import { env, SELF, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { RoomDO } from '../src/room/room-do.js';

describe('scaffold smoke', () => {
  it('GET /health 200s and unknown routes 404', async () => {
    const health = await SELF.fetch('https://bloop.test/health');
    expect(health.status).toBe(200);
    expect(((await health.json()) as { ok: boolean }).ok).toBe(true);
    expect((await SELF.fetch('https://bloop.test/nope')).status).toBe(404);
  });

  it('RoomDO instantiates inside the runtime (SQLite-backed)', async () => {
    await runInDurableObject(env.ROOM.getByName('SMKE'), async (instance) => {
      expect(instance).toBeInstanceOf(RoomDO);
    });
  });
});
```

Run: `pnpm install` (from `r2/bloop`; pulls wrangler/workerd — slow once).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bloop/server test`
Expected: FAIL — the pool cannot find the entry point (`src/index.ts` does not exist).

- [ ] **Step 3: Implement**

`apps/server/src/types.ts`:
```ts
import type { RoomDO } from './room/room-do.js';

export interface Env {
  ROOM: DurableObjectNamespace<RoomDO>;
  CONFIG: KVNamespace;
  ENV: string;
}
```

`apps/server/src/room/room-do.ts`:
```ts
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types.js';

export class RoomDO extends DurableObject<Env> {}
```

`apps/server/src/front-door/app.ts`:
```ts
import { Hono } from 'hono';
import type { Env } from '../types.js';

export const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));
```

`apps/server/src/index.ts`:
```ts
import { app } from './front-door/app.js';

export { RoomDO } from './room/room-do.js';

export default app;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bloop/server test` → PASS — 1 file, **2 tests** (Tier B).
Run: `pnpm test` → PASS — 17 files, **91 tests** (Tier A unchanged). `pnpm typecheck` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): apps/server Workers scaffold (wrangler + vitest-pool-workers tier-B) with /health smoke"
```

---

### Task 2: pure modules — room codes (I2), token hashing, protocol window (M3) — Tier A

**Files:** Create `apps/server/src/front-door/room-code.ts`, `src/room/tokens.ts`, `src/room/protocol-window.ts`; tests `apps/server/test-node/{room-code,tokens,protocol-window}.test.ts`; modify root `vitest.config.ts`.

- [ ] **Step 1: Write the failing tests**

Root `vitest.config.ts` (replace whole file):
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/test/**/*.test.ts',
      // Tier A: pure-Node server logic. The workerd Tier-B suite lives in
      // apps/server/test/** and runs under apps/server/vitest.config.ts.
      'apps/server/test-node/**/*.test.ts',
    ],
  },
});
```

`apps/server/test-node/room-code.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  BLOCKED_CODES, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH,
  generateRoomCode, isBlockedCode, isValidRoomCode, normalizeRoomCode,
} from '../src/front-door/room-code.js';

describe('room codes (design §2.1)', () => {
  it('alphabet is the 31-char unambiguous set; codes are 4 chars', () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(31);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(31);
    for (const ch of 'ILO01') expect(ROOM_CODE_ALPHABET).not.toContain(ch);
    expect(ROOM_CODE_LENGTH).toBe(4);
  });

  it('generateRoomCode always emits valid codes and is not constant', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const code = generateRoomCode();
      expect(isValidRoomCode(code)).toBe(true);
      seen.add(code);
    }
    expect(seen.size).toBeGreaterThan(100);
  });

  it('normalizeRoomCode uppercases case-insensitive input (review I2)', () => {
    expect(normalizeRoomCode('abcd')).toBe('ABCD');
    expect(normalizeRoomCode('AbCd')).toBe('ABCD');
  });

  it('normalizeRoomCode rejects anything outside the code space', () => {
    for (const bad of ['AB', 'ABCDE', 'AIL0', 'AB!?']) expect(normalizeRoomCode(bad)).toBeNull();
  });

  it('blocklist blocks the static slur set, and every entry is generatable', () => {
    expect(isBlockedCode('FUCK')).toBe(true);
    expect(isBlockedCode('ABCD')).toBe(false);
    for (const code of BLOCKED_CODES) expect(isValidRoomCode(code)).toBe(true); // no dead entries
  });
});
```

`apps/server/test-node/tokens.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { hashToken, newReconnectToken } from '../src/room/tokens.js';

describe('reconnect tokens (hashed at rest, §3.5)', () => {
  it('hashToken: 64 lowercase hex, deterministic, matches the SHA-256 vector for "abc"', async () => {
    const a = await hashToken('token-a');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashToken('token-a')).toBe(a);
    expect(await hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('differs across tokens', async () => {
    expect(await hashToken('token-a')).not.toBe(await hashToken('token-b'));
  });

  it('newReconnectToken: 72 uuid chars, unique, within the protocol max of 128', () => {
    const t = newReconnectToken();
    expect(t).toHaveLength(72);
    expect(t).toMatch(/^[0-9a-f-]{72}$/);
    expect(t.length).toBeLessThanOrEqual(128);
    expect(newReconnectToken()).not.toBe(t);
  });
});
```

`apps/server/test-node/protocol-window.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { acceptsProtocol } from '../src/room/protocol-window.js';

describe('acceptsProtocol (review M3: one explicit predicate)', () => {
  it('accepts iff pinned <= client <= pinned + 1', () => {
    expect(acceptsProtocol(1, 1)).toBe(true); // pinned version
    expect(acceptsProtocol(2, 1)).toBe(true); // one ahead: client updated mid-transition
    expect(acceptsProtocol(1, 2)).toBe(false); // below pin -> must update
    expect(acceptsProtocol(3, 1)).toBe(false); // too far ahead
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/server/test-node`
Expected: FAIL — cannot resolve the three `../src/...` modules.

- [ ] **Step 3: Implement**

`apps/server/src/front-door/room-code.ts`:
```ts
/**
 * Design §2.1: Crockford-ish alphabet — A–Z minus I/L/O, plus 2–9 — 31 chars,
 * no OCR/QR ambiguity. 31^4 = 923,521 codes (~0.5% collision per pick at a
 * pessimistic 5,000 live rooms; one retry settles it). Codes are
 * case-insensitive on input and uppercased BEFORE idFromName (review I2).
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;

const CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Static blocklist of GENERATABLE 4-char slurs (a constant set, NOT the obscenity runtime filter). Words needing I/L/O/0/1 can never be generated. */
export const BLOCKED_CODES: ReadonlySet<string> = new Set([
  'FUCK', 'FCUK', 'PHUK', 'FUKK', 'CUNT', 'KUNT', 'TWAT', 'RAPE',
  'ARSE', 'CRAP', 'DAMN', 'SEXY', 'PUSY', 'PUTE', 'MERD', 'CACA',
]);

export function generateRoomCode(): string {
  let code = '';
  while (code.length < ROOM_CODE_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    for (const b of bytes) {
      if (code.length === ROOM_CODE_LENGTH) break;
      if (b < 248) code += ROOM_CODE_ALPHABET[b % 31]!; // 248 = 8*31: rejection sampling, no modulo bias
    }
  }
  return code;
}

export function isValidRoomCode(code: string): boolean {
  return CODE_RE.test(code);
}

/** Uppercased code, or null when the input is not a possible code. */
export function normalizeRoomCode(raw: string): string | null {
  const upper = raw.toUpperCase();
  return isValidRoomCode(upper) ? upper : null;
}

export function isBlockedCode(code: string): boolean {
  return BLOCKED_CODES.has(code);
}
```

`apps/server/src/room/tokens.ts`:
```ts
/**
 * Reconnect tokens are opaque bearer capabilities for one seat in one
 * ephemeral room; the token lives ONLY on the device — the DO stores this
 * SHA-256 hex digest (§3.5). Web Crypto exists in workerd AND Node 20+.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Two uuids = 72 chars, comfortably inside the protocol's 128-char cap. */
export function newReconnectToken(): string {
  return crypto.randomUUID() + crypto.randomUUID();
}
```

`apps/server/src/room/protocol-window.ts`:
```ts
/**
 * Review M3 fix — the design's "2-version window" as ONE predicate:
 * accept iff pinned <= client <= pinned + 1. Rooms pin protocolVersion at
 * creation and never re-pin across deploys (§7.3); a client that updated
 * mid-session is one ahead and absorbed; an outdated client gets
 * UPGRADE_REQUIRED.
 */
export function acceptsProtocol(client: number, pinned: number): boolean {
  return client >= pinned && client <= pinned + 1;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test` → PASS — 20 files, **100 tests** (91 + 5 + 3 + 1).
Run: `pnpm --filter @bloop/server test` → PASS — 1 file, **2 tests**.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): pure modules — room codes (I2), token hashing, protocol window (M3)"
```

---

### Task 3: SQLite `Store` + idempotent `createRoom` test-and-set (I3) + `POST /rooms` + `/config`

Review **I3**: NO `tryClaim`/`createRoom` split, NO `'reserved'` status — the front door generates a code and calls ONE idempotent `createRoom(code)` RPC. The get→set is synchronous SQL inside one event of a single-threaded DO, hence atomic; racing front doors serialize through the one object. Created-but-never-joined rooms are swept by the unborn TTL (Task 7).

**Files:** Create `apps/server/src/room/store.ts`; modify `src/room/room-do.ts` (replace whole file), `src/front-door/app.ts` (replace whole file); test `apps/server/test/front-door.test.ts`.

- [ ] **Step 1: Write the failing test**

`apps/server/test/front-door.test.ts`:
```ts
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@bloop/protocol';

describe('front door', () => {
  it('POST /rooms creates a room: 201 with code, pinned protocolVersion, wsPath', async () => {
    const res = await SELF.fetch('https://bloop.test/rooms', { method: 'POST' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { code: string; protocolVersion: number; wsPath: string };
    expect(body.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    expect(body.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(body.wsPath).toBe(`/rooms/${body.code}/ws`);
  });

  it('createRoom is a test-and-set (I3): the second claim returns created:false', async () => {
    const stub = env.ROOM.getByName('TEST');
    const first = await stub.createRoom({ code: 'TEST', protocolVersion: PROTOCOL_VERSION, createdAt: Date.now() });
    expect(first).toEqual({ created: true, protocolVersion: PROTOCOL_VERSION });
    const second = await stub.createRoom({ code: 'TEST', protocolVersion: PROTOCOL_VERSION, createdAt: Date.now() });
    expect(second).toEqual({ created: false, protocolVersion: PROTOCOL_VERSION });
  });

  it('GET /config returns {} with edge caching when KV is empty', async () => {
    const res = await SELF.fetch('https://bloop.test/config');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
  });

  it('GET /config returns the KV document once present', async () => {
    await env.CONFIG.put('client-config', JSON.stringify({ minAppVersion: '1.0.0', killSwitches: [] }));
    const res = await SELF.fetch('https://bloop.test/config');
    expect(await res.json()).toEqual({ minAppVersion: '1.0.0', killSwitches: [] });
  });
});
```

(Storage is shared across tests — the two `/config` tests rely on in-file order, which vitest preserves.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bloop/server test`
Expected: FAIL — `POST /rooms` and `/config` 404 (routes missing); `stub.createRoom is not a function`. Smoke still passes.

- [ ] **Step 3: Implement**

`apps/server/src/room/store.ts` (the full 2b store; `events`/`snapshots` tables are the marked 2c seam):
```ts
import type { PlayerProfile } from '@bloop/protocol';

export interface RoomMeta {
  code: string;
  protocolVersion: number; // pinned at creation, never re-pinned (§3.3/§7.3)
  status: 'lobby'; // 2c adds 'playing' | 'roundOver' | 'ended' with the game loop
  createdAt: number;
  lastActivityAt: number; // drives the TTL janitor (§5.4)
}

export interface Seat {
  playerId: string;
  profile: PlayerProfile;
  isHost: boolean;
  connected: boolean;
  reconnectTokenHash: string; // sha-256 hex; the token itself is NEVER stored
  joinedAt: number;
  /** Absolute ms deadline while disconnected; null when connected. 2c's AlarmQueue derives its 'grace' timers from this column. */
  graceUntil: number | null;
}

interface RosterRow extends Record<string, SqlStorageValue> {
  player_id: string; profile_json: string; is_host: number; connected: number;
  reconnect_hash: string; joined_at: number; grace_until: number | null;
}

export class Store {
  constructor(private readonly sql: SqlStorage) {}

  /** Idempotent; re-run after destroyRoom() and at createRoom() entry (C3 ghost states). 2c adds events/snapshots tables (§5.1) here. */
  migrate(): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS room_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS roster (
      player_id TEXT PRIMARY KEY, profile_json TEXT NOT NULL, is_host INTEGER NOT NULL,
      connected INTEGER NOT NULL, reconnect_hash TEXT NOT NULL, joined_at INTEGER NOT NULL,
      grace_until INTEGER
    )`);
  }

  getMeta(): RoomMeta | null {
    const rows = this.sql.exec<{ v: string }>(`SELECT v FROM room_meta WHERE k = 'meta'`).toArray();
    return rows.length === 0 ? null : (JSON.parse(rows[0]!.v) as RoomMeta);
  }

  setMeta(meta: RoomMeta): void {
    this.sql.exec(`INSERT OR REPLACE INTO room_meta (k, v) VALUES ('meta', ?)`, JSON.stringify(meta));
  }

  patchMeta(patch: Partial<RoomMeta>): void {
    const meta = this.getMeta();
    if (meta !== null) this.setMeta({ ...meta, ...patch });
  }

  addPlayer(seat: Seat): void {
    this.sql.exec(
      `INSERT INTO roster (player_id, profile_json, is_host, connected, reconnect_hash, joined_at, grace_until)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      seat.playerId, JSON.stringify(seat.profile), seat.isHost ? 1 : 0, seat.connected ? 1 : 0,
      seat.reconnectTokenHash, seat.joinedAt, seat.graceUntil,
    );
  }

  /** Join order — host migration ("longest-joined") relies on it. */
  listSeats(): Seat[] {
    return this.sql.exec<RosterRow>(`SELECT * FROM roster ORDER BY joined_at ASC, rowid ASC`).toArray().map(rowToSeat);
  }

  getSeat(playerId: string): Seat | null {
    const rows = this.sql.exec<RosterRow>(`SELECT * FROM roster WHERE player_id = ?`, playerId).toArray();
    return rows.length === 0 ? null : rowToSeat(rows[0]!);
  }

  findSeatByTokenHash(hash: string): Seat | null {
    const rows = this.sql.exec<RosterRow>(`SELECT * FROM roster WHERE reconnect_hash = ?`, hash).toArray();
    return rows.length === 0 ? null : rowToSeat(rows[0]!);
  }

  rosterSize(): number {
    return Number(this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM roster`).one().n);
  }

  setConnected(playerId: string, connected: boolean, graceUntil: number | null): void {
    this.sql.exec(`UPDATE roster SET connected = ?, grace_until = ? WHERE player_id = ?`, connected ? 1 : 0, graceUntil, playerId);
  }

  removePlayer(playerId: string): void {
    this.sql.exec(`DELETE FROM roster WHERE player_id = ?`, playerId);
  }

  /** Exactly one host: flips is_host on for playerId, off for everyone else. */
  setHost(playerId: string): void {
    this.sql.exec(`UPDATE roster SET is_host = (player_id = ?)`, playerId);
  }
}

function rowToSeat(r: RosterRow): Seat {
  return {
    playerId: r.player_id, profile: JSON.parse(r.profile_json) as PlayerProfile,
    isHost: r.is_host === 1, connected: r.connected === 1,
    reconnectTokenHash: r.reconnect_hash, joinedAt: r.joined_at, graceUntil: r.grace_until,
  };
}
```

(The roster is rows keyed by a server-minted uuid COLUMN — the null-prototype-map rule guards player-keyed *objects* in game state, which do not exist in 2b.)

`apps/server/src/room/room-do.ts` (replace whole file):
```ts
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types.js';
import { Store } from './store.js';

export class RoomDO extends DurableObject<Env> {
  private readonly store: Store;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new Store(ctx.storage.sql);
    this.store.migrate(); // sync + idempotent; 2c seam: AlarmQueue.load(...) joins here
  }

  /**
   * Review I3: the ONE idempotent create RPC — test-and-set-and-init. The
   * getMeta -> setMeta pair is synchronous SQL inside one event of a
   * single-threaded DO, hence atomic; racing front doors serialize here.
   */
  async createRoom(input: { code: string; protocolVersion: number; createdAt: number }): Promise<{ created: boolean; protocolVersion: number }> {
    this.store.migrate(); // C3: tolerate a wiped-tables ghost state
    const meta = this.store.getMeta();
    if (meta !== null) return { created: false, protocolVersion: meta.protocolVersion };
    // C3: idFromName(code) is immortal — a freed code reuses THIS object, which
    // may still hold hibernating sockets from a previous party. Evict them.
    this.closeAllSockets(1011, 'stale-room');
    this.store.setMeta({ code: input.code, protocolVersion: input.protocolVersion, status: 'lobby', createdAt: input.createdAt, lastActivityAt: input.createdAt });
    return { created: true, protocolVersion: input.protocolVersion };
  }

  private closeAllSockets(code: number, reason: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.close(code, reason); } catch { /* already closed */ }
    }
  }
}
```

`apps/server/src/front-door/app.ts` (replace whole file):
```ts
import { Hono } from 'hono';
import { PROTOCOL_VERSION } from '@bloop/protocol';
import type { Env } from '../types.js';
import { generateRoomCode, isBlockedCode } from './room-code.js';

export const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

// Client config (min versions, kill switches, catalog manifest). KV-cached at
// the edge; the ONLY HTTPS fetch the app makes before the WS connect.
app.get('/config', async (c) => {
  const body = await c.env.CONFIG.get('client-config', 'json');
  return c.json(body ?? {}, 200, { 'cache-control': 'public, max-age=60' });
});

app.post('/rooms', async (c) => {
  // Review I3: one idempotent RPC test-and-sets; collisions retry with a fresh code.
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateRoomCode();
    if (isBlockedCode(code)) continue;
    const result = await c.env.ROOM.getByName(code).createRoom({
      code, protocolVersion: PROTOCOL_VERSION, createdAt: Date.now(),
    });
    if (result.created) return c.json({ code, protocolVersion: result.protocolVersion, wsPath: `/rooms/${code}/ws` }, 201);
  }
  return c.json({ error: 'code-space-busy' }, 503);
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bloop/server test` → PASS — 2 files, **6 tests** (2 + 4).
Run: `pnpm test` → PASS — 20 files, **100 tests**.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): SQLite Store + idempotent createRoom test-and-set (I3) + POST /rooms + /config"
```

---

### Task 4: obscenity profanity boundary — Tier A + workerd import smoke (Tier B)

**Files:** Create `apps/server/src/room/profanity.ts`; tests `apps/server/test-node/profanity.test.ts`, `apps/server/test/profanity-workerd.test.ts`.

- [ ] **Step 1: Write the failing tests**

`apps/server/test-node/profanity.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { sanitizeNickname } from '../src/room/profanity.js';

describe('sanitizeNickname (the single text boundary, design §3.4)', () => {
  it('passes clean names through, trimmed', () => {
    expect(sanitizeNickname('  Alice  ')).toBe('Alice');
  });

  it('hard-caps at 20 chars before matching', () => {
    expect(sanitizeNickname('A'.repeat(30))).toBe('A'.repeat(20));
  });

  it('censors profanity embedded in an otherwise fine name', () => {
    expect(sanitizeNickname('fuck yeah')).toBe('**** yeah');
  });

  it('rejects fully-profane, variant, and empty names', () => {
    expect(sanitizeNickname('fuck')).toBeNull();
    expect(sanitizeNickname('fuuuuck')).toBeNull(); // recommended transformers catch elongation
    expect(sanitizeNickname('FuCk')).toBeNull();
    expect(sanitizeNickname('   ')).toBeNull();
  });
});
```

`apps/server/test/profanity-workerd.test.ts` (the import smoke test the design demands):
```ts
import { describe, expect, it } from 'vitest';
import { sanitizeNickname } from '../src/room/profanity.js';

describe('obscenity inside workerd (design §1.5/§3.4 import smoke)', () => {
  it('loads, matches, and censors identically to Node in the workers runtime', () => {
    expect(sanitizeNickname('Alice')).toBe('Alice');
    expect(sanitizeNickname('fuck')).toBeNull();
    expect(sanitizeNickname('fuck yeah')).toBe('**** yeah');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/server/test-node/profanity.test.ts` → FAIL (module missing).
Run: `pnpm --filter @bloop/server test` → FAIL (profanity-workerd.test.ts cannot resolve the module).

- [ ] **Step 3: Implement**

`apps/server/src/room/profanity.ts`:
```ts
import {
  RegExpMatcher, TextCensor, asteriskCensorStrategy, englishDataset, englishRecommendedTransformers,
} from 'obscenity';

// Singleton matcher: built once per isolate, reused across hibernation wakes
// (§3.4). Asterisk strategy (not the default grawlix) so output — and the
// "fully censored" rejection below — is deterministic.
const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
const censor = new TextCensor().setStrategy(asteriskCensorStrategy());

export const MAX_NICKNAME_CHARS = 20;

/**
 * Censored nickname, or null when the whole name is profane or empty (reject
 * — nobody ships as "****"). English-only; locales are a config concern
 * (design §9.2). sanitizeGameText lands with the game loop in Plan 2c.
 */
export function sanitizeNickname(input: string): string | null {
  const trimmed = input.trim().slice(0, MAX_NICKNAME_CHARS);
  if (trimmed.length === 0) return null;
  const matches = matcher.getAllMatches(trimmed);
  if (matches.length === 0) return trimmed;
  const censored = censor.applyTo(trimmed, matches);
  if (censored.replace(/\*/g, '').trim().length === 0) return null;
  return censored;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test` → PASS — 21 files, **104 tests** (100 + 4).
Run: `pnpm --filter @bloop/server test` → PASS — 3 files, **7 tests** (6 + 1).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): obscenity nickname boundary (tier-A) + workerd import smoke (tier-B)"
```

---

### Task 5: WS upgrade + case-insensitive route (I2) + hello/welcome/lobby + host gating

**Files:** Modify `apps/server/src/index.ts` (replace whole file), `src/room/room-do.ts` (targeted edits); create `apps/server/test/helpers.ts`; tests `apps/server/test/ws-routing.test.ts`, `apps/server/test/hello.test.ts`.

- [ ] **Step 1: Write the failing tests**

`apps/server/test/helpers.ts`:
```ts
import { SELF } from 'cloudflare:test';
import { PROTOCOL_VERSION, serverMessageSchema, type ServerMessage } from '@bloop/protocol';

export async function createRoomViaApi(): Promise<string> {
  const res = await SELF.fetch('https://bloop.test/rooms', { method: 'POST' });
  if (res.status !== 201) throw new Error(`POST /rooms failed: ${res.status}`);
  return ((await res.json()) as { code: string }).code;
}

export interface TestSocket {
  ws: WebSocket;
  next(): Promise<ServerMessage>;
  closed: Promise<number>; // resolves with the close code
}

export async function connect(code: string): Promise<TestSocket> {
  const res = await SELF.fetch(`https://bloop.test/rooms/${code}/ws`, { headers: { Upgrade: 'websocket' } });
  const ws = res.webSocket;
  if (ws === null) throw new Error(`expected 101 + webSocket, got ${res.status}`);
  const queue: ServerMessage[] = [];
  const waiters: Array<(m: ServerMessage) => void> = [];
  ws.accept();
  ws.addEventListener('message', (event) => {
    const msg = serverMessageSchema.parse(JSON.parse(event.data as string));
    const waiter = waiters.shift();
    if (waiter !== undefined) waiter(msg);
    else queue.push(msg);
  });
  let resolveClosed!: (code: number) => void;
  const closed = new Promise<number>((resolve) => { resolveClosed = resolve; });
  ws.addEventListener('close', (event) => resolveClosed(event.code));
  return {
    ws,
    next(): Promise<ServerMessage> {
      const head = queue.shift();
      if (head !== undefined) return Promise.resolve(head);
      return new Promise<ServerMessage>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timed out waiting for a server message')), 2_000);
        waiters.push((msg) => { clearTimeout(timer); resolve(msg); });
      });
    },
    closed,
  };
}

export function sendJson(sock: TestSocket, msg: unknown): void {
  sock.ws.send(JSON.stringify(msg));
}

export async function join(
  code: string, nickname: string,
  opts: { protocolVersion?: number; reconnectToken?: string } = {},
): Promise<TestSocket> {
  const sock = await connect(code);
  sendJson(sock, {
    type: 'hello',
    protocolVersion: opts.protocolVersion ?? PROTOCOL_VERSION,
    profile: { nickname, avatar: 'a0' },
    ...(opts.reconnectToken !== undefined ? { reconnectToken: opts.reconnectToken } : {}),
  });
  return sock;
}

export async function expectWelcome(sock: TestSocket): Promise<{ playerId: string; reconnectToken: string }> {
  const msg = await sock.next();
  if (msg.type !== 'welcome') throw new Error(`expected welcome, got ${msg.type}`);
  return { playerId: msg.playerId, reconnectToken: msg.reconnectToken };
}

export async function expectLobby(sock: TestSocket): Promise<Extract<ServerMessage, { type: 'lobby' }>> {
  const msg = await sock.next();
  if (msg.type !== 'lobby') throw new Error(`expected lobby, got ${msg.type}`);
  return msg;
}

export async function expectError(sock: TestSocket): Promise<string> {
  const msg = await sock.next();
  if (msg.type !== 'error') throw new Error(`expected error, got ${msg.type}`);
  return msg.code;
}

export interface JoinedRoom {
  code: string;
  socks: TestSocket[];
  welcomes: Array<{ playerId: string; reconnectToken: string }>;
}

/** Create a room and join players in order, draining every welcome/lobby so all queues start empty. */
export async function setupRoom(nicknames: string[]): Promise<JoinedRoom> {
  const code = await createRoomViaApi();
  const socks: TestSocket[] = [];
  const welcomes: JoinedRoom['welcomes'] = [];
  for (const nickname of nicknames) {
    const sock = await join(code, nickname);
    welcomes.push(await expectWelcome(sock));
    socks.push(sock);
    for (const s of socks) await expectLobby(s); // every joined socket sees the grown lobby
  }
  return { code, socks, welcomes };
}
```

`apps/server/test/ws-routing.test.ts`:
```ts
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createRoomViaApi, expectLobby, expectWelcome, join } from './helpers.js';

describe('WS routing (review I2: case-insensitive codes, one DO per code)', () => {
  it('routes a lowercase deep-link code to the SAME room as the uppercase code', async () => {
    const code = await createRoomViaApi();
    const lower = await join(code.toLowerCase(), 'Lower');
    await expectWelcome(lower);
    await expectLobby(lower);
    const upper = await join(code, 'Upper');
    await expectWelcome(upper);
    expect((await expectLobby(upper)).players).toHaveLength(2); // one room — not two DOs
  });

  it('404s never-created rooms and impossible codes', async () => {
    const ws = { headers: { Upgrade: 'websocket' } };
    expect((await SELF.fetch('https://bloop.test/rooms/ZZZZ/ws', ws)).status).toBe(404); // valid shape, no room
    expect((await SELF.fetch('https://bloop.test/rooms/AIL0/ws', ws)).status).toBe(404); // I/L/0 not in alphabet
    expect((await SELF.fetch('https://bloop.test/rooms/ABCDE/ws', ws)).status).toBe(404); // wrong length
  });

  it('426s a plain GET on the ws path', async () => {
    const code = await createRoomViaApi();
    expect((await SELF.fetch(`https://bloop.test/rooms/${code}/ws`)).status).toBe(426);
  });
});
```

`apps/server/test/hello.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@bloop/protocol';
import {
  connect, createRoomViaApi, expectError, expectLobby, expectWelcome, join, sendJson, setupRoom,
} from './helpers.js';

describe('hello flow (§3.3): handshake, profanity boundary, lobby, host gating', () => {
  it('hello -> welcome with server-minted ids, then a lobby with the host seat', async () => {
    const code = await createRoomViaApi();
    const sock = await join(code, 'Anna');
    const { playerId, reconnectToken } = await expectWelcome(sock);
    expect(playerId).toMatch(/^[0-9a-f-]{36}$/); // server-minted uuid, never client-supplied
    expect(reconnectToken).toHaveLength(72);
    const lobby = await expectLobby(sock);
    expect(lobby.gameId).toBeNull();
    expect(lobby.players).toEqual([
      { id: playerId, profile: { nickname: 'Anna', avatar: 'a0' }, connected: true, isHost: true },
    ]);
  });

  it('broadcasts the grown lobby to everyone; the second joiner is not host', async () => {
    const code = await createRoomViaApi();
    const a = await join(code, 'Anna');
    const annaId = (await expectWelcome(a)).playerId;
    await expectLobby(a);
    const b = await join(code, 'Bert');
    const bertId = (await expectWelcome(b)).playerId;
    const lobbyA = await expectLobby(a);
    expect(lobbyA).toEqual(await expectLobby(b)); // identical broadcast
    expect(lobbyA.players.map((p) => [p.id, p.isHost])).toEqual([[annaId, true], [bertId, false]]);
  });

  it('pins the protocol: out-of-window -> UPGRADE_REQUIRED + close 4426; one ahead -> accepted', async () => {
    const code = await createRoomViaApi();
    const old = await join(code, 'Old', { protocolVersion: 99 });
    expect(await expectError(old)).toBe('UPGRADE_REQUIRED');
    expect(await old.closed).toBe(4426); // app maps 4426 to its update flow
    const ahead = await join(code, 'Ahead', { protocolVersion: PROTOCOL_VERSION + 1 });
    expect((await expectWelcome(ahead)).playerId).toBeTruthy();
  });

  it('non-JSON input earns BAD_MESSAGE', async () => {
    const sock = await connect(await createRoomViaApi());
    sock.ws.send('not json at all');
    expect(await expectError(sock)).toBe('BAD_MESSAGE');
  });

  it('oversize frames earn BAD_MESSAGE before parsing (review M2)', async () => {
    const sock = await connect(await createRoomViaApi());
    sock.ws.send(`"${'x'.repeat(5000)}"`);
    expect(await expectError(sock)).toBe('BAD_MESSAGE');
  });

  it('action before any game earns BAD_MESSAGE (loop lands in Plan 2c)', async () => {
    const { socks } = await setupRoom(['Eager']);
    sendJson(socks[0]!, { type: 'action', payload: { kind: 'vote' } });
    expect(await expectError(socks[0]!)).toBe('BAD_MESSAGE');
  });

  it('profanity boundary: fully profane rejected, mixed censored before anyone sees it', async () => {
    const code = await createRoomViaApi();
    const bad = await join(code, 'fuck');
    expect(await expectError(bad)).toBe('BAD_MESSAGE');
    const mixed = await join(code, 'fuck yeah');
    await expectWelcome(mixed);
    expect((await expectLobby(mixed)).players[0]!.profile.nickname).toBe('**** yeah');
  });

  it('rejects the 17th player with ROOM_FULL', async () => {
    const { code } = await setupRoom(Array.from({ length: 16 }, (_, i) => `P${i}`));
    const extra = await join(code, 'TooMany');
    expect(await expectError(extra)).toBe('ROOM_FULL');
  });

  it('gates startGame on the host flag (UNKNOWN_GAME until the 2c registry)', async () => {
    const { socks } = await setupRoom(['Host', 'Guest']);
    sendJson(socks[1]!, { type: 'startGame', gameId: 'tracer' });
    expect(await expectError(socks[1]!)).toBe('NOT_HOST');
    sendJson(socks[0]!, { type: 'startGame', gameId: 'tracer' });
    expect(await expectError(socks[0]!)).toBe('UNKNOWN_GAME');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bloop/server test`
Expected: FAIL — join-based tests throw `expected 101 + webSocket, got 404` (no WS route; `/rooms/:code/ws` falls through to Hono's 404) and the 426 test gets 404. The 404-expecting test passes vacuously — fine, it pins behavior once the route exists. Existing 7 tests still pass.

- [ ] **Step 3: Implement**

`apps/server/src/index.ts` (replace whole file):
```ts
import { app } from './front-door/app.js';
import { normalizeRoomCode } from './front-door/room-code.js';
import type { Env } from './types.js';

export { RoomDO } from './room/room-do.js';

const WS_PATH = /^\/rooms\/([A-Za-z0-9]{4})\/ws$/;

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const m = WS_PATH.exec(url.pathname);
    if (m !== null) {
      // Review I2: codes are case-insensitive on input; normalize BEFORE
      // idFromName — idFromName('abcd') !== idFromName('ABCD') would split one
      // room across two DOs for QR/deep-link/manual-entry joins.
      const code = normalizeRoomCode(m[1]!);
      if (code === null) return new Response('no such room', { status: 404 });
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('expected websocket upgrade', { status: 426 });
      }
      return env.ROOM.getByName(code).fetch(req); // the DO does ctx.acceptWebSocket
    }
    return app.fetch(req, env, ctx);
  },
} satisfies ExportedHandler<Env>;
```

In `apps/server/src/room/room-do.ts`, make these exact edits:

(1) Replace the whole import block (the first three lines) with:
```ts
import { DurableObject } from 'cloudflare:workers';
import { clientMessageSchema, type ClientMessage, type ErrorCode, type RoomPlayer, type ServerMessage } from '@bloop/protocol';
import type { Env } from '../types.js';
import { acceptsProtocol } from './protocol-window.js';
import { sanitizeNickname } from './profanity.js';
import { Store } from './store.js';
import { hashToken, newReconnectToken } from './tokens.js';
```

(2) Insert between the import block and `export class RoomDO`:
```ts
export const MAX_PLAYERS = 16;
/** UTF-16 code units, not bytes — deliberate cheap cap (review M2); true bytes <= 3x. */
export const MAX_MSG_CHARS = 4096;

/** Hibernation attachment: IDs ONLY (real limit 16 KiB — review I1). Profiles/host/grace live in SQLite roster, so attachment and roster cannot drift. */
interface Attachment { cid: string; playerId?: string; state: 'pending' | 'joined' }

type HelloMessage = Extract<ClientMessage, { type: 'hello' }>;

function safeJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return null; }
}
```

(3) Insert the following methods after the closing brace of `createRoom` (before `private closeAllSockets`):
```ts
  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('expected websocket', { status: 426 });
    if (this.store.getMeta() === null) return new Response('no such room', { status: 404 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]); // HIBERNATABLE — never .accept() (spec §7)
    pair[1].serializeAttachment({ cid: crypto.randomUUID(), state: 'pending' } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /** The single input boundary (§3.3): size cap -> zod -> route. Token-bucket rate limit: Plan 2c. */
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment;
    if (typeof raw !== 'string' || raw.length > MAX_MSG_CHARS) return this.sendError(ws, 'BAD_MESSAGE');
    const parsed = clientMessageSchema.safeParse(safeJson(raw));
    if (!parsed.success) return this.sendError(ws, 'BAD_MESSAGE');
    const msg = parsed.data;
    switch (msg.type) {
      case 'hello': return this.onHello(ws, att, msg);
      case 'startGame': return this.onStartGame(ws, att);
      case 'action': return this.sendError(ws, 'BAD_MESSAGE'); // no game loop until Plan 2c
      case 'leave': ws.close(1000, 'bye'); return; // full leave semantics: Task 6
    }
  }

  private async onHello(ws: WebSocket, att: Attachment, msg: HelloMessage): Promise<void> {
    const meta = this.store.getMeta();
    if (meta === null) { ws.close(1011, 'no-room'); return; } // destroyed under an open socket
    // (a) version handshake against the version PINNED at creation
    if (!acceptsProtocol(msg.protocolVersion, meta.protocolVersion)) {
      this.sendError(ws, 'UPGRADE_REQUIRED');
      ws.close(4426, 'UPGRADE_REQUIRED');
      return;
    }
    // (b) profanity at THE input boundary — before any other client sees the name
    const nickname = sanitizeNickname(msg.profile.nickname);
    if (nickname === null) return this.sendError(ws, 'BAD_MESSAGE');
    const now = Date.now();
    // fresh join: lobby only (roster freezes at startGame in Plan 2c)
    if (this.store.rosterSize() >= MAX_PLAYERS) return this.sendError(ws, 'ROOM_FULL');
    const playerId = crypto.randomUUID(); // server-minted, never client-supplied
    const reconnectToken = newReconnectToken(); // lives only on the device
    this.store.addPlayer({
      playerId, profile: { nickname, avatar: msg.profile.avatar },
      isHost: this.store.rosterSize() === 0, // first joiner is host (§3.5)
      connected: true, reconnectTokenHash: await hashToken(reconnectToken),
      joinedAt: now, graceUntil: null,
    });
    ws.serializeAttachment({ cid: att.cid, playerId, state: 'joined' } satisfies Attachment);
    this.store.patchMeta({ lastActivityAt: now });
    this.send(ws, { type: 'welcome', playerId, reconnectToken });
    this.broadcastLobby();
  }

  private onStartGame(ws: WebSocket, att: Attachment): void {
    const seat = att.playerId === undefined ? null : this.store.getSeat(att.playerId);
    if (seat === null) return this.sendError(ws, 'BAD_MESSAGE'); // hello first
    if (!seat.isHost) return this.sendError(ws, 'NOT_HOST');
    this.sendError(ws, 'UNKNOWN_GAME'); // 2c seam: registry lookup + module init replace this
  }

  // ---- outbound ----

  private broadcastLobby(): void {
    const players: RoomPlayer[] = this.store.listSeats().map((s) => ({
      id: s.playerId, profile: s.profile, connected: s.connected, isHost: s.isHost,
    }));
    const lobby: ServerMessage = { type: 'lobby', players, gameId: null };
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws.deserializeAttachment() as Attachment).state === 'joined') this.send(ws, lobby);
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try { ws.send(JSON.stringify(msg)); } catch { /* gone; close handler cleans up */ }
  }

  private sendError(ws: WebSocket, code: ErrorCode): void {
    this.send(ws, { type: 'error', code });
  }
```

(Design note: §3.2's `ConnectionRegistry` cache is deliberately NOT built — `ctx.getWebSockets()` + IDs-only attachments are the durable truth and a room caps at 17 sockets. See Deviations.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bloop/server test` → PASS — 5 files, **19 tests** (7 + 3 + 9).
Run: `pnpm test` → PASS — 21 files, **104 tests**.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): hibernatable WS upgrade + case-insensitive route (I2) + hello/lobby/host gating"
```

---

### Task 6: disconnect grace + reconnect reclaim + host migration + leave

**Files:** Create `apps/server/src/room/host.ts`; modify `src/room/room-do.ts` (targeted edits); tests `apps/server/test-node/host.test.ts`, `apps/server/test/lifecycle.test.ts`.

- [ ] **Step 1: Write the failing tests**

`apps/server/test-node/host.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { pickNextHost } from '../src/room/host.js';
import type { Seat } from '../src/room/store.js';

function seat(playerId: string, joinedAt: number, connected: boolean): Seat {
  return {
    playerId, profile: { nickname: playerId, avatar: 'a0' }, isHost: false, connected,
    reconnectTokenHash: 'h', joinedAt, graceUntil: connected ? null : joinedAt + 90_000,
  };
}

describe('pickNextHost (§3.5 host migration)', () => {
  it('picks the longest-joined CONNECTED survivor', () => {
    expect(pickNextHost([seat('p2', 2, false), seat('p3', 3, true), seat('p4', 4, true)])).toBe('p3');
  });

  it('falls back to the longest-joined seat when everyone is in grace', () => {
    expect(pickNextHost([seat('p2', 2, false), seat('p3', 3, false)])).toBe('p2');
  });

  it('returns null for an empty roster (room will be TTL-swept)', () => {
    expect(pickNextHost([])).toBeNull();
  });
});
```

`apps/server/test/lifecycle.test.ts`:
```ts
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { GRACE_MS } from '../src/room/room-do.js';
import { expectLobby, expectWelcome, join, sendJson, setupRoom } from './helpers.js';

describe('disconnect grace + reconnect + host migration (§3.5)', () => {
  it('a dropped socket greys the seat (kept, not freed) and arms the grace alarm', async () => {
    const { code, socks, welcomes } = await setupRoom(['Anna', 'Bert']);
    const before = Date.now();
    socks[1]!.ws.close(1000, 'phone died');
    const lobby = await expectLobby(socks[0]!);
    expect(lobby.players).toHaveLength(2); // seat NOT freed
    expect(lobby.players.find((p) => p.id === welcomes[1]!.playerId)!.connected).toBe(false);
    const alarm = await runInDurableObject(env.ROOM.getByName(code), (_i, state) => state.storage.getAlarm());
    expect(alarm).not.toBeNull();
    expect(alarm!).toBeGreaterThanOrEqual(before + GRACE_MS);
    expect(alarm!).toBeLessThanOrEqual(Date.now() + GRACE_MS);
  });

  it('hello + reconnectToken inside grace reclaims the same seat and clears its deadline', async () => {
    const { code, socks, welcomes } = await setupRoom(['Anna', 'Bert']);
    socks[1]!.ws.close(1000, 'tunnel');
    await expectLobby(socks[0]!); // greyed
    const b2 = await join(code, 'Bert', { reconnectToken: welcomes[1]!.reconnectToken });
    const welcome2 = await expectWelcome(b2);
    expect(welcome2.playerId).toBe(welcomes[1]!.playerId); // same seat
    expect(welcome2.reconnectToken).toBe(welcomes[1]!.reconnectToken); // stable token (design §9.3 default)
    expect((await expectLobby(socks[0]!)).players.find((p) => p.id === welcome2.playerId)!.connected).toBe(true);
    const alarm = await runInDurableObject(env.ROOM.getByName(code), (_i, state) => state.storage.getAlarm());
    // the moot grace deadline is gone (Task 7 re-introduces a much later TTL horizon)
    expect(alarm === null || alarm > Date.now() + GRACE_MS).toBe(true);
  });

  it('grace expiry frees the seat, migrates host to the longest-joined survivor, kills the token', async () => {
    const { code, socks, welcomes } = await setupRoom(['Anna', 'Bert', 'Cara']);
    socks[0]!.ws.close(1000, 'host vanished'); // the HOST disconnects
    await expectLobby(socks[1]!);
    await expectLobby(socks[2]!);
    await runInDurableObject(env.ROOM.getByName(code), async (i) => { await i.sweep(Date.now() + GRACE_MS + 1_000); });
    const lobby = await expectLobby(socks[1]!);
    expect(lobby.players.map((p) => [p.id, p.isHost])).toEqual([
      [welcomes[1]!.playerId, true], // longest-joined survivor becomes host
      [welcomes[2]!.playerId, false],
    ]);
    const back = await join(code, 'Anna', { reconnectToken: welcomes[0]!.reconnectToken });
    expect((await expectWelcome(back)).playerId).not.toBe(welcomes[0]!.playerId); // expired token -> fresh join
  });

  it('leave frees the seat immediately and migrates host', async () => {
    const { socks, welcomes } = await setupRoom(['Anna', 'Bert']);
    sendJson(socks[0]!, { type: 'leave' });
    expect(await socks[0]!.closed).toBe(1000);
    const lobby = await expectLobby(socks[1]!);
    expect(lobby.players.map((p) => [p.id, p.isHost])).toEqual([[welcomes[1]!.playerId, true]]);
  });

  it('a reconnect over a still-open socket supersedes it (old socket closed 4001)', async () => {
    const { code, socks, welcomes } = await setupRoom(['Anna', 'Bert']);
    const b2 = await join(code, 'Bert', { reconnectToken: welcomes[1]!.reconnectToken });
    expect((await expectWelcome(b2)).playerId).toBe(welcomes[1]!.playerId);
    expect(await socks[1]!.closed).toBe(4001);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/server/test-node/host.test.ts` → FAIL (module missing).
Run: `pnpm --filter @bloop/server test` → FAIL — `GRACE_MS` not exported (import error fails the whole lifecycle file). Existing 19 tests still pass.

- [ ] **Step 3: Implement**

`apps/server/src/room/host.ts`:
```ts
import type { Seat } from './store.js';

/**
 * §3.5 host migration: longest-joined CONNECTED seat wins; if nobody is
 * connected (everyone in grace), longest-joined overall. Null for an empty
 * roster. `seats` must be in join order — Store.listSeats() guarantees it.
 */
export function pickNextHost(seats: readonly Seat[]): string | null {
  const connected = seats.find((s) => s.connected);
  if (connected !== undefined) return connected.playerId;
  return seats.length > 0 ? seats[0]!.playerId : null;
}
```

In `apps/server/src/room/room-do.ts`, make these exact edits:

(1) Replace `import { Store } from './store.js';` with:
```ts
import { Store, type Seat } from './store.js';
```

(2) Add after the `import { sanitizeNickname } from './profanity.js';` line:
```ts
import { pickNextHost } from './host.js';
```

(3) Add after the `export const MAX_MSG_CHARS = 4096;` line:
```ts
/** Disconnect grace (§3.5): inside the spec's 60–120s band. */
export const GRACE_MS = 90_000;
```

(4) In `webSocketMessage`, replace the line
```ts
      case 'leave': ws.close(1000, 'bye'); return; // full leave semantics: Task 6
```
with:
```ts
      case 'leave': return this.onLeave(ws, att);
```

(5) In `onHello`, insert immediately after the line `const now = Date.now();`:
```ts
    // reconnect-token reclaim comes before the fresh-join path (§3.5)
    if (msg.reconnectToken !== undefined) {
      const seat = this.store.findSeatByTokenHash(await hashToken(msg.reconnectToken));
      if (seat !== null) return this.reclaimSeat(ws, att, seat, msg.reconnectToken, now);
      // invalid or expired token -> fall through to a fresh join
    }
```

(6) Insert the following methods immediately before the `// ---- outbound ----` comment:
```ts
  private async reclaimSeat(ws: WebSocket, att: Attachment, seat: Seat, token: string, now: number): Promise<void> {
    const old = this.socketFor(seat.playerId);
    if (old !== null && old !== ws) {
      const oldAtt = old.deserializeAttachment() as Attachment;
      // strip identity FIRST so the old socket's close handler no-ops
      old.serializeAttachment({ cid: oldAtt.cid, state: 'pending' } satisfies Attachment);
      old.close(4001, 'superseded');
    }
    this.store.setConnected(seat.playerId, true, null); // cancels the grace deadline
    this.store.patchMeta({ lastActivityAt: now });
    ws.serializeAttachment({ cid: att.cid, playerId: seat.playerId, state: 'joined' } satisfies Attachment);
    // stable token for the seat's life (design §9.3 default; rotation deferred)
    this.send(ws, { type: 'welcome', playerId: seat.playerId, reconnectToken: token });
    this.broadcastLobby(); // the resync: fresh lobby right after welcome
    await this.armAlarm(); // drop the now-moot grace deadline eagerly
  }

  private onLeave(ws: WebSocket, att: Attachment): void {
    if (att.state === 'joined' && att.playerId !== undefined) {
      const seat = this.store.getSeat(att.playerId);
      if (seat !== null) this.removeSeat(seat, Date.now());
    }
    ws.serializeAttachment({ cid: att.cid, state: 'pending' } satisfies Attachment);
    ws.close(1000, 'bye');
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment;
    if (att.state !== 'joined' || att.playerId === undefined) return; // pending/left/superseded
    const seat = this.store.getSeat(att.playerId);
    if (seat === null || !seat.connected) return; // already removed or already in grace
    const now = Date.now();
    this.store.setConnected(seat.playerId, false, now + GRACE_MS);
    this.store.patchMeta({ lastActivityAt: now });
    this.broadcastLobby(); // seat greys out — NOT freed
    await this.armAlarm();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  /**
   * Everything due at `now`. PUBLIC so in-runtime tests drive time directly
   * instead of sleeping. Plan 2c seam: the §6 AlarmQueue EDF multiplexer
   * replaces this computed sweep (adding the 'phase' timer kind); the
   * persisted truth it loads from — roster.grace_until + meta.lastActivityAt
   * — is already in place.
   */
  async sweep(now: number): Promise<void> {
    if (this.store.getMeta() === null) return;
    for (const seat of this.store.listSeats()) {
      if (seat.graceUntil !== null && seat.graceUntil <= now) {
        // Lobby semantics: the seat is freed. While a game runs (Plan 2c),
        // this instead emits a playerLeft event into the game loop.
        this.removeSeat(seat, now);
      }
    }
  }

  async alarm(): Promise<void> {
    await this.sweep(Date.now());
    await this.armAlarm();
  }

  /** Remove a seat + migrate host + tell the lobby. Shared by leave and grace expiry. */
  private removeSeat(seat: Seat, now: number): void {
    this.store.removePlayer(seat.playerId);
    if (seat.isHost) {
      const next = pickNextHost(this.store.listSeats());
      if (next !== null) this.store.setHost(next);
    }
    this.store.patchMeta({ lastActivityAt: now });
    this.broadcastLobby();
  }

  private socketFor(playerId: string): WebSocket | null {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment;
      if (att.state === 'joined' && att.playerId === playerId) return ws;
    }
    return null;
  }

  /** Single alarm = earliest pending deadline. Task 7 adds the TTL horizon. */
  private async armAlarm(): Promise<void> {
    let earliest: number | null = null;
    for (const seat of this.store.listSeats()) {
      if (seat.graceUntil !== null && (earliest === null || seat.graceUntil < earliest)) earliest = seat.graceUntil;
    }
    if (earliest === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(earliest);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test` → PASS — 22 files, **107 tests** (104 + 3).
Run: `pnpm --filter @bloop/server test` → PASS — 6 files, **24 tests** (19 + 5).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): disconnect grace, reconnect-token reclaim, host migration, leave"
```

---

### Task 7: TTL janitor + C3-ordered `destroyRoom` + ghost-socket reclaim

**Files:** Modify `apps/server/src/room/room-do.ts` (targeted edits); test `apps/server/test/ttl.test.ts`.

- [ ] **Step 1: Write the failing test**

`apps/server/test/ttl.test.ts`:
```ts
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@bloop/protocol';
import { ROOM_TTL_MS, UNBORN_TTL_MS } from '../src/room/room-do.js';
import { expectWelcome, join, setupRoom } from './helpers.js';

describe('TTL janitor + room destruction (§5.4, review C3)', () => {
  it('a created-but-never-joined room arms the unborn alarm and frees its code (closes the I3 leak)', async () => {
    const stub = env.ROOM.getByName('UNBN');
    const createdAt = Date.now();
    await stub.createRoom({ code: 'UNBN', protocolVersion: PROTOCOL_VERSION, createdAt });
    expect(await runInDurableObject(stub, (_i, state) => state.storage.getAlarm())).toBe(createdAt + UNBORN_TTL_MS);
    await runInDurableObject(stub, async (i) => { await i.sweep(createdAt + UNBORN_TTL_MS + 1_000); });
    expect((await stub.createRoom({ code: 'UNBN', protocolVersion: PROTOCOL_VERSION, createdAt: Date.now() })).created).toBe(true);
  });

  it('after a join, the alarm horizon converges to lastActivity + ROOM_TTL_MS', async () => {
    const { code } = await setupRoom(['Anna']);
    const stub = env.ROOM.getByName(code);
    await runInDurableObject(stub, async (i) => { await i.alarm(); }); // sweep (nothing due) + re-arm
    const alarm = await runInDurableObject(stub, (_i, state) => state.storage.getAlarm());
    const now = Date.now();
    expect(alarm).not.toBeNull();
    expect(alarm!).toBeGreaterThan(now + ROOM_TTL_MS - 60_000);
    expect(alarm!).toBeLessThanOrEqual(now + ROOM_TTL_MS);
  });

  it('idle TTL destroy: sockets closed, alarm gone, code reusable (C3 order)', async () => {
    const { code, socks } = await setupRoom(['Idle']);
    const stub = env.ROOM.getByName(code);
    await runInDurableObject(stub, async (i) => { await i.sweep(Date.now() + ROOM_TTL_MS + 1_000); });
    expect(await socks[0]!.closed).toBe(1000); // hibernating stragglers closed
    expect(await runInDurableObject(stub, (_i, state) => state.storage.getAlarm())).toBeNull(); // no dangling wake-up
    expect((await stub.createRoom({ code, protocolVersion: PROTOCOL_VERSION, createdAt: Date.now() })).created).toBe(true);
  });

  it('createRoom on a stale code closes ghost sockets before claiming (C3)', async () => {
    const stub = env.ROOM.getByName('GHST');
    await stub.createRoom({ code: 'GHST', protocolVersion: PROTOCOL_VERSION, createdAt: Date.now() });
    const ghost = await join('GHST', 'Ghost');
    await expectWelcome(ghost);
    // simulate a crashed wipe that deleted storage WITHOUT closing sockets
    await runInDurableObject(stub, async (_i, state) => { await state.storage.deleteAll(); });
    expect((await stub.createRoom({ code: 'GHST', protocolVersion: PROTOCOL_VERSION, createdAt: Date.now() })).created).toBe(true);
    expect(await ghost.closed).toBe(1011); // previous party's socket evicted
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bloop/server test`
Expected: FAIL — `ROOM_TTL_MS`/`UNBORN_TTL_MS` are not exported (import error fails the whole ttl file). Existing 24 tests still pass.

- [ ] **Step 3: Implement**

In `apps/server/src/room/room-do.ts`, make these exact edits:

(1) Add after the `export const GRACE_MS = 90_000;` line:
```ts
/** §5.4: idle rooms are janitored after 45 min; codes become reusable. */
export const ROOM_TTL_MS = 45 * 60_000;
/** Created-but-never-joined rooms free their code fast (replaces the design's reserved-code sweep — I3 removed the 'reserved' state). */
export const UNBORN_TTL_MS = 120_000;
```

(2) In `createRoom`, insert immediately before the line `return { created: true, protocolVersion: input.protocolVersion };`:
```ts
    await this.armAlarm(); // unborn-TTL horizon from birth — no alarm-less zombie rooms
```

(3) Replace the whole `sweep` method with:
```ts
  /**
   * Everything due at `now`. PUBLIC so in-runtime tests drive time directly
   * instead of sleeping. Plan 2c seam: the §6 AlarmQueue EDF multiplexer
   * replaces this computed sweep (adding the 'phase' timer kind); the
   * persisted truth it loads from — roster.grace_until + meta.lastActivityAt
   * — is already in place.
   */
  async sweep(now: number): Promise<void> {
    if (this.store.getMeta() === null) return;
    for (const seat of this.store.listSeats()) {
      if (seat.graceUntil !== null && seat.graceUntil <= now) {
        // Lobby semantics: the seat is freed. While a game runs (Plan 2c),
        // this instead emits a playerLeft event into the game loop.
        this.removeSeat(seat, now);
      }
    }
    // TTL janitor (§5.4): empty rooms get the short unborn window, otherwise 45
    // min idle. removeSeat above refreshes lastActivityAt, so a just-emptied
    // room lives one more unborn window before the wipe.
    const latest = this.store.getMeta();
    if (latest !== null) {
      const ttl = this.store.rosterSize() === 0 ? UNBORN_TTL_MS : ROOM_TTL_MS;
      if (now - latest.lastActivityAt >= ttl) await this.destroyRoom();
    }
  }
```

(4) Replace the whole `armAlarm` method with:
```ts
  /**
   * Single alarm = earliest pending deadline (grace deadlines vs the TTL
   * horizon). Activity does NOT re-arm eagerly: an early alarm just sweeps
   * nothing and re-arms later — the design §6.2 ttl-branch pattern.
   */
  private async armAlarm(): Promise<void> {
    const meta = this.store.getMeta();
    if (meta === null) { await this.ctx.storage.deleteAlarm(); return; }
    let earliest = meta.lastActivityAt + (this.store.rosterSize() === 0 ? UNBORN_TTL_MS : ROOM_TTL_MS);
    for (const seat of this.store.listSeats()) {
      if (seat.graceUntil !== null && seat.graceUntil < earliest) earliest = seat.graceUntil;
    }
    await this.ctx.storage.setAlarm(earliest);
  }
```

(5) Add immediately after the `armAlarm` method:
```ts
  /**
   * Review C3 fix, in THIS order: close every socket (hibernating ones
   * included — deleteAll does not terminate them), THEN deleteAlarm (deleteAll
   * does not clear it, and a dangling alarm would wake the wiped room), THEN
   * deleteAll, THEN re-create the empty schema so this immortal DO instance
   * keeps serving — the next createRoom() on this code finds a cleanly
   * claimable object.
   */
  private async destroyRoom(): Promise<void> {
    this.closeAllSockets(1000, 'room-closed');
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.store.migrate();
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bloop/server test` → PASS — 7 files, **28 tests** (24 + 4).
Run: `pnpm test` → PASS — 22 files, **107 tests** (Task-6 lifecycle assertions were written to survive the new TTL horizon).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): TTL janitor + C3-ordered destroyRoom + ghost-socket reclaim"
```

---

### Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run both suites + typecheck from `r2/bloop`**

Run: `pnpm test`
Expected: PASS — **22 files, 107 tests**: packages baseline 17 files/91; test-node: room-code 5, tokens 3, protocol-window 1, profanity 4, host 3.

Run: `pnpm --filter @bloop/server test`
Expected: PASS — **7 files, 28 tests**: smoke 2, front-door 4, profanity-workerd 1, ws-routing 3, hello 9, lifecycle 5, ttl 4.

Run: `pnpm typecheck` → exit 0 across all packages including `@bloop/server`.

- [ ] **Step 2: Billing-discipline spot check (§7.1; the CI lint itself is Plan 2c)**

Run from `r2/bloop`: `git grep -nE "setInterval|setTimeout|\.accept\(" -- apps/server/src`
Expected: no matches (exit 1). All time-based work goes through the single alarm; only `ctx.acceptWebSocket` ever accepts. (Tests may use `setTimeout`; the grep is scoped to `src`.)

- [ ] **Step 3: Bundle sanity (review I6 watch-item; the CI size gate is Plan 2c)**

Run: `pnpm --filter @bloop/server exec wrangler deploy --dry-run`
Expected: exit 0; record the reported "Total Upload" size (obscenity's English dataset + zod via protocol are the weight — must stay far below the 3 MiB free-plan limit).

- [ ] **Step 4: Verify clean tree and push**

From the repo root: `git status` — only `r2/bloop` paths in the new commits; leave unrelated untracked root files alone.

```bash
git push origin r3
```

---

## Deferred (deliberate non-goals — Plan 2c seams, marked in code)

- **Game loop** (registry, action schemas, `applyEvent`, effects→Analytics Engine, `gameOver`) — design §4; `onStartGame` answers `UNKNOWN_GAME`, `action` answers `BAD_MESSAGE` until then.
- **Event sourcing + snapshots** (design §5.1–5.3; review C1/C2/I4 are 2c scope) — `Store.migrate()` is the table seam.
- **§6 AlarmQueue EDF multiplexer** — 2b's `sweep`/`armAlarm` compute earliest-deadline from persisted state; 2c swaps in the pure queue + `phase` kind + C2's per-timer error isolation.
- **Token-bucket rate limiting** (§7.4) — size cap + zod hold the boundary until then.
- **`sanitizeGameText`** — free text only exists inside game actions.
- **R2 `CONTENT` + Analytics Engine `METRICS` bindings** — added when 2c uses them.
- **`GAME_IN_PROGRESS` error code** (design §9.7) — additive protocol change, deferred.
- **Reconnect-token rotation** (design §9.3) — stable token chosen and test-asserted; the swap is one line in `reclaimSeat`.
- **Billing CI lint, deploy-restart chaos tests, load smoke** — design Phase 6.

## Deviations from the design (and why)

1. **`partyserver` dropped entirely** (design §1.3 listed it; its own default already kept it off the hibernation path). Review M1 is right: we use `/rooms/:code/ws`, not `/parties/:server/:name`, so it earns nothing. A swap-back would be local to `index.ts`.
2. **`@cloudflare/vitest-pool-workers` pinned to 0.12.21** (not `^0.x`): 0.13.0+ requires vitest `^4.1.0` and would fork the repo's vitest major.
3. **`compatibility_date` 2026-03-01** (not 2026-05-01): must not exceed pool-workers 0.12.21's bundled workerd or the Tier-B pool fails to start.
4. **No `ConnectionRegistry`** (design §3.2): `ctx.getWebSockets()` + IDs-only attachments are the durable truth; ≤17 sockets per room makes a scan cheaper than a rebuilt-on-wake cache.
5. **No `tryClaim`, no `'reserved'` status** (design §2.2): review I3's single-RPC `createRoom` subsumes both; the reserved-code sweep becomes the `UNBORN_TTL_MS` janitor branch.
6. **`RoomMeta` is the 2b subset** (no `gameId`/`seed`/`phaseKey`/`deadlineAt`/`schemaVersion`): meaningless without the loop; 2c extends additively.
7. **`acceptsProtocol` = `pinned <= client <= pinned + 1`**: the design's §3.3 prose was self-contradictory (review M3); this is the decisive, boundary-tested predicate.
8. **Engine/tracer are not `@bloop/server` dependencies yet** (design §1.3 lists them): nothing in 2b imports them; 2c adds them with the registry.
9. **`wrangler types` typegen skipped**: a hand-written `Env` in `src/types.ts` is deterministic for this plan; `worker-configuration.d.ts` is gitignored for anyone who runs `pnpm --filter @bloop/server typegen`.
