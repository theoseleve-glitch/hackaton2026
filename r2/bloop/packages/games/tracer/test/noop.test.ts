import { describe, expect, it } from 'vitest';
import type { ContentPack, GameEvent } from '@bloop/engine';
import { tracer, type TracerAction, type TracerContent, type TracerState } from '@bloop/game-tracer';

const content: ContentPack<TracerContent> = { id: 'noop-pack', version: 1, data: { prompts: ['a', 'b', 'c', 'd'] } };
const players = ['p1', 'p2', 'p3'];
const vote = (playerId: string, target: string, at = 1_000): GameEvent<TracerAction> =>
  ({ type: 'action', playerId, action: { kind: 'vote', target }, at });

function toReveal(): TracerState {
  let s = tracer.init('noop-seed', players, content);
  s = tracer.reduce(s, vote('p1', 'p2')).state;
  s = tracer.reduce(s, vote('p2', 'p3')).state;
  s = tracer.reduce(s, vote('p3', 'p1')).state; // all voted -> reveal
  return s;
}

describe('tracer rejects by reference (engine no-op contract, review I4)', () => {
  it('rejected votes return the SAME state object: self-vote, unknown voter, unknown target', () => {
    const s = tracer.init('noop-seed', players, content);
    expect(tracer.reduce(s, vote('p1', 'p1')).state).toBe(s);
    expect(tracer.reduce(s, vote('ghost', 'p2')).state).toBe(s);
    expect(tracer.reduce(s, vote('p1', '__proto__')).state).toBe(s);
  });

  it('votes outside the vote phase are rejected by reference', () => {
    const s = toReveal();
    expect(s.phase).toBe('reveal');
    expect(tracer.reduce(s, vote('p1', 'p2')).state).toBe(s);
  });

  it('roster events are ignored by reference (tracer has no presence rules)', () => {
    const s = tracer.init('noop-seed', players, content);
    expect(tracer.reduce(s, { type: 'playerLeft', playerId: 'p2', at: 1 }).state).toBe(s);
    expect(tracer.reduce(s, { type: 'playerRejoined', playerId: 'p2', at: 2 }).state).toBe(s);
  });

  it('a finished game absorbs everything by reference', () => {
    let s = toReveal(); // reveal:0:suspense
    // two-beat reveal: each round is suspense -> verdict -> next, so reaching
    // 'over' from reveal:0:suspense takes 8 deadline hops (3 rounds, the first
    // already at suspense): verdict,vote1,suspense,verdict,vote2,suspense,verdict,over.
    for (let i = 0; i < 8; i++) s = tracer.reduce(s, { type: 'deadline', at: 2_000 + i }).state;
    expect(s.phase).toBe('over');
    expect(tracer.reduce(s, { type: 'deadline', at: 9_000 }).state).toBe(s);
    expect(tracer.reduce(s, vote('p1', 'p2')).state).toBe(s);
  });
});
