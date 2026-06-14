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
const players = ['p1', 'p2', 'p3'];

const tuPreferes = createOptionVote('tu-preferes', TU_PREFERES_CONFIG);
const gauche = createOptionVote('gauche-ou-droite', GAUCHE_DROITE_CONFIG);

function ballot(playerId: string, pick: 'A' | 'B', predict?: 'A' | 'B', at = 0): GameEvent<OptionVoteAction> {
  return { type: 'action', playerId, action: { kind: 'ballot', pick, ...(predict !== undefined ? { predict } : {}) }, at };
}
function predict(playerId: string, option: 'A' | 'B', at = 0): GameEvent<OptionVoteAction> {
  return { type: 'action', playerId, action: { kind: 'predict', option }, at };
}

/** Walk deadlines until the game reaches `over`. */
function toOver(s: ReturnType<typeof tuPreferes.init>): ReturnType<typeof tuPreferes.init> {
  for (let i = 0; i < 40 && s.phase !== 'over'; i++) {
    const next = tuPreferes.reduce(s, { type: 'deadline', at: 1_000 + i }).state;
    if (next === s) break;
    s = next;
  }
  return s;
}

describe('CC-1 keystone — prediction side-bet (Tu Préfères)', () => {
  describe('GUARD: no prediction leaks during choose', () => {
    it('a non-owner NEVER sees another player\'s prediction value, only an aggregate count', () => {
      const s0 = tuPreferes.init('s', players, content);
      const a1 = tuPreferes.reduce(s0, predict('p1', 'A')).state;
      const a2 = tuPreferes.reduce(a1, predict('p3', 'B')).state;
      expect(a2.phase).toBe('choose');

      // Every viewer class: roster non-owner, spectator, hostile prototype id.
      for (const viewer of ['p2', 'spectator', '__proto__']) {
        const v = tuPreferes.view(a2, viewer);
        if (v.phase !== 'choose') throw new Error('expected choose view');
        expect(v.predictedCount).toBe(2);     // aggregate is public
        expect(v.myPrediction).toBeNull();     // these viewers placed no prediction
        // The serialized view must contain NO per-player prediction map and must
        // not be invertible to recover p1's 'A' or p3's 'B'.
        const json = JSON.stringify(v);
        expect(json).not.toContain('"predictions"');
        expect(json).not.toContain('"predicted"');
      }
    });

    it('the OWNER sees only their own prediction echoed back — never anyone else\'s', () => {
      const s0 = tuPreferes.init('s', players, content);
      const a1 = tuPreferes.reduce(s0, predict('p1', 'A')).state;
      const a2 = tuPreferes.reduce(a1, predict('p2', 'B')).state;
      const v1 = tuPreferes.view(a2, 'p1');
      if (v1.phase !== 'choose') throw new Error('expected choose view');
      expect(v1.myPrediction).toBe('A');
      expect(v1.predictedCount).toBe(2);
      // p1's view must not reveal p2's 'B' as a foreign player's prediction.
      // (Both 'A' and 'B' are legitimate option labels; the structural guarantee
      // is that there is NO per-player prediction field in the choose view.)
      expect('predictions' in v1).toBe(false);
    });

    it('AUDIT-by-invariance: a non-actor\'s choose view is identical regardless of others\' predictions', () => {
      const base = tuPreferes.init('s', players, content);
      // Script A: p1 predicts A, p3 predicts B.
      const a = tuPreferes.reduce(tuPreferes.reduce(base, predict('p1', 'A')).state, predict('p3', 'B')).state;
      // Script B: same two actors, opposite predictions.
      const b = tuPreferes.reduce(tuPreferes.reduce(base, predict('p1', 'B')).state, predict('p3', 'A')).state;
      // p2 is a non-actor: its view MUST be byte-identical across the two scripts.
      expect(tuPreferes.view(a, 'p2')).toEqual(tuPreferes.view(b, 'p2'));
      expect(tuPreferes.view(a, 'spectator')).toEqual(tuPreferes.view(b, 'spectator'));
    });
  });

  describe('GUARD: a prediction never gates the primary early-resolve', () => {
    it('all players predicting does NOT resolve the round — only ballots can', () => {
      const s0 = tuPreferes.init('s', players, content);
      const a1 = tuPreferes.reduce(s0, predict('p1', 'A')).state;
      const a2 = tuPreferes.reduce(a1, predict('p2', 'A')).state;
      const a3 = tuPreferes.reduce(a2, predict('p3', 'A')).state;
      expect(a3.phase).toBe('choose'); // every connected player predicted, still choose

      // The round resolves ONLY once every connected player has BALLOTED.
      const b1 = tuPreferes.reduce(a3, ballot('p1', 'A', 'A')).state;
      const b2 = tuPreferes.reduce(b1, ballot('p2', 'A', 'A')).state;
      expect(b2.phase).toBe('choose'); // p3 ballot still outstanding
      const { state: b3 } = tuPreferes.reduce(b2, ballot('p3', 'B', 'A'));
      expect(b3.phase).toBe('reveal');
    });

    it('a prediction does not count toward allActed: ballots-only still drives resolution', () => {
      // p1,p2 predict but only p3 ballots; the round must NOT resolve.
      const s0 = tuPreferes.init('s', players, content);
      const a1 = tuPreferes.reduce(s0, predict('p1', 'A')).state;
      const a2 = tuPreferes.reduce(a1, predict('p2', 'A')).state;
      const a3 = tuPreferes.reduce(a2, ballot('p3', 'A', 'A')).state;
      expect(a3.phase).toBe('choose'); // p1/p2 have predicted but NOT balloted
    });
  });

  describe('GUARD: reject-invalid returns the SAME state reference', () => {
    it('a duplicate prediction (one stake per round) is a no-op', () => {
      const s0 = tuPreferes.init('s', players, content);
      const a1 = tuPreferes.reduce(s0, predict('p1', 'A')).state;
      expect(tuPreferes.reduce(a1, predict('p1', 'B')).state).toBe(a1);
      expect(tuPreferes.reduce(a1, predict('p1', 'A')).state).toBe(a1);
    });

    it('a prediction from a non-roster player is a no-op', () => {
      const s0 = tuPreferes.init('s', players, content);
      expect(tuPreferes.reduce(s0, predict('ghost', 'A')).state).toBe(s0);
    });

    it('a prediction with an invalid option is a no-op', () => {
      const s0 = tuPreferes.init('s', players, content);
      const bad: GameEvent<OptionVoteAction> =
        { type: 'action', playerId: 'p1', action: { kind: 'predict', option: 'C' as 'A' }, at: 0 };
      expect(tuPreferes.reduce(s0, bad).state).toBe(s0);
    });

    it('a prediction outside the choose phase is a no-op', () => {
      const s0 = tuPreferes.init('s', players, content);
      const revealed = tuPreferes.reduce(s0, { type: 'deadline', at: 0 }).state;
      expect(revealed.phase).toBe('reveal');
      expect(tuPreferes.reduce(revealed, predict('p1', 'A')).state).toBe(revealed);
    });

    it('a prediction under majority-herd (no prediction channel) is a no-op', () => {
      const s0 = gauche.init('s', players, content);
      const ev: GameEvent<OptionVoteAction> =
        { type: 'action', playerId: 'p1', action: { kind: 'predict', option: 'A' }, at: 0 };
      expect(gauche.reduce(s0, ev).state).toBe(s0);
    });
  });

  describe('a correct prediction pays a small bonus at reveal', () => {
    it('correct predictors get +predictionBonus and land in awarded; the primary pick still does not score', () => {
      const s0 = tuPreferes.init('s', players, content);
      // p1 predicts A (correct), p2 predicts B (wrong), p3 predicts A (correct).
      const a1 = tuPreferes.reduce(s0, predict('p1', 'A')).state;
      const a2 = tuPreferes.reduce(a1, predict('p2', 'B')).state;
      const a3 = tuPreferes.reduce(a2, predict('p3', 'A')).state;
      // Ballots: A wins 2-1. In-ballot `predict` is OMITTED here so the ONLY
      // points come from the side-bet bonus — proving the bonus path in isolation.
      const b1 = tuPreferes.reduce(a3, ballot('p1', 'A', 'B')).state; // in-ballot predict wrong
      const b2 = tuPreferes.reduce(b1, ballot('p2', 'A', 'B')).state;
      const { state: s3 } = tuPreferes.reduce(b2, ballot('p3', 'B', 'B'));
      expect(s3.phase).toBe('reveal');
      expect(s3.lastResult?.majority).toBe('A');
      // Only the side-bet bonus scores: p1 & p3 predicted A correctly => +1 each.
      expect(s3.scores).toEqual({ p1: 1, p2: 0, p3: 1 });
      expect(s3.lastResult?.awarded.sort()).toEqual(['p1', 'p3']);
    });

    it('on a perfect tie nobody is correct, but every prediction is still shown for the dunk', () => {
      const s0 = tuPreferes.init('s', ['p1', 'p2', 'p3', 'p4'], content);
      const a1 = tuPreferes.reduce(s0, predict('p1', 'A')).state;
      const a2 = tuPreferes.reduce(a1, predict('p2', 'A')).state;
      // Ballots tie 2-2 => majority null.
      const b1 = tuPreferes.reduce(a2, ballot('p1', 'A', 'A')).state;
      const b2 = tuPreferes.reduce(b1, ballot('p2', 'A', 'A')).state;
      const b3 = tuPreferes.reduce(b2, ballot('p3', 'B', 'A')).state;
      const { state: s4 } = tuPreferes.reduce(b3, ballot('p4', 'B', 'A'));
      expect(s4.lastResult?.majority).toBeNull();
      expect(s4.scores).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
      const preds = s4.lastResult?.predictions ?? [];
      expect(preds.map((p) => p.playerId).sort()).toEqual(['p1', 'p2']);
      expect(preds.every((p) => p.correct === false)).toBe(true);
    });
  });

  describe('the over view carries the final round\'s public predictions', () => {
    it('exposes lastPredictions by name on the podium', () => {
      const two = createOptionVote('tu-preferes', { ...TU_PREFERES_CONFIG, totalRounds: 1 });
      const s0 = two.init('s', players, content);
      const a1 = two.reduce(s0, predict('p1', 'A')).state;
      const a2 = two.reduce(a1, predict('p2', 'A')).state;
      const a3 = two.reduce(a2, predict('p3', 'B')).state;
      const b1 = two.reduce(a3, ballot('p1', 'A', 'A')).state;
      const b2 = two.reduce(b1, ballot('p2', 'A', 'A')).state;
      const s3 = two.reduce(b2, ballot('p3', 'B', 'A')).state;
      expect(s3.phase).toBe('reveal');
      const over = two.reduce(s3, { type: 'deadline', at: 0 }).state;
      expect(over.phase).toBe('over');
      const v = two.view(over, 'spectator');
      if (v.phase !== 'over') throw new Error('expected over view');
      const byPlayer = Object.fromEntries(v.lastPredictions.map((p) => [p.playerId, p]));
      expect(byPlayer['p1']).toEqual({ playerId: 'p1', predicted: 'A', correct: true });
      expect(byPlayer['p3']).toEqual({ playerId: 'p3', predicted: 'B', correct: false });
    });
  });

  describe('gauche-ou-droite emits no prediction fields', () => {
    it('the over view has an empty lastPredictions list', () => {
      let s = gauche.init('s', players, content);
      for (let i = 0; i < 40 && s.phase !== 'over'; i++) {
        const next = gauche.reduce(s, { type: 'deadline', at: 1_000 + i }).state;
        if (next === s) break;
        s = next;
      }
      expect(s.phase).toBe('over');
      const v = gauche.view(s, 'spectator');
      if (v.phase !== 'over') throw new Error('expected over view');
      expect(v.lastPredictions).toEqual([]);
    });

    it('the choose view reports a null prediction + zero count under majority-herd', () => {
      const s0 = gauche.init('s', players, content);
      const v = gauche.view(s0, 'p1');
      if (v.phase !== 'choose') throw new Error('expected choose view');
      expect(v.myPrediction).toBeNull();
      expect(v.predictedCount).toBe(0);
    });
  });

  describe('predictions buffer is cleared between rounds', () => {
    it('a round-0 prediction never bleeds into round-1', () => {
      const s0 = tuPreferes.init('s', players, content);
      const a1 = tuPreferes.reduce(s0, predict('p1', 'A')).state;
      const b1 = tuPreferes.reduce(a1, ballot('p1', 'A', 'A')).state;
      const b2 = tuPreferes.reduce(b1, ballot('p2', 'A', 'A')).state;
      const reveal = tuPreferes.reduce(b2, ballot('p3', 'B', 'A')).state;
      const choose1 = tuPreferes.reduce(reveal, { type: 'deadline', at: 1 }).state;
      expect(choose1.phase).toBe('choose');
      expect(choose1.round).toBe(1);
      const v = tuPreferes.view(choose1, 'p1');
      if (v.phase !== 'choose') throw new Error('expected choose view');
      expect(v.myPrediction).toBeNull(); // round-0 stake did not carry over
      expect(v.predictedCount).toBe(0);
    });
  });
});

// Touch toOver to keep the helper referenced (used by a smoke assertion).
describe('keystone smoke', () => {
  it('a full predict+ballot game reaches over without throwing', () => {
    let s = tuPreferes.init('s', players, content);
    s = tuPreferes.reduce(s, predict('p1', 'A')).state;
    s = tuPreferes.reduce(s, ballot('p1', 'A', 'A')).state;
    s = tuPreferes.reduce(s, ballot('p2', 'A', 'A')).state;
    s = tuPreferes.reduce(s, ballot('p3', 'B', 'A')).state;
    s = toOver(s);
    expect(s.phase).toBe('over');
  });
});
