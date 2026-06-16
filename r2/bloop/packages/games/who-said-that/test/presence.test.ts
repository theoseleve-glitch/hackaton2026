import { describe, expect, it } from 'vitest';
import type { ContentPack } from '@bloop/engine';
import {
  whoSaidThat,
  type WhoSaidThatContent,
  type WhoSaidThatState,
} from '@bloop/game-who-said-that';

const content: ContentPack<WhoSaidThatContent> = {
  id: 'qadc-test',
  version: 1,
  data: { statements: ['S1', 'S2', 'S3'] },
};
const players = ['p1', 'p2', 'p3', 'p4'];

function confess(state: WhoSaidThatState, p: string, value: boolean, at = 0): WhoSaidThatState {
  return whoSaidThat.reduce(state, { type: 'action', playerId: p, action: { kind: 'confess', value }, at }).state;
}
function accuse(state: WhoSaidThatState, p: string, target: string, at = 0): WhoSaidThatState {
  return whoSaidThat.reduce(state, { type: 'action', playerId: p, action: { kind: 'accuse', target }, at }).state;
}

describe('who-said-that presence', () => {
  it('initializes everyone connected', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    expect(s0.connected).toEqual({ p1: true, p2: true, p3: true, p4: true });
  });

  it('a disconnect never blocks confess early-resolve (allActed over connected only)', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    let s = confess(s0, 'p1', true, 1);
    s = confess(s, 'p2', false, 2);
    s = confess(s, 'p3', true, 3);
    // p4 has not acted; still in confess.
    expect(s.phase).toBe('confess');
    // p4 leaves -> the expected set shrinks to {p1,p2,p3}, all of whom acted.
    const { state: after } = whoSaidThat.reduce(s, { type: 'playerLeft', playerId: 'p4', at: 4 });
    expect(after.phase).toBe('attribute');
    expect(after.connected['p4']).toBe(false);
  });

  it('a disconnect resolves the attribute phase when the rest have accused', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    let s = confess(s0, 'p1', true, 1);
    s = confess(s, 'p2', false, 2);
    s = confess(s, 'p3', true, 3);
    s = confess(s, 'p4', false, 4); // -> attribute
    expect(s.phase).toBe('attribute');
    s = accuse(s, 'p1', 'p3', 5);
    s = accuse(s, 'p2', 'p1', 6);
    s = accuse(s, 'p3', 'p1', 7);
    // p4 missing; still attribute.
    expect(s.phase).toBe('attribute');
    const { state: after } = whoSaidThat.reduce(s, { type: 'playerLeft', playerId: 'p4', at: 8 });
    expect(after.phase).toBe('reveal');
  });

  it('keeps a disconnected player in the roster and never deletes their score', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    const { state } = whoSaidThat.reduce(s0, { type: 'playerLeft', playerId: 'p2', at: 1 });
    expect(state.players).toEqual(players);
    expect(state.scores['p2']).toBe(0);
  });

  it('rejoin is idempotent — a redundant rejoin returns the SAME state reference', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    // Already connected: rejoining an already-connected player is a no-op.
    const r = whoSaidThat.reduce(s0, { type: 'playerRejoined', playerId: 'p1', at: 1 });
    expect(r.state).toBe(s0);
    expect(r.effects).toEqual([]);
  });

  it('a redundant leave (already disconnected) returns the SAME state reference', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    const once = whoSaidThat.reduce(s0, { type: 'playerLeft', playerId: 'p3', at: 1 }).state;
    const twice = whoSaidThat.reduce(once, { type: 'playerLeft', playerId: 'p3', at: 2 });
    expect(twice.state).toBe(once);
  });

  it('a leave/rejoin round-trip restores the original connected map', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    const left = whoSaidThat.reduce(s0, { type: 'playerLeft', playerId: 'p2', at: 1 }).state;
    expect(left.connected['p2']).toBe(false);
    const back = whoSaidThat.reduce(left, { type: 'playerRejoined', playerId: 'p2', at: 2 }).state;
    expect(back.connected).toEqual(s0.connected);
  });

  it('a non-roster presence event returns the SAME state reference', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    const r = whoSaidThat.reduce(s0, { type: 'playerLeft', playerId: 'ghost', at: 1 });
    expect(r.state).toBe(s0);
  });
});
