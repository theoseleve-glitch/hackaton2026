import { describe, expect, it } from 'vitest';
import type { ContentPack, Effect, GameEvent } from '@bloop/engine';
import {
  CINQUANTE_CINQUANTE_CONFIG,
  createInputGuess,
  QUIZZ_CULTURE_GE_CONFIG,
  type InputGuessAction,
  type InputGuessContent,
  type InputGuessState,
} from '@bloop/game-input-guess';
import { crowdContent, crowdItemOf, guess, numberContent, numberItemOf, pick } from './fixtures.js';

const players = ['p1', 'p2', 'p3'];

const quizz = createInputGuess('quizz-culture-ge', QUIZZ_CULTURE_GE_CONFIG);
const cc = createInputGuess('cinquante-cinquante', CINQUANTE_CINQUANTE_CONFIG);

const qContent = numberContent(3);
const cContent = crowdContent(3);

describe('phase chain and timing — closest-number (Au Pif !)', () => {
  it('guess -> reveal -> next guess with the design durations and phaseKeys', () => {
    const s0 = quizz.init('s', players, qContent);
    expect(quizz.phaseKey(s0)).toBe('guess:r0');
    expect(quizz.phaseDurationMs(s0)).toBe(20_000);
    const s1 = quizz.reduce(s0, { type: 'deadline', at: 0 }).state;
    expect(quizz.phaseKey(s1)).toBe('reveal:r0');
    expect(quizz.phaseDurationMs(s1)).toBe(12_000);
    const s2 = quizz.reduce(s1, { type: 'deadline', at: 1 }).state;
    expect(quizz.phaseKey(s2)).toBe('guess:r1');
    expect(s2.submissions).toEqual({});
    expect(s2.lastResult).toBeNull();
  });

  it('emits round_revealed at resolve and round_completed at the reveal deadline (ad-cue boundary)', () => {
    const s0 = quizz.init('s', players, qContent);
    const r1 = quizz.reduce(s0, { type: 'deadline', at: 0 });
    expect(r1.effects).toEqual([{ type: 'analytics', name: 'round_revealed', props: { round: 0 } }]);
    const r2 = quizz.reduce(r1.state, { type: 'deadline', at: 1 });
    expect(r2.effects).toEqual([{ type: 'analytics', name: 'round_completed', props: { round: 0 } }]);
  });

  it('a fully passive room rolls forward to over on deadlines alone', () => {
    let s = quizz.init('s', players, qContent);
    let steps = 0;
    while (s.phase !== 'over' && steps < 50) {
      const next = quizz.reduce(s, { type: 'deadline', at: steps }).state;
      expect(next).not.toBe(s); // every timed phase must consume its deadline
      s = next;
      steps += 1;
    }
    expect(s.phase).toBe('over');
    expect(steps).toBe(qContent.data.items.length * 2); // guess+reveal per round (3 items < 8 rounds)
    expect(quizz.phaseDurationMs(s)).toBeNull();
    expect(quizz.phaseKey(s)).toBe('over');
  });

  it('the over phase absorbs every event (same reference)', () => {
    let s = quizz.init('s', players, qContent);
    for (let i = 0; i < 20 && s.phase !== 'over'; i++) s = quizz.reduce(s, { type: 'deadline', at: i }).state;
    expect(s.phase).toBe('over');
    expect(quizz.reduce(s, { type: 'deadline', at: 99 }).state).toBe(s);
    expect(quizz.reduce(s, guess('p1', 5)).state).toBe(s);
    expect(quizz.reduce(s, { type: 'playerLeft', playerId: 'p1', at: 99 }).state).toBe(s);
  });
});

describe('phase chain and timing — crowd-target (Cinquante-Cinquante)', () => {
  it('pick -> reveal -> next pick with the design durations and phaseKeys', () => {
    const s0 = cc.init('s', players, cContent);
    expect(cc.phaseKey(s0)).toBe('pick:r0');
    expect(cc.phaseDurationMs(s0)).toBe(25_000);
    const s1 = cc.reduce(s0, { type: 'deadline', at: 0 }).state;
    expect(cc.phaseKey(s1)).toBe('reveal:r0');
    expect(cc.phaseDurationMs(s1)).toBe(12_000);
    const s2 = cc.reduce(s1, { type: 'deadline', at: 1 }).state;
    expect(cc.phaseKey(s2)).toBe('pick:r1');
    expect(s2.submissions).toEqual({});
  });

  it('a fully passive room rolls forward to over on deadlines alone', () => {
    let s = cc.init('s', players, cContent);
    let steps = 0;
    while (s.phase !== 'over' && steps < 50) {
      const next = cc.reduce(s, { type: 'deadline', at: steps }).state;
      expect(next).not.toBe(s);
      s = next;
      steps += 1;
    }
    expect(s.phase).toBe('over');
    expect(cc.phaseDurationMs(s)).toBeNull();
    expect(cc.reduce(s, pick('p1', 0)).state).toBe(s);
  });
});

describe('init determinism and pool capping', () => {
  it('same seed -> same item order and same card display order', () => {
    const a = cc.init('seed-1', players, cContent);
    const b = cc.init('seed-1', players, cContent);
    expect(a.items.map((i) => i.id)).toEqual(b.items.map((i) => i.id));
    expect(crowdItemOf(a, 0).completions.map((c) => c.id))
      .toEqual(crowdItemOf(b, 0).completions.map((c) => c.id));
    const c = quizz.init('seed-1', players, qContent);
    const d = quizz.init('seed-1', players, qContent);
    expect(c.items.map((i) => i.id)).toEqual(d.items.map((i) => i.id));
  });

  it('caps totalRounds at the pool size', () => {
    expect(quizz.init('s', players, qContent).config.totalRounds).toBe(3); // 3 items < 8 rounds
    expect(cc.init('s', players, cContent).config.totalRounds).toBe(3); // 3 items < 7 rounds
  });

  it('each mode only draws its own item shape from a mixed pack', () => {
    const mixed: ContentPack<InputGuessContent> = {
      id: 'mixed', version: 1,
      data: { items: [...numberContent(2).data.items, ...crowdContent(2).data.items] },
    };
    const q = quizz.init('s', players, mixed);
    expect(q.items.every((i) => 'answer' in i)).toBe(true);
    expect(q.config.totalRounds).toBe(2);
    const c = cc.init('s', players, mixed);
    expect(c.items.every((i) => 'completions' in i)).toBe(true);
    expect(c.config.totalRounds).toBe(2);
  });

  it('crowd card display order is the seeded shuffle, capped at cardsPerRound', () => {
    const s = cc.init('s', players, cContent);
    const item = crowdItemOf(s, 0);
    expect(item.completions.length).toBe(6);
    expect([...item.completions.map((c) => c.id)].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('an empty pool degenerates straight to over (untimed, absorbing)', () => {
    const empty: ContentPack<InputGuessContent> = { id: 'empty', version: 1, data: { items: [] } };
    const s = quizz.init('s', players, empty);
    expect(s.phase).toBe('over');
    expect(quizz.phaseDurationMs(s)).toBeNull();
    expect(quizz.reduce(s, { type: 'deadline', at: 0 }).state).toBe(s);
  });

  it('init starts every roster player at 0 — including a hostile "__proto__" id', () => {
    const s = quizz.init('s', ['__proto__', 'p2'], qContent);
    expect(s.scores['__proto__']).toBe(0);
    expect(s.scores['p2']).toBe(0);
    expect(JSON.parse(JSON.stringify(quizz.view(s, '__proto__')))).toEqual(quizz.view(s, '__proto__'));
  });
});

describe('game over', () => {
  function playToOver(
    module: ReturnType<typeof createInputGuess>,
    s0: InputGuessState,
    act: (p: string) => GameEvent<InputGuessAction>,
  ) {
    let s = s0;
    let last: { state: InputGuessState; effects: Effect[] } = { state: s, effects: [] };
    for (let i = 0; i < 50 && s.phase !== 'over'; i++) {
      if (s.phase === 'guess') for (const p of players) s = module.reduce(s, act(p)).state;
      const r = module.reduce(s, { type: 'deadline', at: i });
      last = r;
      s = r.state;
    }
    return { s, effects: last.effects };
  }

  it('closest-number emits gameOver with a CLONED scores map after totalRounds', () => {
    const one = createInputGuess('quizz-culture-ge', { ...QUIZZ_CULTURE_GE_CONFIG, totalRounds: 1 });
    const s0 = one.init('s', players, qContent);
    const answer = numberItemOf(s0, 0).answer;
    let s = s0;
    s = one.reduce(s, guess('p1', answer)).state;
    s = one.reduce(s, guess('p2', answer + 7)).state;
    s = one.reduce(s, guess('p3', answer + 9)).state;
    expect(s.phase).toBe('reveal');
    const { state: over, effects } = one.reduce(s, { type: 'deadline', at: 0 });
    expect(over.phase).toBe('over');
    const go = effects.find((e) => e.type === 'gameOver');
    if (go === undefined || go.type !== 'gameOver') throw new Error('expected gameOver effect');
    expect(go.scores).toEqual(over.scores);
    expect(go.scores).not.toBe(over.scores); // defensively cloned
  });

  it('crowd-target reaches over with a cloned gameOver scores map even on pure deadlines', () => {
    const s0 = cc.init('s', players, cContent);
    const { s, effects } = playToOver(cc, s0, (p) => pick(p, 0));
    expect(s.phase).toBe('over');
    const go = effects.find((e) => e.type === 'gameOver');
    if (go === undefined || go.type !== 'gameOver') throw new Error('expected gameOver effect');
    expect(go.scores).toEqual(s.scores);
    expect(go.scores).not.toBe(s.scores);
  });
});
