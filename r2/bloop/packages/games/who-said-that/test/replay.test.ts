import { describe, expect, it } from 'vitest';
import { replay, type ContentPack, type GameEvent } from '@bloop/engine';
import {
  createWhoSaidThat,
  whoSaidThat,
  type WhoSaidThatAction,
  type WhoSaidThatContent,
} from '@bloop/game-who-said-that';

const content: ContentPack<WhoSaidThatContent> = {
  id: 'qadc-test',
  version: 1,
  data: { statements: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'] },
};
const players = ['p1', 'p2', 'p3', 'p4'];

const log: ReadonlyArray<GameEvent<WhoSaidThatAction>> = [
  { type: 'action', playerId: 'p1', action: { kind: 'confess', value: true }, at: 1 },
  { type: 'action', playerId: 'p2', action: { kind: 'confess', value: false }, at: 2 },
  { type: 'action', playerId: 'p3', action: { kind: 'confess', value: true }, at: 3 },
  { type: 'action', playerId: 'p4', action: { kind: 'confess', value: false }, at: 4 },
  { type: 'action', playerId: 'p1', action: { kind: 'accuse', target: 'p3' }, at: 5 },
  { type: 'action', playerId: 'p2', action: { kind: 'accuse', target: 'p1' }, at: 6 },
  { type: 'action', playerId: 'p3', action: { kind: 'accuse', target: 'p1' }, at: 7 },
  { type: 'action', playerId: 'p4', action: { kind: 'accuse', target: 'p2' }, at: 8 },
  { type: 'deadline', at: 9 }, // reveal -> next confess (round 1)
];

describe('who-said-that determinism / replay', () => {
  it('the seeded statement draw is identical across two fresh inits', () => {
    const a = whoSaidThat.init('seed-xyz', players, content);
    const b = whoSaidThat.init('seed-xyz', players, content);
    expect(a.statements).toEqual(b.statements);
  });

  it('different seeds draw a different statement order (no fixed bias)', () => {
    const a = whoSaidThat.init('seed-a', players, content);
    const b = whoSaidThat.init('seed-b', players, content);
    // Same multiset, generally different order.
    expect([...a.statements].sort()).toEqual([...b.statements].sort());
    expect(a.statements).not.toEqual(b.statements);
  });

  it('replaying the same log yields byte-identical state', () => {
    const s1 = replay(whoSaidThat, 'seed', players, content, log);
    const s2 = replay(whoSaidThat, 'seed', players, content, log);
    expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
  });

  it('replay equals a hand-folded reduce of the same log', () => {
    let folded = whoSaidThat.init('seed', players, content);
    for (const e of log) folded = whoSaidThat.reduce(folded, e).state;
    const replayed = replay(whoSaidThat, 'seed', players, content, log);
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(folded));
  });

  it('scoring is RNG-free: identical buffers => identical scores regardless of seed', () => {
    const a = replay(createWhoSaidThat('a'), 'seed-1', players, content, log);
    const b = replay(createWhoSaidThat('b'), 'seed-2', players, content, log);
    // Statement ORDER may differ by seed, but the scores depend only on the
    // confessions+accusations buffers, which are identical here.
    expect(a.scores).toEqual(b.scores);
  });
});
