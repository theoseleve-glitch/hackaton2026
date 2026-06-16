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

describe('who-said-that reject-invalid (SAME state reference)', () => {
  it('rejects a confess from a non-roster player', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    const r = whoSaidThat.reduce(s0, {
      type: 'action', playerId: 'ghost', action: { kind: 'confess', value: true }, at: 1,
    });
    expect(r.state).toBe(s0);
    expect(r.effects).toEqual([]);
  });

  it('rejects an accuse during the confess phase (wrong phase)', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    const r = whoSaidThat.reduce(s0, {
      type: 'action', playerId: 'p1', action: { kind: 'accuse', target: 'p2' }, at: 1,
    });
    expect(r.state).toBe(s0);
  });

  it('rejects a confess during the attribute phase (wrong phase)', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    let s = confess(s0, 'p1', true, 1);
    s = confess(s, 'p2', false, 2);
    s = confess(s, 'p3', true, 3);
    s = confess(s, 'p4', false, 4); // -> attribute
    expect(s.phase).toBe('attribute');
    const r = whoSaidThat.reduce(s, {
      type: 'action', playerId: 'p1', action: { kind: 'confess', value: false }, at: 5,
    });
    expect(r.state).toBe(s);
  });

  it('rejects a self-accusation', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    let s = confess(s0, 'p1', true, 1);
    s = confess(s, 'p2', false, 2);
    s = confess(s, 'p3', true, 3);
    s = confess(s, 'p4', false, 4); // -> attribute
    const r = whoSaidThat.reduce(s, {
      type: 'action', playerId: 'p1', action: { kind: 'accuse', target: 'p1' }, at: 5,
    });
    expect(r.state).toBe(s);
  });

  it('rejects an accusation at a non-roster target', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    let s = confess(s0, 'p1', true, 1);
    s = confess(s, 'p2', false, 2);
    s = confess(s, 'p3', true, 3);
    s = confess(s, 'p4', false, 4); // -> attribute
    const r = whoSaidThat.reduce(s, {
      type: 'action', playerId: 'p1', action: { kind: 'accuse', target: 'ghost' }, at: 5,
    });
    expect(r.state).toBe(s);
  });

  it('rejects any action once over', () => {
    let s = whoSaidThat.init('seed', players, content);
    // drive to over by deadlines
    for (let i = 0; i < s.config.totalRounds; i++) {
      s = whoSaidThat.reduce(s, { type: 'deadline', at: 0 }).state; // confess->attribute
      s = whoSaidThat.reduce(s, { type: 'deadline', at: 1 }).state; // attribute->reveal
      s = whoSaidThat.reduce(s, { type: 'deadline', at: 2 }).state; // reveal->next/over
    }
    expect(s.phase).toBe('over');
    const r = whoSaidThat.reduce(s, {
      type: 'action', playerId: 'p1', action: { kind: 'confess', value: true }, at: 9,
    });
    expect(r.state).toBe(s);
  });

  it('accepts a re-tap (overwrite) and returns a NEW reference, keeping the player acted', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    const first = confess(s0, 'p1', true, 1);
    expect(first).not.toBe(s0);
    const second = confess(first, 'p1', false, 2);
    expect(second).not.toBe(first);
    expect(second.confessions['p1']).toBe(false); // overwrite landed
    // Still exactly one acted player.
    const v = whoSaidThat.view(second, 'p2');
    if (v.phase !== 'confess') throw new Error('expected confess view');
    expect(v.hasConfessed).toEqual({ p1: true, p2: false, p3: false, p4: false });
  });

  it('accepts an accusation re-tap (overwrite) keeping the player acted', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    let s = confess(s0, 'p1', true, 1);
    s = confess(s, 'p2', false, 2);
    s = confess(s, 'p3', true, 3);
    s = confess(s, 'p4', false, 4); // -> attribute
    const a1 = whoSaidThat.reduce(s, { type: 'action', playerId: 'p1', action: { kind: 'accuse', target: 'p2' }, at: 5 }).state;
    const a2 = whoSaidThat.reduce(a1, { type: 'action', playerId: 'p1', action: { kind: 'accuse', target: 'p3' }, at: 6 }).state;
    expect(a2).not.toBe(a1);
    expect(a2.accusations['p1']).toBe('p3');
  });
});
