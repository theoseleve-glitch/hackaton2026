import { describe, expect, it } from 'vitest';
import type { ContentPack } from '@bloop/engine';
import { tracer, type TracerContent, type TracerState } from '@bloop/game-tracer';

const content: ContentPack<TracerContent> = {
  id: 't', version: 1,
  data: { prompts: ['P1?', 'P2?', 'P3?'] },
};
const players = ['p1', 'p2'];

function playRound(state: TracerState): TracerState {
  // vote deadline -> reveal:suspense, deadline -> reveal:verdict, deadline -> next
  // (two-beat reveal: the verdict beat adds one extra deadline hop per round).
  const suspense = tracer.reduce(state, { type: 'deadline', at: 0 }).state;
  const verdict = tracer.reduce(suspense, { type: 'deadline', at: 1 }).state;
  return tracer.reduce(verdict, { type: 'deadline', at: 2 }).state;
}

describe('tracer phases', () => {
  it('advances reveal -> next vote round with cleared votes', () => {
    const s0 = tracer.init('s', players, content);
    const s1 = playRound(s0);
    expect(s1.phase).toBe('vote');
    expect(s1.round).toBe(1);
    expect(s1.votes).toEqual({});
  });

  it('ends after totalRounds with a gameOver effect carrying final scores', () => {
    let state = tracer.init('s', players, content);
    expect(state.config.totalRounds).toBe(3);
    state = playRound(state);
    state = playRound(state);
    const suspense = tracer.reduce(state, { type: 'deadline', at: 0 }).state;
    const verdict = tracer.reduce(suspense, { type: 'deadline', at: 1 }).state;
    const { state: over, effects } = tracer.reduce(verdict, { type: 'deadline', at: 2 });
    expect(over.phase).toBe('over');
    expect(effects).toContainEqual({ type: 'gameOver', scores: over.scores });
  });

  it('is inert once over', () => {
    let state = tracer.init('s', players, content);
    for (let i = 0; i < 3; i++) state = playRound(state);
    const { state: still, effects } = tracer.reduce(state, { type: 'deadline', at: 99 });
    expect(still).toBe(state);
    expect(effects).toEqual([]);
  });

  it('carries scores forward across rounds', () => {
    const s0 = tracer.init('s', players, content);
    const voted = tracer.reduce(s0, {
      type: 'action', playerId: 'p1', action: { kind: 'vote', target: 'p2' }, at: 0,
    }).state;
    const suspense = tracer.reduce(voted, { type: 'deadline', at: 1 }).state;
    // Scoring is DEFERRED: still frozen at the suspense beat, lands at verdict.
    expect(suspense.revealStep).toBe('suspense');
    expect(suspense.scores).toEqual({ p1: 0, p2: 0 });
    const verdict = tracer.reduce(suspense, { type: 'deadline', at: 2 }).state;
    expect(verdict.revealStep).toBe('verdict');
    expect(verdict.scores).toEqual({ p1: 0, p2: 1 }); // the climb lands HERE
    const next = tracer.reduce(verdict, { type: 'deadline', at: 3 }).state;
    expect(next.phase).toBe('vote');
    expect(next.round).toBe(1);
    expect(next.scores).toEqual({ p1: 0, p2: 1 });
  });

  it('ignores playerLeft/playerRejoined without crashing', () => {
    const s0 = tracer.init('s', players, content);
    const left = tracer.reduce(s0, { type: 'playerLeft', playerId: 'p1', at: 0 });
    const back = tracer.reduce(left.state, { type: 'playerRejoined', playerId: 'p1', at: 1 });
    expect(back.state).toEqual(s0);
  });

  it('gameOver effect scores do not alias live state', () => {
    let state = tracer.init('s', players, content);
    for (let i = 0; i < 2; i++) {
      state = tracer.reduce(state, { type: 'deadline', at: 0 }).state; // -> suspense
      state = tracer.reduce(state, { type: 'deadline', at: 1 }).state; // -> verdict
      state = tracer.reduce(state, { type: 'deadline', at: 2 }).state; // -> next round
    }
    const suspense = tracer.reduce(state, { type: 'deadline', at: 0 }).state;
    const verdict = tracer.reduce(suspense, { type: 'deadline', at: 1 }).state;
    const { state: over, effects } = tracer.reduce(verdict, { type: 'deadline', at: 2 });
    const effect = effects.find((e) => e.type === 'gameOver');
    if (!effect || effect.type !== 'gameOver') throw new Error('expected gameOver');
    effect.scores['p1'] = 999;
    expect(over.scores['p1']).not.toBe(999);
  });
});
