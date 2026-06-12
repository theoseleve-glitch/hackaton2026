import { describe, expect, it } from 'vitest';
import {
  createInputGuess,
  QUIZZ_CULTURE_GE_CONFIG,
  type InputGuessState,
} from '@bloop/game-input-guess';
import { guess, numberContent, numberItemOf, pick } from './fixtures.js';

const players = ['p1', 'p2', 'p3'];
const quizz = createInputGuess('quizz-culture-ge', QUIZZ_CULTURE_GE_CONFIG);
const content = numberContent(3);

/** A one-round game so the answer of round 0 is the only item. */
const oneRound = createInputGuess('quizz-culture-ge', { ...QUIZZ_CULTURE_GE_CONFIG, totalRounds: 1 });
const oneContent = numberContent(1); // answer = 100

describe('guess submission (hidden buffer)', () => {
  it('records a guess without revealing it; no effects', () => {
    const s0 = quizz.init('s', players, content);
    const { state: s1, effects } = quizz.reduce(s0, guess('p1', 42));
    expect(s1.submissions).toEqual({ p1: 42 });
    expect(s1.phase).toBe('guess');
    expect(effects).toEqual([]);
  });

  it('lets a player change their guess before resolve (last wins)', () => {
    const s0 = quizz.init('s', players, content);
    const s1 = quizz.reduce(s0, guess('p1', 42)).state;
    const s2 = quizz.reduce(s1, guess('p1', 77)).state;
    expect(s2.submissions).toEqual({ p1: 77 });
  });

  it('rejects (same reference) non-roster, wrong-mode, and invalid numeric payloads', () => {
    const s0 = quizz.init('s', players, content);
    expect(quizz.reduce(s0, guess('ghost', 42)).state).toBe(s0); // non-roster
    expect(quizz.reduce(s0, pick('p1', 1)).state).toBe(s0); // wrong action kind for the mode
    expect(quizz.reduce(s0, guess('p1', 4.5)).state).toBe(s0); // float
    expect(quizz.reduce(s0, guess('p1', -1)).state).toBe(s0); // negative
    expect(quizz.reduce(s0, guess('p1', Number.NaN)).state).toBe(s0);
    expect(quizz.reduce(s0, guess('p1', Number.POSITIVE_INFINITY)).state).toBe(s0);
    expect(quizz.reduce(s0, guess('p1', 1_000_000_000)).state).toBe(s0); // > 9 digits
    expect(quizz.reduce(s0, guess('p1', 999_999_999)).state).not.toBe(s0); // 9 digits OK
  });

  it('ignores guesses outside the guess phase (same reference)', () => {
    const s0 = quizz.init('s', players, content);
    const revealed = quizz.reduce(s0, { type: 'deadline', at: 0 }).state;
    expect(revealed.phase).toBe('reveal');
    expect(quizz.reduce(revealed, guess('p1', 42)).state).toBe(revealed);
  });

  it('early-advances to reveal once all CONNECTED players submitted', () => {
    const s0 = quizz.init('s', players, content);
    const s1 = quizz.reduce(s0, guess('p1', 10)).state;
    const s2 = quizz.reduce(s1, guess('p2', 20)).state;
    expect(s2.phase).toBe('guess');
    const { state: s3, effects } = quizz.reduce(s2, guess('p3', 30));
    expect(s3.phase).toBe('reveal');
    expect(effects).toEqual([{ type: 'analytics', name: 'round_revealed', props: { round: 0 } }]);
  });

  it('respects earlyAdvanceOnAllSubmitted=false (resolves on deadline only)', () => {
    const noEarly = createInputGuess('quizz-culture-ge', { ...QUIZZ_CULTURE_GE_CONFIG, earlyAdvanceOnAllSubmitted: false });
    const s0 = noEarly.init('s', players, content);
    let s = s0;
    for (const p of players) s = noEarly.reduce(s, guess(p, 10)).state;
    expect(s.phase).toBe('guess'); // everyone submitted, still waiting for the clock
    expect(noEarly.reduce(s, { type: 'deadline', at: 0 }).state.phase).toBe('reveal');
  });
});

describe('closest-number scoring (design §2.4, exact)', () => {
  function reveal(guesses: Record<string, number>, roster = players): InputGuessState {
    const s0 = quizz.init('s', roster, content);
    let s = s0;
    for (const [p, v] of Object.entries(guesses)) s = quizz.reduce(s, guess(p, v)).state;
    if (s.phase !== 'reveal') s = quizz.reduce(s, { type: 'deadline', at: 0 }).state;
    return s;
  }

  it('competition ranking pays 100/50/25/0 by |guess − answer|', () => {
    const four = ['p1', 'p2', 'p3', 'p4'];
    const s0 = quizz.init('s', four, content);
    const a = numberItemOf(s0, 0).answer;
    let s = s0;
    s = quizz.reduce(s, guess('p1', a + 1)).state; // d=1 -> 1st
    s = quizz.reduce(s, guess('p2', a + 5)).state; // d=5 -> 2nd
    s = quizz.reduce(s, guess('p3', a - 9)).state; // d=9 -> 3rd
    s = quizz.reduce(s, guess('p4', a + 50)).state; // d=50 -> 4th, 0 pts
    expect(s.phase).toBe('reveal');
    expect(s.scores).toEqual({ p1: 100, p2: 50, p3: 25, p4: 0 });
    expect(s.lastResult?.kind).toBe('closest-number');
    if (s.lastResult?.kind !== 'closest-number') throw new Error('expected closest result');
    expect(s.lastResult.ranking).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(s.lastResult.pointsEarned).toEqual({ p1: 100, p2: 50, p3: 25, p4: 0 });
    expect(s.lastResult.answer).toBe(a);
  });

  it('ties share the rank and skip the next one (two tied closest -> both 100, next gets 25)', () => {
    const four = ['p1', 'p2', 'p3', 'p4'];
    const s0 = quizz.init('s', four, content);
    const a = numberItemOf(s0, 0).answer;
    let s = s0;
    s = quizz.reduce(s, guess('p1', a + 3)).state; // d=3, tied 1st
    s = quizz.reduce(s, guess('p2', a - 3)).state; // d=3, tied 1st
    s = quizz.reduce(s, guess('p3', a + 7)).state; // d=7 -> rank index 2 -> 25
    s = quizz.reduce(s, guess('p4', a + 8)).state; // d=8 -> rank index 3 -> 0
    expect(s.scores).toEqual({ p1: 100, p2: 100, p3: 25, p4: 0 });
  });

  it('an exact hit adds the +50 « Pile ! » bonus', () => {
    const s0 = quizz.init('s', players, content);
    const a = numberItemOf(s0, 0).answer;
    let s = s0;
    s = quizz.reduce(s, guess('p1', a)).state; // exact -> 100 + 50
    s = quizz.reduce(s, guess('p2', a + 2)).state; // 50
    s = quizz.reduce(s, guess('p3', a + 4)).state; // 25
    expect(s.scores).toEqual({ p1: 150, p2: 50, p3: 25 });
    if (s.lastResult?.kind !== 'closest-number') throw new Error('expected closest result');
    expect(s.lastResult.exact).toEqual(['p1']);
  });

  it('the final round doubles ALL points (rank and bonus)', () => {
    const s0 = oneRound.init('s', players, oneContent); // round 0 IS the final round
    const a = numberItemOf(s0, 0).answer;
    let s = s0;
    s = oneRound.reduce(s, guess('p1', a)).state; // (100 + 50) × 2
    s = oneRound.reduce(s, guess('p2', a + 2)).state; // 50 × 2
    s = oneRound.reduce(s, guess('p3', a + 4)).state; // 25 × 2
    expect(s.scores).toEqual({ p1: 300, p2: 100, p3: 50 });
    if (s.lastResult?.kind !== 'closest-number') throw new Error('expected closest result');
    expect(s.lastResult.multiplier).toBe(2);
  });

  it('a single answerer takes 100; absentees have no entry and stay at 0', () => {
    const s = reveal({ p1: 7 });
    expect(s.scores).toEqual({ p1: 100, p2: 0, p3: 0 });
    if (s.lastResult?.kind !== 'closest-number') throw new Error('expected closest result');
    expect(s.lastResult.guesses).toEqual({ p1: 7 });
    expect(s.lastResult.ranking).toEqual(['p1']);
  });

  it('zero answerers awards nothing and the round still advances on deadline', () => {
    const s = reveal({});
    expect(s.phase).toBe('reveal');
    expect(s.scores).toEqual({ p1: 0, p2: 0, p3: 0 });
    if (s.lastResult?.kind !== 'closest-number') throw new Error('expected closest result');
    expect(s.lastResult.ranking).toEqual([]);
    expect(quizz.reduce(s, { type: 'deadline', at: 1 }).state.phase).toBe('guess');
  });

  it('bustIfOver=true (Juste Prix sibling) eliminates over-bidders from the ranking', () => {
    const bust = createInputGuess('quizz-culture-ge', { ...QUIZZ_CULTURE_GE_CONFIG, bustIfOver: true });
    const s0 = bust.init('s', players, oneContent);
    const a = numberItemOf(s0, 0).answer;
    let s = s0;
    s = bust.reduce(s, guess('p1', a + 1)).state; // OVER -> busted
    s = bust.reduce(s, guess('p2', a - 30)).state; // under, d=30 -> 1st
    s = bust.reduce(s, guess('p3', a - 50)).state; // under, d=50 -> 2nd
    if (s.lastResult?.kind !== 'closest-number') throw new Error('expected closest result');
    expect(s.lastResult.busted).toEqual(['p1']);
    expect(s.lastResult.ranking).toEqual(['p2', 'p3']);
    // final round of a 1-round game: ×2 applies to the survivors
    expect(s.scores).toEqual({ p1: 0, p2: 200, p3: 100 });
  });
});

describe('closest-number guess-phase redaction', () => {
  it('exposes hasSubmitted flags and the owner echo only — never the answer or funFact', () => {
    const s0 = quizz.init('s', players, content);
    const s1 = quizz.reduce(s0, guess('p1', 42)).state;
    const v2 = quizz.view(s1, 'p2');
    if (v2.phase !== 'guess' || v2.mode !== 'closest-number') throw new Error('expected guess view');
    expect(v2.hasSubmitted).toEqual({ p1: true, p2: false, p3: false });
    expect(v2.mySubmission).toBeNull();
    const json = JSON.stringify(v2);
    expect(json).not.toContain('"answer"');
    expect(json).not.toContain('FUNFACT-SECRET');
    expect(json).not.toContain('42');
    const v1 = quizz.view(s1, 'p1');
    if (v1.phase !== 'guess' || v1.mode !== 'closest-number') throw new Error('expected guess view');
    expect(v1.mySubmission).toBe(42);
  });

  it("non-actors' views are INVARIANT under hidden-guess changes", () => {
    const s0 = quizz.init('s', players, content);
    const a1 = quizz.reduce(quizz.reduce(s0, guess('p1', 11)).state, guess('p2', 22)).state;
    const a2 = quizz.reduce(quizz.reduce(s0, guess('p1', 88)).state, guess('p2', 99)).state;
    expect(quizz.phaseKey(a1)).toBe(quizz.phaseKey(a2));
    for (const viewer of ['p3', 'spectator', '__proto__']) {
      expect(quizz.view(a1, viewer)).toEqual(quizz.view(a2, viewer));
    }
  });

  it('spectators and hostile viewer ids get a serializable, non-leaking view in every phase', () => {
    let s = quizz.init('s', players, content);
    s = quizz.reduce(s, guess('p1', 42)).state;
    for (let i = 0; i < 10; i++) {
      for (const outsider of ['spectator', '__proto__']) {
        const v = quizz.view(s, outsider);
        expect(JSON.parse(JSON.stringify(v))).toEqual(v);
      }
      const next = quizz.reduce(s, { type: 'deadline', at: i }).state;
      if (next === s) break;
      s = next;
    }
    expect(s.phase).toBe('over');
  });

  it('the reveal view promotes everything at once: answer, all guesses, funFact, points', () => {
    const s0 = quizz.init('s', players, content);
    const a = numberItemOf(s0, 0).answer;
    let s = s0;
    s = quizz.reduce(s, guess('p1', a)).state;
    s = quizz.reduce(s, guess('p2', a + 2)).state;
    s = quizz.reduce(s, guess('p3', a + 9)).state;
    const v = quizz.view(s, 'spectator');
    if (v.phase !== 'reveal' || v.mode !== 'closest-number') throw new Error('expected reveal view');
    expect(v.result.answer).toBe(a);
    expect(v.result.guesses).toEqual({ p1: a, p2: a + 2, p3: a + 9 });
    expect(v.funFact.fr).toContain('FUNFACT-SECRET-FR');
  });
});
