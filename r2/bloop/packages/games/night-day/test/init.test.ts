import { describe, expect, it } from 'vitest';
import { CONTENT, game, mk, P5 } from './helpers.js';

describe('init determinism', () => {
  it('same seed -> identical roles and narration order', () => {
    const a = game.init('seed-1', P5, CONTENT);
    const b = game.init('seed-1', P5, CONTENT);
    expect(a.roles).toEqual(b.roles);
    expect(a.narrations).toEqual(b.narrations);
  });

  it('roles depend only on seed+roster, never on pack contents', () => {
    const a = game.init('seed-1', P5, CONTENT);
    const skinny = { ...CONTENT, data: { items: CONTENT.data.items.slice(0, 4) } };
    const b = game.init('seed-1', P5, skinny);
    expect(a.roles).toEqual(b.roles);
  });

  it('different seeds shuffle the assignment (some seed differs)', () => {
    const a = game.init('seed-1', P5, CONTENT);
    const differs = ['seed-2', 'seed-3', 'seed-4'].some(
      (s) => JSON.stringify(game.init(s, P5, CONTENT).roles) !== JSON.stringify(a.roles),
    );
    expect(differs).toBe(true);
  });
});

describe('role table (design §2.17)', () => {
  const expectedWolves = (n: number) => Math.min(4, Math.max(1, Math.floor(n / 4)));

  it('wolves = min(4, max(1, floor(n/4))) for n = 5..16, +1 seer, +1 witch, rest villagers', () => {
    for (let n = 5; n <= 16; n++) {
      const players = Array.from({ length: n }, (_, i) => `p${i + 1}`);
      const s = game.init('table-seed', players, CONTENT);
      const counts = { wolf: 0, villager: 0, seer: 0, witch: 0 };
      for (const p of players) counts[s.roles[p]] += 1;
      expect(counts.wolf).toBe(expectedWolves(n));
      expect(counts.seer).toBe(1);
      expect(counts.witch).toBe(1);
      expect(counts.villager).toBe(n - expectedWolves(n) - 2);
      expect(s.composition).toEqual(counts);
      // wolves are a strict minority at every count (the parity win depends on it)
      expect(counts.wolf).toBeLessThan(n - counts.wolf);
    }
  });

  it('maxWolves caps the pool', () => {
    const capped = mk({ maxWolves: 2 });
    const players = Array.from({ length: 16 }, (_, i) => `p${i + 1}`);
    const s = capped.init('s', players, CONTENT);
    expect(s.composition.wolf).toBe(2);
  });

  it('disabled seer/witch assign nobody and zero the public composition', () => {
    const bare = mk({ seerEnabled: false, witchEnabled: false });
    const s = bare.init('s', P5, CONTENT);
    expect(s.composition.seer).toBe(0);
    expect(s.composition.witch).toBe(0);
    expect(P5.every((p) => s.roles[p] === 'wolf' || s.roles[p] === 'villager')).toBe(true);
  });
});

describe('content intake', () => {
  it('ignores roleCards beyond the v1 set (hunter, cupid, ...)', () => {
    const withV2 = {
      ...CONTENT,
      data: {
        items: [
          ...CONTENT.data.items,
          // hostile/extra card outside the v1 role union, as the raw authored pack carries
          { id: 'rc-hunter', type: 'roleCard', role: 'hunter', name: { fr: 'C', en: 'H' }, text: { fr: 't', en: 't' } },
        ] as unknown as typeof CONTENT.data.items,
      },
    };
    const s = game.init('s', P5, withV2);
    expect(Object.keys(s.roleCards).sort()).toEqual(['seer', 'villager', 'witch', 'wolf']);
  });

  it('missing narration slots and roleCards degrade to null in views, never crash', () => {
    const empty = { id: 'empty', version: 1, data: { items: [] } };
    const s = game.init('s', P5, empty);
    const v = game.view(s, 'p1');
    expect(v.narration).toBeNull();
    expect(v.myRoleCard).toBeNull();
    const night = game.reduce(s, { type: 'deadline', at: 1 }).state;
    expect(game.view(night, 'p1').narration).toBeNull();
  });
});

describe('initial shape', () => {
  it('starts at roleReveal with everyone alive, connected, zero scores', () => {
    const s = game.init('s', P5, CONTENT);
    expect(s.phase).toBe('roleReveal');
    expect(game.phaseKey(s)).toBe('roleReveal');
    expect(game.phaseDurationMs(s)).toBe(15_000);
    for (const p of P5) {
      expect(s.alive[p]).toBe(true);
      expect(s.connected[p]).toBe(true);
      expect(s.scores[p]).toBe(0);
    }
    expect(s.witchState).toEqual({ healLeft: true, poisonLeft: true });
  });

  it('the composition is public — spectators see it too', () => {
    const s = game.init('s', P5, CONTENT);
    const v = game.view(s, 'spectator');
    expect(v.composition).toEqual({ wolf: 1, villager: 2, seer: 1, witch: 1 });
  });
});
