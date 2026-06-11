import { describe, expect, it } from 'vitest';
import type { ContentPack, GameEvent } from '@bloop/engine';
import {
  createOptionVote,
  GAUCHE_DROITE_CONFIG,
  TU_PREFERES_CONFIG,
  type OptionVoteAction,
  type OptionVoteContent,
  type OptionVoteState,
} from '@bloop/game-option-vote';

const content: ContentPack<OptionVoteContent> = {
  id: 'test-pack', version: 1,
  data: {
    items: [
      { id: 'i1', optionA: { fr: 'A1', en: 'A1' }, optionB: { fr: 'B1', en: 'B1' }, debateStarter: { fr: 'd', en: 'd' } },
      { id: 'i2', optionA: { fr: 'A2', en: 'A2' }, optionB: { fr: 'B2', en: 'B2' } },
    ],
  },
};
const players = ['p1', 'p2', 'p3'];

const tuPreferes = createOptionVote('tu-preferes', TU_PREFERES_CONFIG);
const gauche = createOptionVote('gauche-ou-droite', GAUCHE_DROITE_CONFIG);

function ballot(playerId: string, pick: 'A' | 'B', predict?: 'A' | 'B', at = 0): GameEvent<OptionVoteAction> {
  return { type: 'action', playerId, action: { kind: 'ballot', pick, ...(predict !== undefined ? { predict } : {}) }, at };
}
const skip = (playerId: string, at = 0): GameEvent<OptionVoteAction> =>
  ({ type: 'action', playerId, action: { kind: 'skip' }, at });

function toReveal(s0: OptionVoteState): OptionVoteState {
  const s1 = gauche.reduce(s0, ballot('p1', 'A')).state;
  const s2 = gauche.reduce(s1, ballot('p2', 'A')).state;
  return gauche.reduce(s2, ballot('p3', 'B')).state;
}

describe('phase chain and timing', () => {
  it('tu-preferes: choose -> reveal -> next choose (no debate when debateMs = 0)', () => {
    const s0 = tuPreferes.init('s', players, content);
    expect(tuPreferes.phaseKey(s0)).toBe('choose:r0');
    expect(tuPreferes.phaseDurationMs(s0)).toBe(15_000);
    const s1 = tuPreferes.reduce(s0, { type: 'deadline', at: 0 }).state;
    expect(tuPreferes.phaseKey(s1)).toBe('reveal:r0');
    expect(tuPreferes.phaseDurationMs(s1)).toBe(15_000);
    const s2 = tuPreferes.reduce(s1, { type: 'deadline', at: 1 }).state;
    expect(tuPreferes.phaseKey(s2)).toBe('choose:r1');
    expect(s2.ballots).toEqual({});
    expect(s2.lastResult).toBeNull();
  });

  it('gauche: choose -> reveal -> debate -> next choose, with per-phase durations', () => {
    const s0 = gauche.init('s', players, content);
    const s1 = toReveal(s0);
    expect(gauche.phaseKey(s1)).toBe('reveal:r0');
    expect(gauche.phaseDurationMs(s1)).toBe(7_000);
    const s2 = gauche.reduce(s1, { type: 'deadline', at: 0 }).state;
    expect(gauche.phaseKey(s2)).toBe('debate:r0');
    expect(gauche.phaseDurationMs(s2)).toBe(35_000);
    const s3 = gauche.reduce(s2, { type: 'deadline', at: 1 }).state;
    expect(gauche.phaseKey(s3)).toBe('choose:r1');
  });

  it('the over phase is untimed and absorbs every event', () => {
    let s = tuPreferes.init('s', players, content);
    for (let i = 0; i < 20 && s.phase !== 'over'; i++) {
      s = tuPreferes.reduce(s, { type: 'deadline', at: i }).state;
    }
    expect(s.phase).toBe('over');
    expect(tuPreferes.phaseDurationMs(s)).toBeNull();
    expect(tuPreferes.reduce(s, { type: 'deadline', at: 99 }).state).toBe(s);
    expect(tuPreferes.reduce(s, ballot('p1', 'A', 'A')).state).toBe(s);
  });
});

describe('debate skip quorum', () => {
  it('strictly more than half of connected players ends the debate early', () => {
    const s0 = gauche.init('s', players, content);
    const debate = gauche.reduce(toReveal(s0), { type: 'deadline', at: 0 }).state;
    expect(debate.phase).toBe('debate');
    const s1 = gauche.reduce(debate, skip('p1')).state;
    expect(s1.phase).toBe('debate'); // 1/3 is not > 0.5
    const { state: s2 } = gauche.reduce(s1, skip('p2'));
    expect(s2.phase).toBe('choose'); // 2/3 > 0.5
    expect(s2.round).toBe(1);
  });

  it('duplicate skips are no-ops (same reference)', () => {
    const s0 = gauche.init('s', players, content);
    const debate = gauche.reduce(toReveal(s0), { type: 'deadline', at: 0 }).state;
    const s1 = gauche.reduce(debate, skip('p1')).state;
    expect(gauche.reduce(s1, skip('p1')).state).toBe(s1);
  });

  it('a disconnect that satisfies the quorum ends the debate', () => {
    const four = ['p1', 'p2', 'p3', 'p4'];
    const s0 = gauche.init('s', four, content);
    const s1 = gauche.reduce(s0, ballot('p1', 'A')).state;
    const s2 = gauche.reduce(s1, ballot('p2', 'A')).state;
    const s3 = gauche.reduce(s2, ballot('p3', 'B')).state;
    const revealed = gauche.reduce(s3, ballot('p4', 'B')).state;
    const debate = gauche.reduce(revealed, { type: 'deadline', at: 0 }).state;
    expect(debate.phase).toBe('debate');
    const d1 = gauche.reduce(debate, skip('p1')).state;
    const d2 = gauche.reduce(d1, skip('p2')).state;
    expect(d2.phase).toBe('debate'); // 2/4 is not > 0.5
    const { state: d3 } = gauche.reduce(d2, { type: 'playerLeft', playerId: 'p3', at: 1 });
    expect(d3.phase).toBe('choose'); // 2/3 > 0.5 — the leave completed the quorum
  });

  it('the debate view exposes skip counts, never who skipped', () => {
    const s0 = gauche.init('s', players, content);
    const debate = gauche.reduce(toReveal(s0), { type: 'deadline', at: 0 }).state;
    const s1 = gauche.reduce(debate, skip('p1')).state;
    const v = gauche.view(s1, 'p2');
    if (v.phase !== 'debate') throw new Error('expected debate view');
    expect(v.skipCount).toBe(1);
    expect(v.skipNeeded).toBe(2);
    expect(v.mySkip).toBe(false);
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });
});

describe('presence', () => {
  it('playerLeft/playerRejoined flip presence; unknown ids and redundant flips are no-ops', () => {
    const s0 = gauche.init('s', players, content);
    expect(gauche.reduce(s0, { type: 'playerLeft', playerId: 'ghost', at: 0 }).state).toBe(s0);
    expect(gauche.reduce(s0, { type: 'playerRejoined', playerId: 'p1', at: 0 }).state).toBe(s0);
    const s1 = gauche.reduce(s0, { type: 'playerLeft', playerId: 'p1', at: 0 }).state;
    expect(s1.connected['p1']).toBe(false);
    expect(gauche.reduce(s1, { type: 'playerLeft', playerId: 'p1', at: 1 }).state).toBe(s1);
    const s2 = gauche.reduce(s1, { type: 'playerRejoined', playerId: 'p1', at: 2 }).state;
    expect(s2.connected['p1']).toBe(true);
  });

  it('a rejoined player is expected again mid-choose', () => {
    const s0 = gauche.init('s', players, content);
    const s1 = gauche.reduce(s0, { type: 'playerLeft', playerId: 'p3', at: 0 }).state;
    const s2 = gauche.reduce(s1, ballot('p1', 'A')).state;
    const s3 = gauche.reduce(s2, { type: 'playerRejoined', playerId: 'p3', at: 1 }).state;
    // p2 AND p3 now expected — a p2 ballot alone must not resolve
    const s4 = gauche.reduce(s3, ballot('p2', 'A')).state;
    expect(s4.phase).toBe('choose');
  });
});

describe('init determinism', () => {
  it('same seed -> same item order; different seed -> (very likely) different order', () => {
    const a = gauche.init('seed-1', players, content);
    const b = gauche.init('seed-1', players, content);
    expect(a.items.map((i) => i.id)).toEqual(b.items.map((i) => i.id));
  });

  it('caps totalRounds at the pool size', () => {
    const s = gauche.init('s', players, content); // 2 items < 7 totalRounds
    expect(s.config.totalRounds).toBe(2);
  });
});
