import { describe, expect, it } from 'vitest';
import { leakedSecrets, type GameEvent } from '@bloop/engine';
import type { NightDayAction, NightDayState } from '@bloop/game-night-day';
import { allOf, CONTENT, game, nightRead, roleOf, toNight } from './helpers.js';

/**
 * Mirror of the EXACT fixture shipped in INTEGRATION.md for
 * apps/server/test-node/redaction-audit.test.ts — run here against the same
 * machinery so the snippet can never rot silently. Seed 'audit-seed' with
 * roster p1..p5 assigns: p1=wolf, p2=seer, p3=witch, p4/p5=villagers
 * (deterministic; roles never depend on pack contents).
 */
const PLAYERS = ['p1', 'p2', 'p3', 'p4', 'p5'];
const SEED = 'audit-seed';

const EVENTS: ReadonlyArray<GameEvent<NightDayAction>> = [
  { type: 'playerLeft', playerId: 'p3', at: 500 },
  { type: 'playerLeft', playerId: 'p4', at: 600 },
  { type: 'playerLeft', playerId: 'p5', at: 700 },
  { type: 'deadline', at: 1_000 },
  { type: 'action', playerId: 'p2', action: { kind: 'seerPeek', target: 'p4' }, at: 2_000 },
  { type: 'deadline', at: 3_000 },
  { type: 'action', playerId: 'p1', action: { kind: 'wolfVote', target: 'p3' }, at: 4_000 },
];
const EVENTS_ALT: ReadonlyArray<GameEvent<NightDayAction>> = [
  { type: 'playerLeft', playerId: 'p3', at: 500 },
  { type: 'playerLeft', playerId: 'p4', at: 600 },
  { type: 'playerLeft', playerId: 'p5', at: 700 },
  { type: 'deadline', at: 1_000 },
  { type: 'action', playerId: 'p2', action: { kind: 'seerPeek', target: 'p5' }, at: 2_000 },
  { type: 'deadline', at: 3_000 },
  { type: 'action', playerId: 'p1', action: { kind: 'wolfVote', target: 'p4' }, at: 4_000 },
];
const ACTORS = ['p1', 'p2'];
const OUTSIDERS = ['viewer-not-in-roster', '__proto__'];

function secrets(state: unknown) {
  const s = state as { players: string[]; roles: Record<string, string> };
  return s.players.map((p) => ({ value: `"${p}":"${s.roles[p]}"`, owner: p }));
}

/**
 * REDACTION-AUDIT DECLARATION of the hidden values on this template. Each entry
 * is `{ value, owner }`: the exact substring that would appear in a LEAKED view,
 * owned by the only viewer permitted to see it. `leakedSecrets` then proves no
 * other viewer's view contains it.
 *
 *   - `roles`     — own-only role assignment (the platform's core secret).
 *   - `nightReads`— CC-1 "Night Read" hidden side-bet: each living non-actor's
 *                   private wolf-hunch for the round. Strictly more hidden than
 *                   wolfVotes (owner-only echo, public count, full reveal only at
 *                   `over`). DECLARED here so its non-owner invariance is audited.
 */
function readSecrets(state: NightDayState) {
  const buffer = state.nightReads[state.round] ?? {};
  return Object.keys(buffer).map((reader) => ({
    value: `"${reader}":"${(buffer as Record<string, string>)[reader]}"`,
    owner: reader,
  }));
}

function fold(events: ReadonlyArray<GameEvent<NightDayAction>>): NightDayState {
  let state = game.init(SEED, [...PLAYERS], CONTENT);
  for (const e of events) {
    const next = game.reduce(state, e).state;
    if (next === state) throw new Error(`audit fixture event was rejected: ${JSON.stringify(e)}`);
    state = next;
  }
  return state;
}

describe('INTEGRATION.md redaction-audit fixture (kept in lockstep)', () => {
  const sA = fold(EVENTS);
  const sB = fold(EVENTS_ALT);

  it('fixture is live: same phaseKey, at least one actor sees its own differing choice', () => {
    expect(game.phaseKey(sA)).toBe('night:r0:wolves');
    expect(game.phaseKey(sB)).toBe(game.phaseKey(sA));
    const anActorSees = ACTORS.some(
      (a) => JSON.stringify(game.view(sA, a)) !== JSON.stringify(game.view(sB, a)),
    );
    expect(anActorSees).toBe(true);
  });

  it('every view is JSON-serializable for roster, spectator, hostile viewers', () => {
    for (const viewer of [...PLAYERS, ...OUTSIDERS]) {
      const view = game.view(sA, viewer);
      expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    }
  });

  it("non-actors' views are invariant under hidden-choice changes", () => {
    for (const viewer of [...PLAYERS.filter((p) => !ACTORS.includes(p)), ...OUTSIDERS]) {
      expect(game.view(sA, viewer)).toEqual(game.view(sB, viewer));
    }
  });

  it('declared role secrets never appear in any non-owner view', () => {
    const viewers = [...PLAYERS, ...OUTSIDERS];
    expect(leakedSecrets(game, sA, viewers, secrets(sA))).toEqual([]);
    expect(leakedSecrets(game, sB, viewers, secrets(sB))).toEqual([]);
  });

  it('the deadline walk reaches the untimed over phase within the 25-step audit budget', () => {
    let s = sA;
    let steps = 0;
    for (; steps < 25; steps++) {
      const next = game.reduce(s, { type: 'deadline', at: 100_000 + steps }).state;
      if (next === s) break;
      s = next;
      for (const viewer of OUTSIDERS) {
        const view = game.view(s, viewer);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
      }
    }
    expect(game.phaseDurationMs(s)).toBeNull();
    expect(s.phase).toBe('over');
    expect(s.endReason).toBe('roomCollapsed'); // 3 leaves -> alive∧connected < 3 at the dawn win-check
    expect(steps).toBeLessThanOrEqual(4); // wolves -> witch -> dawn -> over, then absorbed
  });
});

describe('redaction-audit: CC-1 Night Read hidden value (declared + invariant)', () => {
  // Full roster (nobody leaves) so multiple non-actors can place a read.
  const base = toNight(game, game.init(SEED, [...PLAYERS], CONTENT));
  const wolf = roleOf(base, 'wolf');
  const seer = roleOf(base, 'seer');
  const villagers = allOf(base, 'villager');

  // nightSeer: two non-actor villagers read the wolf; the seer (actor) does not read.
  const withReads = (() => {
    let s = game.reduce(base, nightRead(villagers[0]!, wolf, 1)).state;
    s = game.reduce(s, nightRead(villagers[1]!, seer, 2)).state; // a deliberately-wrong read
    return s;
  })();

  it('the declaration is non-empty (the audit actually exercises the new secret)', () => {
    expect(readSecrets(withReads).length).toBeGreaterThanOrEqual(2);
  });

  it('declared night-read secrets never appear in any non-owner view', () => {
    const viewers = [...PLAYERS, ...OUTSIDERS];
    expect(leakedSecrets(game, withReads, viewers, readSecrets(withReads))).toEqual([]);
  });

  it('changing a hidden read leaves every non-owner view byte-identical', () => {
    const alt = game.reduce(base, nightRead(villagers[0]!, seer, 1)).state; // owner reads someone else
    const ref = game.reduce(base, nightRead(villagers[0]!, wolf, 1)).state;
    expect(game.phaseKey(alt)).toBe(game.phaseKey(ref));
    for (const viewer of [...PLAYERS.filter((p) => p !== villagers[0]), ...OUTSIDERS]) {
      expect(game.view(alt, viewer)).toEqual(game.view(ref, viewer));
    }
  });
});
