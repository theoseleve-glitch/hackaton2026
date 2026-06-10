# Bloop Plan 2c — The Game Loop: GameModule Execution, Event Sourcing, AlarmQueue

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tracer PLAYABLE end-to-end over WebSockets (design `docs/designs/2026-06-10-server-shell-design.md` §§4–6 + its adversarial review). Deliverables: game registry + `startGame` (seed, frozen roster, static built-in content pack), the action pipeline (per-game zod → server-stamped `GameEvent` → reduce → append-BEFORE-broadcast → per-player `view`+`deadlineAt`), event sourcing with **C1-mandated replay-from-zero rehydration** (snapshots deliberately deferred), the §6 **AlarmQueue EDF multiplexer** over {phase, grace, ttl} with **C2 per-timer error isolation**, the **I4** reference-equality no-op contract (documented in the engine + tested), **lastActivityAt bump on every applied event** (live games survive the 45-min TTL), and reducer-driven `playerLeft`/`playerRejoined` roster events. Tier A grows 109 → **123** (22 → 25 files); Tier B grows 29 → **51** (7 → 12 files).

**Architecture & key decisions:**
- **Snapshots: DEFERRED entirely (C1 resolution).** `JSON.parse` can never rebuild null-prototype player maps; the only pollution-proof state constructor is the game code itself. Rehydration is `replay(init, full event log)` — a full tracer game is < ~60 tiny events folded through a microsecond reducer, so replay-from-zero wins at party scale. The `events` table carries `schema_version`; the snapshot table + module-aware revive is a marked seam if a long game ever needs it.
- **No timers table.** The §6 `AlarmQueue` is a pure EDF structure **derived on demand from already-persisted truth**: `phase` ← `meta.phaseKey`+`meta.deadlineAt`, `grace` ← `roster.grace_until`, `ttl` ← `meta.lastActivityAt` + roster size. One source of truth, zero cache drift, and an alarm retry re-derives a self-consistent queue (C2 idempotency for free). 2b's public `sweep(now)` keeps its name/signature so every committed Tier-B test keeps passing.
- **Seed:** `crypto.randomUUID()` at `startGame`, persisted in meta — unguessable (code+createdAt is predictable), and the same seed feeds `init` and every replay.
- **I4:** engine contract now states: a module REJECTS an event by returning the **same state reference**; the shell skips append/broadcast/re-arm exactly when `after === before`. A fresh-but-equal object is an ACCEPTED event (logged + re-broadcast — harmless; alarms re-arm only on `phaseKey` change, so no churn). Tested at both tiers.
- **No protocol changes.** `gameOver` is signaled by the terminal `view` + `deadlineAt: null` (design §4.3); mid-game fresh joins reuse `ROOM_FULL` (§9.7 deferral upheld); bad `startGame` timing/roster-size is `BAD_MESSAGE`.
- **Effects:** analytics = `console.log` only (Analytics Engine binding is a later seam); `gameOver` → `status: 'roundOver'` (host may `startGame` again on a cleared log; `'ended'` is declared but reserved for an explicit close flow).

**Tech Stack:** unchanged from 2b (vitest-pool-workers 0.12.21 pinned, wrangler ^4.72.0, compat date 2026-03-01, singleWorker + isolatedStorage:false). New `@bloop/server` deps: `@bloop/engine`, `@bloop/game-tracer`, `@bloop/kit` (workspace), `zod ^4.0.0`.

**Conventions for every task:**
- Working directory `C:\Users\Admin\Documents\Hacktaton26\r2\bloop`. pnpm at `C:\Users\Admin\AppData\Roaming\npm\pnpm.cmd` (plain `pnpm` resolves in PowerShell), pnpm 11.5.2, Node 20+.
- Git: ONLY `git add r2/bloop/<paths>` from repo root or `git add .` from inside `r2/bloop`. NEVER `git add -A` at the root. Branch: **r3**.
- Baselines (verified): Tier A `pnpm test` → **22 files, 109 tests**; Tier B `pnpm --filter @bloop/server test` → **7 files, 29 tests**. Run BOTH after every task.
- Tier-B storage is shared (singleWorker) → **every test uses a unique room** (fresh `POST /rooms` or a unique 4-char literal from the alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`).
- DO source (`apps/server/src/**`) must NEVER contain `setInterval`/`setTimeout`/`ws.accept(` (billing §7.1). Test files may use `setTimeout`.
- All relative imports use the `.js` extension.

---

### Task 1: I4 contract — engine doc clause + tracer reference-stability tests (Tier A)

**Files:** Modify `packages/engine/src/types.ts` (JSDoc only — no version bump); create `packages/games/tracer/test/noop.test.ts`.

- [ ] **Step 1: Write the failing test**

`packages/games/tracer/test/noop.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { ContentPack, GameEvent } from '@bloop/engine';
import { tracer, type TracerAction, type TracerContent, type TracerState } from '@bloop/game-tracer';

const content: ContentPack<TracerContent> = { id: 'noop-pack', version: 1, data: { prompts: ['a', 'b', 'c', 'd'] } };
const players = ['p1', 'p2', 'p3'];
const vote = (playerId: string, target: string, at = 1_000): GameEvent<TracerAction> =>
  ({ type: 'action', playerId, action: { kind: 'vote', target }, at });

function toReveal(): TracerState {
  let s = tracer.init('noop-seed', players, content);
  s = tracer.reduce(s, vote('p1', 'p2')).state;
  s = tracer.reduce(s, vote('p2', 'p3')).state;
  s = tracer.reduce(s, vote('p3', 'p1')).state; // all voted -> reveal
  return s;
}

describe('tracer rejects by reference (engine no-op contract, review I4)', () => {
  it('rejected votes return the SAME state object: self-vote, unknown voter, unknown target', () => {
    const s = tracer.init('noop-seed', players, content);
    expect(tracer.reduce(s, vote('p1', 'p1')).state).toBe(s);
    expect(tracer.reduce(s, vote('ghost', 'p2')).state).toBe(s);
    expect(tracer.reduce(s, vote('p1', '__proto__')).state).toBe(s);
  });

  it('votes outside the vote phase are rejected by reference', () => {
    const s = toReveal();
    expect(s.phase).toBe('reveal');
    expect(tracer.reduce(s, vote('p1', 'p2')).state).toBe(s);
  });

  it('roster events are ignored by reference (tracer has no presence rules)', () => {
    const s = tracer.init('noop-seed', players, content);
    expect(tracer.reduce(s, { type: 'playerLeft', playerId: 'p2', at: 1 }).state).toBe(s);
    expect(tracer.reduce(s, { type: 'playerRejoined', playerId: 'p2', at: 2 }).state).toBe(s);
  });

  it('a finished game absorbs everything by reference', () => {
    let s = toReveal(); // reveal:0 -> vote:1 -> reveal:1 -> vote:2 -> reveal:2 -> over
    for (let i = 0; i < 5; i++) s = tracer.reduce(s, { type: 'deadline', at: 2_000 + i }).state;
    expect(s.phase).toBe('over');
    expect(tracer.reduce(s, { type: 'deadline', at: 9_000 }).state).toBe(s);
    expect(tracer.reduce(s, vote('p1', 'p2')).state).toBe(s);
  });
});
```

- [ ] **Step 2: Run test to verify it fails-or-passes honestly**

Run: `pnpm vitest run packages/games/tracer/test/noop.test.ts`
Expected: PASS already — tracer happens to be reference-stable. This task PINS the coincidence into a contract (the whole point of I4: "don't leave correctness riding on an undocumented identity coincidence"). Proceed.

- [ ] **Step 3: Make the contract explicit in the engine**

In `packages/engine/src/types.ts`, replace:
```ts
  init(seed: string, players: PlayerId[], content: ContentPack<C>): S;
  reduce(state: S, event: GameEvent<A>): ReduceResult<S>;
```
with:
```ts
  init(seed: string, players: PlayerId[], content: ContentPack<C>): S;
  /**
   * Pure transition. CONTRACT (shell no-op detection — server-shell review I4):
   * to REJECT/IGNORE an event, return the SAME state reference you were given
   * (`{ state, effects: [] }`), never a fresh-but-equal copy. The shell skips
   * append/broadcast/re-arm exactly when `after === before`; any NEW reference
   * is an ACCEPTED event — logged and broadcast (alarms still re-arm only on a
   * phaseKey change, so an equal-but-fresh state cannot churn timers).
   */
  reduce(state: S, event: GameEvent<A>): ReduceResult<S>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test` → PASS — 23 files, **113 tests** (109 + 4).
Run: `pnpm --filter @bloop/server test` → PASS — 7 files, **29 tests**.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(engine): reference-stable no-op reduce contract (review I4) + tracer conformance tests"
```

---

### Task 2: static tracer content pack + game registry (Tier A)

**Files:** Create `apps/server/src/content/tracer-pack.ts`, `apps/server/src/room/registry.ts`, `apps/server/test-node/registry.test.ts`; modify `apps/server/package.json`.

- [ ] **Step 1: Write the failing test**

`apps/server/test-node/registry.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@bloop/game-tracer';
import { TRACER_PACK } from '../src/content/tracer-pack.js';
import { lookupGame } from '../src/room/registry.js';

describe('game registry + static content (design §4.1)', () => {
  it('resolves tracer with module, action schema, and content pack', () => {
    const entry = lookupGame('tracer');
    expect(entry).not.toBeNull();
    expect(entry!.module.id).toBe('tracer');
    expect(entry!.module.version).toBe(1);
    expect(entry!.content).toBe(TRACER_PACK);
  });

  it('the action schema accepts a vote and rejects junk shapes', () => {
    const schema = lookupGame('tracer')!.actionSchema;
    expect(schema.safeParse({ kind: 'vote', target: 'p1' }).success).toBe(true);
    for (const bad of [{ kind: 'vote' }, { kind: 'nuke', target: 'p1' }, 'vote', null, { kind: 'vote', target: '' }]) {
      expect(schema.safeParse(bad).success).toBe(false);
    }
  });

  it('misses unknown ids AND hostile prototype-chain ids (gameId is client-supplied)', () => {
    for (const id of ['nopes', '__proto__', 'constructor', 'toString']) expect(lookupGame(id)).toBeNull();
  });

  it('ships enough non-empty prompts for a full game', () => {
    expect(TRACER_PACK.data.prompts.length).toBeGreaterThanOrEqual(DEFAULT_CONFIG.totalRounds);
    for (const p of TRACER_PACK.data.prompts) expect(p.trim().length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/server/test-node/registry.test.ts`
Expected: FAIL — cannot resolve the two `../src/...` modules (and `@bloop/game-tracer` is not yet a server dep).

- [ ] **Step 3: Implement**

In `apps/server/package.json`, replace the `"dependencies"` block with:
```json
  "dependencies": {
    "@bloop/engine": "workspace:*",
    "@bloop/game-tracer": "workspace:*",
    "@bloop/kit": "workspace:*",
    "@bloop/protocol": "workspace:*",
    "hono": "^4.12.0",
    "obscenity": "^0.4.6",
    "zod": "^4.0.0"
  },
```

`apps/server/src/content/tracer-pack.ts`:
```ts
import type { ContentPack } from '@bloop/engine';
import type { TracerContent } from '@bloop/game-tracer';

/**
 * STATIC built-in content (2c). R2 seam (design §1.2): packs later live in the
 * CONTENT bucket as `<gameId>/<contentId>@<version>.json` and load through the
 * registry; RoomMeta.contentRef already records exactly which pack a running
 * game was init'd with, so rehydration stays deterministic across that change.
 */
export const TRACER_PACK: ContentPack<TracerContent> = {
  id: 'tracer-core',
  version: 1,
  data: {
    prompts: [
      'Most likely to befriend the bartender within ten minutes',
      'Most likely to cry at a phone commercial',
      'Most likely to survive a zombie apocalypse out of spite',
      'Most likely to text back three business days later',
      'Most likely to win an argument with a GPS',
      'Most likely to bring a spreadsheet to a picnic',
    ],
  },
};
```

`apps/server/src/room/registry.ts`:
```ts
import type { ContentPack, GameModule } from '@bloop/engine';
import { tracer, tracerActionSchema } from '@bloop/game-tracer';
import type { z } from 'zod';
import { TRACER_PACK } from '../content/tracer-pack.js';

// The registry erases per-game generics; type safety is restored per game by
// the zod schema at the boundary and by the module's own typed tests.
export type AnyGameModule = GameModule<any, any, any, any>;

export interface GameEntry {
  module: AnyGameModule;
  /** Validates client `action.payload` — the protocol leaves it z.unknown() on purpose. */
  actionSchema: z.ZodType<any>;
  /** 2c: static built-in pack. R2 seam: becomes an async loader keyed by RoomMeta.contentRef. */
  content: ContentPack<any>;
}

/** A Map, NOT an object literal: gameId is CLIENT-SUPPLIED — `obj['__proto__']` on a literal would return Object.prototype. */
const REGISTRY = new Map<string, GameEntry>([
  ['tracer', { module: tracer, actionSchema: tracerActionSchema, content: TRACER_PACK }],
]);

export function lookupGame(gameId: string): GameEntry | null {
  return REGISTRY.get(gameId) ?? null;
}
```

Run: `pnpm install` (links the new workspace deps).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test` → PASS — 24 files, **117 tests** (113 + 4).
Run: `pnpm --filter @bloop/server test` → PASS — 7 files, **29 tests**.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): game registry (proto-safe Map) + static built-in tracer content pack"
```

---

### Task 3: Store — 2c RoomMeta + events table + event CRUD (Tier B)

**Files:** Modify `apps/server/src/room/store.ts`, `apps/server/src/room/room-do.ts` (createRoom only); create `apps/server/test/events-store.test.ts`.

- [ ] **Step 1: Write the failing test**

`apps/server/test/events-store.test.ts`:
```ts
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@bloop/engine';
import { PROTOCOL_VERSION } from '@bloop/protocol';
import { Store } from '../src/room/store.js';

async function fresh(code: string) {
  const stub = env.ROOM.getByName(code);
  await stub.createRoom({ code, protocolVersion: PROTOCOL_VERSION, createdAt: Date.now() });
  return stub;
}

describe('event log (design §5.1–5.2; snapshots deliberately deferred per C1)', () => {
  it('appendEvent/listEvents round-trip GameEvent JSON in seq order', async () => {
    const stub = await fresh('EVTA');
    await runInDurableObject(stub, (_i, state) => {
      const store = new Store(state.storage.sql);
      const e1: GameEvent<unknown> = { type: 'action', playerId: 'p1', action: { kind: 'vote', target: 'p2' }, at: 1_000 };
      const e2: GameEvent<unknown> = { type: 'deadline', at: 2_000 };
      const e3: GameEvent<unknown> = { type: 'playerLeft', playerId: 'p1', at: 3_000 };
      store.appendEvent(e1); store.appendEvent(e2); store.appendEvent(e3);
      expect(store.eventCount()).toBe(3);
      expect(store.listEvents()).toEqual([e1, e2, e3]);
    });
  });

  it('clearEvents wipes the log so the next game replays from zero', async () => {
    const stub = await fresh('EVTB');
    await runInDurableObject(stub, (_i, state) => {
      const store = new Store(state.storage.sql);
      store.appendEvent({ type: 'deadline', at: 1 });
      store.appendEvent({ type: 'deadline', at: 2 });
      store.clearEvents();
      expect(store.eventCount()).toBe(0);
      store.appendEvent({ type: 'deadline', at: 3 });
      expect(store.listEvents()).toEqual([{ type: 'deadline', at: 3 }]);
    });
  });

  it('createRoom persists the extended 2c meta with a null game binding', async () => {
    const stub = await fresh('EVTC');
    const meta = await runInDurableObject(stub, (_i, state) => new Store(state.storage.sql).getMeta());
    expect(meta).toMatchObject({
      code: 'EVTC', status: 'lobby', gameId: null, gameVersion: null, seed: null,
      contentRef: null, roster: null, phaseKey: null, deadlineAt: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bloop/server test`
Expected: FAIL — `appendEvent is not a function` / meta lacks the new null fields. Existing 29 tests still pass.

- [ ] **Step 3: Implement**

In `apps/server/src/room/store.ts`, replace the import + `RoomMeta` block (everything from `import type { PlayerProfile }` through the first closing `}` of `RoomMeta`) with:
```ts
import type { GameEvent } from '@bloop/engine';
import type { PlayerProfile } from '@bloop/protocol';

/** Stamped on every event row; bump + write an upcaster when event/state shapes change (§5.3 — upcasters are a later seam). */
export const EVENTS_SCHEMA_VERSION = 1;

export interface ContentRef { gameId: string; contentId: string; version: number }

export interface RoomMeta {
  code: string;
  protocolVersion: number; // pinned at creation, never re-pinned (§3.3/§7.3)
  status: 'lobby' | 'playing' | 'roundOver' | 'ended'; // 'ended' reserved for an explicit close flow
  createdAt: number;
  lastActivityAt: number; // TTL janitor truth (§5.4); bumped on EVERY applied game event (Task 8)
  // -- game binding (null until startGame) --
  gameId: string | null;
  gameVersion: number | null;
  seed: string | null; // crypto-random at startGame; reused by every replay
  contentRef: ContentRef | null; // which pack init used (static built-in for 2c; R2 later)
  roster: string[] | null; // FROZEN player order at init (engine: roster fixed at init)
  // -- phase/timer authority (written on every phase entry) --
  phaseKey: string | null; // alarm idempotency guard (§6)
  deadlineAt: number | null; // absolute ms; survives eviction — never recomputed from "now"
}
```

Replace the whole `migrate()` method with:
```ts
  /** Idempotent; re-run after destroyRoom() and at createRoom() entry (C3 ghost states). */
  migrate(): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS room_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS roster (
      player_id TEXT PRIMARY KEY, profile_json TEXT NOT NULL, is_host INTEGER NOT NULL,
      connected INTEGER NOT NULL, reconnect_hash TEXT NOT NULL, joined_at INTEGER NOT NULL,
      grace_until INTEGER
    )`);
    // §5.1 event log. Plain INTEGER PRIMARY KEY (rowid): we only ever wipe the
    // WHOLE log (clearEvents), never delete rows, so AUTOINCREMENT's
    // no-rowid-reuse guarantee buys nothing. No snapshots table: C1 — replay-from-zero.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS events (
      seq INTEGER PRIMARY KEY, at INTEGER NOT NULL, kind TEXT NOT NULL,
      payload_json TEXT NOT NULL, schema_version INTEGER NOT NULL
    )`);
  }
```

Insert after the closing brace of the `setHost` method (still inside the class):
```ts
  /** A single synchronous INSERT — commits with the turn, BEFORE any broadcast (§5.2). */
  appendEvent(event: GameEvent<unknown>): void {
    this.sql.exec(
      `INSERT INTO events (at, kind, payload_json, schema_version) VALUES (?, ?, ?, ?)`,
      event.at, event.type, JSON.stringify(event), EVENTS_SCHEMA_VERSION,
    );
  }

  /** Full log in seq order. Parsed events feed ONLY reduce()/replay() — parsed JSON never becomes live state itself (C1). */
  listEvents(): GameEvent<unknown>[] {
    return this.sql.exec<{ payload_json: string }>(`SELECT payload_json FROM events ORDER BY seq ASC`)
      .toArray().map((r) => JSON.parse(r.payload_json) as GameEvent<unknown>);
  }

  eventCount(): number {
    return Number(this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM events`).one().n);
  }

  /** startGame wipes the previous game's log — game N's events must never replay into game N+1. */
  clearEvents(): void {
    this.sql.exec(`DELETE FROM events`);
  }
```

In `apps/server/src/room/room-do.ts`, inside `createRoom`, replace the `this.store.setMeta({ ... })` call with:
```ts
    this.store.setMeta({
      code: input.code, protocolVersion: input.protocolVersion, status: 'lobby',
      createdAt: input.createdAt, lastActivityAt: input.createdAt,
      gameId: null, gameVersion: null, seed: null, contentRef: null, roster: null,
      phaseKey: null, deadlineAt: null,
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bloop/server test` → PASS — 8 files, **32 tests** (29 + 3).
Run: `pnpm test` → PASS — 24 files, **117 tests**.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): events table + event CRUD + extended 2c RoomMeta (no snapshots — C1 replay-from-zero)"
```

---

### Task 4: AlarmQueue — pure EDF multiplexer + deadline rule (Tier A)

**Files:** Create `apps/server/src/room/alarm-mux.ts`, `apps/server/test-node/alarm-mux.test.ts`.

- [ ] **Step 1: Write the failing test**

`apps/server/test-node/alarm-mux.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { AlarmQueue, nextPhaseDeadline, type RoomTimerSource } from '../src/room/alarm-mux.js';

const queue = (over: Partial<RoomTimerSource> = {}) =>
  AlarmQueue.fromRoom({ phase: null, graces: [], ttlFireAt: 10_000, ...over });

describe('AlarmQueue (pure EDF over phase/grace/ttl, design §6)', () => {
  it('earliest picks the minimum across kinds', () => {
    const q = queue({ phase: { key: 'vote:0', fireAt: 5_000 }, graces: [{ playerId: 'p1', fireAt: 7_000 }] });
    expect(q.earliest()).toEqual({ kind: 'phase', key: 'vote:0', fireAt: 5_000 });
  });

  it('a quiet room still has its ttl horizon (earliest is non-null by construction)', () => {
    expect(queue().earliest()).toEqual({ kind: 'ttl', key: 'ttl', fireAt: 10_000 });
  });

  it('due returns only ripe timers, earliest first', () => {
    const q = queue({
      phase: { key: 'vote:0', fireAt: 5_000 },
      graces: [{ playerId: 'p1', fireAt: 3_000 }, { playerId: 'p2', fireAt: 99_000 }],
    });
    expect(q.due(6_000).map((t) => [t.kind, t.key])).toEqual([['grace', 'p1'], ['phase', 'vote:0']]);
  });

  it('on a tie fires phase < grace < ttl, so activity lands before the ttl idleness check', () => {
    const q = queue({ phase: { key: 'vote:0', fireAt: 10_000 }, graces: [{ playerId: 'p1', fireAt: 10_000 }] });
    expect(q.due(10_000).map((t) => t.kind)).toEqual(['phase', 'grace', 'ttl']);
  });

  it('nextPhaseDeadline keeps the running deadline while phaseKey is unchanged (a vote must not reset the clock)', () => {
    expect(nextPhaseDeadline('vote:0', 'vote:0', 30_000, 1_000, 4_500)).toBe(4_500);
    expect(nextPhaseDeadline('vote:0', 'vote:0', null, 1_000, null)).toBeNull();
  });

  it('nextPhaseDeadline re-arms on phase entry: at + duration, or null when untimed', () => {
    expect(nextPhaseDeadline('vote:0', 'reveal:0', 5_000, 31_000, 31_000)).toBe(36_000);
    expect(nextPhaseDeadline('reveal:2', 'over', null, 99_000, 77_000)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/server/test-node/alarm-mux.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

`apps/server/src/room/alarm-mux.ts`:
```ts
export type TimerKind = 'phase' | 'grace' | 'ttl';
export interface Timer { kind: TimerKind; key: string; fireAt: number }

/**
 * Persisted truth the queue derives from — deliberately NO timers table
 * (deviation from design §6.1): phase <- meta.phaseKey+deadlineAt, grace <-
 * roster.grace_until, ttl <- meta.lastActivityAt+horizon. Single source of
 * truth; an alarm retry re-derives a self-consistent queue (review C2).
 */
export interface RoomTimerSource {
  phase: { key: string; fireAt: number } | null;
  graces: ReadonlyArray<{ playerId: string; fireAt: number }>;
  /** Always present: a live room always has a TTL horizon. */
  ttlFireAt: number;
}

const KIND_RANK: Record<TimerKind, number> = { phase: 0, grace: 1, ttl: 2 };
const byDeadline = (a: Timer, b: Timer): number => a.fireAt - b.fireAt || KIND_RANK[a.kind] - KIND_RANK[b.kind];

/** Pure EDF multiplexer over the DO's single alarm (§6). No Cloudflare, no clock. */
export class AlarmQueue {
  private constructor(private readonly timers: ReadonlyArray<Timer>) {}

  static fromRoom(src: RoomTimerSource): AlarmQueue {
    const timers: Timer[] = [];
    if (src.phase !== null) timers.push({ kind: 'phase', key: src.phase.key, fireAt: src.phase.fireAt });
    for (const g of src.graces) timers.push({ kind: 'grace', key: g.playerId, fireAt: g.fireAt });
    timers.push({ kind: 'ttl', key: 'ttl', fireAt: src.ttlFireAt });
    return new AlarmQueue(timers);
  }

  /** The single alarm target — non-null by construction (ttl always exists). */
  earliest(): Timer {
    return [...this.timers].sort(byDeadline)[0]!;
  }

  /** All timers due at `now`, earliest first; ties fire phase < grace < ttl. */
  due(now: number): Timer[] {
    return this.timers.filter((t) => t.fireAt <= now).sort(byDeadline);
  }
}

/** §0.1/§4.2: a NEW absolute deadline starts iff phaseKey changed; in-phase progress keeps the running one. */
export function nextPhaseDeadline(
  keyBefore: string, keyAfter: string, durationMs: number | null, at: number, current: number | null,
): number | null {
  if (keyAfter === keyBefore) return current;
  return durationMs === null ? null : at + durationMs;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test` → PASS — 25 files, **123 tests** (117 + 6).
Run: `pnpm --filter @bloop/server test` → PASS — 8 files, **32 tests**.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): pure EDF AlarmQueue derived from persisted truth + nextPhaseDeadline rule"
```

---

### Task 5: the game loop — startGame, action pipeline, rehydration, EDF sweep (Tier B)

**Files:** Replace `apps/server/src/room/room-do.ts` (whole file); modify `apps/server/test/helpers.ts`, `apps/server/test/hello.test.ts`; create `apps/server/test/game.test.ts`.

- [ ] **Step 1: Write the failing tests**

In `apps/server/test/helpers.ts`:

(1) Replace the first two import lines with:
```ts
import { SELF } from 'cloudflare:test';
import { PROTOCOL_VERSION, serverMessageSchema, type ServerMessage } from '@bloop/protocol';
import type { TracerView } from '@bloop/game-tracer';
```

(2) Replace the `TestSocket` interface with:
```ts
export interface TestSocket {
  ws: WebSocket;
  next(): Promise<ServerMessage>;
  /** Empty the receive queue without waiting (expectSilence support). */
  drain(): ServerMessage[];
  closed: Promise<number>; // resolves with the close code
}
```

(3) In `connect`'s return object, replace:
```ts
    },
    closed,
  };
```
with:
```ts
    },
    drain: () => queue.splice(0, queue.length),
    closed,
  };
```

(4) Append at the end of the file:
```ts
export interface TracerViewMsg { view: TracerView; deadlineAt: number | null }

export async function expectTracerView(sock: TestSocket): Promise<TracerViewMsg> {
  const msg = await sock.next();
  if (msg.type !== 'view') throw new Error(`expected view, got ${msg.type}`);
  return { view: msg.view as TracerView, deadlineAt: msg.deadlineAt };
}

/** Asserts NOTHING arrives for `ms` (I4: rejected events are completely silent). */
export async function expectSilence(sock: TestSocket, ms = 300): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  const pending = sock.drain();
  if (pending.length > 0) throw new Error(`expected silence, got ${pending.map((m) => m.type).join(',')}`);
}

/** setupRoom + host starts tracer + drains everyone's initial view. */
export async function startTracer(nicknames: string[]): Promise<JoinedRoom & { views: TracerViewMsg[] }> {
  const room = await setupRoom(nicknames);
  sendJson(room.socks[0]!, { type: 'startGame', gameId: 'tracer' });
  const views: TracerViewMsg[] = [];
  for (const s of room.socks) views.push(await expectTracerView(s));
  return { ...room, views };
}
```

In `apps/server/test/hello.test.ts`, the registry now KNOWS `tracer` — a 2-player host start would succeed, so the UNKNOWN_GAME probe must use an unregistered id. Replace:
```ts
  it('gates startGame on the host flag (UNKNOWN_GAME until the 2c registry)', async () => {
    const { socks } = await setupRoom(['Host', 'Guest']);
    sendJson(socks[1]!, { type: 'startGame', gameId: 'tracer' });
    expect(await expectError(socks[1]!)).toBe('NOT_HOST');
    sendJson(socks[0]!, { type: 'startGame', gameId: 'tracer' });
    expect(await expectError(socks[0]!)).toBe('UNKNOWN_GAME');
  });
```
with:
```ts
  it('gates startGame on the host flag; unregistered gameIds are UNKNOWN_GAME', async () => {
    const { socks } = await setupRoom(['Host', 'Guest']);
    sendJson(socks[1]!, { type: 'startGame', gameId: 'tracer' });
    expect(await expectError(socks[1]!)).toBe('NOT_HOST');
    sendJson(socks[0]!, { type: 'startGame', gameId: 'nopes' });
    expect(await expectError(socks[0]!)).toBe('UNKNOWN_GAME');
  });
```

`apps/server/test/game.test.ts`:
```ts
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@bloop/game-tracer';
import { Store } from '../src/room/store.js';
import { expectError, expectSilence, expectTracerView, join, sendJson, setupRoom, startTracer } from './helpers.js';

const eventCount = (code: string) =>
  runInDurableObject(env.ROOM.getByName(code), (_i, state) => new Store(state.storage.sql).eventCount());

describe('the game loop (design §4): startGame, actions, deadlines, gameOver', () => {
  it('guards startGame: below minPlayers and double-start are BAD_MESSAGE', async () => {
    const solo = await setupRoom(['OnlyMe']);
    sendJson(solo.socks[0]!, { type: 'startGame', gameId: 'tracer' });
    expect(await expectError(solo.socks[0]!)).toBe('BAD_MESSAGE'); // 1 < tracer.minPlayers
    const room = await startTracer(['Anna', 'Bert']);
    sendJson(room.socks[0]!, { type: 'startGame', gameId: 'tracer' });
    expect(await expectError(room.socks[0]!)).toBe('BAD_MESSAGE'); // already playing
  });

  it('startGame seeds + broadcasts per-player vote views with ONE absolute deadline; the alarm is armed to it; nothing is logged', async () => {
    const before = Date.now();
    const { code, views } = await startTracer(['Anna', 'Bert', 'Cara']);
    for (const { view, deadlineAt } of views) {
      if (view.phase !== 'vote') throw new Error(`expected vote, got ${view.phase}`);
      expect(view.round).toBe(0);
      expect(view.myVote).toBeNull();
      expect(Object.values(view.hasVoted)).toEqual([false, false, false]);
      expect(deadlineAt!).toBeGreaterThanOrEqual(before + DEFAULT_CONFIG.voteMs);
      expect(deadlineAt!).toBeLessThanOrEqual(Date.now() + DEFAULT_CONFIG.voteMs);
    }
    expect(new Set(views.map((v) => v.deadlineAt)).size).toBe(1); // one authority for every phone
    const alarm = await runInDurableObject(env.ROOM.getByName(code), (_i, state) => state.storage.getAlarm());
    expect(alarm).toBe(views[0]!.deadlineAt);
    expect(await eventCount(code)).toBe(0); // init is re-derivable from (seed, roster, content)
  });

  it('rejects fresh joins mid-game with ROOM_FULL (the roster froze at startGame)', async () => {
    const { code } = await startTracer(['Anna', 'Bert']);
    const late = await join(code, 'Late');
    expect(await expectError(late)).toBe('ROOM_FULL');
  });

  it('votes flow with per-player redaction; the last ballot auto-advances to reveal without the alarm', async () => {
    const { socks, welcomes } = await startTracer(['Anna', 'Bert', 'Cara']);
    const [pa, pb, pc] = welcomes.map((w) => w.playerId);
    sendJson(socks[0]!, { type: 'action', payload: { kind: 'vote', target: pb } });
    const anna = await expectTracerView(socks[0]!);
    const bert = await expectTracerView(socks[1]!);
    await expectTracerView(socks[2]!);
    if (anna.view.phase !== 'vote' || bert.view.phase !== 'vote') throw new Error('expected vote phase');
    expect(anna.view.myVote).toBe(pb); // my own ballot is visible to me...
    expect(bert.view.myVote).toBeNull(); // ...and to nobody else
    expect(bert.view.hasVoted[pa!]).toBe(true); // others see only THAT I voted
    // the vote-phase view exposes exactly these fields — the raw votes map never leaves the server
    expect(Object.keys(anna.view).sort()).toEqual(['hasVoted', 'myVote', 'phase', 'prompt', 'round', 'scores', 'totalRounds']);
    sendJson(socks[1]!, { type: 'action', payload: { kind: 'vote', target: pc } });
    for (const s of socks) await expectTracerView(s);
    sendJson(socks[2]!, { type: 'action', payload: { kind: 'vote', target: pb } });
    const reveal = await expectTracerView(socks[0]!);
    for (const s of [socks[1]!, socks[2]!]) await expectTracerView(s);
    if (reveal.view.phase !== 'reveal') throw new Error(`expected reveal, got ${reveal.view.phase}`);
    expect(reveal.view.tally[pb!]).toBe(2);
    expect(reveal.view.scores[pb!]).toBe(1); // round won
    expect(reveal.deadlineAt).not.toBeNull(); // reveal is timed
  });

  it('forged-time sweeps drive deadlines through every phase to over (deadlineAt null)', async () => {
    const { code, socks, views } = await startTracer(['Anna', 'Bert']);
    const stub = env.ROOM.getByName(code);
    let deadlineAt = views[0]!.deadlineAt;
    const phases: string[] = [];
    for (let i = 0; i < 6; i++) { // vote:0→reveal:0→vote:1→reveal:1→vote:2→reveal:2→over
      expect(deadlineAt).not.toBeNull();
      const now = deadlineAt! + 1;
      await runInDurableObject(stub, (inst) => inst.sweep(now));
      const next = await expectTracerView(socks[0]!);
      await expectTracerView(socks[1]!);
      phases.push(next.view.phase === 'over' ? 'over' : `${next.view.phase}:${next.view.round}`);
      deadlineAt = next.deadlineAt;
    }
    expect(phases).toEqual(['reveal:0', 'vote:1', 'reveal:1', 'vote:2', 'reveal:2', 'over']);
    expect(deadlineAt).toBeNull(); // 'over' is untimed: the client shows the interstitial here
    expect(await eventCount(code)).toBe(6); // exactly one deadline event per transition
  });

  it('gameOver lands in roundOver: the host starts a NEW game on a cleared log', async () => {
    const { code, socks, views } = await startTracer(['Anna', 'Bert']);
    const stub = env.ROOM.getByName(code);
    let deadlineAt = views[0]!.deadlineAt;
    for (let i = 0; i < 6; i++) {
      const now = deadlineAt! + 1;
      await runInDurableObject(stub, (inst) => inst.sweep(now));
      const v = await expectTracerView(socks[0]!);
      await expectTracerView(socks[1]!);
      deadlineAt = v.deadlineAt;
    }
    expect((await runInDurableObject(stub, (_i, state) => new Store(state.storage.sql).getMeta()))!.status).toBe('roundOver');
    sendJson(socks[0]!, { type: 'startGame', gameId: 'tracer' });
    const fresh = await expectTracerView(socks[0]!);
    await expectTracerView(socks[1]!);
    if (fresh.view.phase !== 'vote') throw new Error('expected a fresh vote phase');
    expect(fresh.view.round).toBe(0);
    expect(Object.values(fresh.view.scores)).toEqual([0, 0]); // clean slate
    expect(await eventCount(code)).toBe(0); // game N's log can never replay into game N+1
  });

  it('rejected and malformed actions are silent no-ops: no broadcast, no log entry, no alarm churn (I4)', async () => {
    const { code, socks, welcomes } = await startTracer(['Anna', 'Bert']);
    const stub = env.ROOM.getByName(code);
    const alarmBefore = await runInDurableObject(stub, (_i, state) => state.storage.getAlarm());
    sendJson(socks[0]!, { type: 'action', payload: { kind: 'vote', target: welcomes[0]!.playerId } }); // self-vote: tracer rejects by SAME-reference
    await expectSilence(socks[0]!);
    expect(socks[1]!.drain()).toEqual([]);
    sendJson(socks[1]!, { type: 'action', payload: { kind: 'nuke' } }); // fails the per-game zod schema
    expect(await expectError(socks[1]!)).toBe('BAD_MESSAGE');
    expect(await eventCount(code)).toBe(0);
    expect(await runInDurableObject(stub, (_i, state) => state.storage.getAlarm())).toBe(alarmBefore);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bloop/server test`
Expected: FAIL — `startGame` answers `UNKNOWN_GAME` (registry not wired) so `startTracer` times out waiting for a view; `action` answers `BAD_MESSAGE`. The edited hello test passes (unregistered id still UNKNOWN_GAME on the 2b stub). Other 2b tests still pass.

- [ ] **Step 3: Implement — targeted edits to `apps/server/src/room/room-do.ts`** (every other method stays byte-identical to 2b)

(1) Replace the whole import block (the first 8 lines) with:
```ts
import { DurableObject } from 'cloudflare:workers';
import { replay, type Effect, type GameEvent } from '@bloop/engine';
import { clientMessageSchema, type ClientMessage, type ErrorCode, type RoomPlayer, type ServerMessage } from '@bloop/protocol';
import type { Env } from '../types.js';
import { AlarmQueue, nextPhaseDeadline } from './alarm-mux.js';
import { acceptsProtocol } from './protocol-window.js';
import { sanitizeNickname } from './profanity.js';
import { pickNextHost } from './host.js';
import { lookupGame, type GameEntry } from './registry.js';
import { Store, type Seat } from './store.js';
import { hashToken, newReconnectToken } from './tokens.js';
```

(2) Replace the line `type HelloMessage = Extract<ClientMessage, { type: 'hello' }>;` with:
```ts
type HelloMessage = Extract<ClientMessage, { type: 'hello' }>;
type StartGameMessage = Extract<ClientMessage, { type: 'startGame' }>;
type ActionMessage = Extract<ClientMessage, { type: 'action' }>;

/** In-memory cache of the running game. Losing it to eviction is CORRECT, not a bug: rehydrate() rebuilds it from (seed, roster, content, event log). */
interface GameRuntime { entry: GameEntry; state: unknown }
```

(3) Replace the line `  private readonly store: Store;` with:
```ts
  private readonly store: Store;
  private game: GameRuntime | null = null;
```
and, in the constructor, replace the line ending `// sync + idempotent; 2c seam: AlarmQueue.load(...) joins here` with:
```ts
    this.store.migrate(); // sync + idempotent. (No AlarmQueue.load: the EDF queue is DERIVED from persisted truth per use — see loadQueue.)
```

(4) In `createRoom`, replace the line `    this.closeAllSockets(1011, 'stale-room');` with:
```ts
    this.closeAllSockets(1011, 'stale-room');
    this.game = null; // C3 companion: a stale runtime cache must not leak into the new party
```

(5) In `webSocketMessage`, replace the doc comment and the `switch` block:
```ts
  /** The single input boundary (§3.3): size cap -> zod -> route. Token-bucket rate limit: Plan 2c. */
```
becomes
```ts
  /** The single input boundary (§3.3): size cap -> zod -> route. Token-bucket rate limit: Plan 2d. */
```
and
```ts
    switch (msg.type) {
      case 'hello': return this.onHello(ws, att, msg);
      case 'startGame': return this.onStartGame(ws, att);
      case 'action': return this.sendError(ws, 'BAD_MESSAGE'); // no game loop until Plan 2c
      case 'leave': return this.onLeave(ws, att);
    }
```
becomes
```ts
    switch (msg.type) {
      case 'hello': return this.onHello(ws, att, msg);
      case 'startGame': return this.onStartGame(ws, att, msg);
      case 'action': return this.onAction(ws, att, msg);
      case 'leave': return this.onLeave(ws, att);
    }
```

(6) In `onHello`, replace:
```ts
    // fresh join: lobby only (roster freezes at startGame in Plan 2c)
    if (this.store.rosterSize() >= MAX_PLAYERS) return this.sendError(ws, 'ROOM_FULL');
```
with:
```ts
    // fresh join: lobby or between games only — the game roster froze at
    // startGame (design §3.3d; ROOM_FULL reused per §9.7)
    if (meta.status === 'playing') return this.sendError(ws, 'ROOM_FULL');
    if (this.store.rosterSize() >= MAX_PLAYERS) return this.sendError(ws, 'ROOM_FULL');
```

(7) Replace the whole `onStartGame` stub method with the game loop core (one contiguous block — `onStartGame` plus five new methods):
```ts
  /** Design §4.1/§4.5: validate -> seed -> init -> persist binding -> broadcast views. NOTHING is appended: init is re-derivable from (seed, roster, content). */
  private async onStartGame(ws: WebSocket, att: Attachment, msg: StartGameMessage): Promise<void> {
    const seat = att.playerId === undefined ? null : this.store.getSeat(att.playerId);
    if (seat === null) return this.sendError(ws, 'BAD_MESSAGE'); // hello first
    if (!seat.isHost) return this.sendError(ws, 'NOT_HOST');
    const meta = this.store.getMeta();
    if (meta === null || meta.status === 'playing') return this.sendError(ws, 'BAD_MESSAGE');
    const entry = lookupGame(msg.gameId);
    if (entry === null) return this.sendError(ws, 'UNKNOWN_GAME');
    // the roster freezes NOW from connected seats; in-grace seats sit this one out
    const roster = this.store.listSeats().filter((s) => s.connected).map((s) => s.playerId);
    if (roster.length < entry.module.minPlayers || roster.length > entry.module.maxPlayers) {
      return this.sendError(ws, 'BAD_MESSAGE');
    }
    const at = Date.now();
    const seed = crypto.randomUUID(); // unguessable; persisted so init and every replay agree
    const state = entry.module.init(seed, roster, entry.content);
    const dur = entry.module.phaseDurationMs(state);
    this.store.clearEvents(); // a previous game's log must never replay into this one
    this.store.patchMeta({
      status: 'playing', gameId: entry.module.id, gameVersion: entry.module.version, seed,
      contentRef: { gameId: entry.module.id, contentId: entry.content.id, version: entry.content.version },
      roster, phaseKey: entry.module.phaseKey(state),
      deadlineAt: dur === null ? null : at + dur, lastActivityAt: at,
    });
    this.game = { entry, state };
    this.broadcastViews(this.game);
    await this.armAlarm();
  }

  /** Design §4.2: per-game zod -> server-stamped GameEvent -> the applyEvent funnel. */
  private async onAction(ws: WebSocket, att: Attachment, msg: ActionMessage): Promise<void> {
    if (att.state !== 'joined' || att.playerId === undefined) return this.sendError(ws, 'BAD_MESSAGE');
    const meta = this.store.getMeta();
    if (meta === null || meta.status !== 'playing') return this.sendError(ws, 'BAD_MESSAGE');
    const rt = this.rehydrate();
    if (rt === null) return this.sendError(ws, 'BAD_MESSAGE');
    // Per-game payload validation; the module never sees junk. (Free-text
    // scrubbing — sanitizeGameText — joins here when a text game lands.)
    const action = rt.entry.actionSchema.safeParse(msg.payload);
    if (!action.success) return this.sendError(ws, 'BAD_MESSAGE');
    await this.applyEvent(rt, { type: 'action', playerId: att.playerId, action: action.data, at: Date.now() });
  }

  /**
   * C1 fix (adversarial review): live state is ONLY ever built by game code.
   * Rehydration = replay(init, full event log) — every player-keyed map is
   * reconstructed null-prototype by the module itself. Deliberately NO
   * snapshot path: a tracer game is < ~60 events and reduce is microseconds,
   * so replay-from-zero is the simple, pollution-proof choice at party scale.
   * (Seam: if a marathon game ever needs snapshots, they must round-trip
   * through a module-aware revive — never bare JSON.parse.)
   */
  private rehydrate(): GameRuntime | null {
    if (this.game !== null) return this.game;
    const meta = this.store.getMeta();
    if (meta === null || meta.gameId === null || meta.seed === null || meta.roster === null) return null;
    const entry = lookupGame(meta.gameId);
    if (entry === null || entry.module.version !== meta.gameVersion) return null; // killed/bumped mid-game: unrecoverable, room TTLs out
    const state = replay(entry.module, meta.seed, meta.roster, entry.content, this.store.listEvents());
    this.game = { entry, state };
    return this.game;
  }

  /**
   * The single funnel for EVERY game event (action/deadline/playerLeft/
   * playerRejoined). I4 contract: a module rejects by returning the SAME
   * reference -> nothing logged, broadcast, or re-armed. Accepted events:
   * PERSIST BEFORE BROADCAST (spec §7), re-arm iff phaseKey changed (§0.1).
   */
  private async applyEvent(rt: GameRuntime, event: GameEvent<unknown>): Promise<void> {
    const before = rt.state;
    const keyBefore = rt.entry.module.phaseKey(before);
    const { state: after, effects } = rt.entry.module.reduce(before, event);
    if (after === before) return; // rejected by reference (I4) — keeps the log replay-clean
    const meta = this.store.getMeta();
    if (meta === null) return; // room wiped under our feet — drop the event
    this.store.appendEvent(event); // (1) durable log entry — BEFORE any socket send
    rt.state = after;
    const keyAfter = rt.entry.module.phaseKey(after);
    const deadlineAt = nextPhaseDeadline(keyBefore, keyAfter, rt.entry.module.phaseDurationMs(after), event.at, meta.deadlineAt);
    this.store.patchMeta({ phaseKey: keyAfter, deadlineAt }); // (2) timer truth persisted
    for (const eff of effects as Effect[]) this.runEffect(eff); // (3) effects
    this.broadcastViews(rt); // (4) per-player redacted views — strictly after the append
    await this.armAlarm(); // (5) the earliest timer may have moved
  }

  /** Effects are descriptions; the shell executes them. replay() drops historical effects, so eviction never re-runs these. */
  private runEffect(eff: Effect): void {
    if (eff.type === 'analytics') {
      // 2c: log-only. Analytics Engine binding is a later seam — never PostHog from the DO (spec §3).
      console.log(`[analytics] ${eff.name}`, JSON.stringify(eff.props ?? {}));
    } else {
      // gameOver: between-games state; host may startGame again. The terminal
      // view + deadlineAt:null IS the client signal (design §4.3) — no extra
      // protocol message. 'ended' stays reserved for an explicit close flow.
      this.store.patchMeta({ status: 'roundOver' });
    }
  }

  /** Redaction by construction (spec §4): each socket only ever receives view(state, ITS OWN playerId). */
  private broadcastViews(rt: GameRuntime): void {
    const deadlineAt = this.store.getMeta()?.deadlineAt ?? null;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment;
      if (att.state === 'joined' && att.playerId !== undefined) this.sendView(ws, rt, att.playerId, deadlineAt);
    }
  }

  private sendView(ws: WebSocket, rt: GameRuntime, playerId: string, deadlineAt: number | null): void {
    this.send(ws, { type: 'view', gameId: rt.entry.module.id, view: rt.entry.module.view(rt.state, playerId), deadlineAt });
  }
```

(8) Replace the whole 2b `sweep` method AND the `alarm` method that follows it (one contiguous block — the EDF loop plus its four helpers):
```ts
  /**
   * Everything due at `now`, earliest-deadline-first over {phase, grace, ttl}
   * (§6). PUBLIC so in-runtime tests drive forged time directly. The queue is
   * DERIVED from persisted truth (meta.phaseKey/deadlineAt, roster.grace_until,
   * meta.lastActivityAt) — no timers table to drift, and a retry re-derives a
   * self-consistent queue (C2). Per-timer error isolation lands in Task 8.
   */
  async sweep(now: number): Promise<void> {
    if (this.store.getMeta() === null) return;
    for (const t of this.loadQueue().due(now)) {
      if (t.kind === 'phase') await this.firePhase(t.key, now);
      else if (t.kind === 'grace') await this.fireGrace(t.key, now);
      else await this.fireTtl(now);
      if (this.store.getMeta() === null) return; // ttl wiped the room; alarm already deleted
    }
    await this.armAlarm();
  }

  async alarm(): Promise<void> {
    await this.sweep(Date.now());
  }

  private loadQueue(): AlarmQueue {
    const meta = this.store.getMeta();
    if (meta === null) throw new Error('loadQueue: no room'); // callers guard
    const seats = this.store.listSeats();
    return AlarmQueue.fromRoom({
      phase: meta.deadlineAt !== null && meta.phaseKey !== null ? { key: meta.phaseKey, fireAt: meta.deadlineAt } : null,
      graces: seats.flatMap((s) => (s.graceUntil === null ? [] : [{ playerId: s.playerId, fireAt: s.graceUntil }])),
      ttlFireAt: meta.lastActivityAt + (seats.length === 0 ? UNBORN_TTL_MS : ROOM_TTL_MS),
    });
  }

  /** Phase deadline -> a server-stamped `deadline` GameEvent. The phaseKey guard makes a stale/duplicate alarm a no-op (§6.2). */
  private async firePhase(key: string, now: number): Promise<void> {
    const rt = this.rehydrate();
    if (rt === null) return;
    if (rt.entry.module.phaseKey(rt.state) !== key) return; // the phase already advanced
    await this.applyEvent(rt, { type: 'deadline', at: now });
  }

  /** Grace expiry: idempotent vs the roster — a retry finds the seat gone or its deadline cleared. */
  private async fireGrace(playerId: string, now: number): Promise<void> {
    const seat = this.store.getSeat(playerId);
    if (seat === null || seat.graceUntil === null || seat.graceUntil > now) return;
    this.removeSeat(seat, now); // Task 6 upgrades this to seatDeparted (playerLeft game event)
  }

  /** TTL: re-checks PERSISTED idleness — a grace fired earlier in this sweep refreshed lastActivityAt and saves the room. Destroy is terminal: a retry no-ops on null meta. */
  private async fireTtl(now: number): Promise<void> {
    const meta = this.store.getMeta();
    if (meta === null) return;
    const ttl = this.store.rosterSize() === 0 ? UNBORN_TTL_MS : ROOM_TTL_MS;
    if (now - meta.lastActivityAt >= ttl) await this.destroyRoom();
  }
```

(9) Replace the whole 2b `armAlarm` method with:
```ts
  /** Single alarm = the EDF queue's earliest timer (always exists: ttl). */
  private async armAlarm(): Promise<void> {
    if (this.store.getMeta() === null) { await this.ctx.storage.deleteAlarm(); return; }
    await this.ctx.storage.setAlarm(this.loadQueue().earliest().fireAt);
  }
```

(10) In `destroyRoom`, replace the line `    this.store.migrate();` with:
```ts
    this.game = null; // the in-memory runtime dies with the room
    this.store.migrate();
```

(11) In `broadcastLobby`, replace the line:
```ts
    const lobby: ServerMessage = { type: 'lobby', players, gameId: null };
```
with:
```ts
    const lobby: ServerMessage = { type: 'lobby', players, gameId: this.store.getMeta()?.gameId ?? null };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bloop/server test` → PASS — 9 files, **39 tests** (32 + 7; all 2b tests still green — `sweep(now)` kept its public forged-time contract, `createRoom`/grace/TTL behavior is unchanged).
Run: `pnpm test` → PASS — 25 files, **123 tests**.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): the game loop — startGame, action pipeline, replay-from-zero rehydration (C1), EDF sweep"
```

---

### Task 6: roster events during a game — playerLeft / playerRejoined / mid-game resync (Tier B)

**Files:** Modify `apps/server/src/room/room-do.ts` (three methods + one new); create `apps/server/test/game-lifecycle.test.ts`.

- [ ] **Step 1: Write the failing test**

`apps/server/test/game-lifecycle.test.ts`:
```ts
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { GRACE_MS } from '../src/room/room-do.js';
import { Store } from '../src/room/store.js';
import { expectError, expectLobby, expectTracerView, expectWelcome, join, sendJson, startTracer } from './helpers.js';

describe('room lifecycle while a game runs (design §3.5 + §4 roster events)', () => {
  it('grace expiry mid-game: EDF fires the due vote deadline THEN frees the seat; tracer no-ops playerLeft (nothing extra logged)', async () => {
    const { code, socks, welcomes } = await startTracer(['Anna', 'Bert', 'Cara']);
    const stub = env.ROOM.getByName(code);
    socks[2]!.ws.close(1000, 'phone died');
    await expectLobby(socks[0]!);
    await expectLobby(socks[1]!);
    await runInDurableObject(stub, (i) => i.sweep(Date.now() + GRACE_MS + 1_000));
    // EDF order: the vote:0 deadline (T+30s) fires before Cara's grace (T+90s)
    // — survivors see the reveal views first, then the shrunken lobby.
    const reveal = await expectTracerView(socks[0]!);
    await expectTracerView(socks[1]!);
    expect(reveal.view.phase).toBe('reveal');
    const lobby = await expectLobby(socks[0]!);
    await expectLobby(socks[1]!);
    expect(lobby.players.map((p) => p.id)).toEqual([welcomes[0]!.playerId, welcomes[1]!.playerId]);
    expect(lobby.gameId).toBe('tracer'); // the game survives the departure
    // exactly ONE logged event: the deadline. playerLeft was offered to the module and rejected by reference (I4).
    expect(await runInDurableObject(stub, (_i, state) => new Store(state.storage.sql).eventCount())).toBe(1);
  });

  it('leave mid-game frees the seat immediately and the survivors keep playing', async () => {
    const { socks, welcomes } = await startTracer(['Anna', 'Bert', 'Cara']);
    sendJson(socks[2]!, { type: 'leave' });
    expect(await socks[2]!.closed).toBe(1000);
    const lobby = await expectLobby(socks[0]!);
    await expectLobby(socks[1]!);
    expect(lobby.players).toHaveLength(2);
    sendJson(socks[0]!, { type: 'action', payload: { kind: 'vote', target: welcomes[1]!.playerId } });
    const v = await expectTracerView(socks[0]!);
    await expectTracerView(socks[1]!);
    if (v.view.phase !== 'vote') throw new Error('expected vote phase');
    expect(v.view.myVote).toBe(welcomes[1]!.playerId);
  });

  it('reclaim mid-game resyncs the phone: welcome, lobby, then a personal view with the RUNNING deadline and the preserved ballot', async () => {
    const { code, socks, welcomes, views } = await startTracer(['Anna', 'Bert']);
    sendJson(socks[1]!, { type: 'action', payload: { kind: 'vote', target: welcomes[0]!.playerId } });
    for (const s of socks) await expectTracerView(s);
    socks[1]!.ws.close(1000, 'elevator');
    await expectLobby(socks[0]!); // greyed
    const back = await join(code, 'Bert', { reconnectToken: welcomes[1]!.reconnectToken });
    expect((await expectWelcome(back)).playerId).toBe(welcomes[1]!.playerId);
    await expectLobby(back);
    await expectLobby(socks[0]!);
    const resync = await expectTracerView(back); // unconditional resync (tracer no-ops playerRejoined — I4 skips the broadcast)
    if (resync.view.phase !== 'vote') throw new Error('expected vote phase');
    expect(resync.view.myVote).toBe(welcomes[0]!.playerId); // the ballot survived the drop
    expect(resync.deadlineAt).toBe(views[0]!.deadlineAt); // running deadline, NOT reset
  });

  it('mid-game, an unknown reconnect token cannot enter: fresh joins are closed while playing', async () => {
    const { code } = await startTracer(['Anna', 'Bert']);
    const stranger = await join(code, 'Stranger', { reconnectToken: 'beef'.repeat(18) });
    expect(await expectError(stranger)).toBe('ROOM_FULL');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bloop/server test`
Expected: FAIL — the reclaim test times out waiting for the resync view (reclaimSeat sends no view yet). The other three pass already (mid-game join guard + leave landed in Task 5) — they pin behavior. Existing 39 still pass.

- [ ] **Step 3: Implement**

In `apps/server/src/room/room-do.ts`:

(1) Replace the whole `reclaimSeat` method with:
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
    // Mid-game resync (§3.5): offer playerRejoined to the module (most ignore
    // it — I4 then skips append/broadcast), and ALWAYS send the returning
    // phone its current personal view so it catches up regardless.
    const meta = this.store.getMeta();
    if (meta !== null && meta.gameId !== null && meta.status !== 'lobby') {
      const rt = this.rehydrate();
      if (rt !== null) {
        await this.applyEvent(rt, { type: 'playerRejoined', playerId: seat.playerId, at: now });
        this.sendView(ws, rt, seat.playerId, this.store.getMeta()?.deadlineAt ?? null);
      }
    }
    await this.armAlarm(); // drop the now-moot grace deadline eagerly
  }
```

(2) Replace the whole `onLeave` method with:
```ts
  private async onLeave(ws: WebSocket, att: Attachment): Promise<void> {
    if (att.state === 'joined' && att.playerId !== undefined) {
      const seat = this.store.getSeat(att.playerId);
      if (seat !== null) await this.seatDeparted(seat, Date.now());
    }
    ws.serializeAttachment({ cid: att.cid, state: 'pending' } satisfies Attachment);
    ws.close(1000, 'bye');
  }
```

(3) Replace the whole `fireGrace` method with:
```ts
  /** Grace expiry: idempotent vs the roster — a retry finds the seat gone or its deadline cleared. */
  private async fireGrace(playerId: string, now: number): Promise<void> {
    const seat = this.store.getSeat(playerId);
    if (seat === null || seat.graceUntil === null || seat.graceUntil > now) return;
    await this.seatDeparted(seat, now);
  }
```

(4) Insert after the closing brace of `fireGrace`:
```ts
  /** Leave/grace-expiry shared path (design §4 roster events): free the seat (host migration + lobby), then surface the departure to a running game as a playerLeft event. Tracer ignores it (I4 keeps the log clean); presence-aware games react. */
  private async seatDeparted(seat: Seat, now: number): Promise<void> {
    const playing = this.store.getMeta()?.status === 'playing';
    this.removeSeat(seat, now);
    if (playing) {
      const rt = this.rehydrate();
      if (rt !== null) await this.applyEvent(rt, { type: 'playerLeft', playerId: seat.playerId, at: now });
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bloop/server test` → PASS — 10 files, **43 tests** (39 + 4).
Run: `pnpm test` → PASS — 25 files, **123 tests**.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): playerLeft/playerRejoined through the reducer + mid-game reclaim resync"
```

---

### Task 7: rehydration chaos — C1 verification under eviction (Tier B)

**Files:** Create `apps/server/test/rehydration.test.ts`. (No implementation expected — this is the chaos suite that PROVES Task 5's replay-from-zero; any failure here is a Task-5 bug to fix before proceeding.)

- [ ] **Step 1: Write the tests**

`apps/server/test/rehydration.test.ts`:
```ts
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { TracerState } from '@bloop/game-tracer';
import type { RoomDO } from '../src/room/room-do.js';
import { Store } from '../src/room/store.js';
import { expectSilence, expectTracerView, sendJson, startTracer } from './helpers.js';

/** Simulate eviction: drop the in-memory runtime cache — the next touch MUST rebuild from storage alone. (Test-only reach into a private field.) */
const evict = (i: RoomDO) => { (i as unknown as { game: unknown }).game = null; };
/** Test-only reach into the private rehydrate(). */
const rehydrated = (i: RoomDO) => (i as unknown as { rehydrate(): { state: TracerState } | null }).rehydrate();

describe('rehydration chaos (design §5.2 + review C1)', () => {
  it('ballots cast before eviction shape the round after it (replay-from-zero equivalence)', async () => {
    const { code, socks, welcomes } = await startTracer(['Anna', 'Bert', 'Cara']);
    const stub = env.ROOM.getByName(code);
    const [pa, pb] = welcomes.map((w) => w.playerId);
    sendJson(socks[0]!, { type: 'action', payload: { kind: 'vote', target: pb } });
    for (const s of socks) await expectTracerView(s);
    sendJson(socks[1]!, { type: 'action', payload: { kind: 'vote', target: pa } });
    for (const s of socks) await expectTracerView(s);
    await runInDurableObject(stub, evict);
    sendJson(socks[2]!, { type: 'action', payload: { kind: 'vote', target: pb } }); // completes the round POST-eviction
    const reveal = await expectTracerView(socks[0]!);
    for (const s of [socks[1]!, socks[2]!]) await expectTracerView(s);
    if (reveal.view.phase !== 'reveal') throw new Error(`expected reveal, got ${reveal.view.phase}`);
    expect(reveal.view.tally[pb!]).toBe(2); // both PRE-eviction ballots were rebuilt from the log
    expect(reveal.view.tally[pa!]).toBe(1);
    expect(reveal.view.scores[pb!]).toBe(1);
  });

  it('rehydrated player-keyed maps are null-prototype (C1: state is rebuilt by game code, never JSON.parse)', async () => {
    const { code, socks, welcomes } = await startTracer(['Anna', 'Bert']);
    sendJson(socks[0]!, { type: 'action', payload: { kind: 'vote', target: welcomes[1]!.playerId } });
    for (const s of socks) await expectTracerView(s);
    await runInDurableObject(env.ROOM.getByName(code), (i) => {
      evict(i);
      const rt = rehydrated(i);
      expect(rt).not.toBeNull();
      expect(Object.getPrototypeOf(rt!.state.votes)).toBeNull();
      expect(Object.getPrototypeOf(rt!.state.scores)).toBeNull();
      expect('constructor' in rt!.state.votes).toBe(false); // no inherited keys to poison reads
    });
  });

  it('hostile __proto__ targets bounce off the rehydrated state (silent reject, no pollution)', async () => {
    const { code, socks } = await startTracer(['Anna', 'Bert']);
    const stub = env.ROOM.getByName(code);
    await runInDurableObject(stub, evict);
    sendJson(socks[0]!, { type: 'action', payload: { kind: 'vote', target: '__proto__' } }); // passes zod (any string); the module rejects non-roster targets by reference
    await expectSilence(socks[0]!);
    expect(socks[1]!.drain()).toEqual([]);
    await runInDurableObject(stub, (i) => {
      const rt = rehydrated(i);
      expect((rt!.state.votes as Record<string, unknown>)['__proto__']).toBeUndefined();
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined(); // global prototype untouched
    });
    expect(await runInDurableObject(stub, (_i, state) => new Store(state.storage.sql).eventCount())).toBe(0);
  });

  it('the running countdown survives eviction + alarm loss: re-armed to the SAME absolute deadlineAt', async () => {
    const { code, views } = await startTracer(['Anna', 'Bert']);
    const stub = env.ROOM.getByName(code);
    await runInDurableObject(stub, async (i, state) => {
      evict(i);
      await state.storage.deleteAlarm(); // a deploy restart drops in-memory timers
      await i.sweep(Date.now()); // wake path: nothing due — re-arm from persisted truth
    });
    expect(await runInDurableObject(stub, (_i, state) => state.storage.getAlarm())).toBe(views[0]!.deadlineAt);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm --filter @bloop/server test` → PASS — 11 files, **47 tests** (43 + 4). If ANY fail, fix `rehydrate()`/`applyEvent` in `room-do.ts` (Task 5) — do not weaken the test.
Run: `pnpm test` → PASS — 25 files, **123 tests**.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "test(server): rehydration chaos — replay equivalence, null-proto maps (C1), deadline survival"
```

---

### Task 8: alarm hardening — C2 per-timer isolation + retry floor + lastActivityAt bump (Tier B)

**Files:** Modify `apps/server/src/room/room-do.ts` (one const, two methods, one line); create `apps/server/test/alarm.test.ts`.

- [ ] **Step 1: Write the failing test**

`apps/server/test/alarm.test.ts`:
```ts
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { ALARM_RETRY_MS, GRACE_MS, ROOM_TTL_MS } from '../src/room/room-do.js';
import { Store } from '../src/room/store.js';
import { expectLobby, expectSilence, expectTracerView, sendJson, startTracer } from './helpers.js';

describe('alarm semantics (design §6 + review C2 + TTL-vs-live-game)', () => {
  it('a duplicate sweep at the same instant cannot double-fire a phase deadline (at-least-once safe)', async () => {
    const { code, socks, views } = await startTracer(['Anna', 'Bert']);
    const stub = env.ROOM.getByName(code);
    const now = views[0]!.deadlineAt! + 1;
    await runInDurableObject(stub, (i) => i.sweep(now));
    await runInDurableObject(stub, (i) => i.sweep(now)); // retry at the same forged instant
    const v = await expectTracerView(socks[0]!);
    await expectTracerView(socks[1]!);
    expect(v.view.phase).toBe('reveal'); // advanced exactly once...
    await expectSilence(socks[0]!); // ...and the retry broadcast nothing
    expect(await runInDurableObject(stub, (_i, state) => new Store(state.storage.sql).eventCount())).toBe(1);
  });

  it('a stale phase timer is a no-op (phaseKey guard)', async () => {
    const { code, socks } = await startTracer(['Anna', 'Bert']);
    const stub = env.ROOM.getByName(code);
    await runInDurableObject(stub, (i) =>
      (i as unknown as { firePhase(key: string, now: number): Promise<void> }).firePhase('vote:99', Date.now()));
    await expectSilence(socks[0]!);
    expect(await runInDurableObject(stub, (_i, state) => new Store(state.storage.sql).eventCount())).toBe(0);
  });

  it('C2: a throwing timer cannot starve the others, and the alarm re-arms with the retry floor', async () => {
    const { code, socks } = await startTracer(['Anna', 'Bert', 'Cara']);
    const stub = env.ROOM.getByName(code);
    socks[2]!.ws.close(1000, 'gone');
    await expectLobby(socks[0]!);
    await expectLobby(socks[1]!);
    const now = Date.now() + GRACE_MS + 1_000; // BOTH the vote deadline and Cara's grace are due
    await runInDurableObject(stub, async (i) => {
      // shadow the prototype method on THIS instance: every phase fire explodes
      (i as unknown as { firePhase: () => Promise<void> }).firePhase = () => Promise.reject(new Error('boom'));
      await i.sweep(now);
    });
    const lobby = await expectLobby(socks[0]!); // the grace timer fired anyway: seat freed
    await expectLobby(socks[1]!);
    expect(lobby.players).toHaveLength(2);
    const alarm = await runInDurableObject(stub, (_i, state) => state.storage.getAlarm());
    expect(alarm).toBe(now + ALARM_RETRY_MS); // the failed past-due deadline is floored, not hot-looped
  });

  it('an actively-played game survives a TTL-boundary sweep: every applied event bumps lastActivityAt', async () => {
    const { code, socks, welcomes } = await startTracer(['Anna', 'Bert']);
    const stub = env.ROOM.getByName(code);
    const longAgo = Date.now() - ROOM_TTL_MS - 60_000;
    // backdate: the room now LOOKS idle past the full 45-min TTL...
    await runInDurableObject(stub, (_i, state) => { new Store(state.storage.sql).patchMeta({ lastActivityAt: longAgo }); });
    // ...but a live ballot bumps lastActivityAt, so the janitor pass spares it
    sendJson(socks[0]!, { type: 'action', payload: { kind: 'vote', target: welcomes[1]!.playerId } });
    for (const s of socks) await expectTracerView(s);
    await runInDurableObject(stub, (i) => i.sweep(Date.now()));
    const meta = await runInDurableObject(stub, (_i, state) => new Store(state.storage.sql).getMeta());
    expect(meta).not.toBeNull();
    expect(meta!.status).toBe('playing'); // the live game was NOT reaped
    // control: with NO fresh event, the same horizon reaps the room
    await runInDurableObject(stub, (_i, state) => { new Store(state.storage.sql).patchMeta({ lastActivityAt: longAgo }); });
    await runInDurableObject(stub, (i) => i.sweep(Date.now()));
    expect(await runInDurableObject(stub, (_i, state) => new Store(state.storage.sql).getMeta())).toBeNull();
    expect(await socks[0]!.closed).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bloop/server test`
Expected: FAIL — the whole alarm file errors (`ALARM_RETRY_MS` is not exported yet, so the import fails all 4). The real behavior gaps are the C2 test (sweep has no try/catch — the injected throw rejects the whole call) and the TTL-survival test (`applyEvent` does not bump `lastActivityAt`, so the backdated room is destroyed mid-game); tests 1–2 already hold by construction (derived queue + phaseKey guard) and are pinned here. Existing 47 still pass.

- [ ] **Step 3: Implement**

In `apps/server/src/room/room-do.ts`:

(1) Insert after the `export const UNBORN_TTL_MS = 120_000;` line:
```ts
/** C2: when a timer handler throws, the alarm re-arms no earlier than now + this backoff — one failure must neither starve other timers nor hot-loop the DO. */
export const ALARM_RETRY_MS = 5_000;
```

(2) Replace the whole `sweep` method with:
```ts
  /**
   * Everything due at `now`, earliest-deadline-first over {phase, grace, ttl}
   * (§6). PUBLIC so in-runtime tests drive forged time directly. The queue is
   * DERIVED from persisted truth — a retry re-derives a self-consistent queue
   * (C2 idempotency). Each timer is error-isolated (review C2): a throw is
   * caught, the remaining due timers still fire, and the alarm re-arms with a
   * floor so a past-due broken timer cannot hot-loop the alarm.
   */
  async sweep(now: number): Promise<void> {
    if (this.store.getMeta() === null) return;
    let failed = false;
    for (const t of this.loadQueue().due(now)) {
      try {
        if (t.kind === 'phase') await this.firePhase(t.key, now);
        else if (t.kind === 'grace') await this.fireGrace(t.key, now);
        else await this.fireTtl(now);
      } catch (err) {
        failed = true;
        console.error(`[alarm] timer ${t.kind}:${t.key} failed`, err);
      }
      if (this.store.getMeta() === null) return; // ttl wiped the room; alarm already deleted
    }
    await this.armAlarm(failed ? now + ALARM_RETRY_MS : 0);
  }
```

(3) Replace the whole `armAlarm` method with:
```ts
  /** Single alarm = the EDF queue's earliest timer (always exists: ttl), floored to notBefore after a failed sweep (C2). */
  private async armAlarm(notBefore = 0): Promise<void> {
    if (this.store.getMeta() === null) { await this.ctx.storage.deleteAlarm(); return; }
    await this.ctx.storage.setAlarm(Math.max(this.loadQueue().earliest().fireAt, notBefore));
  }
```

(4) In `applyEvent`, replace the line:
```ts
    this.store.patchMeta({ phaseKey: keyAfter, deadlineAt }); // (2) timer truth persisted
```
with:
```ts
    this.store.patchMeta({ phaseKey: keyAfter, deadlineAt, lastActivityAt: event.at }); // (2) timer truth + activity bump — the 45-min TTL must never reap a LIVE game
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bloop/server test` → PASS — 12 files, **51 tests** (47 + 4).
Run: `pnpm test` → PASS — 25 files, **123 tests**.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): C2 per-timer alarm isolation + retry floor; lastActivityAt bump on every applied event"
```

---

### Task 9: full verification

**Files:** none.

- [ ] **Step 1: Both suites + typecheck from `r2/bloop`**

Run: `pnpm test`
Expected: PASS — **25 files, 123 tests** (2b baseline 109; + noop 4, registry 4, alarm-mux 6).

Run: `pnpm --filter @bloop/server test`
Expected: PASS — **12 files, 51 tests**: smoke 2, front-door 4, profanity-workerd 1, ws-routing 3, hello 10, lifecycle 5, ttl 4, events-store 3, game 7, game-lifecycle 4, rehydration 4, alarm 4.

Run: `pnpm typecheck` → exit 0 across all packages.

- [ ] **Step 2: Billing-discipline spot check (§7.1)**

Run from `r2/bloop`: `git grep -nE "setInterval|setTimeout|\.accept\(" -- apps/server/src`
Expected: no matches (exit 1). All time-based work rides the single alarm; only `ctx.acceptWebSocket` accepts.

- [ ] **Step 3: Bundle sanity (review I6 watch-item)**

Run: `pnpm --filter @bloop/server exec wrangler deploy --dry-run`
Expected: exit 0; record "Total Upload" (engine + tracer + kit add a few KB over 2b; must stay far below the 3 MiB free-plan limit).

- [ ] **Step 4: Clean tree and push**

From the repo root: `git status` — only `r2/bloop` paths in the new commits.

```bash
git push origin r3
```

---

## Deferred (deliberate non-goals — seams marked in code)

- **Snapshots + upcasters** (design §5.1–5.3): replay-from-zero per C1; `events.schema_version` column reserved for upcasters.
- **R2 content packs**: static `TRACER_PACK` in server source; `RoomMeta.contentRef` + `GameEntry.content` are the loader seam.
- **Analytics Engine `METRICS` binding**: effects log to console; `runEffect` is the swap point.
- **Token-bucket rate limit** (§7.4): not in 2c scope (boundary = size cap + zod + per-game schema); the `webSocketMessage` comment now says Plan 2d.
- **`sanitizeGameText`**: no registered game carries free text; seam comment sits in `onAction`.
- **`GAME_IN_PROGRESS` error code** (design §9.7): `ROOM_FULL` reused for mid-game joins — additive protocol change later.
- **Billing CI lint, deploy-restart chaos beyond cache-drop, load smoke** (design Phase 6).

## Deviations from the design (and why)

1. **Snapshots dropped entirely** (design §5.1/§5.2 had a snapshots table + tail-fold): C1 showed `JSON.parse` snapshots silently destroy the null-prototype invariant. Replay-from-zero through `module.init`+`reduce` is pollution-proof by construction and costs microseconds at party scale (review's own option (b)).
2. **No timers table** (design §6.1 `store.putTimer`): the queue is derived per use from `meta.phaseKey/deadlineAt`, `roster.grace_until`, `meta.lastActivityAt` — already persisted by 2b. One source of truth; alarm retries self-heal (C2); `AlarmQueue` stays the pure Tier-A-tested EDF structure.
3. **`registry` keyed by bare `gameId`** (design used `id@version`): the wire `startGame` carries no version; `meta.gameVersion` pins it and `rehydrate()` refuses a version mismatch.
4. **`lookupGame` uses a `Map`**: `REGISTRY['__proto__']` on the design's object literal returns `Object.prototype` — a truthy bogus entry for a hostile client-supplied id.
5. **`gameOver` persists no `finalScores`** (design §4.3 did): the terminal view already carries scores; meta duplication earns nothing in 2c.
6. **`applyEvent` reads `keyBefore` from the module, deadline base from persisted meta** — equivalent to the design's sketch but robust across cache rebuilds.
7. **`events.seq` is plain `INTEGER PRIMARY KEY`** (design: AUTOINCREMENT): the log is only ever wiped whole; avoids `sqlite_sequence` edge cases on `clearEvents`.
8. **`@bloop/kit` added as a direct server dep** without a shell import yet (scope mandate; tracer already pulls it transitively — the shell's future presence helpers land there).

## Open questions

1. Fresh joins are allowed during `roundOver` (design §3.3d only bars `playing`) — the next `startGame` freezes a roster including newcomers. Confirm product intent.
2. Grace expiry mid-game frees the SEAT (roster row + token) while the engine roster keeps the player — re-entry into the same running game is impossible by design. Acceptable for party scale, but revisit if "rejoin the round" becomes a product ask.
3. `ALARM_RETRY_MS = 5s` is a guess; tune against real alarm-failure telemetry once Analytics Engine lands.
