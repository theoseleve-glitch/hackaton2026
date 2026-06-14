import { describe, expect, it } from 'vitest';
import {
  act,
  allOf,
  CONTENT,
  deadline,
  drive,
  game,
  left,
  nightAck,
  P5,
  peek,
  rejoin,
  roleOf,
  toNight,
  walkUntil,
} from './helpers.js';

describe('presence flips', () => {
  it('playerLeft/playerRejoined flip presence; unknown ids and redundant flips are same-reference', () => {
    const s0 = game.init('s', P5, CONTENT);
    expect(game.reduce(s0, left('ghost')).state).toBe(s0);
    expect(game.reduce(s0, rejoin('p1')).state).toBe(s0);
    const s1 = game.reduce(s0, left('p1')).state;
    expect(s1.connected['p1']).toBe(false);
    expect(game.reduce(s1, left('p1', 1)).state).toBe(s1);
    const s2 = game.reduce(s1, rejoin('p1', 2)).state;
    expect(s2.connected['p1']).toBe(true);
  });

  it('presence is NOT elimination — alive never flips on a disconnect', () => {
    const s0 = game.init('s', P5, CONTENT);
    const s1 = game.reduce(s0, left('p2')).state;
    expect(s1.alive['p2']).toBe(true);
    const seat = game.view(s1, 'p1').seats.find((x) => x.id === 'p2')!;
    expect(seat.alive).toBe(true);
    expect(seat.connected).toBe(false);
  });
});

describe('disconnected players never block', () => {
  it('a night sub-phase completes without the disconnected player', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const seer = roleOf(s0, 'seer');
    const villager = allOf(s0, 'villager')[0]!;
    const s1 = game.reduce(s0, left(villager)).state;
    let s = s1;
    for (const p of P5.filter((x) => x !== villager && x !== seer)) {
      s = game.reduce(s, nightAck(p)).state;
    }
    expect(s.phase).toBe('nightSeer');
    s = game.reduce(s, peek(seer, villager)).state;
    expect(s.phase).toBe('nightWolves'); // the absent villager was not expected
  });

  it('a leave can complete the expected set mid-phase', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const lastOne = P5[4]!;
    let s = s0;
    for (const p of P5.slice(0, 4)) s = game.reduce(s, nightAck(p)).state;
    expect(s.phase).toBe('nightSeer');
    const { state: s1 } = game.reduce(s, left(lastOne, 9));
    expect(s1.phase).toBe('nightWolves'); // the leave completed the set
  });

  it('a rejoined player is expected again while the phase is still open', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const villager = allOf(s0, 'villager')[0]!;
    const s1 = game.reduce(s0, left(villager)).state;
    const s2 = game.reduce(s1, rejoin(villager, 2)).state;
    let s = s2;
    for (const p of P5.filter((x) => x !== villager)) s = game.reduce(s, nightAck(p)).state;
    expect(s.phase).toBe('nightSeer'); // the rejoined villager is expected again
    s = game.reduce(s, nightAck(villager)).state;
    expect(s.phase).toBe('nightWolves');
  });

  it('a disconnected seer simply loses her peek (deadline, empty log)', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const seer = roleOf(s0, 'seer');
    const s1 = game.reduce(s0, left(seer)).state;
    const s2 = game.reduce(s1, deadline(2)).state;
    expect(s2.phase).toBe('nightWolves');
    expect(s2.seerLog).toEqual([]);
  });

  it('a sole disconnected wolf produces a kill-less night', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const wolf = roleOf(s0, 'wolf');
    const s1 = game.reduce(s0, left(wolf)).state;
    const dawn = drive(game, s1, [deadline(2), deadline(3), deadline(4)]);
    expect(dawn.phase).toBe('dawn');
    expect(dawn.lastDawn).toEqual({ died: [], revealedRoles: {}, marked: null });
    expect(dawn.alive[wolf]).toBe(true); // disconnected, not dead
  });

  it('roleReveal and debate also complete via a leave', () => {
    const s0 = game.init('s', P5, CONTENT);
    let s = s0;
    for (const p of P5.slice(0, 4)) s = game.reduce(s, act(p, { kind: 'ackRole' })).state;
    expect(s.phase).toBe('roleReveal');
    s = game.reduce(s, left(P5[4]!, 5)).state;
    expect(s.phase).toBe('nightSeer');

    const debate = walkUntil(game, s, (x) => x.phase === 'debate');
    let d = debate;
    for (const p of P5.slice(0, 3)) d = game.reduce(d, act(p, { kind: 'readyToVote' })).state;
    expect(d.phase).toBe('debate'); // p4 still expected (p5 is away)
    d = game.reduce(d, left(P5[3]!, 6)).state;
    expect(d.phase).toBe('vote');
  });
});

describe('room collapse', () => {
  it('alive∧connected < 3 ends the match at the next win-check with zero scores', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const s1 = drive(game, s0, [left('p1', 1), left('p2', 2), left('p3', 3)]);
    expect(s1.phase === 'nightSeer' || s1.phase === 'nightWolves' || s1.phase === 'nightWitch').toBe(true);
    const dawn = walkUntil(game, s1, (s) => s.phase === 'dawn');
    const { state: over, effects } = game.reduce(dawn, deadline(50));
    expect(over.phase).toBe('over');
    expect(over.endReason).toBe('roomCollapsed');
    expect(over.winners).toBe('village'); // wolves were a strict minority
    expect(over.scores).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 });
    const fx = effects.find((e) => e.type === 'gameOver');
    if (fx === undefined || fx.type !== 'gameOver') throw new Error('expected gameOver effect');
    expect(fx.scores).toEqual(over.scores);
    expect(fx.scores).not.toBe(over.scores);
  });

  it('a passive half-empty room still rolls to over on deadlines alone', () => {
    const s0 = game.init('s', P5, CONTENT);
    const s1 = drive(game, s0, [left('p1', 1), left('p2', 2), left('p3', 3)]);
    const over = walkUntil(game, s1, (s) => s.phase === 'over');
    expect(over.endReason).toBe('roomCollapsed');
    expect(game.phaseDurationMs(over)).toBeNull();
  });
});
