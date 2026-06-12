import { describe, expect, it } from 'vitest';
import {
  CINQUANTE_CINQUANTE_CONFIG,
  createInputGuess,
  QUIZZ_CULTURE_GE_CONFIG,
} from '@bloop/game-input-guess';
import { crowdContent, guess, numberContent, pick } from './fixtures.js';

const players = ['p1', 'p2', 'p3'];
const quizz = createInputGuess('quizz-culture-ge', QUIZZ_CULTURE_GE_CONFIG);
const cc = createInputGuess('cinquante-cinquante', CINQUANTE_CINQUANTE_CONFIG);
const qContent = numberContent(3);
const cContent = crowdContent(3);

describe('presence semantics (a disconnected player NEVER blocks)', () => {
  it('playerLeft/playerRejoined flip presence; unknown ids and redundant flips are no-ops', () => {
    const s0 = quizz.init('s', players, qContent);
    expect(quizz.reduce(s0, { type: 'playerLeft', playerId: 'ghost', at: 0 }).state).toBe(s0);
    expect(quizz.reduce(s0, { type: 'playerRejoined', playerId: 'p1', at: 0 }).state).toBe(s0);
    const s1 = quizz.reduce(s0, { type: 'playerLeft', playerId: 'p1', at: 0 }).state;
    expect(s1.connected['p1']).toBe(false);
    expect(quizz.reduce(s1, { type: 'playerLeft', playerId: 'p1', at: 1 }).state).toBe(s1);
    const s2 = quizz.reduce(s1, { type: 'playerRejoined', playerId: 'p1', at: 2 }).state;
    expect(s2.connected['p1']).toBe(true);
  });

  it('a disconnected player is excluded from the expected set (others early-advance without them)', () => {
    const s0 = quizz.init('s', players, qContent);
    const s1 = quizz.reduce(s0, { type: 'playerLeft', playerId: 'p3', at: 0 }).state;
    const s2 = quizz.reduce(s1, guess('p1', 10)).state;
    const { state: s3 } = quizz.reduce(s2, guess('p2', 20));
    expect(s3.phase).toBe('reveal'); // p3 never blocked the room
  });

  it('a leave can COMPLETE the expected set and resolve the round (closest-number)', () => {
    const s0 = quizz.init('s', players, qContent);
    const s1 = quizz.reduce(s0, guess('p1', 10)).state;
    const s2 = quizz.reduce(s1, guess('p2', 20)).state;
    expect(s2.phase).toBe('guess');
    const { state: s3 } = quizz.reduce(s2, { type: 'playerLeft', playerId: 'p3', at: 0 });
    expect(s3.phase).toBe('reveal');
    if (s3.lastResult?.kind !== 'closest-number') throw new Error('expected closest result');
    expect(s3.lastResult.guesses).toEqual({ p1: 10, p2: 20 }); // p3 has no entry
  });

  it('a leave can complete the expected set (crowd-target)', () => {
    const s0 = cc.init('s', players, cContent);
    const s1 = cc.reduce(s0, pick('p1', 0)).state;
    const s2 = cc.reduce(s1, pick('p2', 1)).state;
    expect(s2.phase).toBe('guess');
    const { state: s3 } = cc.reduce(s2, { type: 'playerLeft', playerId: 'p3', at: 0 });
    expect(s3.phase).toBe('reveal');
  });

  it('a rejoined player is expected again mid-phase', () => {
    const s0 = cc.init('s', players, cContent);
    const s1 = cc.reduce(s0, { type: 'playerLeft', playerId: 'p3', at: 0 }).state;
    const s2 = cc.reduce(s1, pick('p1', 0)).state;
    const s3 = cc.reduce(s2, { type: 'playerRejoined', playerId: 'p3', at: 1 }).state;
    // p2 AND p3 now expected — a p2 pick alone must not resolve
    const s4 = cc.reduce(s3, pick('p2', 1)).state;
    expect(s4.phase).toBe('guess');
  });

  it('a submitted-then-disconnected player keeps their buffered entry at resolve', () => {
    const s0 = quizz.init('s', players, qContent);
    const s1 = quizz.reduce(s0, guess('p1', 10)).state;
    const s2 = quizz.reduce(s1, { type: 'playerLeft', playerId: 'p1', at: 0 }).state;
    const { state: s3 } = quizz.reduce(s2, { type: 'deadline', at: 1 });
    expect(s3.phase).toBe('reveal');
    if (s3.lastResult?.kind !== 'closest-number') throw new Error('expected closest result');
    expect(s3.lastResult.guesses).toEqual({ p1: 10 }); // the seat keeps its scores and entries
  });

  it('an entirely disconnected room still rolls to over on deadlines alone', () => {
    let s = cc.init('s', players, cContent);
    for (const p of players) s = cc.reduce(s, { type: 'playerLeft', playerId: p, at: 0 }).state;
    let steps = 0;
    while (s.phase !== 'over' && steps < 50) {
      const next = cc.reduce(s, { type: 'deadline', at: steps }).state;
      expect(next).not.toBe(s);
      s = next;
      steps += 1;
    }
    expect(s.phase).toBe('over');
    expect(cc.phaseDurationMs(s)).toBeNull();
  });

  it('presence flips mid-guess do not advance the phase or leak the buffer', () => {
    const s0 = quizz.init('s', players, qContent);
    const s1 = quizz.reduce(s0, guess('p1', 10)).state;
    const s2 = quizz.reduce(s1, { type: 'playerLeft', playerId: 'p2', at: 0 }).state;
    expect(s2.phase).toBe('guess'); // p3 still expected
    expect(quizz.phaseKey(s2)).toBe('guess:r0'); // same phase instance — the running deadline stays
    const v = quizz.view(s2, 'p3');
    if (v.phase !== 'guess') throw new Error('expected guess view');
    expect(v.mySubmission).toBeNull();
  });
});
