import { describe, expect, it } from 'vitest';
import type { ContentPack } from '@bloop/engine';
import { tracer, type TracerContent } from '@bloop/game-tracer';

const content: ContentPack<TracerContent> = {
  id: 't', version: 1,
  data: { prompts: ['P1?', 'P2?', 'P3?'] },
};
const players = ['p1', 'p2', 'p3'];

describe('tracer.phaseKey', () => {
  it('does not change while votes arrive within the vote phase', () => {
    const s0 = tracer.init('s', players, content);
    expect(tracer.phaseKey(s0)).toBe('vote:0');
    const s1 = tracer.reduce(s0, {
      type: 'action', playerId: 'p1', action: { kind: 'vote', target: 'p2' }, at: 0,
    }).state;
    expect(tracer.phaseKey(s1)).toBe('vote:0'); // in-phase progress keeps the running deadline
  });

  it('changes on every phase transition through a full game', () => {
    let state = tracer.init('s', players, content);
    const keys = [tracer.phaseKey(state)];
    while (state.phase !== 'over') {
      state = tracer.reduce(state, { type: 'deadline', at: keys.length }).state;
      keys.push(tracer.phaseKey(state));
    }
    expect(keys).toEqual([
      'vote:0', 'reveal:0', 'vote:1', 'reveal:1', 'vote:2', 'reveal:2', 'over',
    ]);
  });

  it('is the bare string "over" in the terminal phase, and stays put', () => {
    let state = tracer.init('s', players, content);
    while (state.phase !== 'over') {
      state = tracer.reduce(state, { type: 'deadline', at: 0 }).state;
    }
    expect(tracer.phaseKey(state)).toBe('over');
    const after = tracer.reduce(state, { type: 'deadline', at: 99 }).state;
    expect(tracer.phaseKey(after)).toBe('over');
  });

  it('never embeds prompts or player ids (keys are loggable, never secret)', () => {
    let state = tracer.init('s', players, content);
    const seen: string[] = [tracer.phaseKey(state)];
    while (state.phase !== 'over') {
      state = tracer.reduce(state, { type: 'deadline', at: 0 }).state;
      seen.push(tracer.phaseKey(state));
    }
    for (const key of seen) {
      expect(key).toMatch(/^[a-z]+(:\d+)?$/);
      for (const p of players) expect(key).not.toContain(p);
    }
  });
});
