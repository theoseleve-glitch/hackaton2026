import { describe, expect, it } from 'vitest';
import type { ContentPack, GameEvent } from '@bloop/engine';
import { tracer, type TracerAction, type TracerContent } from '@bloop/game-tracer';

const content: ContentPack<TracerContent> = {
  id: 't', version: 1,
  data: { prompts: ['P1?', 'P2?', 'P3?'] },
};
const players = ['p1', 'p2', 'p3'];

function vote(playerId: string, target: string, at = 0): GameEvent<TracerAction> {
  return { type: 'action', playerId, action: { kind: 'vote', target }, at };
}

describe('tracer voting', () => {
  it('records a vote without revealing it (state only)', () => {
    const s0 = tracer.init('s', players, content);
    const { state: s1, effects } = tracer.reduce(s0, vote('p1', 'p2'));
    expect(s1.votes).toEqual({ p1: 'p2' });
    expect(s1.phase).toBe('vote');
    expect(effects).toEqual([]);
  });

  it('lets a player change their vote before the phase ends', () => {
    const s0 = tracer.init('s', players, content);
    const s1 = tracer.reduce(s0, vote('p1', 'p2')).state;
    const s2 = tracer.reduce(s1, vote('p1', 'p3')).state;
    expect(s2.votes).toEqual({ p1: 'p3' });
  });

  it('ignores self-votes, unknown voters, and unknown targets', () => {
    const s0 = tracer.init('s', players, content);
    expect(tracer.reduce(s0, vote('p1', 'p1')).state.votes).toEqual({});
    expect(tracer.reduce(s0, vote('ghost', 'p1')).state.votes).toEqual({});
    expect(tracer.reduce(s0, vote('p1', 'ghost')).state.votes).toEqual({});
  });

  it('transitions to reveal when all players have voted, scoring the most-voted', () => {
    const s0 = tracer.init('s', players, content);
    const s1 = tracer.reduce(s0, vote('p1', 'p3')).state;
    const s2 = tracer.reduce(s1, vote('p2', 'p3')).state;
    const { state: s3 } = tracer.reduce(s2, vote('p3', 'p1'));
    expect(s3.phase).toBe('reveal');
    expect(s3.scores).toEqual({ p1: 0, p2: 0, p3: 1 });
  });

  it('awards a point to every player tied for most votes', () => {
    const two = ['p1', 'p2'];
    const s0 = tracer.init('s', two, content);
    const s1 = tracer.reduce(s0, vote('p1', 'p2')).state;
    const { state: s2 } = tracer.reduce(s1, vote('p2', 'p1'));
    expect(s2.phase).toBe('reveal');
    expect(s2.scores).toEqual({ p1: 1, p2: 1 });
  });

  it('ignores actions outside the vote phase', () => {
    const s0 = tracer.init('s', players, content);
    const revealed = tracer.reduce(s0, { type: 'deadline', at: 0 }).state;
    expect(revealed.phase).toBe('reveal');
    const after = tracer.reduce(revealed, vote('p1', 'p2')).state;
    expect(after.votes).toEqual(revealed.votes);
  });

  it('awards no points when the deadline fires with zero votes', () => {
    const s0 = tracer.init('s', players, content);
    const { state: s1 } = tracer.reduce(s0, { type: 'deadline', at: 0 });
    expect(s1.phase).toBe('reveal');
    expect(s1.scores).toEqual({ p1: 0, p2: 0, p3: 0 });
  });

  it('keeps a "__proto__" player id from corrupting tallies', () => {
    const weird = ['__proto__', 'p2'];
    const s0 = tracer.init('s', weird, content);
    const s1 = tracer.reduce(s0, vote('__proto__', 'p2')).state;
    const { state: s2 } = tracer.reduce(s1, vote('p2', '__proto__'));
    expect(s2.phase).toBe('reveal');
    expect(s2.scores['__proto__']).toBe(1);
    expect(s2.scores['p2']).toBe(1);
  });

  it('does not count an absent "__proto__" player as having voted', () => {
    const weird = ['p1', '__proto__'];
    const s0 = tracer.init('s', weird, content);
    const { state: s1 } = tracer.reduce(s0, vote('p1', '__proto__'));
    expect(s1.phase).toBe('vote'); // __proto__ has NOT voted yet — must not reveal
    const { state: s2 } = tracer.reduce(s1, vote('__proto__', 'p1'));
    expect(s2.phase).toBe('reveal');
  });
});
