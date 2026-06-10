# Bloop Plan 2a — `phaseKey` Contract Amendment + `@bloop/kit` Shared Game Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the one approved engine contract amendment — `phaseKey(state): string` on `GameModule` (synthesis A1, server-shell §0.1) — implemented by tracer and every test fixture in the same change, plus a new `@bloop/kit` workspace package of pure shared helpers the four upcoming games need: `emptyPlayerMap` (moved out of tracer), the `Presence` model + `allActed`, `nextActiveSeat`, `tally`, `gameOver` (cloned scores), `normalizeText`, and `phaseKeyOf` with the phaseKey string conventions. All pure TypeScript, no Cloudflare, full Vitest coverage. Suite grows from 50 to 86 tests with no regression.

**Architecture:** Per `r2/bloop/docs/designs/2026-06-10-cross-game-synthesis.md` (§1 shared kit, §2 amendment A1) and `r2/bloop/docs/designs/2026-06-10-server-shell-design.md` (§0.1 phaseKey semantics: the shell re-arms its single alarm iff `phaseKey(before) !== phaseKey(after)` after a reduce; the key must change on every phase entry, must NOT change for in-phase progress, and must never embed a secret). `@bloop/kit` is a sibling package to `@bloop/engine`: the engine stays the minimal contract (types, rng, replay, redaction); the kit is the game-author library on top of it. Every kit helper obeys the engine purity firewall: null-prototype player-keyed maps, JSON-safe values, no `Date.now`/`Math.random`, no I/O.

**Tech Stack:** pnpm workspaces, TypeScript (strict), Vitest. No new external dependencies.

**Conventions for every task:**
- Working directory is `C:\Users\Admin\Documents\Hacktaton26\r2\bloop` unless stated otherwise.
- pnpm is at `C:\Users\Admin\AppData\Roaming\npm\pnpm.cmd` (plain `pnpm` resolves to it in PowerShell). pnpm 11.5.2, Node 20+.
- Git: the repo root contains unrelated untracked files. ONLY ever `git add r2/bloop/<specific paths>` (run from repo root) or `git add .` from inside `r2/bloop`. NEVER `git add -A` from the repo root.
- Branch: `r3`.
- Baseline before Task 1: `pnpm test` → 9 files, 50 tests, all green.
- ALWAYS run the full suite (`pnpm test`) at the end of a task, not just the new file — tracer and engine fixtures must never regress.

---

### Task 1: `phaseKey(state)` on `GameModule` + tracer + fixtures

The amendment is additive for game authors but the interface method is required, so the engine types, both engine test fixtures (counter, spy), and tracer all change in ONE task. Tracer's key scheme follows the server-shell design's one-liner — `` `${phase}:${round}` `` — with the bare terminal `"over"` that both the server-shell convention examples (`"vote:2", "reveal:2", "over"`) and the synthesis §1.6 terminal rule agree on.

**Files:**
- Modify: `r2/bloop/packages/engine/src/types.ts`
- Modify: `r2/bloop/packages/engine/package.json` (version 0.0.2 — the shell compiles against this)
- Modify: `r2/bloop/packages/engine/test/replay.test.ts` (counter fixture)
- Modify: `r2/bloop/packages/engine/test/redaction.test.ts` (spy fixture)
- Modify: `r2/bloop/packages/games/tracer/src/tracer.ts`
- Test: `r2/bloop/packages/games/tracer/test/phasekey.test.ts` (new)

- [ ] **Step 1: Write the failing test**

`packages/games/tracer/test/phasekey.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { ContentPack } from '@bloop/engine';
import { tracer, type TracerContent } from '@bloop/game-tracer';

const content: ContentPack<TracerContent> = {
  id: 't', version: 1,
  data: { prompts: ['P1?', 'P2?', 'P3?'] },
};
const players = ['p1', 'p2', 'p3'];

describe('tracer.phaseKey', () => {
  it('does not change while votes arrive within the vote phase', () => {
    const s0 = tracer.init('s', players, content);
    expect(tracer.phaseKey(s0)).toBe('vote:0');
    const s1 = tracer.reduce(s0, {
      type: 'action', playerId: 'p1', action: { kind: 'vote', target: 'p2' }, at: 0,
    }).state;
    expect(tracer.phaseKey(s1)).toBe('vote:0'); // in-phase progress keeps the running deadline
  });

  it('changes on every phase transition through a full game', () => {
    let state = tracer.init('s', players, content);
    const keys = [tracer.phaseKey(state)];
    while (state.phase !== 'over') {
      state = tracer.reduce(state, { type: 'deadline', at: keys.length }).state;
      keys.push(tracer.phaseKey(state));
    }
    expect(keys).toEqual([
      'vote:0', 'reveal:0', 'vote:1', 'reveal:1', 'vote:2', 'reveal:2', 'over',
    ]);
  });

  it('is the bare string "over" in the terminal phase, and stays put', () => {
    let state = tracer.init('s', players, content);
    while (state.phase !== 'over') {
      state = tracer.reduce(state, { type: 'deadline', at: 0 }).state;
    }
    expect(tracer.phaseKey(state)).toBe('over');
    const after = tracer.reduce(state, { type: 'deadline', at: 99 }).state;
    expect(tracer.phaseKey(after)).toBe('over');
  });

  it('never embeds prompts or player ids (keys are loggable, never secret)', () => {
    let state = tracer.init('s', players, content);
    const seen: string[] = [tracer.phaseKey(state)];
    while (state.phase !== 'over') {
      state = tracer.reduce(state, { type: 'deadline', at: 0 }).state;
      seen.push(tracer.phaseKey(state));
    }
    for (const key of seen) {
      expect(key).toMatch(/^[a-z]+(:\d+)?$/);
      for (const p of players) expect(key).not.toContain(p);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/games/tracer/test/phasekey.test.ts`
Expected: FAIL — `tracer.phaseKey is not a function` (4 failing tests).

- [ ] **Step 3: Implement**

In `packages/engine/src/types.ts`, inside the `GameModule` interface, immediately after the line `phaseDurationMs(state: S): number | null;` (and before the interface's closing `}`), add:

```ts
  /**
   * Stable, pure identifier for the current timed-phase *instance*. The shell
   * re-arms its single alarm iff phaseKey changes across a reduce(): the key
   * must change whenever a NEW deadline should start (entering a phase, or
   * re-entering the same phase kind for a new round/turn) and must NOT change
   * for in-phase progress that keeps the running deadline (e.g. a vote
   * arriving mid-vote-phase). Deterministic from state only — no clock, no
   * randomness. Treat the string as logged: it must NEVER embed a secret
   * (words, roles, ballots, answers). Convention: colon-delimited segments,
   * e.g. "vote:0", "reveal:2"; the terminal phase is the bare string "over".
   */
  phaseKey(state: S): string;
```

Nothing else in `types.ts` changes.

In `packages/engine/package.json`, replace the whole file (version bump — the server shell pins against the amended contract):

```json
{
  "name": "@bloop/engine",
  "version": "0.0.2",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```

In `packages/engine/test/replay.test.ts`, in the `counter` fixture object, add this line directly after `phaseDurationMs: () => null,`:

```ts
  phaseKey: () => 'count',
```

(The `effectful` module in the same file spreads `...counter`, so it inherits `phaseKey` — no change needed there.)

In `packages/engine/test/redaction.test.ts`, in the object literal returned by `makeModule`, add this line directly after `phaseDurationMs: () => null,`:

```ts
    phaseKey: () => 'play',
```

In `packages/games/tracer/src/tracer.ts`, add the method to the `tracer` object immediately after the `phaseDurationMs` method (inside the object literal, before its closing `};`):

```ts
  phaseKey(state) {
    return state.phase === 'over' ? 'over' : `${state.phase}:${state.round}`;
  },
```

(`replay()` in `packages/engine/src/replay.ts` needs no code change — it never calls `phaseKey`; it is generic over `GameModule` and picks up the amended interface automatically.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS — 10 files, 54 tests (50 + 4 new).
Run: `pnpm typecheck`
Expected: exit 0 — every `GameModule` implementor (counter, effectful, spy fixture, tracer) satisfies the amended interface.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(engine): phaseKey(state) contract amendment (A1) + tracer/fixture implementations"
```

---

### Task 2: `@bloop/kit` package scaffold + `emptyPlayerMap` moved out of tracer

**Files:**
- Create: `r2/bloop/packages/kit/package.json`
- Create: `r2/bloop/packages/kit/tsconfig.json`
- Create: `r2/bloop/packages/kit/src/player-map.ts`
- Create: `r2/bloop/packages/kit/src/index.ts`
- Test: `r2/bloop/packages/kit/test/player-map.test.ts`
- Modify: `r2/bloop/packages/games/tracer/src/tracer.ts` (delete local helper, import from kit)
- Modify: `r2/bloop/packages/games/tracer/package.json` (add dependency)

(No `pnpm-workspace.yaml` change: the existing `packages/*` glob already covers `packages/kit`. No `vitest.config.ts` change: the `packages/**/test/**/*.test.ts` include already covers it.)

- [ ] **Step 1: Write the failing test**

`packages/kit/test/player-map.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { emptyPlayerMap } from '@bloop/kit';

describe('emptyPlayerMap', () => {
  it('has a null prototype', () => {
    expect(Object.getPrototypeOf(emptyPlayerMap())).toBeNull();
  });

  it('treats "__proto__" as a plain own key (no prototype pollution)', () => {
    const m = emptyPlayerMap<string>();
    m['__proto__'] = 'evil';
    expect(m['__proto__']).toBe('evil');
    expect(Object.keys(m)).toEqual(['__proto__']);
    expect(({} as Record<string, unknown>)['evil']).toBeUndefined();
  });

  it('round-trips through JSON', () => {
    const m = emptyPlayerMap<number>();
    m['p1'] = 1;
    m['p2'] = 2;
    expect(JSON.parse(JSON.stringify(m))).toEqual({ p1: 1, p2: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/kit`
Expected: FAIL — cannot resolve import `@bloop/kit` (package does not exist yet).

- [ ] **Step 3: Implement**

`packages/kit/package.json`:
```json
{
  "name": "@bloop/kit",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@bloop/engine": "workspace:*"
  }
}
```

`packages/kit/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

`packages/kit/src/player-map.ts`:
```ts
import type { PlayerId } from '@bloop/engine';

/**
 * Null-prototype, JSON-serializable map keyed by untrusted player ids.
 * Player IDs are untrusted strings: assigning obj['__proto__'] on a
 * default-prototype object silently corrupts the map instead of creating a
 * key. Null-proto objects stay JSON-serializable (unlike Map), which
 * event-sourcing requires. Every player-keyed map in every game state MUST
 * be built with this.
 */
export function emptyPlayerMap<V>(): Record<PlayerId, V> {
  return Object.create(null) as Record<PlayerId, V>;
}
```

`packages/kit/src/index.ts`:
```ts
export { emptyPlayerMap } from './player-map.js';
```

In `packages/games/tracer/package.json`, replace the whole file:
```json
{
  "name": "@bloop/game-tracer",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@bloop/engine": "workspace:*",
    "@bloop/kit": "workspace:*",
    "zod": "^4.0.0"
  }
}
```

In `packages/games/tracer/src/tracer.ts`:

(a) Replace the import block at the top of the file:
```ts
import type { Effect, GameModule, PlayerId, ReduceResult } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import { emptyPlayerMap } from '@bloop/kit';
import {
  DEFAULT_CONFIG,
  type TracerAction,
  type TracerState,
  type TracerView,
} from './state.js';
```

(b) Delete the now-duplicated local helper — remove these lines entirely (the doc comment and the function):
```ts
/**
 * Player-keyed maps use null prototypes: player IDs are untrusted strings,
 * and assigning obj['__proto__'] on a default-prototype object silently
 * corrupts the map instead of creating a key. Null-proto objects stay
 * JSON-serializable, unlike Map.
 */
function emptyPlayerMap<V>(): Record<PlayerId, V> {
  return Object.create(null) as Record<PlayerId, V>;
}
```

Nothing else in `tracer.ts` changes — every existing call site (`tallyVotes`, `resolveReveal`, `nextRound`, `init`, `reduce`, `view`) now resolves to the kit import.

Run: `pnpm install` (links `@bloop/kit` into the workspace and into tracer).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS — 11 files, 57 tests (54 + 3 new; all 30 tracer tests still green against the imported helper).
Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(kit): new @bloop/kit shared-helpers package; move emptyPlayerMap out of tracer"
```

---

### Task 3: Presence model + `allActed` predicate

Synthesis §1.2/§1.3: ONE presence shape (state field convention: `connected: Presence`, all-true at init, flipped by playerLeft/playerRejoined, never deleted, orthogonal to game-local elimination like impostor `alive`), and ONE buffer-complete loop. The game computes the eligible `expected` set (usually via `connectedPlayers`); `allActed` owns only the loop, so the "a disconnected player can never stall a phase" rule is implemented identically in all four games.

**Files:**
- Create: `r2/bloop/packages/kit/src/presence.ts`
- Modify: `r2/bloop/packages/kit/src/index.ts`
- Test: `r2/bloop/packages/kit/test/presence.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/kit/test/presence.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { allActed, connectedPlayers, initPresence, setConnected } from '@bloop/kit';

const roster = ['p1', 'p2', 'p3'];

describe('presence', () => {
  it('initPresence marks every roster player connected, null-proto', () => {
    const p = initPresence(roster);
    expect(p).toEqual({ p1: true, p2: true, p3: true });
    expect(Object.getPrototypeOf(p)).toBeNull();
  });

  it('setConnected is copy-on-write and never deletes roster keys', () => {
    const p0 = initPresence(roster);
    const p1 = setConnected(p0, 'p2', false);
    expect(p1).toEqual({ p1: true, p2: false, p3: true });
    expect(p0).toEqual({ p1: true, p2: true, p3: true }); // original untouched
    expect(Object.getPrototypeOf(p1)).toBeNull();
  });

  it('round-trips a disconnect/reconnect', () => {
    const p = setConnected(setConnected(initPresence(roster), 'p3', false), 'p3', true);
    expect(p).toEqual({ p1: true, p2: true, p3: true });
  });

  it('connectedPlayers filters in roster order', () => {
    const p = setConnected(initPresence(roster), 'p1', false);
    expect(connectedPlayers(roster, p)).toEqual(['p2', 'p3']);
    expect(connectedPlayers(roster, initPresence(roster))).toEqual(roster);
  });
});

describe('allActed', () => {
  it('is true when every expected actor has an entry', () => {
    expect(allActed(['p1', 'p2'], { p1: 'x', p2: 'y' })).toBe(true);
  });

  it('is false while any expected actor is missing', () => {
    expect(allActed(['p1', 'p2'], { p1: 'x' })).toBe(false);
  });

  it('treats falsy-but-present entries (e.g. answer 0) as acted, and ignores non-expected actors', () => {
    expect(allActed(['p1'], { p1: 0, ghost: 9 })).toBe(true);
  });

  it('is vacuously true for an empty expected set', () => {
    expect(allActed([], {})).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/kit/test/presence.test.ts`
Expected: FAIL — `@bloop/kit` does not export `initPresence`/`setConnected`/`connectedPlayers`/`allActed`.

- [ ] **Step 3: Implement**

`packages/kit/src/presence.ts`:
```ts
import type { PlayerId } from '@bloop/engine';
import { emptyPlayerMap } from './player-map.js';

/**
 * Canonical presence map (cross-game convention, synthesis §1.2): the state
 * field is named `connected: Presence`, initialized all-true at init, flipped
 * by playerLeft/playerRejoined. `connected[p] === false` means a greyed seat:
 * the player stays in the roster (keys are NEVER deleted) and keeps their
 * scores. Presence is NOT elimination — games keep vote-driven elimination
 * (e.g. impostor `alive`) as a separate game-local map.
 */
export type Presence = Record<PlayerId, boolean>;

/** Fresh presence for a roster: everyone connected. */
export function initPresence(players: readonly PlayerId[]): Presence {
  const p = emptyPlayerMap<boolean>();
  for (const id of players) p[id] = true;
  return p;
}

/** Copy-on-write flip. Never deletes roster keys, never touches scores. */
export function setConnected(p: Presence, id: PlayerId, v: boolean): Presence {
  return Object.assign(emptyPlayerMap<boolean>(), p, { [id]: v });
}

/** Roster-ordered list of connected players. Connected means `=== true`. */
export function connectedPlayers(players: readonly PlayerId[], p: Presence): PlayerId[] {
  return players.filter((id) => p[id] === true);
}

/**
 * True when every expected actor has an entry in `acted`. `expected` is the
 * game-specific eligible set (e.g. connectedPlayers(...), connected-and-alive,
 * present-non-active) — eligibility stays game logic; this helper owns only
 * the buffer-complete loop. Because absent players are simply not in
 * `expected`, a disconnected player can never stall a phase past its deadline
 * (platform rule, spec §6). Entries are "present" when not undefined, so
 * falsy values like a 0|1 answer count as acted. Vacuously true for an empty
 * `expected` (the deadline path still ends every phase).
 */
export function allActed<V>(
  expected: readonly PlayerId[],
  acted: Record<PlayerId, V>,
): boolean {
  return expected.every((id) => acted[id] !== undefined);
}
```

`packages/kit/src/index.ts` (replace whole file):
```ts
export { emptyPlayerMap } from './player-map.js';
export {
  allActed,
  connectedPlayers,
  initPresence,
  setConnected,
  type Presence,
} from './presence.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS — 12 files, 65 tests (57 + 8 new).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(kit): Presence model + allActed buffer-complete predicate"
```

---

### Task 4: `nextActiveSeat` rotation helper

Synthesis §1.4: impostor clue turns, t-or-d turns, and hot-seat rotation all advance a current actor through a fixed seeded order, skipping disconnected seats, wrapping at the end, never deadlocking when everyone is gone (rank-friends won't import this — everyone acts simultaneously there).

**Files:**
- Create: `r2/bloop/packages/kit/src/rotation.ts`
- Modify: `r2/bloop/packages/kit/src/index.ts`
- Test: `r2/bloop/packages/kit/test/rotation.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/kit/test/rotation.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { initPresence, nextActiveSeat, setConnected } from '@bloop/kit';

const order = ['p1', 'p2', 'p3', 'p4'];

describe('nextActiveSeat', () => {
  it('advances to the immediate next seat when it is connected', () => {
    expect(nextActiveSeat(order, 0, initPresence(order))).toEqual({ index: 1, wrapped: false });
  });

  it('skips disconnected seats', () => {
    const p = setConnected(initPresence(order), 'p2', false);
    expect(nextActiveSeat(order, 0, p)).toEqual({ index: 2, wrapped: false });
  });

  it('wraps past the end and reports it', () => {
    expect(nextActiveSeat(order, 3, initPresence(order))).toEqual({ index: 0, wrapped: true });
  });

  it('skipping across the boundary also counts as a wrap', () => {
    const p = setConnected(initPresence(order), 'p4', false);
    expect(nextActiveSeat(order, 2, p)).toEqual({ index: 0, wrapped: true });
  });

  it('degenerates to (fromIndex + 1) % length when nobody is connected', () => {
    let p = initPresence(order);
    for (const id of order) p = setConnected(p, id, false);
    expect(nextActiveSeat(order, 1, p)).toEqual({ index: 2, wrapped: false });
    expect(nextActiveSeat(order, 3, p)).toEqual({ index: 0, wrapped: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/kit/test/rotation.test.ts`
Expected: FAIL — `@bloop/kit` does not export `nextActiveSeat`.

- [ ] **Step 3: Implement**

`packages/kit/src/rotation.ts`:
```ts
import type { PlayerId } from '@bloop/engine';
import type { Presence } from './presence.js';

/**
 * Advance from `fromIndex` forward through `order` (mod length) to the next
 * connected seat. `wrapped` is true when the scan passed the end of `order`
 * — callers bump a round/lap counter on wrap. If NO seat is connected the
 * result degenerates to (fromIndex + 1) % order.length: non-deadlocking by
 * design; the shell's empty-room/grace logic ends the game, the rotation
 * itself never spins forever.
 */
export function nextActiveSeat(
  order: readonly PlayerId[],
  fromIndex: number,
  connected: Presence,
): { index: number; wrapped: boolean } {
  const len = order.length;
  if (len === 0) return { index: 0, wrapped: false }; // degenerate; rosters are >= minPlayers
  for (let step = 1; step <= len; step++) {
    const raw = fromIndex + step;
    const index = raw % len;
    if (connected[order[index]!] === true) return { index, wrapped: raw >= len };
  }
  return { index: (fromIndex + 1) % len, wrapped: fromIndex + 1 >= len };
}
```

Append to the end of `packages/kit/src/index.ts`:
```ts
export { nextActiveSeat } from './rotation.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS — 13 files, 70 tests (65 + 5 new).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(kit): nextActiveSeat rotation (skip disconnected, wrap, never deadlock)"
```

---

### Task 5: `tally` + cloned-scores `gameOver` helper

Synthesis §1.5/§1.7. `tally` is the hidden-buffer → public-aggregate promotion (generalizes tracer's votes → tally); `gameOver` builds the terminal effect with defensively cloned scores so no game can ship the aliasing bug tracer's `phases.test.ts` guards against. The owner-only-echo rule (`mine = buffer[viewer] ?? null`) is a convention, not a function — it is documented in the `tally` JSDoc and enforced per-game by redaction tests.

**Files:**
- Create: `r2/bloop/packages/kit/src/tally.ts`
- Create: `r2/bloop/packages/kit/src/effects.ts`
- Modify: `r2/bloop/packages/kit/src/index.ts`
- Test: `r2/bloop/packages/kit/test/tally.test.ts`
- Test: `r2/bloop/packages/kit/test/effects.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/kit/test/tally.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { emptyPlayerMap, tally } from '@bloop/kit';

describe('tally', () => {
  it('counts occurrences of each value', () => {
    const votes = Object.assign(emptyPlayerMap<string>(), { p1: 'p3', p2: 'p3', p3: 'p1' });
    expect(tally(votes)).toEqual({ p3: 2, p1: 1 });
  });

  it('returns an empty null-proto record for an empty buffer', () => {
    const t = tally(emptyPlayerMap<string>());
    expect(Object.keys(t)).toEqual([]);
    expect(Object.getPrototypeOf(t)).toBeNull();
  });

  it('round-trips through JSON', () => {
    const t = tally(Object.assign(emptyPlayerMap<string>(), { a: 'x', b: 'x' }));
    expect(JSON.parse(JSON.stringify(t))).toEqual({ x: 2 });
  });

  it('counts "__proto__" as a plain value (null-proto discipline on the output)', () => {
    const t = tally(Object.assign(emptyPlayerMap<string>(), { p1: '__proto__', p2: '__proto__' }));
    expect(t['__proto__']).toBe(2);
    expect(Object.keys(t)).toEqual(['__proto__']);
  });
});
```

`packages/kit/test/effects.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { emptyPlayerMap, gameOver } from '@bloop/kit';

describe('gameOver', () => {
  it('builds a gameOver effect carrying the given scores', () => {
    const scores = Object.assign(emptyPlayerMap<number>(), { p1: 3, p2: 0 });
    expect(gameOver(scores)).toEqual({ type: 'gameOver', scores: { p1: 3, p2: 0 } });
  });

  it('clones scores — the effect never aliases live state', () => {
    const live = Object.assign(emptyPlayerMap<number>(), { p1: 1 });
    const eff = gameOver(live);
    expect(eff.scores).not.toBe(live);
    eff.scores['p1'] = 999;
    expect(live['p1']).toBe(1);
  });

  it('returns a null-proto, JSON-safe scores object', () => {
    const eff = gameOver(Object.assign(emptyPlayerMap<number>(), { p1: 2 }));
    expect(Object.getPrototypeOf(eff.scores)).toBeNull();
    expect(JSON.parse(JSON.stringify(eff))).toEqual({ type: 'gameOver', scores: { p1: 2 } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/kit/test/tally.test.ts packages/kit/test/effects.test.ts`
Expected: FAIL — `@bloop/kit` does not export `tally` or `gameOver`.

- [ ] **Step 3: Implement**

`packages/kit/src/tally.ts`:
```ts
import type { PlayerId } from '@bloop/engine';

/**
 * Count occurrences of each value in a player-keyed hidden buffer
 * (generalizes tracer's votes -> tally promotion). The result is the PUBLIC
 * aggregate a reveal transition may expose; the buffer itself stays hidden.
 * Output is null-prototype + JSON-safe, so a hostile value like "__proto__"
 * becomes a plain counted key instead of corrupting the record.
 *
 * Hidden-buffer convention (synthesis §1.5, enforced per-game with
 * leakedSecrets tests): buffers are doc-commented HIDDEN in state, never
 * appear in any non-owner view, and the owner-only echo is always
 * `buffer[viewer] ?? null` — never an indexed lookup that could return a
 * foreign player's value.
 */
export function tally<T extends string>(buffer: Record<PlayerId, T>): Record<T, number> {
  const counts = Object.create(null) as Record<T, number>;
  for (const value of Object.values(buffer)) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}
```

`packages/kit/src/effects.ts`:
```ts
import type { Effect, PlayerId } from '@bloop/engine';
import { emptyPlayerMap } from './player-map.js';

/**
 * Build the gameOver effect with a defensively cloned scores object:
 * effect.scores must never alias live state (the tracer "scores do not
 * alias" invariant — mandatory for all games). Scores are match-local and
 * start at 0 each init; the shell derives session XP from per-match
 * placement, never from raw points (synthesis §1.7).
 */
export function gameOver(scores: Record<PlayerId, number>): Extract<Effect, { type: 'gameOver' }> {
  return { type: 'gameOver', scores: Object.assign(emptyPlayerMap<number>(), scores) };
}
```

Append to the end of `packages/kit/src/index.ts`:
```ts
export { tally } from './tally.js';
export { gameOver } from './effects.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS — 15 files, 77 tests (70 + 7 new).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(kit): tally aggregation + cloned-scores gameOver effect builder"
```

---

### Task 6: `normalizeText`

Synthesis §1.8: deterministic, locale-independent normalization for in-reducer equality compares (impostor guess vs secret word; future write-your-own modes). Explicitly NOT a profanity filter — that stays at the DO boundary.

**Files:**
- Create: `r2/bloop/packages/kit/src/text.ts`
- Modify: `r2/bloop/packages/kit/src/index.ts`
- Test: `r2/bloop/packages/kit/test/text.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/kit/test/text.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { normalizeText } from '@bloop/kit';

describe('normalizeText', () => {
  it('lowercases and trims', () => {
    expect(normalizeText('  CafE  ')).toBe('cafe');
  });

  it('strips diacritics so café === Café', () => {
    expect(normalizeText('Café')).toBe(normalizeText('café'));
    expect(normalizeText('ÉLÈVE')).toBe('eleve');
  });

  it('strips punctuation and symbols', () => {
    expect(normalizeText("l'eau-de-vie!")).toBe('leaudevie');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeText('au   revoir\t mon  ami')).toBe('au revoir mon ami');
  });

  it('is idempotent and keeps digits', () => {
    const once = normalizeText(' Numéro 10! ');
    expect(once).toBe('numero 10');
    expect(normalizeText(once)).toBe(once);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/kit/test/text.test.ts`
Expected: FAIL — `@bloop/kit` does not export `normalizeText`.

- [ ] **Step 3: Implement**

`packages/kit/src/text.ts`:
```ts
/**
 * Deterministic, locale-independent normalization for equality compares
 * (e.g. impostor guess vs secret word): Unicode-decompose (NFD), strip
 * combining diacritics, lowercase, drop everything except letters / digits /
 * whitespace, collapse whitespace runs to a single space, trim. Pure — same
 * input, same output, no locale tables. NOT a profanity filter: that lives
 * at the DO boundary, never in a reducer.
 */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```

Append to the end of `packages/kit/src/index.ts`:
```ts
export { normalizeText } from './text.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS — 16 files, 82 tests (77 + 5 new).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(kit): normalizeText for deterministic guess comparison"
```

---

### Task 7: `phaseKeyOf` formatter + phaseKey string conventions

Synthesis §1.6: the string-scheme conventions are normative; `phaseKeyOf` is the optional sugar that encodes them so the four games format keys one way. The conventions live as JSDoc on the helper (the kit is the game author's reference surface — no separate doc file).

**Files:**
- Create: `r2/bloop/packages/kit/src/phase-key.ts`
- Modify: `r2/bloop/packages/kit/src/index.ts`
- Test: `r2/bloop/packages/kit/test/phase-key.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/kit/test/phase-key.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { phaseKeyOf } from '@bloop/kit';

describe('phaseKeyOf', () => {
  it('renders a bare phase (terminal "over")', () => {
    expect(phaseKeyOf('over')).toBe('over');
  });

  it('renders phase + round as "<phase>:r<round>"', () => {
    expect(phaseKeyOf('vote', 2)).toBe('vote:r2');
    expect(phaseKeyOf('reveal', 0)).toBe('reveal:r0');
  });

  it('renders a sub-segment for per-turn / per-beat uniqueness', () => {
    expect(phaseKeyOf('reveal', 0, 'gold')).toBe('reveal:r0:gold');
    expect(phaseKeyOf('clue', 0, 't3')).toBe('clue:r0:t3');
  });

  it('supports turnSeq-style keys (sub without round)', () => {
    expect(phaseKeyOf('prompt', undefined, 7)).toBe('prompt:7');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/kit/test/phase-key.test.ts`
Expected: FAIL — `@bloop/kit` does not export `phaseKeyOf`.

- [ ] **Step 3: Implement**

`packages/kit/src/phase-key.ts`:
```ts
/**
 * phaseKey string conventions (cross-game synthesis §1.6) — `phaseKeyOf`
 * encodes them; using it is optional sugar, obeying them is not:
 *
 * - Colon-delimited segments, lowest-cardinality first: `"<phase>"`,
 *   `"<phase>:r<round>"`, or `"<phase>:r<round>:<sub>"`. The terminal phase
 *   is always the bare string `"over"`.
 * - The key MUST change on every transition the shell reacts to (new alarm,
 *   ad check, broadcast), including per-turn and per-reveal-beat transitions,
 *   and MUST NOT change for in-phase progress that keeps the running
 *   deadline.
 * - The key MUST NOT embed a secret (treat it as logged): no words, roles,
 *   ballots, answers — phase names, round numbers, turn indices only.
 * - Uniqueness: when a game has multiple actor-turns inside one logical
 *   round, the key MUST include a per-(phase, turn)-unique component —
 *   either a per-turn index (`phaseKeyOf('clue', 0, 't3')` -> "clue:r0:t3")
 *   or a global monotonic turnSeq (`phaseKeyOf('prompt', undefined, 7)` ->
 *   "prompt:7"). `round` alone is NOT sufficient for those games.
 */
export function phaseKeyOf(phase: string, round?: number, sub?: string | number): string {
  const segments: string[] = [phase];
  if (round !== undefined) segments.push(`r${round}`);
  if (sub !== undefined) segments.push(String(sub));
  return segments.join(':');
}
```

`packages/kit/src/index.ts` (replace whole file — final form):
```ts
export { emptyPlayerMap } from './player-map.js';
export {
  allActed,
  connectedPlayers,
  initPresence,
  setConnected,
  type Presence,
} from './presence.js';
export { nextActiveSeat } from './rotation.js';
export { tally } from './tally.js';
export { gameOver } from './effects.js';
export { normalizeText } from './text.js';
export { phaseKeyOf } from './phase-key.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS — 17 files, 86 tests (82 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(kit): phaseKeyOf formatter + normative phaseKey string conventions"
```

---

### Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole suite from `r2/bloop`**

Run: `pnpm test`
Expected: PASS — 17 test files, 86 tests, exit 0:
- engine: rng 6, replay 3, redaction 3
- protocol: messages 12
- tracer: init 3, vote 9, phases 6, redaction 6, replay 2, phasekey 4
- kit: player-map 3, presence 8, rotation 5, tally 4, effects 3, text 5, phase-key 4

Run: `pnpm typecheck`
Expected: exit 0, no errors in any package (engine, protocol, tracer, kit).

- [ ] **Step 2: Purity spot-check on the kit**

Run from `r2/bloop`: `git grep -nE "Date\.now\(\)|Math\.random\(\)" -- packages/kit packages/engine packages/games`
Expected: no matches (exit 1) — the purity firewall holds. (The call-site parens matter: `types.ts` mentions the bare names in a doc comment.)

- [ ] **Step 3: Verify clean tree and push**

Run from repo root (`C:\Users\Admin\Documents\Hacktaton26`): `git status` — only `r2/bloop` paths should appear in the new commits; leave unrelated untracked root files alone.

```bash
git push origin r3
```

---

## Deferred (deliberate non-goals, with reasons)

- **`assertSafePhaseKey` dev guard** — the synthesis does not specify one (§1.6 defines string conventions plus the optional `phaseKeyOf` sugar only). The no-secrets rule is enforced where it is testable: per-game phaseKey tests (Task 1's loggable-format test is the template) and each game's `leakedSecrets` redaction audit. Add a runtime guard only if a future game's review demands it.
- **`HiddenBuffer` abstraction** — synthesis §1.5 is explicit that only `tally` and the owner-echo *convention* are shared; reveal semantics differ per game and must not be abstracted. The convention is documented on `tally` and enforced by per-game redaction tests.
- **Refactoring tracer's `tallyVotes`/`gameOver` call sites onto kit `tally`/`gameOver`** — tracer's `tallyVotes` zero-seeds every player (a tracer-specific view shape) and its inline `{ ...over.scores }` clone is already covered by the no-alias test. Only the `emptyPlayerMap` move is mandated; churning a green reference game for cosmetics is not. The four new games use the kit helpers from day one.
- **Scoring/XP helpers beyond `gameOver`** — synthesis §1.7's placement-based session XP is a shell rule ("requires nothing from the engine"); nothing to build here.
- **Pack-envelope (`locale`/`tone`) types** — synthesis §3 conventions bind the *game packages'* content types, which don't exist yet; defining shared pack types now would speculate ahead of the first game plan (rank-friends).

## Deviations from the synthesis doc (and why)

- **Kit lives in a new `packages/kit` (`@bloop/kit`) workspace package**, not inside `packages/engine` — synthesis §1 allows "packages/engine (or a sibling)"; a sibling keeps the contract package minimal and lets the shell depend on the contract without the game-author library.
- **Tracer's key format is `vote:0` / `reveal:0` / bare `over`** (server-shell §0.1 one-liner and convention examples), not synthesis A1's `vote:r0` sketch. Both satisfy the shell's only requirement (the key diffs exactly on phase entry); the `r`-prefixed scheme via `phaseKeyOf` is the convention for the four NEW games, and tracer predates it as the shell-design reference implementation.
- **The cloned-scores helper is named `gameOver`** (synthesis §1.7's exact name), not `gameOverEffect`.
- **`allActed(expected, acted)`** takes the pre-filtered eligible set per synthesis §1.3 — there is no third `presence?` parameter; games compose `connectedPlayers(...)` (plus their own role filters) to build `expected`.
