import { describe, expect, it } from 'vitest';
import {
  choose,
  deadline,
  declare,
  DRINK_PACK,
  drink,
  fold,
  left,
  othersOf,
  PLAYERS,
  rejoin,
  TOD_PACK,
  tod,
  vote,
  walkToOver,
} from './helpers';

describe('disconnected players never block', () => {
  it('a voter who left before the claim is not expected: the other vote resolves alone', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const [v1, v2] = othersOf(s0);
    const s1 = fold(tod, s0, [choose(active, 'truth'), left(v2!), declare(active, 'done')]);
    expect(s1.phase).toBe('verdict');
    const view = tod.view(s1, v1!);
    if (view.phase !== 'verdict') throw new Error('expected verdict view');
    expect(view.votersExpected).toBe(1);
    const s2 = fold(tod, s1, [vote(v1!, 'done')]);
    expect(s2.phase).toBe('score');
    expect(s2.lastResult?.verdict).toBe('done');
  });

  it('a leave can COMPLETE the expected voter set (resolve with votes in)', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const [v1, v2] = othersOf(s0);
    const s1 = fold(tod, s0, [choose(active, 'truth'), declare(active, 'done'), vote(v1!, 'chickened')]);
    expect(s1.phase).toBe('verdict');
    const s2 = fold(tod, s1, [left(v2!)]);
    expect(s2.phase).toBe('score');
    // v1's lone vote decided it: 0/1 < 0.5 -> chickened
    expect(s2.lastResult?.verdict).toBe('chickened');
    expect(s2.lastResult?.tally).toEqual({ done: 0, chickened: 1 });
  });

  it('a leave that EMPTIES the eligible set resolves as done (benefit of the doubt)', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const [v1, v2] = othersOf(s0);
    const s1 = fold(tod, s0, [choose(active, 'truth'), declare(active, 'done'), left(v1!)]);
    expect(s1.phase).toBe('verdict'); // v2 still expected
    const s2 = fold(tod, s1, [left(v2!)]);
    expect(s2.phase).toBe('score');
    expect(s2.lastResult?.verdict).toBe('done');
    expect(s2.lastResult?.tally).toEqual({ done: 0, chickened: 0 });
    expect(s2.scores[active]).toBe(10);
  });

  it('an empty eligible set at verdict ENTRY resolves immediately (never strands)', () => {
    const s0 = tod.init('s', ['a', 'b'], TOD_PACK);
    const active = s0.activePlayer;
    const judge = s0.players.find((p) => p !== active)!;
    const s1 = fold(tod, s0, [choose(active, 'truth'), left(judge), declare(active, 'done')]);
    expect(s1.phase).toBe('score'); // never sat in verdict with zero possible voters
    expect(s1.lastResult?.verdict).toBe('done');
    expect(s1.scores[active]).toBe(10);
  });
});

describe('the active player leaving mid-turn', () => {
  it('during choose: turn is handed on, no reveal, no points, no pass spent', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const s1 = fold(tod, s0, [left(active)]);
    expect(s1.phase).toBe('choose');
    expect(s1.turnSeq).toBe(1);
    expect(s1.activePlayer).not.toBe(active);
    expect(s1.lastResult).toBeNull();
    expect(s1.scores[active]).toBe(0);
    expect(s1.passesLeft[active]).toBe(2);
  });

  it('during prompt: chickened, 0 points, no pass spent', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const s1 = fold(tod, s0, [choose(active, 'dare'), left(active)]);
    expect(s1.phase).toBe('score');
    expect(s1.lastResult?.verdict).toBe('chickened');
    expect(s1.lastResult?.pointsAwarded).toBe(0);
    expect(s1.passesLeft[active]).toBe(2);
  });

  it('drink, during prompt: dodged with NO forfeit drawn (never auto-assign alcohol)', () => {
    const s0 = drink.init('s', PLAYERS, DRINK_PACK);
    const usedBefore = s0.usedPromptIds.length;
    const s1 = fold(drink, s0, [left(s0.activePlayer)]);
    expect(s1.phase).toBe('score');
    expect(s1.lastResult?.verdict).toBe('chickened');
    expect(s1.lastResult?.forfeitText).toBeNull();
    expect(s1.usedPromptIds.length).toBe(usedBefore);
  });

  it('during verdict: the claim still stands — resolve with votes in', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const [v1] = othersOf(s0);
    const s1 = fold(tod, s0, [choose(active, 'truth'), declare(active, 'done'), vote(v1!, 'done'), left(active)]);
    expect(s1.phase).toBe('score');
    expect(s1.lastResult?.verdict).toBe('done');
    expect(s1.scores[active]).toBe(10);
  });
});

describe('rejoin semantics', () => {
  it('a rejoined voter is RE-EXPECTED: the verdict waits for them again', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const [v1, v2] = othersOf(s0);
    const s1 = fold(tod, s0, [choose(active, 'truth'), left(v2!), declare(active, 'done'), rejoin(v2!)]);
    expect(s1.phase).toBe('verdict');
    const s2 = fold(tod, s1, [vote(v1!, 'done')]);
    expect(s2.phase).toBe('verdict'); // v2 is expected again — not resolved yet
    const s3 = fold(tod, s2, [vote(v2!, 'done')]);
    expect(s3.phase).toBe('score');
    expect(s3.lastResult?.tally).toEqual({ done: 2, chickened: 0 });
  });

  it('a disconnected seat is skipped on turn entry; the rejoiner gets a later turn', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const next = s0.rotation[1]!;
    // next-up player disconnects during turn 0, which times out fully
    const s1 = fold(tod, s0, [left(next), deadline(1), deadline(2), deadline(3)]);
    expect(s1.phase).toBe('choose');
    expect(s1.activePlayer).toBe(s0.rotation[2]); // seat 1 skipped, not freed
    const s2 = fold(tod, s1, [rejoin(next)]);
    // walk on: the rejoiner must become active on a later turn
    let s = s2;
    let sawNext = false;
    for (let i = 0; i < 30 && s.phase !== 'over'; i++) {
      if (s.phase === 'choose' && s.activePlayer === next) { sawNext = true; break; }
      s = tod.reduce(s, deadline(10 + i)).state;
    }
    expect(sawNext).toBe(true);
  });

  it('presence no-ops return the SAME reference (already-connected rejoin, double leave, ghost)', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    expect(tod.reduce(s0, rejoin(PLAYERS[0]!)).state).toBe(s0);
    expect(tod.reduce(s0, left('ghost')).state).toBe(s0);
    expect(tod.reduce(s0, rejoin('__proto__')).state).toBe(s0);
    const s1 = fold(tod, s0, [left(othersOf(s0)[0]!)]);
    expect(tod.reduce(s1, left(othersOf(s0)[0]!)).state).toBe(s1);
  });

  it('leaves and rejoins never delete roster keys or wipe scores/passes', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const p = othersOf(s0)[0]!;
    const s1 = fold(tod, s0, [left(p), rejoin(p)]);
    expect(Object.keys(s1.scores).sort()).toEqual([...PLAYERS].sort());
    expect(Object.keys(s1.passesLeft).sort()).toEqual([...PLAYERS].sort());
    expect(s1.rotation).toEqual(s0.rotation);
  });
});

describe('a fully passive / abandoned room still ends', () => {
  it('everyone disconnected: deadlines alone roll the game to over', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const s1 = fold(tod, s0, PLAYERS.map((p, i) => left(p, i)));
    const { state } = walkToOver(tod, s1);
    expect(state.phase).toBe('over');
    expect(tod.phaseDurationMs(state)).toBeNull();
  });

  it('drink: everyone disconnected mid-game also reaches over', () => {
    const s0 = drink.init('s', PLAYERS, DRINK_PACK);
    const s1 = fold(drink, s0, PLAYERS.map((p, i) => left(p, i)));
    const { state } = walkToOver(drink, s1);
    expect(state.phase).toBe('over');
    expect(drink.phaseDurationMs(state)).toBeNull();
  });
});
