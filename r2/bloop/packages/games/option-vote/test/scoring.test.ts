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
    ],
  },
};

const tuPreferes = createOptionVote('tu-preferes', TU_PREFERES_CONFIG);
const gauche = createOptionVote('gauche-ou-droite', GAUCHE_DROITE_CONFIG);

function ballot(playerId: string, pick: 'A' | 'B', predict?: 'A' | 'B', at = 0): GameEvent<OptionVoteAction> {
  return { type: 'action', playerId, action: { kind: 'ballot', pick, ...(predict !== undefined ? { predict } : {}) }, at };
}
function predict(playerId: string, option: 'A' | 'B', at = 0): GameEvent<OptionVoteAction> {
  return { type: 'action', playerId, action: { kind: 'predict', option }, at };
}

describe('predict-majority scoring (Tu Préfères)', () => {
  it('scores correct majority predictions only — own pick never scores', () => {
    const s0 = tuPreferes.init('s', ['p1', 'p2', 'p3'], content);
    // Majority = A (2 vs 1). Correct predictors: p1 and p3 (predict A).
    const s1 = tuPreferes.reduce(s0, ballot('p1', 'A', 'A')).state;
    const s2 = tuPreferes.reduce(s1, ballot('p2', 'A', 'B')).state;
    const { state: s3 } = tuPreferes.reduce(s2, ballot('p3', 'B', 'A'));
    expect(s3.phase).toBe('reveal');
    expect(s3.scores).toEqual({ p1: 1, p2: 0, p3: 1 });
    // p3 predicted right while personally in the minority — still exactly +1.
    expect(s3.lastResult?.majority).toBe('A');
    expect(s3.lastResult?.awarded.sort()).toEqual(['p1', 'p3']);
    expect(s3.lastResult?.picks).toEqual({ p1: 'A', p2: 'A', p3: 'B' });
  });

  it('a perfect tie awards nothing (majority null)', () => {
    const s0 = tuPreferes.init('s', ['p1', 'p2', 'p3', 'p4'], content);
    const s1 = tuPreferes.reduce(s0, ballot('p1', 'A', 'A')).state;
    const s2 = tuPreferes.reduce(s1, ballot('p2', 'A', 'A')).state;
    const s3 = tuPreferes.reduce(s2, ballot('p3', 'B', 'A')).state;
    const { state: s4 } = tuPreferes.reduce(s3, ballot('p4', 'B', 'A'));
    expect(s4.phase).toBe('reveal');
    expect(s4.lastResult?.majority).toBeNull();
    expect(s4.scores).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
    expect(s4.lastResult?.awarded).toEqual([]);
  });

  // REDACTION AUDIT (rewritten for the CC-1 keystone, product-approved Risk #1):
  // the majority-PREDICTION side-bet is HIDDEN during choose (no other player's
  // prediction leaks) and EXPOSED, by name, ONLY at reveal/over. The primary
  // ballot/pick stays anonymous exactly as before.
  it('AUDIT: a prediction is HIDDEN during choose then EXPOSED by name only at reveal', () => {
    const s0 = tuPreferes.init('s', ['p1', 'p2', 'p3'], content);
    // p1 & p3 predict A, p2 predicts B; everyone also ballots (pick is separate).
    const a1 = tuPreferes.reduce(s0, predict('p1', 'A')).state;
    const a2 = tuPreferes.reduce(a1, predict('p2', 'B')).state;
    const a3 = tuPreferes.reduce(a2, predict('p3', 'A')).state;
    expect(a3.phase).toBe('choose'); // predictions never resolve the round

    // CHOOSE-phase audit: a non-owner sees only an aggregate count + their OWN
    // echo, never another player's prediction value.
    const choose = tuPreferes.view(a3, 'p2');
    if (choose.phase !== 'choose') throw new Error('expected choose view');
    expect(choose.predictedCount).toBe(3);
    expect(choose.myPrediction).toBe('B'); // own echo
    // p2's view must not carry p1/p3's 'A' prediction anywhere identifiable:
    // there is no per-player prediction map in the choose view at all.
    expect('predictions' in choose).toBe(false);

    // Resolve: ballots make A the majority (2 vs 1).
    const b1 = tuPreferes.reduce(a3, ballot('p1', 'A', 'A')).state;
    const b2 = tuPreferes.reduce(b1, ballot('p2', 'A', 'B')).state;
    const s3 = tuPreferes.reduce(b2, ballot('p3', 'B', 'A')).state;
    expect(s3.phase).toBe('reveal');

    // REVEAL: the predictions are now PUBLIC, by name, for every viewer.
    for (const viewer of ['p1', 'p2', 'p3', 'spectator']) {
      const v = tuPreferes.view(s3, viewer);
      if (v.phase !== 'reveal') throw new Error('expected reveal view');
      const byPlayer = Object.fromEntries(v.result.predictions.map((p) => [p.playerId, p]));
      expect(byPlayer['p1']).toEqual({ playerId: 'p1', predicted: 'A', correct: true });
      expect(byPlayer['p2']).toEqual({ playerId: 'p2', predicted: 'B', correct: false });
      expect(byPlayer['p3']).toEqual({ playerId: 'p3', predicted: 'A', correct: true });
    }
  });
});

describe('majority-herd scoring (Gauche ou Droite)', () => {
  it('the majority side scores; the minority feeds minorityCount, never negative points', () => {
    const s0 = gauche.init('s', ['p1', 'p2', 'p3'], content);
    const s1 = gauche.reduce(s0, ballot('p1', 'A')).state;
    const s2 = gauche.reduce(s1, ballot('p2', 'A')).state;
    const { state: s3 } = gauche.reduce(s2, ballot('p3', 'B'));
    expect(s3.phase).toBe('reveal');
    expect(s3.scores).toEqual({ p1: 1, p2: 1, p3: 0 });
    expect(s3.minorityCount).toEqual({ p1: 0, p2: 0, p3: 1 });
  });

  it('a tie awards nothing and increments no minority counts', () => {
    const s0 = gauche.init('s', ['p1', 'p2', 'p3', 'p4'], content);
    const s1 = gauche.reduce(s0, ballot('p1', 'A')).state;
    const s2 = gauche.reduce(s1, ballot('p2', 'A')).state;
    const s3 = gauche.reduce(s2, ballot('p3', 'B')).state;
    const { state: s4 } = gauche.reduce(s3, ballot('p4', 'B'));
    expect(s4.scores).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
    expect(s4.minorityCount).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });

  it('zero ballots at deadline is the degenerate tie — nothing scores', () => {
    const s0 = gauche.init('s', ['p1', 'p2', 'p3'], content);
    const { state: s1 } = gauche.reduce(s0, { type: 'deadline', at: 0 });
    expect(s1.phase).toBe('reveal');
    expect(s1.lastResult?.majority).toBeNull();
    expect(s1.scores).toEqual({ p1: 0, p2: 0, p3: 0 });
  });

  it('the over view carries minorityCount for the Contrarian superlative', () => {
    const s0 = gauche.init('s', ['p1', 'p2', 'p3'], content);
    // round 0: p3 minority
    const s1 = gauche.reduce(s0, ballot('p1', 'A')).state;
    const s2 = gauche.reduce(s1, ballot('p2', 'A')).state;
    let s = gauche.reduce(s2, ballot('p3', 'B')).state;
    // walk deadlines to over (reveal -> debate -> choose r1 -> reveal -> debate -> over)
    for (let i = 0; i < 10 && s.phase !== 'over'; i++) {
      const next = gauche.reduce(s, { type: 'deadline', at: 1_000 + i }).state;
      if (next === s) break;
      s = next;
    }
    expect(s.phase).toBe('over');
    const v = gauche.view(s, 'spectator');
    if (v.phase !== 'over') throw new Error('expected over view');
    expect(v.minorityCount['p3']).toBe(1);
  });
});

describe('game over', () => {
  it('emits gameOver with a CLONED scores map after totalRounds', () => {
    const two = createOptionVote('tu-preferes', { ...TU_PREFERES_CONFIG, totalRounds: 1 });
    const s0 = two.init('s', ['p1', 'p2', 'p3'], content);
    const s1 = two.reduce(s0, ballot('p1', 'A', 'A')).state;
    const s2 = two.reduce(s1, ballot('p2', 'A', 'A')).state;
    const s3 = two.reduce(s2, ballot('p3', 'B', 'B')).state;
    expect(s3.phase).toBe('reveal');
    const { state: s4, effects } = two.reduce(s3, { type: 'deadline', at: 0 });
    expect(s4.phase).toBe('over');
    const gameOver = effects.find((e) => e.type === 'gameOver');
    if (gameOver === undefined || gameOver.type !== 'gameOver') throw new Error('expected gameOver effect');
    expect(gameOver.scores).toEqual(s4.scores);
    expect(gameOver.scores).not.toBe(s4.scores);
  });
});
