import { describe, expect, it } from 'vitest';
import { replay, type ContentPack, type GameEvent } from '@bloop/engine';
import { tracer, type TracerAction, type TracerContent } from '@bloop/game-tracer';

const content: ContentPack<TracerContent> = {
  id: 't', version: 1,
  data: { prompts: ['P1?', 'P2?', 'P3?'] },
};
const players = ['p1', 'p2', 'p3'];

function fullGameScript(): GameEvent<TracerAction>[] {
  const events: GameEvent<TracerAction>[] = [];
  let at = 0;
  for (let round = 0; round < 3; round++) {
    events.push({ type: 'action', playerId: 'p1', action: { kind: 'vote', target: 'p2' }, at: at++ });
    events.push({ type: 'action', playerId: 'p2', action: { kind: 'vote', target: 'p1' }, at: at++ });
    events.push({ type: 'action', playerId: 'p3', action: { kind: 'vote', target: 'p1' }, at: at++ });
    // all voted -> reveal:suspense automatically; two-beat reveal needs two
    // deadline hops to advance: suspense -> verdict (scores climb), verdict -> next.
    events.push({ type: 'deadline', at: at++ });
    events.push({ type: 'deadline', at: at++ });
  }
  return events;
}

describe('tracer replay determinism', () => {
  it('replaying the full script twice yields identical end states', () => {
    const script = fullGameScript();
    const a = replay(tracer, 'seed-x', players, content, script);
    const b = replay(tracer, 'seed-x', players, content, script);
    expect(a).toEqual(b);
    expect(a.phase).toBe('over');
    expect(a.scores).toEqual({ p1: 3, p2: 0, p3: 0 });
  });

  it('snapshot-and-continue equals full replay at every cut point', () => {
    const script = fullGameScript();
    const full = replay(tracer, 'seed-x', players, content, script);
    for (let cut = 0; cut <= script.length; cut++) {
      let state = replay(tracer, 'seed-x', players, content, script.slice(0, cut));
      for (const e of script.slice(cut)) state = tracer.reduce(state, e).state;
      expect(state).toEqual(full);
    }
  });
});
