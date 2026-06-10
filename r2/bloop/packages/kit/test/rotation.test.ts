import { describe, expect, it } from 'vitest';
import { initPresence, nextActiveSeat, setConnected } from '@bloop/kit';

const order = ['p1', 'p2', 'p3', 'p4'];

describe('nextActiveSeat', () => {
  it('advances to the immediate next seat when it is connected', () => {
    expect(nextActiveSeat(order, 0, initPresence(order))).toEqual({ index: 1, wrapped: false });
  });

  it('skips disconnected seats', () => {
    const p = setConnected(initPresence(order), 'p2', false);
    expect(nextActiveSeat(order, 0, p)).toEqual({ index: 2, wrapped: false });
  });

  it('wraps past the end and reports it', () => {
    expect(nextActiveSeat(order, 3, initPresence(order))).toEqual({ index: 0, wrapped: true });
  });

  it('skipping across the boundary also counts as a wrap', () => {
    const p = setConnected(initPresence(order), 'p4', false);
    expect(nextActiveSeat(order, 2, p)).toEqual({ index: 0, wrapped: true });
  });

  it('degenerates to (fromIndex + 1) % length when nobody is connected', () => {
    let p = initPresence(order);
    for (const id of order) p = setConnected(p, id, false);
    expect(nextActiveSeat(order, 1, p)).toEqual({ index: 2, wrapped: false });
    expect(nextActiveSeat(order, 3, p)).toEqual({ index: 0, wrapped: true });
  });
});
