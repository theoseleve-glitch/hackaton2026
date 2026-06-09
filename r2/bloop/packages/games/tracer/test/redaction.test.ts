import { describe, expect, it } from 'vitest';
import type { ContentPack } from '@bloop/engine';
import { tracer, type TracerContent } from '@bloop/game-tracer';

const content: ContentPack<TracerContent> = {
  id: 't', version: 1,
  data: { prompts: ['P1?', 'P2?', 'P3?'] },
};
const players = ['p1', 'p2', 'p3'];

describe('tracer view redaction', () => {
  it('shows each viewer only their own vote during the vote phase', () => {
    const s0 = tracer.init('s', players, content);
    const s1 = tracer.reduce(s0, {
      type: 'action', playerId: 'p1', action: { kind: 'vote', target: 'p2' }, at: 0,
    }).state;

    const v1 = tracer.view(s1, 'p1');
    const v2 = tracer.view(s1, 'p2');
    if (v1.phase !== 'vote' || v2.phase !== 'vote') throw new Error('expected vote views');

    expect(v1.myVote).toBe('p2');
    expect(v2.myVote).toBeNull();
    expect(v1.hasVoted).toEqual({ p1: true, p2: false, p3: false });
    expect(v1.prompt).toBe(s1.prompts[0]);
  });

  it('never serializes the raw votes map in any vote-phase view', () => {
    const s0 = tracer.init('s', players, content);
    const s1 = tracer.reduce(s0, {
      type: 'action', playerId: 'p1', action: { kind: 'vote', target: 'p3' }, at: 0,
    }).state;
    for (const viewer of players) {
      const json = JSON.stringify(tracer.view(s1, viewer));
      expect(json).not.toContain('"votes"');
      if (viewer !== 'p1') expect(json).not.toContain('"myVote":"p3"');
    }
  });

  it('reveals only aggregate tallies in the reveal phase', () => {
    const s0 = tracer.init('s', players, content);
    let state = s0;
    state = tracer.reduce(state, { type: 'action', playerId: 'p1', action: { kind: 'vote', target: 'p3' }, at: 0 }).state;
    state = tracer.reduce(state, { type: 'action', playerId: 'p2', action: { kind: 'vote', target: 'p3' }, at: 1 }).state;
    state = tracer.reduce(state, { type: 'action', playerId: 'p3', action: { kind: 'vote', target: 'p1' }, at: 2 }).state;

    const v = tracer.view(state, 'p2');
    if (v.phase !== 'reveal') throw new Error('expected reveal view');
    expect(v.tally).toEqual({ p1: 1, p2: 0, p3: 2 });
    expect(JSON.stringify(v)).not.toContain('"votes"');
  });

  it('shows final scores when over', () => {
    let state = tracer.init('s', ['p1', 'p2'], content);
    for (let i = 0; i < 3; i++) {
      state = tracer.reduce(state, { type: 'deadline', at: 0 }).state;
      state = tracer.reduce(state, { type: 'deadline', at: 1 }).state;
    }
    const v = tracer.view(state, 'p1');
    expect(v.phase).toBe('over');
  });
});
