import { describe, expect, it } from 'vitest';
import type { ContentPack, GameEvent } from '@bloop/engine';
import {
  createOptionVote,
  GAUCHE_DROITE_CONFIG,
  TU_PREFERES_CONFIG,
  type OptionVoteAction,
  type OptionVoteContent,
} from '@bloop/game-option-vote';

const content: ContentPack<OptionVoteContent> = {
  id: 'test-pack', version: 1,
  data: {
    items: [
      { id: 'i1', optionA: { fr: 'A1', en: 'A1' }, optionB: { fr: 'B1', en: 'B1' } },
      { id: 'i2', optionA: { fr: 'A2', en: 'A2' }, optionB: { fr: 'B2', en: 'B2' } },
      { id: 'i3', optionA: { fr: 'A3', en: 'A3' }, optionB: { fr: 'B3', en: 'B3' } },
    ],
  },
};
const players = ['p1', 'p2', 'p3'];

const tuPreferes = createOptionVote('tu-preferes', TU_PREFERES_CONFIG);
const gauche = createOptionVote('gauche-ou-droite', GAUCHE_DROITE_CONFIG);

function ballot(playerId: string, pick: 'A' | 'B', predict?: 'A' | 'B', at = 0): GameEvent<OptionVoteAction> {
  return { type: 'action', playerId, action: { kind: 'ballot', pick, ...(predict !== undefined ? { predict } : {}) }, at };
}

describe('option-vote ballots', () => {
  it('records a ballot without revealing it (hidden buffer)', () => {
    const s0 = tuPreferes.init('s', players, content);
    const { state: s1, effects } = tuPreferes.reduce(s0, ballot('p1', 'A', 'B'));
    expect(s1.ballots).toEqual({ p1: { pick: 'A', predict: 'B' } });
    expect(s1.phase).toBe('choose');
    expect(effects).toEqual([]);
  });

  it('lets a player change their ballot before resolve (last wins)', () => {
    const s0 = tuPreferes.init('s', players, content);
    const s1 = tuPreferes.reduce(s0, ballot('p1', 'A', 'A')).state;
    const s2 = tuPreferes.reduce(s1, ballot('p1', 'B', 'B')).state;
    expect(s2.ballots).toEqual({ p1: { pick: 'B', predict: 'B' } });
  });

  it('rejects (same reference) non-roster voters and a missing predict under predict-majority', () => {
    const s0 = tuPreferes.init('s', players, content);
    expect(tuPreferes.reduce(s0, ballot('ghost', 'A', 'B')).state).toBe(s0);
    expect(tuPreferes.reduce(s0, ballot('p1', 'A')).state).toBe(s0);
  });

  it('accepts a pick-only ballot under majority-herd and drops any stray predict', () => {
    const s0 = gauche.init('s', players, content);
    const s1 = gauche.reduce(s0, ballot('p1', 'A', 'B')).state;
    expect(s1.ballots).toEqual({ p1: { pick: 'A' } });
  });

  it('resolves to reveal once all CONNECTED players have balloted', () => {
    const s0 = tuPreferes.init('s', players, content);
    const s1 = tuPreferes.reduce(s0, ballot('p1', 'A', 'A')).state;
    const s2 = tuPreferes.reduce(s1, ballot('p2', 'A', 'A')).state;
    expect(s2.phase).toBe('choose');
    const { state: s3, effects } = tuPreferes.reduce(s2, ballot('p3', 'B', 'A'));
    expect(s3.phase).toBe('reveal');
    expect(effects).toEqual([{ type: 'analytics', name: 'round_revealed', props: { round: 0 } }]);
  });

  it('a disconnect that completes the expected set resolves the round', () => {
    const s0 = tuPreferes.init('s', players, content);
    const s1 = tuPreferes.reduce(s0, ballot('p1', 'A', 'A')).state;
    const s2 = tuPreferes.reduce(s1, ballot('p2', 'B', 'A')).state;
    const { state: s3 } = tuPreferes.reduce(s2, { type: 'playerLeft', playerId: 'p3', at: 0 });
    expect(s3.phase).toBe('reveal');
    // p3 never balloted: excluded from the tally
    expect(s3.lastResult?.counts).toEqual({ A: 1, B: 1 });
  });

  it('deadline resolves with only the buffered ballots; non-voters are excluded', () => {
    const s0 = gauche.init('s', players, content);
    const s1 = gauche.reduce(s0, ballot('p1', 'A')).state;
    const { state: s2 } = gauche.reduce(s1, { type: 'deadline', at: 0 });
    expect(s2.phase).toBe('reveal');
    expect(s2.lastResult?.counts).toEqual({ A: 1, B: 0 });
    expect(s2.lastResult?.majority).toBe('A');
  });

  it('ignores ballots outside the choose phase (same reference)', () => {
    const s0 = tuPreferes.init('s', players, content);
    const revealed = tuPreferes.reduce(s0, { type: 'deadline', at: 0 }).state;
    expect(revealed.phase).toBe('reveal');
    expect(tuPreferes.reduce(revealed, ballot('p1', 'A', 'A')).state).toBe(revealed);
  });

  it('handles "__proto__" player ids without corrupting buffers or tallies', () => {
    const weird = ['__proto__', 'p2', 'p3'];
    const s0 = gauche.init('s', weird, content);
    const s1 = gauche.reduce(s0, ballot('__proto__', 'A')).state;
    expect(s1.phase).toBe('choose'); // p2/p3 still expected
    const s2 = gauche.reduce(s1, ballot('p2', 'A')).state;
    const { state: s3 } = gauche.reduce(s2, ballot('p3', 'B'));
    expect(s3.phase).toBe('reveal');
    expect(s3.scores['__proto__']).toBe(1);
    expect(s3.scores['p2']).toBe(1);
    expect(s3.scores['p3']).toBe(0);
  });
});

describe('option-vote choose view redaction', () => {
  it('exposes only hasSubmitted flags and the owner echo, never picks or counts', () => {
    const s0 = tuPreferes.init('s', players, content);
    const s1 = tuPreferes.reduce(s0, ballot('p1', 'A', 'B')).state;
    const v2 = tuPreferes.view(s1, 'p2');
    if (v2.phase !== 'choose') throw new Error('expected choose view');
    expect(v2.hasSubmitted).toEqual({ p1: true, p2: false, p3: false });
    expect(v2.myBallot).toBeNull();
    expect(JSON.stringify(v2)).not.toContain('"pick"');
    const v1 = tuPreferes.view(s1, 'p1');
    if (v1.phase !== 'choose') throw new Error('expected choose view');
    expect(v1.myBallot).toEqual({ pick: 'A', predict: 'B' });
  });

  it('spectators and hostile viewer ids get a serializable, non-leaking view', () => {
    const s0 = tuPreferes.init('s', players, content);
    const s1 = tuPreferes.reduce(s0, ballot('p1', 'A', 'B')).state;
    for (const outsider of ['spectator', '__proto__']) {
      const v = tuPreferes.view(s1, outsider);
      if (v.phase !== 'choose') throw new Error('expected choose view');
      expect(v.myBallot).toBeNull();
      expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    }
  });
});
