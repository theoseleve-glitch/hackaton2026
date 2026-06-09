import { describe, expect, it } from 'vitest';
import { replay, type ContentPack, type GameModule } from '@bloop/engine';

interface CounterState { n: number }
type CounterAction = { kind: 'inc' };

const counter: GameModule<CounterState, CounterAction, number> = {
  id: 'counter',
  version: 1,
  minPlayers: 1,
  maxPlayers: 16,
  init: () => ({ n: 0 }),
  reduce: (state, event) =>
    event.type === 'action'
      ? { state: { n: state.n + 1 }, effects: [] }
      : { state, effects: [] },
  view: (state) => state.n,
  deadline: () => null,
};

const content: ContentPack = { id: 'none', version: 1, data: {} };

describe('replay', () => {
  it('folds events over init deterministically', () => {
    const events = [
      { type: 'action', playerId: 'p1', action: { kind: 'inc' }, at: 1 },
      { type: 'deadline', at: 2 },
      { type: 'action', playerId: 'p2', action: { kind: 'inc' }, at: 3 },
    ] as const;
    const s1 = replay(counter, 'seed', ['p1', 'p2'], content, [...events]);
    const s2 = replay(counter, 'seed', ['p1', 'p2'], content, [...events]);
    expect(s1).toEqual({ n: 2 });
    expect(s1).toEqual(s2);
  });

  it('replay(all) === replay(prefix) continued with suffix', () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      type: 'action' as const,
      playerId: 'p1',
      action: { kind: 'inc' as const },
      at: i,
    }));
    const full = replay(counter, 's', ['p1'], content, events);
    let state = replay(counter, 's', ['p1'], content, events.slice(0, 2));
    for (const e of events.slice(2)) state = counter.reduce(state, e).state;
    expect(state).toEqual(full);
  });
});
