import { describe, expect, it } from 'vitest';
import type { Effect } from '@bloop/engine';
import { createTruthDare, TRUTH_OR_DARE_2_CONFIG } from '@bloop/game-truth-dare';
import {
  choose,
  deadline,
  declare,
  DRINK_PACK,
  drink,
  fold,
  othersOf,
  pass,
  PLAYERS,
  TOD_PACK,
  tod,
  vote,
  walkToOver,
} from './helpers';

const PLAYERS4 = ['p1', 'p2', 'p3', 'p4'];

/** Run one full claimed-done turn for the current active player with the given votes. */
function turnWithVotes(seed: string, choice: 'truth' | 'dare', votes: Array<'done' | 'chickened'>) {
  const module = createTruthDare('truth-or-dare-2', TRUTH_OR_DARE_2_CONFIG);
  const players = votes.length > 2 ? PLAYERS4 : PLAYERS;
  const s0 = module.init(seed, players, TOD_PACK);
  const active = s0.activePlayer;
  const voters = othersOf(s0);
  const events = [choose(active, choice), declare(active, 'done'), ...votes.map((v, i) => vote(voters[i]!, v, i))];
  return { state: fold(module, s0, events), active, voters };
}

describe('EXACT scoring (wave2 §2.7 — active player only, voters never score)', () => {
  it('verdicted done + truth = 10 (donePoints)', () => {
    const { state, active } = turnWithVotes('s', 'truth', ['done', 'done']);
    expect(state.lastResult?.pointsAwarded).toBe(10);
    expect(state.scores[active]).toBe(10);
  });

  it('verdicted done + dare = 15 (10 donePoints + 5 dareBonus)', () => {
    const { state, active } = turnWithVotes('s', 'dare', ['done', 'done']);
    expect(state.lastResult?.pointsAwarded).toBe(15);
    expect(state.scores[active]).toBe(15);
  });

  it('a 1–1 tie resolves to done (>= 0.5 threshold)', () => {
    const { state } = turnWithVotes('s', 'truth', ['done', 'chickened']);
    expect(state.lastResult?.verdict).toBe('done');
    expect(state.lastResult?.tally).toEqual({ done: 1, chickened: 1 });
    expect(state.lastResult?.pointsAwarded).toBe(10);
  });

  it('a chicken majority overturns the claim: 1 done vs 2 chickened = 0', () => {
    const { state, active } = turnWithVotes('s4', 'dare', ['done', 'chickened', 'chickened']);
    expect(state.lastResult?.verdict).toBe('chickened');
    expect(state.lastResult?.pointsAwarded).toBe(0);
    expect(state.scores[active]).toBe(0);
  });

  it('verdict deadline with ZERO votes cast resolves done (benefit of the doubt)', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const s1 = fold(tod, s0, [choose(active, 'truth'), declare(active, 'done'), deadline(1)]);
    expect(s1.phase).toBe('score');
    expect(s1.lastResult?.verdict).toBe('done');
    expect(s1.lastResult?.tally).toEqual({ done: 0, chickened: 0 });
    expect(s1.scores[active]).toBe(10);
  });

  it('verdict deadline tallies only the votes in; abstainers are excluded', () => {
    const m = createTruthDare('truth-or-dare-2', TRUTH_OR_DARE_2_CONFIG);
    const s0 = m.init('s4', PLAYERS4, TOD_PACK);
    const active = s0.activePlayer;
    const [v1] = othersOf(s0);
    const s1 = fold(m, s0, [choose(active, 'truth'), declare(active, 'done'), vote(v1!, 'chickened'), deadline(1)]);
    expect(s1.phase).toBe('score');
    // 0 done of 1 cast -> chickened; the two silent voters never count
    expect(s1.lastResult?.verdict).toBe('chickened');
    expect(s1.lastResult?.tally).toEqual({ done: 0, chickened: 1 });
    expect(s1.scores[active]).toBe(0);
  });

  it('pass = 3 (passPoints) and consumes exactly one pass; the economy runs dry', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const s1 = fold(tod, s0, [choose(active, 'dare'), pass(active)]);
    expect(s1.lastResult?.pointsAwarded).toBe(3);
    expect(s1.passesLeft[active]).toBe(1);
    // burn the second pass on the player's next turn, then the third is rejected
    let s = s1;
    for (let guard = 0; guard < 40 && !(s.phase === 'choose' && s.activePlayer === active); guard++) {
      s = tod.reduce(s, deadline(100 + guard)).state;
    }
    expect(s.phase).toBe('choose');
    const s2 = fold(tod, s, [choose(active, 'dare'), pass(active)]);
    expect(s2.passesLeft[active]).toBe(0);
    expect(s2.scores[active]).toBe(6); // 3 + 3
    let s3 = s2;
    for (let guard = 0; guard < 40 && !(s3.phase === 'choose' && s3.activePlayer === active); guard++) {
      s3 = tod.reduce(s3, deadline(200 + guard)).state;
    }
    const s4 = fold(tod, s3, [choose(active, 'dare')]);
    expect(tod.reduce(s4, pass(active)).state).toBe(s4); // no passes left -> same reference
  });

  it('self-declared chicken = 0, skips the verdict entirely', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const s1 = fold(tod, s0, [choose(active, 'dare'), declare(active, 'chickened')]);
    expect(s1.phase).toBe('score');
    expect(s1.lastResult?.verdict).toBe('chickened');
    expect(s1.lastResult?.pointsAwarded).toBe(0);
  });

  it('voters NEVER score — only the active player moves', () => {
    const { state, active, voters } = turnWithVotes('s', 'dare', ['done', 'done']);
    expect(state.scores[active]).toBe(15);
    for (const v of voters) expect(state.scores[v]).toBe(0);
  });
});

describe('truth-or-drink scoring (wave2 §2.8)', () => {
  it('verdicted real answer = 10, no dare bonus exists', () => {
    const s0 = drink.init('s', PLAYERS, DRINK_PACK);
    const active = s0.activePlayer;
    const [v1, v2] = othersOf(s0);
    const s1 = fold(drink, s0, [declare(active, 'done'), vote(v1!, 'done'), vote(v2!, 'done')]);
    expect(s1.lastResult?.pointsAwarded).toBe(10);
    expect(s1.scores[active]).toBe(10);
  });

  it('drink/forfeit taken = 3 and the forfeit card is shown', () => {
    const s0 = drink.init('s', PLAYERS, DRINK_PACK);
    const s1 = fold(drink, s0, [pass(s0.activePlayer)]);
    expect(s1.lastResult?.verdict).toBe('passed');
    expect(s1.lastResult?.pointsAwarded).toBe(3);
    expect(s1.lastResult?.forfeitText).not.toBeNull();
  });

  it('dodged (verdicted down) = 0', () => {
    const s0 = drink.init('s', PLAYERS, DRINK_PACK);
    const active = s0.activePlayer;
    const [v1, v2] = othersOf(s0);
    const s1 = fold(drink, s0, [declare(active, 'done'), vote(v1!, 'chickened'), vote(v2!, 'chickened')]);
    expect(s1.lastResult?.verdict).toBe('chickened');
    expect(s1.scores[active]).toBe(0);
  });
});

describe('2-player rooms (single judge)', () => {
  const pair = ['a', 'b'];

  it('the lone judge decides: done -> 10, chickened -> 0, abstain -> done', () => {
    const s0 = tod.init('2p', pair, TOD_PACK);
    const active = s0.activePlayer;
    const judge = pair.find((p) => p !== active)!;
    const claimed = fold(tod, s0, [choose(active, 'truth'), declare(active, 'done')]);

    const sDone = fold(tod, claimed, [vote(judge, 'done')]);
    expect(sDone.scores[active]).toBe(10);

    const sChick = fold(tod, claimed, [vote(judge, 'chickened')]);
    expect(sChick.lastResult?.verdict).toBe('chickened');
    expect(sChick.scores[active]).toBe(0);

    const sAbstain = fold(tod, claimed, [deadline(1)]);
    expect(sAbstain.lastResult?.verdict).toBe('done');
    expect(sAbstain.scores[active]).toBe(10);
  });

  it('scores accumulate across laps: 2 players x 2 laps of verdicted truths = 20 each', () => {
    const m = drink; // totalRounds 2, truth-only — 4 turns total
    let s = m.init('2p', pair, DRINK_PACK);
    let guard = 0;
    while (s.phase !== 'over' && guard < 40) {
      guard += 1;
      if (s.phase === 'prompt') {
        s = fold(m, s, [declare(s.activePlayer, 'done', guard)]);
      } else if (s.phase === 'verdict') {
        const judge = pair.find((p) => p !== s.activePlayer)!;
        s = fold(m, s, [vote(judge, 'done', guard)]);
      } else {
        s = m.reduce(s, deadline(guard)).state;
      }
    }
    expect(s.phase).toBe('over');
    expect(s.scores['a']).toBe(20);
    expect(s.scores['b']).toBe(20);
  });
});

describe('gameOver effect (cloned scores)', () => {
  it('carries the final scores as a CLONE, never aliasing live state', () => {
    const { state, effects } = walkToOver(tod, tod.init('s', PLAYERS, TOD_PACK));
    const go = effects.find((e): e is Extract<Effect, { type: 'gameOver' }> => e.type === 'gameOver');
    expect(go).toBeDefined();
    expect(go!.scores).toEqual(state.scores);
    expect(go!.scores).not.toBe(state.scores);
    // mutating the effect payload must not touch state
    go!.scores[PLAYERS[0]!] = 999;
    expect(state.scores[PLAYERS[0]!]).not.toBe(999);
  });

  it('drink emits exactly one gameOver, on the final lap wrap', () => {
    const { effects } = walkToOver(drink, drink.init('s', PLAYERS, DRINK_PACK));
    expect(effects.filter((e) => e.type === 'gameOver')).toHaveLength(1);
  });
});
