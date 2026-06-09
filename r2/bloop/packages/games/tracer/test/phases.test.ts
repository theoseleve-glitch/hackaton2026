import { describe, expect, it } from 'vitest';
import type { ContentPack } from '@bloop/engine';
import { tracer, type TracerContent, type TracerState } from '@bloop/game-tracer';

const content: ContentPack<TracerContent> = {
  id: 't', version: 1,
  data: { prompts: ['P1?', 'P2?', 'P3?'] },
};
const players = ['p1', 'p2'];

function playRound(state: TracerState): TracerState {
  // vote deadline -> reveal, reveal deadline -> next
  const revealed = tracer.reduce(state, { type: 'deadline', at: 0 }).state;
  return tracer.reduce(revealed, { type: 'deadline', at: 1 }).state;
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
    const revealed = tracer.reduce(state, { type: 'deadline', at: 0 }).state;
    const { state: over, effects } = tracer.reduce(revealed, { type: 'deadline', at: 1 });
    expect(over.phase).toBe('over');
    expect(effects).toContainEqual({ type: 'gameOver', scores: over.scores });
  });

  it('is inert once over', () => {
    let state = tracer.init('s', players, content);
    for (let i = 0; i < 3; i++) state = playRound(state);
    const { state: still, effects } = tracer.reduce(state, { type: 'deadline', at: 99 });
    expect(still).toEqual(state);
    expect(effects).toEqual([]);
  });

  it('ignores playerLeft/playerRejoined without crashing', () => {
    const s0 = tracer.init('s', players, content);
    const left = tracer.reduce(s0, { type: 'playerLeft', playerId: 'p1', at: 0 });
    const back = tracer.reduce(left.state, { type: 'playerRejoined', playerId: 'p1', at: 1 });
    expect(back.state).toEqual(s0);
  });
});
