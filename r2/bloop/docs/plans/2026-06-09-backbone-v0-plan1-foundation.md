# Bloop Backbone v0 — Plan 1: Foundation (engine, protocol, tracer game) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the bloop pnpm monorepo with the pure-TypeScript game engine (`GameModule` contract, seeded RNG, event replay), the zod wire protocol, and the tracer-bullet vote game — all fully unit-tested, no cloud services involved.

**Architecture:** Per `r2/bloop/docs/specs/2026-06-09-party-game-platform-architecture-design.md`. Game logic is pure reducers with per-player view redaction; the server shell (Plan 2) and Expo app (Plan 3) consume these packages. Nothing in this plan imports Cloudflare or React Native.

**Tech Stack:** pnpm workspaces, TypeScript (strict), Vitest, zod v4.

**Conventions for every task:**
- Working directory is `C:\Users\Admin\Documents\Hacktaton26\r2\bloop` unless stated otherwise.
- Git: the repo root contains unrelated untracked files. ONLY ever `git add r2/bloop/<specific paths>` (run from repo root) or `git add .` from inside `r2/bloop`. NEVER `git add -A` from the repo root.
- Branch: `collab/r2`.

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `r2/bloop/package.json`
- Create: `r2/bloop/pnpm-workspace.yaml`
- Create: `r2/bloop/tsconfig.base.json`
- Create: `r2/bloop/vitest.config.ts`
- Create: `r2/bloop/.gitignore`

- [ ] **Step 1: Verify toolchain**

Run: `node --version` (expect v20+). Run: `pnpm --version`; if pnpm is missing, run `npm install -g pnpm` and re-verify.

- [ ] **Step 2: Create workspace files**

`package.json`:
```json
{
  "name": "bloop",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run --passWithNoTests",
    "typecheck": "pnpm -r --no-bail exec tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "vitest": "^3.2.0"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
  - "packages/games/*"
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['packages/**/test/**/*.test.ts'] },
});
```

`.gitignore`:
```
node_modules/
dist/
*.tsbuildinfo
```

- [ ] **Step 3: Install and verify**

Run: `pnpm install` — expect a `pnpm-lock.yaml` to be created, no errors.
Run: `pnpm test` — expect exit 0 with "No test files found" (passWithNoTests).

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore(bloop): monorepo scaffold (pnpm + vitest + ts strict)"
```

---

### Task 2: Engine — seeded RNG

**Files:**
- Create: `r2/bloop/packages/engine/package.json`
- Create: `r2/bloop/packages/engine/tsconfig.json`
- Create: `r2/bloop/packages/engine/src/rng.ts`
- Create: `r2/bloop/packages/engine/src/index.ts`
- Test: `r2/bloop/packages/engine/test/rng.test.ts`

- [ ] **Step 1: Create package skeleton**

`packages/engine/package.json`:
```json
{
  "name": "@bloop/engine",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```

`packages/engine/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

- [ ] **Step 2: Write the failing test**

`packages/engine/test/rng.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createRng, shuffle } from '@bloop/engine';

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng('room-ABCD');
    const b = createRng('room-ABCD');
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('differs across seeds', () => {
    const a = createRng('room-ABCD');
    const b = createRng('room-WXYZ');
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('emits values in [0, 1)', () => {
    const rng = createRng('x');
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('shuffle', () => {
  it('is a deterministic permutation that does not mutate input', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const frozen = Object.freeze([...items]);
    const out1 = shuffle(createRng('s'), frozen);
    const out2 = shuffle(createRng('s'), frozen);
    expect(out1).toEqual(out2);
    expect([...out1].sort()).toEqual([...items].sort());
    expect(frozen).toEqual(items);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm install` (links the new workspace package), then `pnpm vitest run packages/engine`
Expected: FAIL — cannot resolve `@bloop/engine` exports / functions not defined.

- [ ] **Step 4: Implement**

`packages/engine/src/rng.ts`:
```ts
export type Rng = () => number;

// xmur3 string hash -> 32-bit seed
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

// mulberry32 PRNG
function mulberry32(a: number): Rng {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: string): Rng {
  return mulberry32(xmur3(seed)());
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
```

`packages/engine/src/index.ts`:
```ts
export { createRng, shuffle, type Rng } from './rng.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/engine`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(engine): seeded deterministic RNG + shuffle"
```

---

### Task 3: Engine — GameModule contract and replay

**Files:**
- Create: `r2/bloop/packages/engine/src/types.ts`
- Create: `r2/bloop/packages/engine/src/replay.ts`
- Modify: `r2/bloop/packages/engine/src/index.ts`
- Test: `r2/bloop/packages/engine/test/replay.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/engine/test/replay.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { replay, type ContentPack, type GameModule } from '@bloop/engine';

interface CounterState { n: number }
type CounterAction = { kind: 'inc' };

const counter: GameModule<CounterState, CounterAction, number> = {
  id: 'counter',
  version: 1,
  minPlayers: 1,
  maxPlayers: 16,
  init: () => ({ n: 0 }),
  reduce: (state, event) =>
    event.type === 'action'
      ? { state: { n: state.n + 1 }, effects: [] }
      : { state, effects: [] },
  view: (state) => state.n,
  deadline: () => null,
};

const content: ContentPack = { id: 'none', version: 1, data: {} };

describe('replay', () => {
  it('folds events over init deterministically', () => {
    const events = [
      { type: 'action', playerId: 'p1', action: { kind: 'inc' }, at: 1 },
      { type: 'deadline', at: 2 },
      { type: 'action', playerId: 'p2', action: { kind: 'inc' }, at: 3 },
    ] as const;
    const s1 = replay(counter, 'seed', ['p1', 'p2'], content, [...events]);
    const s2 = replay(counter, 'seed', ['p1', 'p2'], content, [...events]);
    expect(s1).toEqual({ n: 2 });
    expect(s1).toEqual(s2);
  });

  it('replay(all) === replay(prefix) continued with suffix', () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      type: 'action' as const,
      playerId: 'p1',
      action: { kind: 'inc' as const },
      at: i,
    }));
    const full = replay(counter, 's', ['p1'], content, events);
    let state = replay(counter, 's', ['p1'], content, events.slice(0, 2));
    for (const e of events.slice(2)) state = counter.reduce(state, e).state;
    expect(state).toEqual(full);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/engine/test/replay.test.ts`
Expected: FAIL — `replay` not exported.

- [ ] **Step 3: Implement**

`packages/engine/src/types.ts`:
```ts
export type PlayerId = string;

export interface ContentPack<D = unknown> {
  id: string;
  version: number;
  data: D;
}

/** Events fed to a game reducer. `at` is a server-assigned ms timestamp so replay is deterministic. */
export type GameEvent<A> =
  | { type: 'action'; playerId: PlayerId; action: A; at: number }
  | { type: 'deadline'; at: number }
  | { type: 'playerLeft'; playerId: PlayerId; at: number }
  | { type: 'playerRejoined'; playerId: PlayerId; at: number };

export type Effect =
  | { type: 'analytics'; name: string; props?: Record<string, string | number | boolean> }
  | { type: 'gameOver'; scores: Record<PlayerId, number> };

export interface ReduceResult<S> {
  state: S;
  effects: Effect[];
}

/**
 * The platform's core contract (spec §4). Pure TypeScript only:
 * no Cloudflare imports, no I/O, no Date.now/Math.random — all
 * nondeterminism enters via seed and event timestamps.
 */
export interface GameModule<S, A, V> {
  id: string;
  version: number;
  minPlayers: number;
  maxPlayers: number;
  init(seed: string, players: PlayerId[], content: ContentPack): S;
  reduce(state: S, event: GameEvent<A>): ReduceResult<S>;
  view(state: S, viewer: PlayerId): V;
  /** ms remaining for the current phase, or null when untimed. */
  deadline(state: S): number | null;
}
```

`packages/engine/src/replay.ts`:
```ts
import type { ContentPack, GameEvent, GameModule, PlayerId } from './types.js';

export function replay<S, A, V>(
  module: GameModule<S, A, V>,
  seed: string,
  players: PlayerId[],
  content: ContentPack,
  events: ReadonlyArray<GameEvent<A>>,
): S {
  let state = module.init(seed, players, content);
  for (const event of events) state = module.reduce(state, event).state;
  return state;
}
```

`packages/engine/src/index.ts` (replace whole file):
```ts
export { createRng, shuffle, type Rng } from './rng.js';
export { replay } from './replay.js';
export type {
  ContentPack,
  Effect,
  GameEvent,
  GameModule,
  PlayerId,
  ReduceResult,
} from './types.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/engine`
Expected: PASS (6 tests). Run: `pnpm typecheck` — expect no errors.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(engine): GameModule contract, events/effects, replay fold"
```

---

### Task 4: Protocol — zod wire messages

**Files:**
- Create: `r2/bloop/packages/protocol/package.json`
- Create: `r2/bloop/packages/protocol/tsconfig.json`
- Create: `r2/bloop/packages/protocol/src/messages.ts`
- Create: `r2/bloop/packages/protocol/src/index.ts`
- Test: `r2/bloop/packages/protocol/test/messages.test.ts`

- [ ] **Step 1: Create package skeleton**

`packages/protocol/package.json`:
```json
{
  "name": "@bloop/protocol",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "^4.0.0" }
}
```

`packages/protocol/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

Run: `pnpm install`.

- [ ] **Step 2: Write the failing test**

`packages/protocol/test/messages.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  clientMessageSchema,
  PROTOCOL_VERSION,
  serverMessageSchema,
} from '@bloop/protocol';

describe('clientMessageSchema', () => {
  it('accepts a valid hello', () => {
    const msg = {
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      profile: { nickname: 'Théo', avatar: 'fox-3' },
    };
    expect(clientMessageSchema.parse(msg)).toEqual(msg);
  });

  it('rejects an empty nickname', () => {
    const msg = {
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      profile: { nickname: '', avatar: 'fox-3' },
    };
    expect(clientMessageSchema.safeParse(msg).success).toBe(false);
  });

  it('rejects unknown message types', () => {
    expect(clientMessageSchema.safeParse({ type: 'hack' }).success).toBe(false);
  });

  it('accepts a game action with arbitrary payload', () => {
    const msg = { type: 'action', payload: { kind: 'vote', target: 'p2' } };
    expect(clientMessageSchema.parse(msg)).toEqual(msg);
  });
});

describe('serverMessageSchema', () => {
  it('accepts a view broadcast', () => {
    const msg = {
      type: 'view',
      gameId: 'tracer',
      view: { phase: 'vote' },
      deadlineAt: 1750000000000,
    };
    expect(serverMessageSchema.parse(msg)).toEqual(msg);
  });

  it('accepts a typed error', () => {
    const msg = { type: 'error', code: 'UPGRADE_REQUIRED' };
    expect(serverMessageSchema.parse(msg)).toEqual(msg);
  });

  it('rejects unknown error codes', () => {
    expect(
      serverMessageSchema.safeParse({ type: 'error', code: 'NOPE' }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/protocol`
Expected: FAIL — module not implemented.

- [ ] **Step 4: Implement**

`packages/protocol/src/messages.ts`:
```ts
import { z } from 'zod';

export const PROTOCOL_VERSION = 1;

export const playerProfileSchema = z.object({
  nickname: z.string().min(1).max(20),
  avatar: z.string().max(64),
});
export type PlayerProfile = z.infer<typeof playerProfileSchema>;

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    protocolVersion: z.number().int().positive(),
    profile: playerProfileSchema,
    reconnectToken: z.string().optional(),
  }),
  z.object({ type: z.literal('startGame'), gameId: z.string().min(1) }),
  z.object({ type: z.literal('action'), payload: z.unknown() }),
  z.object({ type: z.literal('leave') }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const errorCodeSchema = z.enum([
  'UPGRADE_REQUIRED',
  'ROOM_FULL',
  'BAD_MESSAGE',
  'NOT_HOST',
  'UNKNOWN_GAME',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const roomPlayerSchema = z.object({
  id: z.string(),
  profile: playerProfileSchema,
  connected: z.boolean(),
  isHost: z.boolean(),
});
export type RoomPlayer = z.infer<typeof roomPlayerSchema>;

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('welcome'),
    playerId: z.string(),
    reconnectToken: z.string(),
  }),
  z.object({
    type: z.literal('lobby'),
    players: z.array(roomPlayerSchema),
    gameId: z.string().nullable(),
  }),
  z.object({
    type: z.literal('view'),
    gameId: z.string(),
    view: z.unknown(),
    deadlineAt: z.number().nullable(),
  }),
  z.object({ type: z.literal('error'), code: errorCodeSchema }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
```

`packages/protocol/src/index.ts`:
```ts
export * from './messages.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/protocol`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(protocol): zod wire messages + protocol version"
```

---

### Task 5: Tracer game — package and `init`

**Files:**
- Create: `r2/bloop/packages/games/tracer/package.json`
- Create: `r2/bloop/packages/games/tracer/tsconfig.json`
- Create: `r2/bloop/packages/games/tracer/src/state.ts`
- Create: `r2/bloop/packages/games/tracer/src/actions.ts`
- Create: `r2/bloop/packages/games/tracer/src/tracer.ts`
- Create: `r2/bloop/packages/games/tracer/src/index.ts`
- Test: `r2/bloop/packages/games/tracer/test/init.test.ts`

- [ ] **Step 1: Create package skeleton**

`packages/games/tracer/package.json`:
```json
{
  "name": "@bloop/game-tracer",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@bloop/engine": "workspace:*",
    "zod": "^4.0.0"
  }
}
```

`packages/games/tracer/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

Run: `pnpm install`.

- [ ] **Step 2: Write the failing test**

`packages/games/tracer/test/init.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { ContentPack } from '@bloop/engine';
import { tracer, type TracerContent } from '@bloop/game-tracer';

const content: ContentPack<TracerContent> = {
  id: 'tracer-pack-1',
  version: 1,
  data: { prompts: ['Most likely to fall asleep first?', 'Best dancer?', 'Worst cook?', 'Most likely to be famous?'] },
};
const players = ['p1', 'p2', 'p3'];

describe('tracer.init', () => {
  it('starts in vote phase, round 0, zeroed scores', () => {
    const s = tracer.init('seed-1', players, content);
    expect(s.phase).toBe('vote');
    expect(s.round).toBe(0);
    expect(s.votes).toEqual({});
    expect(s.scores).toEqual({ p1: 0, p2: 0, p3: 0 });
    expect(s.players).toEqual(players);
  });

  it('shuffles prompts deterministically by seed', () => {
    const a = tracer.init('seed-1', players, content);
    const b = tracer.init('seed-1', players, content);
    const c = tracer.init('seed-2', players, content);
    expect(a.prompts).toEqual(b.prompts);
    expect([...a.prompts].sort()).toEqual([...content.data.prompts].sort());
    expect(a.prompts.join()).not.toEqual(c.prompts.join());
  });

  it('caps totalRounds at the number of prompts', () => {
    const tiny: ContentPack<TracerContent> = {
      id: 't', version: 1, data: { prompts: ['Only one?'] },
    };
    const s = tracer.init('s', players, tiny);
    expect(s.config.totalRounds).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/games/tracer`
Expected: FAIL — module not implemented.

- [ ] **Step 4: Implement state, actions, and init (reduce/view/deadline as minimal stubs that compile but are completed in Tasks 6–7)**

`packages/games/tracer/src/state.ts`:
```ts
import type { PlayerId } from '@bloop/engine';

export interface TracerConfig {
  totalRounds: number;
  voteMs: number;
  revealMs: number;
}

export const DEFAULT_CONFIG: TracerConfig = {
  totalRounds: 3,
  voteMs: 30_000,
  revealMs: 5_000,
};

export type TracerPhase = 'vote' | 'reveal' | 'over';

export interface TracerState {
  config: TracerConfig;
  players: PlayerId[];
  prompts: string[];
  round: number;
  phase: TracerPhase;
  /** HIDDEN: never exposed through view(). */
  votes: Record<PlayerId, PlayerId>;
  scores: Record<PlayerId, number>;
}

export type TracerAction = { kind: 'vote'; target: PlayerId };

export type TracerView =
  | {
      phase: 'vote';
      round: number;
      totalRounds: number;
      prompt: string;
      hasVoted: Record<PlayerId, boolean>;
      myVote: PlayerId | null;
      scores: Record<PlayerId, number>;
    }
  | {
      phase: 'reveal';
      round: number;
      totalRounds: number;
      prompt: string;
      tally: Record<PlayerId, number>;
      scores: Record<PlayerId, number>;
    }
  | { phase: 'over'; scores: Record<PlayerId, number> };
```

`packages/games/tracer/src/actions.ts`:
```ts
import { z } from 'zod';

export const tracerActionSchema = z.object({
  kind: z.literal('vote'),
  target: z.string().min(1),
});
```

`packages/games/tracer/src/tracer.ts`:
```ts
import type { GameModule, PlayerId } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import {
  DEFAULT_CONFIG,
  type TracerAction,
  type TracerState,
  type TracerView,
} from './state.js';

export interface TracerContent {
  prompts: string[];
}

export const tracer: GameModule<TracerState, TracerAction, TracerView> = {
  id: 'tracer',
  version: 1,
  minPlayers: 2,
  maxPlayers: 16,

  init(seed, players, content) {
    const { prompts } = content.data as TracerContent;
    const shuffled = shuffle(createRng(seed), prompts);
    const totalRounds = Math.min(DEFAULT_CONFIG.totalRounds, shuffled.length);
    const scores: Record<PlayerId, number> = {};
    for (const p of players) scores[p] = 0;
    return {
      config: { ...DEFAULT_CONFIG, totalRounds },
      players: [...players],
      prompts: shuffled,
      round: 0,
      phase: 'vote',
      votes: {},
      scores,
    };
  },

  reduce(state, _event) {
    return { state, effects: [] }; // completed in Tasks 6-7
  },

  view(state, _viewer) {
    return { phase: 'over', scores: state.scores }; // completed in Task 8
  },

  deadline(state) {
    if (state.phase === 'vote') return state.config.voteMs;
    if (state.phase === 'reveal') return state.config.revealMs;
    return null;
  },
};
```

`packages/games/tracer/src/index.ts`:
```ts
export { tracer, type TracerContent } from './tracer.js';
export { tracerActionSchema } from './actions.js';
export {
  DEFAULT_CONFIG,
  type TracerAction,
  type TracerConfig,
  type TracerPhase,
  type TracerState,
  type TracerView,
} from './state.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/games/tracer`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(tracer): package skeleton + deterministic init"
```

---

### Task 6: Tracer game — voting

**Files:**
- Modify: `r2/bloop/packages/games/tracer/src/tracer.ts` (replace `reduce`)
- Test: `r2/bloop/packages/games/tracer/test/vote.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/games/tracer/test/vote.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { ContentPack, GameEvent } from '@bloop/engine';
import { tracer, type TracerAction, type TracerContent } from '@bloop/game-tracer';

const content: ContentPack<TracerContent> = {
  id: 't', version: 1,
  data: { prompts: ['P1?', 'P2?', 'P3?'] },
};
const players = ['p1', 'p2', 'p3'];

function vote(playerId: string, target: string, at = 0): GameEvent<TracerAction> {
  return { type: 'action', playerId, action: { kind: 'vote', target }, at };
}

describe('tracer voting', () => {
  it('records a vote without revealing it (state only)', () => {
    const s0 = tracer.init('s', players, content);
    const { state: s1, effects } = tracer.reduce(s0, vote('p1', 'p2'));
    expect(s1.votes).toEqual({ p1: 'p2' });
    expect(s1.phase).toBe('vote');
    expect(effects).toEqual([]);
  });

  it('lets a player change their vote before the phase ends', () => {
    const s0 = tracer.init('s', players, content);
    const s1 = tracer.reduce(s0, vote('p1', 'p2')).state;
    const s2 = tracer.reduce(s1, vote('p1', 'p3')).state;
    expect(s2.votes).toEqual({ p1: 'p3' });
  });

  it('ignores self-votes, unknown voters, and unknown targets', () => {
    const s0 = tracer.init('s', players, content);
    expect(tracer.reduce(s0, vote('p1', 'p1')).state.votes).toEqual({});
    expect(tracer.reduce(s0, vote('ghost', 'p1')).state.votes).toEqual({});
    expect(tracer.reduce(s0, vote('p1', 'ghost')).state.votes).toEqual({});
  });

  it('transitions to reveal when all players have voted, scoring the most-voted', () => {
    const s0 = tracer.init('s', players, content);
    const s1 = tracer.reduce(s0, vote('p1', 'p3')).state;
    const s2 = tracer.reduce(s1, vote('p2', 'p3')).state;
    const { state: s3 } = tracer.reduce(s2, vote('p3', 'p1'));
    expect(s3.phase).toBe('reveal');
    expect(s3.scores).toEqual({ p1: 0, p2: 0, p3: 1 });
  });

  it('awards a point to every player tied for most votes', () => {
    const two = ['p1', 'p2'];
    const s0 = tracer.init('s', two, content);
    const s1 = tracer.reduce(s0, vote('p1', 'p2')).state;
    const { state: s2 } = tracer.reduce(s1, vote('p2', 'p1'));
    expect(s2.phase).toBe('reveal');
    expect(s2.scores).toEqual({ p1: 1, p2: 1 });
  });

  it('ignores actions outside the vote phase', () => {
    const s0 = tracer.init('s', players, content);
    const revealed = tracer.reduce(s0, { type: 'deadline', at: 0 }).state;
    expect(revealed.phase).toBe('reveal');
    const after = tracer.reduce(revealed, vote('p1', 'p2')).state;
    expect(after.votes).toEqual(revealed.votes);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/games/tracer/test/vote.test.ts`
Expected: FAIL — reduce is a stub.

- [ ] **Step 3: Implement reduce (voting + reveal resolution; round advancement lands in Task 7)**

In `packages/games/tracer/src/tracer.ts`, add above the `tracer` export:

```ts
import type { Effect, ReduceResult } from '@bloop/engine';

function tallyVotes(state: TracerState): Record<PlayerId, number> {
  const counts: Record<PlayerId, number> = {};
  for (const p of state.players) counts[p] = 0;
  for (const target of Object.values(state.votes)) {
    counts[target] = (counts[target] ?? 0) + 1;
  }
  return counts;
}

function resolveReveal(state: TracerState): ReduceResult<TracerState> {
  const counts = tallyVotes(state);
  const max = Math.max(0, ...Object.values(counts));
  const scores = { ...state.scores };
  if (max > 0) {
    for (const p of state.players) {
      if (counts[p] === max) scores[p] = (scores[p] ?? 0) + 1;
    }
  }
  const effects: Effect[] = [
    { type: 'analytics', name: 'round_revealed', props: { round: state.round } },
  ];
  return { state: { ...state, phase: 'reveal', scores }, effects };
}
```

Replace the stub `reduce` with:

```ts
  reduce(state, event) {
    if (state.phase === 'over') return { state, effects: [] };

    if (event.type === 'action' && state.phase === 'vote') {
      const { playerId, action } = event;
      if (!state.players.includes(playerId)) return { state, effects: [] };
      if (!state.players.includes(action.target) || action.target === playerId) {
        return { state, effects: [] };
      }
      const votes = { ...state.votes, [playerId]: action.target };
      const next = { ...state, votes };
      if (state.players.every((p) => votes[p] !== undefined)) {
        return resolveReveal(next);
      }
      return { state: next, effects: [] };
    }

    if (event.type === 'deadline') {
      if (state.phase === 'vote') return resolveReveal(state);
      if (state.phase === 'reveal') return nextRound(state); // Task 7
    }

    return { state, effects: [] };
  },
```

Add a temporary `nextRound` so this task compiles (completed in Task 7):

```ts
function nextRound(state: TracerState): ReduceResult<TracerState> {
  return { state, effects: [] }; // completed in Task 7
}
```

Also update the imports at the top of `tracer.ts` to include `TracerState` value usage — final import block:

```ts
import type { Effect, GameModule, PlayerId, ReduceResult } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import {
  DEFAULT_CONFIG,
  type TracerAction,
  type TracerState,
  type TracerView,
} from './state.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/games/tracer`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(tracer): voting with hidden buffered votes and reveal scoring"
```

---

### Task 7: Tracer game — round advancement and game over

**Files:**
- Modify: `r2/bloop/packages/games/tracer/src/tracer.ts` (replace `nextRound` stub)
- Test: `r2/bloop/packages/games/tracer/test/phases.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/games/tracer/test/phases.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { ContentPack } from '@bloop/engine';
import { tracer, type TracerContent, type TracerState } from '@bloop/game-tracer';

const content: ContentPack<TracerContent> = {
  id: 't', version: 1,
  data: { prompts: ['P1?', 'P2?', 'P3?'] },
};
const players = ['p1', 'p2'];

function playRound(state: TracerState): TracerState {
  // vote deadline -> reveal, reveal deadline -> next
  const revealed = tracer.reduce(state, { type: 'deadline', at: 0 }).state;
  return tracer.reduce(revealed, { type: 'deadline', at: 1 }).state;
}

describe('tracer phases', () => {
  it('advances reveal -> next vote round with cleared votes', () => {
    const s0 = tracer.init('s', players, content);
    const s1 = playRound(s0);
    expect(s1.phase).toBe('vote');
    expect(s1.round).toBe(1);
    expect(s1.votes).toEqual({});
  });

  it('ends after totalRounds with a gameOver effect carrying final scores', () => {
    let state = tracer.init('s', players, content);
    expect(state.config.totalRounds).toBe(3);
    state = playRound(state);
    state = playRound(state);
    const revealed = tracer.reduce(state, { type: 'deadline', at: 0 }).state;
    const { state: over, effects } = tracer.reduce(revealed, { type: 'deadline', at: 1 });
    expect(over.phase).toBe('over');
    expect(effects).toContainEqual({ type: 'gameOver', scores: over.scores });
  });

  it('is inert once over', () => {
    let state = tracer.init('s', players, content);
    for (let i = 0; i < 3; i++) state = playRound(state);
    const { state: still, effects } = tracer.reduce(state, { type: 'deadline', at: 99 });
    expect(still).toEqual(state);
    expect(effects).toEqual([]);
  });

  it('ignores playerLeft/playerRejoined without crashing', () => {
    const s0 = tracer.init('s', players, content);
    const left = tracer.reduce(s0, { type: 'playerLeft', playerId: 'p1', at: 0 });
    const back = tracer.reduce(left.state, { type: 'playerRejoined', playerId: 'p1', at: 1 });
    expect(back.state).toEqual(s0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/games/tracer/test/phases.test.ts`
Expected: FAIL — `nextRound` is a stub (round never advances).

- [ ] **Step 3: Implement `nextRound`**

Replace the stub in `packages/games/tracer/src/tracer.ts`:

```ts
function nextRound(state: TracerState): ReduceResult<TracerState> {
  const round = state.round + 1;
  if (round >= state.config.totalRounds) {
    const over: TracerState = { ...state, phase: 'over' };
    return { state: over, effects: [{ type: 'gameOver', scores: over.scores }] };
  }
  return { state: { ...state, round, phase: 'vote', votes: {} }, effects: [] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/games/tracer`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(tracer): round advancement and game over"
```

---

### Task 8: Tracer game — per-player views with redaction

**Files:**
- Modify: `r2/bloop/packages/games/tracer/src/tracer.ts` (replace `view`)
- Test: `r2/bloop/packages/games/tracer/test/redaction.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/games/tracer/test/redaction.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { ContentPack } from '@bloop/engine';
import { tracer, type TracerContent } from '@bloop/game-tracer';

const content: ContentPack<TracerContent> = {
  id: 't', version: 1,
  data: { prompts: ['P1?', 'P2?', 'P3?'] },
};
const players = ['p1', 'p2', 'p3'];

describe('tracer view redaction', () => {
  it('shows each viewer only their own vote during the vote phase', () => {
    const s0 = tracer.init('s', players, content);
    const s1 = tracer.reduce(s0, {
      type: 'action', playerId: 'p1', action: { kind: 'vote', target: 'p2' }, at: 0,
    }).state;

    const v1 = tracer.view(s1, 'p1');
    const v2 = tracer.view(s1, 'p2');
    if (v1.phase !== 'vote' || v2.phase !== 'vote') throw new Error('expected vote views');

    expect(v1.myVote).toBe('p2');
    expect(v2.myVote).toBeNull();
    expect(v1.hasVoted).toEqual({ p1: true, p2: false, p3: false });
    expect(v1.prompt).toBe(s1.prompts[0]);
  });

  it('never serializes the raw votes map in any vote-phase view', () => {
    const s0 = tracer.init('s', players, content);
    const s1 = tracer.reduce(s0, {
      type: 'action', playerId: 'p1', action: { kind: 'vote', target: 'p3' }, at: 0,
    }).state;
    for (const viewer of players) {
      const json = JSON.stringify(tracer.view(s1, viewer));
      expect(json).not.toContain('"votes"');
      if (viewer !== 'p1') expect(json).not.toContain('"myVote":"p3"');
    }
  });

  it('reveals only aggregate tallies in the reveal phase', () => {
    const s0 = tracer.init('s', players, content);
    let state = s0;
    state = tracer.reduce(state, { type: 'action', playerId: 'p1', action: { kind: 'vote', target: 'p3' }, at: 0 }).state;
    state = tracer.reduce(state, { type: 'action', playerId: 'p2', action: { kind: 'vote', target: 'p3' }, at: 1 }).state;
    state = tracer.reduce(state, { type: 'action', playerId: 'p3', action: { kind: 'vote', target: 'p1' }, at: 2 }).state;

    const v = tracer.view(state, 'p2');
    if (v.phase !== 'reveal') throw new Error('expected reveal view');
    expect(v.tally).toEqual({ p1: 1, p2: 0, p3: 2 });
    expect(JSON.stringify(v)).not.toContain('"votes"');
  });

  it('shows final scores when over', () => {
    let state = tracer.init('s', ['p1', 'p2'], content);
    for (let i = 0; i < 3; i++) {
      state = tracer.reduce(state, { type: 'deadline', at: 0 }).state;
      state = tracer.reduce(state, { type: 'deadline', at: 1 }).state;
    }
    const v = tracer.view(state, 'p1');
    expect(v.phase).toBe('over');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/games/tracer/test/redaction.test.ts`
Expected: FAIL — view is a stub returning `over`.

- [ ] **Step 3: Implement `view`**

Replace the stub `view` in `packages/games/tracer/src/tracer.ts`:

```ts
  view(state, viewer) {
    const prompt = state.prompts[state.round] ?? '';
    if (state.phase === 'vote') {
      const hasVoted: Record<PlayerId, boolean> = {};
      for (const p of state.players) hasVoted[p] = state.votes[p] !== undefined;
      return {
        phase: 'vote',
        round: state.round,
        totalRounds: state.config.totalRounds,
        prompt,
        hasVoted,
        myVote: state.votes[viewer] ?? null,
        scores: state.scores,
      };
    }
    if (state.phase === 'reveal') {
      return {
        phase: 'reveal',
        round: state.round,
        totalRounds: state.config.totalRounds,
        prompt,
        tally: tallyVotes(state),
        scores: state.scores,
      };
    }
    return { phase: 'over', scores: state.scores };
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/games/tracer`
Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(tracer): per-player redacted views"
```

---

### Task 9: Tracer game — replay determinism (chaos foundation)

**Files:**
- Test: `r2/bloop/packages/games/tracer/test/replay.test.ts`

- [ ] **Step 1: Write the test (expected to pass — it certifies properties already built)**

`packages/games/tracer/test/replay.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { replay, type ContentPack, type GameEvent } from '@bloop/engine';
import { tracer, type TracerAction, type TracerContent } from '@bloop/game-tracer';

const content: ContentPack<TracerContent> = {
  id: 't', version: 1,
  data: { prompts: ['P1?', 'P2?', 'P3?'] },
};
const players = ['p1', 'p2', 'p3'];

function fullGameScript(): GameEvent<TracerAction>[] {
  const events: GameEvent<TracerAction>[] = [];
  let at = 0;
  for (let round = 0; round < 3; round++) {
    events.push({ type: 'action', playerId: 'p1', action: { kind: 'vote', target: 'p2' }, at: at++ });
    events.push({ type: 'action', playerId: 'p2', action: { kind: 'vote', target: 'p1' }, at: at++ });
    events.push({ type: 'action', playerId: 'p3', action: { kind: 'vote', target: 'p1' }, at: at++ });
    // all voted -> reveal happened automatically; reveal deadline advances the round
    events.push({ type: 'deadline', at: at++ });
  }
  return events;
}

describe('tracer replay determinism', () => {
  it('replaying the full script twice yields identical end states', () => {
    const script = fullGameScript();
    const a = replay(tracer, 'seed-x', players, content, script);
    const b = replay(tracer, 'seed-x', players, content, script);
    expect(a).toEqual(b);
    expect(a.phase).toBe('over');
    expect(a.scores).toEqual({ p1: 3, p2: 0, p3: 0 });
  });

  it('snapshot-and-continue equals full replay at every cut point', () => {
    const script = fullGameScript();
    const full = replay(tracer, 'seed-x', players, content, script);
    for (let cut = 0; cut <= script.length; cut++) {
      let state = replay(tracer, 'seed-x', players, content, script.slice(0, cut));
      for (const e of script.slice(cut)) state = tracer.reduce(state, e).state;
      expect(state).toEqual(full);
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm vitest run packages/games/tracer/test/replay.test.ts`
Expected: PASS (2 tests). If `a.scores` differs, the reducer has hidden nondeterminism — that is a bug to fix in `tracer.ts`, not in the test.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "test(tracer): replay determinism and snapshot-continuation equivalence"
```

---

### Task 10: Full verification

- [ ] **Step 1: Run the whole suite from `r2/bloop`**

Run: `pnpm test`
Expected: PASS — 8 test files (engine rng + replay, protocol, tracer ×5), ~32 tests, exit 0.

Run: `pnpm typecheck`
Expected: exit 0, no errors in any package.

- [ ] **Step 2: Verify clean tree and push**

Run from repo root: `git status` — only `r2/bloop` paths should appear in committed history; working tree may still show the unrelated untracked Backed files (leave them).

```bash
git push origin collab/r2
```
