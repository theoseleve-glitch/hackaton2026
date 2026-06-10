# Bloop Plan 2d — Server Hardening: Rate Limit, Redaction Audit, CI Gates

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Plan 2 with four small hardening deliverables against `docs/designs/2026-06-10-server-shell-design.md`: (1) the §7.4 **token-bucket rate limit** checked FIRST at the WS message boundary (burst 20, refill 10/s — the design's numbers; warn once → silent drops → close on sustained abuse); (2) the **generic redaction-audit** Tier-A suite covering EVERY registry entry automatically (adversarial review I5); (3) a **bundle-size gate** script failing CI when the worker bundle exceeds 2 MiB raw (review I6; measured today: 752 KiB); (4) the **billing + purity CI lint** (design §7.1: no `setInterval`/`setTimeout`/`ws.accept(` in DO source; no `Date.now`/`Math.random` in kit/engine/games src) plus a `pnpm check` umbrella. Tier A grows 123 → **136** (25 → 27 files); Tier B grows 51 → **55** (12 → 13 files). No protocol changes, no new deps.

**Architecture & key decisions:**
- **Bucket persistence: in-memory `Map<cid, RateLimiter>` on the DO instance, reset on wake (design §7.4's own choice, justified harder).** The runtime only hibernates an *idle* DO; at refill 10/s a drained bucket is FULL again after 2s of silence, so any socket that survives into a hibernation gap would have converged to a full bucket anyway — reset-on-wake computes the same answer the timestamps-in-attachment scheme would, for free. Persisting tokens in the attachment would instead add a `serializeAttachment()` storage write to EVERY message on the hot path, directly against the billing model (§7.1). The `take(now)` clock-skew clamp (`Math.max(0, now - last)`) makes the bucket monotone AND makes Tier-B tests deterministic (tests drain at a future instant; real-clock refill then clamps to zero).
- **Violation policy (design §7.4 prose, numbers picked here):** first violation answers one `BAD_MESSAGE` (no new error code), further violations are silently dropped *before any parsing*, and the 50th violation closes the socket with `1008` (policy violation). Existing Tier-B tests stay green: no committed test sends more than ~6 messages per connection.
- **Redaction-audit genericity: required per-game fixture + generic machinery.** Valid actions cannot be synthesized generically (action shapes are per-game), so each registry entry declares a small audit FIXTURE (two event scripts that differ only in hidden choices) and a coverage test fails the moment `listGames()` contains an id without a fixture — future games are covered automatically. The machinery asserts: (a) **non-actor view invariance** — every non-actor's and outsider's view is deep-equal across the two scripts, so hidden choices are provably invisible (this catches tracer-style structural secrets like ballots, where `leakedSecrets` substring matching cannot — playerIds legitimately appear in views); (b) engine `leakedSecrets` = [] for declared value secrets (roles/words/answers — "where applicable"); (c) every view is **JSON-serializable** for roster, non-roster, and `__proto__` viewers; (d) a deadline-walk through every later phase keeps views serializable and stalls only in untimed phases.
- **Bundle gate: 2 MiB raw** (one third headroom under the 3 MiB free-plan limit; today's bundle is 752 KiB ⇒ 36% of budget). `wrangler deploy --dry-run --outdir` emits the real bundle; a plain-node script sums emitted `.js` bytes (sourcemaps excluded) — no output parsing, no new deps. Budget overridable via `BUNDLE_BUDGET_BYTES` for the negative test.
- **Lint placement:** `check:bundle` in `apps/server/package.json` (it is a server concern); `check:billing` + the `check` umbrella in the ROOT `package.json` (the purity rule spans `packages/*`). The lint strips comments before matching (the engine's own JSDoc says "no Date.now/Math.random"; `room-do.ts` says "never .accept()") so doc mentions never false-positive.
- **Run order (CI calls exactly this):** `pnpm check` = Tier A → Tier B → typecheck → billing/purity lint → bundle gate.

**Tech Stack:** unchanged from 2c (vitest-pool-workers 0.12.21 pinned, wrangler ^4.72.0, compat date 2026-03-01, singleWorker + isolatedStorage:false, zod ^4). Zero new dependencies — the two CI scripts are plain `node:fs`/`node:path`.

**Conventions for every task:**
- Working directory `C:\Users\Admin\Documents\Hacktaton26\r2\bloop`. pnpm at `C:\Users\Admin\AppData\Roaming\npm\pnpm.cmd` (plain `pnpm` resolves in PowerShell), pnpm 11.5.2, Node 20+.
- Git: ONLY `git add r2/bloop/<paths>` from repo root or `git add .` from inside `r2/bloop`. NEVER `git add -A` at the root. Branch: **r3**.
- Baselines (verified): Tier A `pnpm test` → **25 files, 123 tests**; Tier B `pnpm --filter @bloop/server test` → **12 files, 51 tests**. Run BOTH after every task.
- Tier-B storage is shared (singleWorker) → every test uses a unique room (fresh `POST /rooms` via `setupRoom`).
- DO source (`apps/server/src/**`) must NEVER contain `setInterval`/`setTimeout`/`ws.accept(` (billing §7.1). Test files may use `setTimeout`.
- All relative imports use the `.js` extension.

---

### Task 1: TokenBucket + RateLimiter — pure §7.4 policy (Tier A)

**Files:** Create `apps/server/src/room/ratelimit.ts`, `apps/server/test-node/ratelimit.test.ts`.

- [ ] **Step 1: Write the failing test**

`apps/server/test-node/ratelimit.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BUCKET_CAP, CLOSE_AFTER_VIOLATIONS, RateLimiter, REFILL_PER_SEC, TokenBucket } from '../src/room/ratelimit.js';

describe('TokenBucket (design §7.4: burst 20, refill 10/s, caller-supplied clock)', () => {
  it('grants exactly the burst capacity at a single instant, then refuses', () => {
    const b = new TokenBucket();
    for (let i = 0; i < BUCKET_CAP; i++) expect(b.take(1_000)).toBe(true);
    expect(b.take(1_000)).toBe(false);
  });

  it('refills at 10 tokens/s: a drained bucket refuses at +50ms, grants at +150ms, is FULL after 2s', () => {
    const b = new TokenBucket();
    for (let i = 0; i < BUCKET_CAP; i++) b.take(1_000);
    expect(b.take(1_050)).toBe(false); // 0.5 tokens accrued — not yet
    expect(b.take(1_150)).toBe(true); // 1.5 tokens since the drain
    const c = new TokenBucket();
    for (let i = 0; i < BUCKET_CAP; i++) c.take(1_000);
    for (let i = 0; i < BUCKET_CAP; i++) expect(c.take(3_000)).toBe(true); // 2s idle = full burst again
    expect(c.take(3_000)).toBe(false);
  });

  it('never refills past the cap', () => {
    const b = new TokenBucket();
    b.take(0);
    for (let i = 0; i < BUCKET_CAP; i++) expect(b.take(3_600_000)).toBe(true); // an hour later: cap, not 36,000
    expect(b.take(3_600_000)).toBe(false);
  });

  it('clamps clock skew: time going backwards never mints tokens', () => {
    const b = new TokenBucket();
    for (let i = 0; i < BUCKET_CAP; i++) b.take(10_000);
    expect(b.take(1_000)).toBe(false); // now < last: refill clamps to 0
    expect(b.take(1_000)).toBe(false); // and stays clamped
  });
});

describe('RateLimiter (warn once -> silent drops -> close on sustained abuse)', () => {
  const drained = (): RateLimiter => {
    const l = new RateLimiter();
    for (let i = 0; i < BUCKET_CAP; i++) expect(l.check(5_000)).toBe('ok');
    return l;
  };

  it('first violation warns (one BAD_MESSAGE), further violations drop silently', () => {
    const l = drained();
    expect(l.check(5_000)).toBe('warn');
    expect(l.check(5_000)).toBe('drop');
    expect(l.check(5_000)).toBe('drop');
  });

  it('the Nth violation closes', () => {
    const l = drained();
    for (let i = 1; i < CLOSE_AFTER_VIOLATIONS; i++) l.check(5_000); // violations 1..N-1
    expect(l.check(5_000)).toBe('close'); // violation N
  });

  it('a well-behaved client at exactly the sustained rate never violates', () => {
    const l = new RateLimiter();
    for (let i = 0; i < 200; i++) expect(l.check(10_000 + i * (1_000 / REFILL_PER_SEC))).toBe('ok');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/server/test-node/ratelimit.test.ts`
Expected: FAIL — cannot resolve `../src/room/ratelimit.js`.

- [ ] **Step 3: Implement**

`apps/server/src/room/ratelimit.ts`:
```ts
/**
 * Token-bucket rate limiting at the WS message boundary (design §7.4).
 *
 * HIBERNATION CHOICE — in-memory, reset-on-wake (deliberate, per §7.4): the
 * buckets live in a Map on the DO instance and vanish on hibernation. That is
 * CORRECT, not a compromise: the runtime only hibernates an IDLE object, and
 * at REFILL_PER_SEC a drained bucket is full again after 2s of silence — any
 * socket that survives into a hibernation gap would have converged to a full
 * bucket anyway, so a fresh bucket on wake computes the same answer.
 * Persisting tokens+timestamps in the socket attachment instead would add a
 * serializeAttachment() storage write to EVERY message on the hot path —
 * against the billing model (§7.1) — to reproduce what refill math gives free.
 */
export const BUCKET_CAP = 20; // §7.4: burst
export const REFILL_PER_SEC = 10; // §7.4: sustained msgs/s (party games are a vote, a tap)
/** §7.4 "repeated abuse closes the socket": total violations on one connection. */
export const CLOSE_AFTER_VIOLATIONS = 50;

export class TokenBucket {
  private tokens: number;
  private last: number | null = null;

  constructor(private readonly cap = BUCKET_CAP, private readonly refillPerSec = REFILL_PER_SEC) {
    this.tokens = cap;
  }

  /** Caller supplies the clock (pure, Tier-A testable). Skew clamps to zero refill — time going backwards never mints tokens. */
  take(now: number): boolean {
    if (this.last !== null) {
      this.tokens = Math.min(this.cap, this.tokens + (Math.max(0, now - this.last) / 1000) * this.refillPerSec);
    }
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export type RateVerdict = 'ok' | 'warn' | 'drop' | 'close';

/** Per-connection policy: one BAD_MESSAGE warning, then silent drops, then close (§7.4). */
export class RateLimiter {
  private violations = 0;

  constructor(private readonly bucket = new TokenBucket()) {}

  check(now: number): RateVerdict {
    if (this.bucket.take(now)) return 'ok';
    this.violations += 1;
    if (this.violations >= CLOSE_AFTER_VIOLATIONS) return 'close';
    return this.violations === 1 ? 'warn' : 'drop';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test` → PASS — 26 files, **130 tests** (123 + 7).
Run: `pnpm --filter @bloop/server test` → PASS — 12 files, **51 tests**.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): §7.4 token bucket + warn/drop/close rate-limit policy (pure, Tier A)"
```

---

### Task 2: rate limit FIRST at the message boundary (Tier B)

**Files:** Modify `apps/server/src/room/room-do.ts`; create `apps/server/test/ratelimit.test.ts`.

- [ ] **Step 1: Write the failing test**

`apps/server/test/ratelimit.test.ts`:
```ts
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { BUCKET_CAP, CLOSE_AFTER_VIOLATIONS, type RateLimiter } from '../src/room/ratelimit.js';
import { expectError, expectLobby, expectSilence, sendJson, setupRoom } from './helpers.js';

/**
 * Deterministically drain every live connection's bucket (and optionally
 * pre-load extra violations) INSIDE the DO: the drain happens at a far-future
 * instant, so the skew clamp in TokenBucket.take() zeroes real-clock refill
 * for the rest of the test — no timing flake.
 */
async function drainBuckets(code: string, extraViolations = 0): Promise<void> {
  await runInDurableObject(env.ROOM.getByName(code), (inst, state) => {
    const reach = inst as unknown as { limiterFor(cid: string): RateLimiter };
    const future = Date.now() + 3_600_000;
    for (const ws of state.getWebSockets()) {
      const { cid } = ws.deserializeAttachment() as { cid: string };
      const lim = reach.limiterFor(cid);
      for (let i = 0; i < BUCKET_CAP; i++) lim.check(future); // exhaust the burst (all 'ok' or already partly spent)
      for (let i = 0; i < extraViolations; i++) lim.check(future); // pre-load violations
    }
  });
}

describe('token-bucket rate limit at the boundary (design §7.4, FIRST in webSocketMessage)', () => {
  it('a drained bucket answers exactly one BAD_MESSAGE, then drops silently BEFORE size/zod/routing', async () => {
    const { code, socks } = await setupRoom(['Anna', 'Bert']);
    await drainBuckets(code);
    sendJson(socks[0]!, { type: 'leave' }); // a VALID message — routing would close 1000 'bye'
    expect(await expectError(socks[0]!)).toBe('BAD_MESSAGE'); // warn: rate limit won, leave never ran
    socks[0]!.ws.send('x'.repeat(5_000)); // oversized junk: size cap AND zod would both answer BAD_MESSAGE
    await expectSilence(socks[0]!); // dropped before either ran
    expect(socks[1]!.drain()).toEqual([]); // no lobby churn: Anna never actually left
  });

  it('sustained abuse closes the socket with 1008', async () => {
    const { code, socks } = await setupRoom(['Solo']);
    await drainBuckets(code, CLOSE_AFTER_VIOLATIONS - 1); // the next message is violation #N
    sendJson(socks[0]!, { type: 'leave' });
    expect(await socks[0]!.closed).toBe(1008);
  });

  it('normal burst traffic is untouched: 10 rapid messages all reach zod, the boundary still routes', async () => {
    const { socks } = await setupRoom(['Anna']);
    for (let i = 0; i < 10; i++) sendJson(socks[0]!, 'junk'); // 10 < BUCKET_CAP: every one reaches zod
    for (let i = 0; i < 10; i++) expect(await expectError(socks[0]!)).toBe('BAD_MESSAGE');
    sendJson(socks[0]!, { type: 'leave' }); // and the connection still works
    expect(await socks[0]!.closed).toBe(1000);
  });

  it('webSocketClose evicts the connection limiter (no unbounded Map growth)', async () => {
    const { code, socks } = await setupRoom(['Anna', 'Bert']);
    socks[1]!.ws.close(1000, 'gone');
    await expectLobby(socks[0]!); // Bert greyed out => webSocketClose fully ran
    const size = await runInDurableObject(env.ROOM.getByName(code), (inst) =>
      (inst as unknown as { limiters: Map<string, unknown> }).limiters.size);
    expect(size).toBe(1); // Bert evicted; Anna remains
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bloop/server test`
Expected: FAIL — the new file errors in `drainBuckets` (`reach.limiterFor is not a function`), and would fail behaviorally anyway (no limiter: the drained-bucket `leave` actually closes 1000). Existing 51 tests still pass.

- [ ] **Step 3: Implement — targeted edits to `apps/server/src/room/room-do.ts`**

(1) Append to the import block, after the `import { lookupGame, ... }` line:
```ts
import { RateLimiter } from './ratelimit.js';
```

(2) Replace the line `  private game: GameRuntime | null = null;` with:
```ts
  private game: GameRuntime | null = null;
  /** §7.4 per-connection buckets, keyed by attachment cid. In-memory by design — see ratelimit.ts: hibernation implies idleness implies a full bucket. */
  private readonly limiters = new Map<string, RateLimiter>();
```

(3) Insert after the closing brace of the `fetch` method (before `webSocketMessage`):
```ts
  private limiterFor(cid: string): RateLimiter {
    let lim = this.limiters.get(cid);
    if (lim === undefined) {
      lim = new RateLimiter();
      this.limiters.set(cid, lim);
    }
    return lim;
  }
```

(4) Replace:
```ts
  /** The single input boundary (§3.3): size cap -> zod -> route. Token-bucket rate limit: Plan 2d. */
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment;
    if (typeof raw !== 'string' || raw.length > MAX_MSG_CHARS) return this.sendError(ws, 'BAD_MESSAGE');
```
with:
```ts
  /** The single input boundary (§3.3/§7.4): rate limit FIRST -> size cap -> zod -> route. */
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment;
    // (0) Token bucket BEFORE any parsing — a flood must cost us ~nothing (§7.4).
    const verdict = this.limiterFor(att.cid).check(Date.now());
    if (verdict !== 'ok') {
      if (verdict === 'warn') this.sendError(ws, 'BAD_MESSAGE'); // once per connection, then silence
      else if (verdict === 'close') ws.close(1008, 'rate-limit'); // sustained abuse: policy violation
      return; // 'drop': silent
    }
    if (typeof raw !== 'string' || raw.length > MAX_MSG_CHARS) return this.sendError(ws, 'BAD_MESSAGE');
```

(5) In `webSocketClose`, replace:
```ts
    const att = ws.deserializeAttachment() as Attachment;
    if (att.state !== 'joined' || att.playerId === undefined) return; // pending/left/superseded
```
with:
```ts
    const att = ws.deserializeAttachment() as Attachment;
    this.limiters.delete(att.cid); // bucket dies with the socket (cids are never reused)
    if (att.state !== 'joined' || att.playerId === undefined) return; // pending/left/superseded
```

(6) In `destroyRoom`, replace the line `    this.game = null; // the in-memory runtime dies with the room` with:
```ts
    this.game = null; // the in-memory runtime dies with the room
    this.limiters.clear(); // C3 hygiene: no stale buckets on this immortal DO id
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bloop/server test` → PASS — 13 files, **55 tests** (51 + 4).
Run: `pnpm test` → PASS — 26 files, **130 tests**.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): token-bucket rate limit FIRST at the WS boundary (warn once, drop, close 1008 on abuse)"
```

---

### Task 3: generic redaction audit over the whole registry (Tier A, review I5)

**Files:** Modify `apps/server/src/room/registry.ts`; create `apps/server/test-node/redaction-audit.test.ts`.

- [ ] **Step 1: Write the failing test**

`apps/server/test-node/redaction-audit.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { leakedSecrets, type GameEvent, type PlayerId } from '@bloop/engine';
import { listGames, type GameEntry } from '../src/room/registry.js';

/**
 * Per-game audit FIXTURE (adversarial review I5). The machinery below is
 * fully generic; only this data is per-game — valid actions cannot be
 * synthesized without knowing the game's action shape. The coverage test
 * fails the moment a game is registered without a fixture, so every future
 * registry entry is audited automatically.
 */
interface RedactionAudit {
  players: readonly PlayerId[];
  seed: string;
  /** Drives init -> a representative MID-GAME state in which hidden state exists. */
  events: ReadonlyArray<GameEvent<unknown>>;
  /** The same script with ONLY the actors' hidden choices changed. */
  eventsAlt: ReadonlyArray<GameEvent<unknown>>;
  /** Players whose hidden choices differ across the scripts (their own views MAY differ). */
  actors: readonly PlayerId[];
  /**
   * Value-bearing secrets for engine leakedSecrets (roles, secret words,
   * answer keys). Empty when the game's secrets are structural — tracer's
   * ballots are playerId->playerId and every playerId legitimately appears in
   * views, so substring auditing cannot apply; the invariance check below
   * covers those instead.
   */
  secrets(state: unknown): ReadonlyArray<{ value: string; owner?: PlayerId }>;
}

const vote = (playerId: string, target: string, at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'vote', target }, at });

const AUDITS: ReadonlyMap<string, RedactionAudit> = new Map([
  ['tracer', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    // mid-vote-phase: two secret ballots in flight, phase NOT yet advanced
    events: [vote('p1', 'p2', 1_000), vote('p2', 'p3', 2_000)],
    eventsAlt: [vote('p1', 'p3', 1_000), vote('p2', 'p1', 2_000)],
    actors: ['p1', 'p2'],
    secrets: () => [],
  }],
]);

/** Viewer classes that must never receive hidden state: a non-roster spectator and a hostile prototype-chain id. */
const OUTSIDERS = ['viewer-not-in-roster', '__proto__'] as const;

function fold(entry: GameEntry, audit: RedactionAudit, events: ReadonlyArray<GameEvent<unknown>>): unknown {
  let state: unknown = entry.module.init(audit.seed, [...audit.players], entry.content);
  for (const e of events) {
    const next = entry.module.reduce(state, e).state;
    // a rejected fixture event (same reference, I4) would make the audit vacuous — fail loud
    if (next === state) throw new Error(`audit fixture event was rejected by reduce: ${JSON.stringify(e)}`);
    state = next;
  }
  return state;
}

describe('redaction audit — every registry entry (review I5)', () => {
  it('every registered game declares an audit fixture', () => {
    expect(listGames().map(([id]) => id).sort()).toEqual([...AUDITS.keys()].sort());
  });

  for (const [id, entry] of listGames()) {
    const audit = AUDITS.get(id);
    if (audit === undefined) continue; // the coverage test above already failed

    describe(id, () => {
      const sA = fold(entry, audit, audit.events);
      const sB = fold(entry, audit, audit.eventsAlt);

      it('fixture is live: same phase both scripts, and at least one actor SEES its own differing choice', () => {
        expect(entry.module.phaseKey(sA)).toBe(entry.module.phaseKey(sB));
        const anActorSees = audit.actors.some(
          (a) => JSON.stringify(entry.module.view(sA, a)) !== JSON.stringify(entry.module.view(sB, a)));
        expect(anActorSees).toBe(true); // guards against a vacuous fixture
      });

      it('every view is JSON-serializable for roster, spectator, and hostile viewers', () => {
        for (const viewer of [...audit.players, ...OUTSIDERS]) {
          const view = entry.module.view(sA, viewer);
          // toEqual (not toStrictEqual): views may carry null-prototype player maps by design
          expect(JSON.parse(JSON.stringify(view))).toEqual(view);
        }
      });

      it("non-actors' views are INVARIANT under hidden-choice changes (structural leak check)", () => {
        const nonActors = [...audit.players.filter((p) => !audit.actors.includes(p)), ...OUTSIDERS];
        expect(nonActors.length).toBeGreaterThan(0);
        for (const viewer of nonActors) {
          expect(entry.module.view(sA, viewer)).toEqual(entry.module.view(sB, viewer));
        }
      });

      it('declared value secrets never appear in any non-owner view (engine leakedSecrets)', () => {
        const viewers = [...audit.players, ...OUTSIDERS];
        expect(leakedSecrets(entry.module, sA, viewers, [...audit.secrets(sA)])).toEqual([]);
        expect(leakedSecrets(entry.module, sB, viewers, [...audit.secrets(sB)])).toEqual([]);
      });

      it('every later phase reached by deadlines keeps views serializable; deadlines stall only in untimed phases', () => {
        let s = sA;
        for (let i = 0; i < 25; i++) {
          const next = entry.module.reduce(s, { type: 'deadline', at: 100_000 + i }).state;
          if (next === s) break; // absorbed (I4)
          s = next;
          for (const viewer of OUTSIDERS) {
            const view = entry.module.view(s, viewer);
            expect(JSON.parse(JSON.stringify(view))).toEqual(view);
          }
        }
        // a module may only ignore a deadline when the phase is untimed — otherwise rooms would stall
        expect(entry.module.phaseDurationMs(s)).toBeNull();
      });
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/server/test-node/redaction-audit.test.ts`
Expected: FAIL — `listGames` is not exported from `../src/room/registry.js`.

- [ ] **Step 3: Implement**

In `apps/server/src/room/registry.ts`, insert after the closing brace of `lookupGame`:
```ts

/** Every registered entry — drives the generic CI audits (redaction I5; future schema audits). */
export function listGames(): ReadonlyArray<readonly [string, GameEntry]> {
  return [...REGISTRY.entries()];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test` → PASS — 27 files, **136 tests** (130 + 6).
Run: `pnpm --filter @bloop/server test` → PASS — 13 files, **55 tests**.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "test(server): generic registry-wide redaction audit (review I5) — invariance + leakedSecrets + serializability"
```

---

### Task 4: bundle-size gate — `check:bundle` (review I6)

**Files:** Create `apps/server/scripts/check-bundle.mjs`; modify `apps/server/package.json`.

- [ ] **Step 1: Write the script**

`apps/server/scripts/check-bundle.mjs`:
```js
#!/usr/bin/env node
/**
 * Bundle-size gate (server-shell adversarial review I6).
 * Run AFTER `wrangler deploy --dry-run --outdir <dir>` (the check:bundle npm
 * script chains both). Sums the raw bytes of every emitted .js/.mjs file
 * (sourcemaps are not uploaded) and fails over budget: 2 MiB raw — deliberate
 * headroom under Cloudflare's 3 MiB free-plan worker limit, so growth (zod v4,
 * obscenity datasets, new game modules) is caught long before a deploy fails.
 * Override for testing: BUNDLE_BUDGET_BYTES env var.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET = Number(process.env.BUNDLE_BUDGET_BYTES ?? 2 * 1024 * 1024);
const outdir = process.argv[2];
if (!outdir) {
  console.error('usage: node scripts/check-bundle.mjs <outdir emitted by wrangler deploy --dry-run --outdir>');
  process.exit(2);
}

let total = 0;
const lines = [];
for (const name of readdirSync(outdir)) {
  if (!/\.m?js$/.test(name)) continue; // skips .js.map and metadata
  const bytes = statSync(join(outdir, name)).size;
  lines.push(`  ${name}: ${(bytes / 1024).toFixed(1)} KiB`);
  total += bytes;
}

if (lines.length === 0) {
  console.error(`check:bundle FAIL — no .js emitted in ${outdir}; did the wrangler dry-run step run?`);
  process.exit(2);
}

console.log(lines.join('\n'));
console.log(`worker bundle: ${(total / 1024).toFixed(1)} KiB raw — ${((total / BUDGET) * 100).toFixed(1)}% of the ${(BUDGET / 1024).toFixed(0)} KiB budget`);
if (total > BUDGET) {
  console.error('check:bundle FAIL — over budget. Trim (zod/mini? obscenity dataset? per-game content) before raising it.');
  process.exit(1);
}
console.log('check:bundle OK');
```

In `apps/server/package.json`, replace the `"scripts"` block with:
```json
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "check:bundle": "wrangler deploy --dry-run --outdir dist/bundle-check && node scripts/check-bundle.mjs dist/bundle-check"
  },
```
(`dist/` is already gitignored, so the emitted bundle never lands in a commit; `&&` works in both cmd.exe and sh npm-script shells.)

- [ ] **Step 2: Run the gate — pass path**

Run from `r2/bloop`: `pnpm --filter @bloop/server check:bundle`
Expected: exit 0; prints `index.js: ~752–780 KiB` (Plan 2d adds ~1 KiB of ratelimit code), `~37% of the 2048 KiB budget`, `check:bundle OK`.

- [ ] **Step 3: Verify the fail path actually fails**

```powershell
$env:BUNDLE_BUDGET_BYTES = '1000'
pnpm --filter @bloop/server check:bundle
$env:BUNDLE_BUDGET_BYTES = $null
```
Expected: the second command exits **1** with `check:bundle FAIL — over budget`.

- [ ] **Step 4: Run both suites (no behavior change expected)**

Run: `pnpm test` → PASS — 27 files, **136 tests**.
Run: `pnpm --filter @bloop/server test` → PASS — 13 files, **55 tests**.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore(server): 2 MiB raw bundle-size gate via wrangler dry-run outdir (review I6) — check:bundle"
```

---

### Task 5: billing + purity CI lint — `check:billing` (design §7.1)

**Files:** Create `scripts/check-billing.mjs` (under `r2/bloop/scripts/`); modify root `package.json` (`r2/bloop/package.json`).

- [ ] **Step 1: Write the script**

`scripts/check-billing.mjs`:
```js
#!/usr/bin/env node
/**
 * Billing + purity CI lint. Exit 1 on any violation.
 *
 * Rule 1 — BILLING (design §7.1), apps/server/src: no setInterval/setTimeout
 * (all time-based work rides the single DO alarm) and no bare `.accept(`
 * (only hibernatable ctx.acceptWebSocket — note `acceptWebSocket(` does NOT
 * match `.accept(`, so the legal call never trips this).
 *
 * Rule 2 — PURITY (spec §4), packages/{kit,engine,games/<each>}/src: no
 * Date.now/Math.random — all nondeterminism enters via seed + event.at.
 *
 * Comment handling: full-comment lines (//, *, /*) are skipped and trailing
 * `//` comments are stripped before matching, so doc mentions of the banned
 * tokens (engine types.ts JSDoc, room-do.ts margin notes) never false-positive.
 * (A violation sharing a line with an earlier `//`-bearing string literal
 * would be missed — acceptable for a lint; the Tier-B suite is the backstop.)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url)); // r2/bloop

function tsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

function codeOnly(line) {
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return '';
  const cut = line.indexOf('//');
  return cut === -1 ? line : line.slice(0, cut);
}

const gameSrcRoots = readdirSync(join(repo, 'packages/games'))
  .map((d) => join('packages/games', d, 'src'))
  .filter((p) => existsSync(join(repo, p)));

const RULES = [
  {
    name: 'billing §7.1 (DO source must hibernate cleanly)',
    roots: ['apps/server/src'],
    patterns: [/\bsetInterval\s*\(/, /\bsetTimeout\s*\(/, /\.accept\s*\(/],
  },
  {
    name: 'purity (game logic sees no ambient clock/RNG)',
    roots: ['packages/kit/src', 'packages/engine/src', ...gameSrcRoots],
    patterns: [/\bDate\.now\b/, /\bMath\.random\b/],
  },
];

let violations = 0;
for (const rule of RULES) {
  for (const root of rule.roots) {
    for (const file of tsFiles(join(repo, root))) {
      readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
        const code = codeOnly(line);
        for (const pattern of rule.patterns) {
          if (pattern.test(code)) {
            violations += 1;
            console.error(`${rule.name}: ${relative(repo, file)}:${i + 1}: ${line.trim()}`);
          }
        }
      });
    }
  }
}

if (violations > 0) {
  console.error(`check:billing FAIL — ${violations} violation(s)`);
  process.exit(1);
}
console.log('check:billing OK — DO source alarm-only; kit/engine/games deterministic');
```

In root `package.json` (`r2/bloop/package.json`), replace the `"scripts"` block with:
```json
  "scripts": {
    "test": "vitest run --passWithNoTests",
    "typecheck": "pnpm -r --no-bail exec tsc --noEmit",
    "check:billing": "node scripts/check-billing.mjs"
  },
```

- [ ] **Step 2: Run the lint — pass path**

Run from `r2/bloop`: `pnpm check:billing`
Expected: exit 0, `check:billing OK ...`. (The only current source mentions are comments — engine `types.ts` JSDoc and `room-do.ts` "never .accept()" margin note — both stripped. `ctx.acceptWebSocket(` does not match `\.accept\s*\(`.)

- [ ] **Step 3: Verify the fail path with a throwaway canary**

```bash
node -e "require('fs').writeFileSync('apps/server/src/tmp-canary.ts','setTimeout(() => {}, 1);')"
pnpm check:billing
```
Expected: exit **1**, naming `apps/server/src/tmp-canary.ts:1`. Then remove it and re-verify:
```bash
node -e "require('fs').unlinkSync('apps/server/src/tmp-canary.ts')"
pnpm check:billing
```
Expected: exit 0.

- [ ] **Step 4: Run both suites (no behavior change expected)**

Run: `pnpm test` → PASS — 27 files, **136 tests**.
Run: `pnpm --filter @bloop/server test` → PASS — 13 files, **55 tests**.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: billing + purity CI lint (design §7.1 / spec §4 firewall) — check:billing"
```

---

### Task 6: `pnpm check` umbrella + full verification + push

**Files:** Modify root `package.json` (`r2/bloop/package.json`).

- [ ] **Step 1: Add the umbrella script**

In root `package.json`, replace the `"scripts"` block with:
```json
  "scripts": {
    "test": "vitest run --passWithNoTests",
    "typecheck": "pnpm -r --no-bail exec tsc --noEmit",
    "check:billing": "node scripts/check-billing.mjs",
    "check": "pnpm run test && pnpm --filter @bloop/server run test && pnpm run typecheck && pnpm run check:billing && pnpm --filter @bloop/server run check:bundle"
  },
```

**Run order (this IS the CI contract — a CI job runs `pnpm install && pnpm check` from `r2/bloop`):**
1. Tier A (pure Node: packages + apps/server/test-node) — fast, fails first on logic.
2. Tier B (workerd: apps/server/test) — DO/socket/alarm wiring.
3. Typecheck — every workspace package.
4. `check:billing` — hibernation + purity greps.
5. `check:bundle` — wrangler dry-run + 2 MiB raw gate.

- [ ] **Step 2: Full verification from `r2/bloop`**

Run: `pnpm check`
Expected, in order, all green:
- Tier A: PASS — **27 files, 136 tests** (2c baseline 123; + ratelimit 7, redaction-audit 6).
- Tier B: PASS — **13 files, 55 tests** (2c baseline 51; + ratelimit boundary 4): smoke 2, front-door 4, profanity-workerd 1, ws-routing 3, hello 10, lifecycle 5, ttl 4, events-store 3, game 7, game-lifecycle 4, rehydration 4, alarm 4, ratelimit 4.
- Typecheck: exit 0 across all packages.
- `check:billing OK`.
- `check:bundle OK` (~752–780 KiB, ≲38% of budget).

- [ ] **Step 3: Billing spot-check parity (the grep the lint replaces stays true)**

Run from repo root: `git grep -nE "setInterval|setTimeout|\.accept\(" -- r2/bloop/apps/server/src`
Expected: only the `room-do.ts` comment line ("never .accept()") — no code matches.

- [ ] **Step 4: Clean tree, commit, push**

From the repo root: `git status` — only `r2/bloop` paths in the new commits.

```bash
git add .
git commit -m "chore: pnpm check umbrella — tiered tests, typecheck, billing lint, bundle gate (closes Plan 2)"
git push origin r3
```

---

## Deferred (deliberate non-goals — Plan 4/later)

- **Analytics Engine binding, R2 content packs, ads/interstitial config, deploy + billing alerts**: design Phase 6 leftovers beyond this plan's four items.
- **Load smoke** (N-room × 16-socket against `wrangler dev`): pre-launch gate, not a CI gate.
- **Per-IP / pre-upgrade rate limiting at the front door**: §7.4 scopes the bucket per *connection*; upgrade-flood protection is Cloudflare-edge territory.
- **`RATE_LIMITED` protocol error code**: violations reuse `BAD_MESSAGE` + close `1008` — additive protocol change only if the client ever needs distinct UX.
- **gzip-aware bundle budget**: the 3 MiB platform limit is post-compression; the 2 MiB *raw* gate is a stricter, simpler proxy. Revisit only if raw/gzip ratios diverge.

## Deviations from the design (and why)

1. **Bucket numbers follow §7.4 exactly (burst 20, refill 10/s)**, but `TokenBucket.take(now)` takes the clock as a parameter instead of defaulting to `Date.now()` (design sketch) — pure/Tier-A-testable, and the added skew clamp doubles as the determinism lever for Tier-B tests.
2. **Violation policy quantified**: the design's "optionally one BAD_MESSAGE then silence; repeated abuse closes" becomes warn-at-1 / drop / close-at-50 with code `1008`.
3. **Redaction audit is fixture-driven, not auto-synthesized** (review I5 asked "run it for every registered module… not hand-written per game"): per-game action synthesis is impossible generically; instead the fixture is per-game *data*, the machinery is generic, and a coverage test makes fixtures mandatory. The non-actor **invariance check** is strictly stronger than `leakedSecrets` for structural secrets (tracer ballots), which the engine helper's own docs declare out of scope.
4. **Bundle gate measures emitted file bytes** (`--outdir` + `fs.stat`), not parsed wrangler stdout — locale/format-proof, zero deps.
5. **`check:billing` lives at the monorepo root** (the purity rule spans `packages/*`); only `check:bundle` is an `apps/server` script as the design's Phase-6 item implied.

## Open questions

1. Close code for rate-limit abuse: `1008` (generic policy violation) vs a custom `4xxx` the client could map to a "slow down" toast — revisit with client UX.
2. `CLOSE_AFTER_VIOLATIONS = 50` is a guess (≈5s of sustained flooding); tune once Analytics Engine telemetry exists.
3. Should `pnpm check` also run `wrangler types` drift detection? Deferred — `worker-configuration.d.ts` churns rarely.
