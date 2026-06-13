import { describe, expect, it } from 'vitest';
import { leakedSecrets, type GameEvent } from '@bloop/engine';
import type { NightDayAction, NightDayState } from '@bloop/game-night-day';
import { CONTENT, game } from './helpers.js';

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
