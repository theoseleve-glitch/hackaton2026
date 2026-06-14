import { describe, expect, it } from 'vitest';
import type { Effect } from '@bloop/engine';
import { createTruthDare, TRUTH_OR_DARE_2_CONFIG, TRUTH_OR_DRINK_CONFIG } from '@bloop/game-truth-dare';
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
  predict,
  react,
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

describe('CC-1 spectator scoring (call your shot resolves at score)', () => {
  const PLAYERS4 = ['p1', 'p2', 'p3', 'p4'];

  it('correct predictors earn +2 each; wrong ones earn 0; the active player is unaffected', () => {
    const m = createTruthDare('truth-or-dare-2', TRUTH_OR_DARE_2_CONFIG);
    const s0 = m.init('s4', PLAYERS4, TOD_PACK);
    const active = s0.activePlayer;
    const [v1, v2, v3] = othersOf(s0);
    // v1+v2 call 'done', v3 calls 'chickened'; the room then verdicts DONE.
    const sScore = fold(m, s0, [
      choose(active, 'truth'),
      predict(v1!, 'done'), predict(v2!, 'done'), predict(v3!, 'chickened'),
      declare(active, 'done'),
      vote(v1!, 'done'), vote(v2!, 'done'), vote(v3!, 'done'),
    ]);
    expect(sScore.phase).toBe('score');
    expect(sScore.lastResult?.verdict).toBe('done');
    expect(sScore.scores[active]).toBe(10); // active scoring unchanged by predictions
    expect(sScore.scores[v1!]).toBe(2); // correct call
    expect(sScore.scores[v2!]).toBe(2); // correct call
    expect(sScore.scores[v3!]).toBe(0); // wrong call
    // counts-only spectator tally — no names
    expect(sScore.lastResult?.spectatorTally).toEqual({ correct: 2, total: 3, pointsEach: 2 });
  });

  it("a 'chickened' verdict rewards the spectators who called the bottle, not the believers", () => {
    const m = createTruthDare('truth-or-dare-2', TRUTH_OR_DARE_2_CONFIG);
    const s0 = m.init('s4', PLAYERS4, TOD_PACK);
    const active = s0.activePlayer;
    const [v1, v2, v3] = othersOf(s0);
    const sScore = fold(m, s0, [
      choose(active, 'truth'),
      predict(v1!, 'chickened'), predict(v2!, 'done'), predict(v3!, 'chickened'),
      declare(active, 'done'),
      vote(v1!, 'chickened'), vote(v2!, 'chickened'), vote(v3!, 'chickened'), // overturned -> chickened
    ]);
    expect(sScore.lastResult?.verdict).toBe('chickened');
    expect(sScore.scores[active]).toBe(0);
    expect(sScore.scores[v1!]).toBe(2); // called the bottle
    expect(sScore.scores[v2!]).toBe(0); // believed, wrong
    expect(sScore.scores[v3!]).toBe(2); // called the bottle
    expect(sScore.lastResult?.spectatorTally).toEqual({ correct: 2, total: 3, pointsEach: 2 });
  });

  it("an escape ('passed') counts as 'did not complete': a 'chickened' prediction wins", () => {
    const s0 = drink.init('s', PLAYERS, DRINK_PACK);
    const active = s0.activePlayer;
    const [v1, v2] = othersOf(s0);
    // v1 calls the escape (chickened), v2 believes (done); the active player drinks.
    const sScore = fold(drink, s0, [
      predict(v1!, 'chickened'), predict(v2!, 'done'),
      pass(active),
    ]);
    expect(sScore.phase).toBe('score');
    expect(sScore.lastResult?.verdict).toBe('passed');
    expect(sScore.scores[active]).toBe(3); // the escape's own points, unchanged
    expect(sScore.scores[v1!]).toBe(2); // called the dodge
    expect(sScore.scores[v2!]).toBe(0); // believed, wrong
    expect(sScore.lastResult?.spectatorTally).toEqual({ correct: 1, total: 2, pointsEach: 2 });
  });

  it('no predictions placed -> a zeroed spectator tally, no spectator ever moves', () => {
    const { state, voters } = turnWithVotes('s', 'truth', ['done', 'done']);
    expect(state.lastResult?.spectatorTally).toEqual({ correct: 0, total: 0, pointsEach: 2 });
    for (const v of voters) expect(state.scores[v]).toBe(0);
  });

  it('a correct prediction on a deadline-timeout (chickened) turn still pays at score', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const [v1, v2] = othersOf(s0);
    // both call the bottle, then the active player times out (= chickened).
    const sScore = fold(tod, s0, [
      choose(active, 'dare'),
      predict(v1!, 'chickened'), predict(v2!, 'chickened'),
      deadline(1),
    ]);
    expect(sScore.phase).toBe('score');
    expect(sScore.lastResult?.verdict).toBe('chickened');
    expect(sScore.scores[v1!]).toBe(2);
    expect(sScore.scores[v2!]).toBe(2);
    expect(sScore.lastResult?.spectatorTally).toEqual({ correct: 2, total: 2, pointsEach: 2 });
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

describe('CC-2 P1-1 tier-weighted done points (default identity)', () => {
  // soft+party fun deck, ascending tier bonus. Draw plays the highest ALLOWED
  // tier first, so a single-tier config pins the drawn intensity deterministically.
  const TIER_BONUS = { soft: 0, party: 3, spicy: 6 } as const;
  const softOnly = createTruthDare('truth-or-dare-2', {
    ...TRUTH_OR_DARE_2_CONFIG, allowedIntensities: ['soft'], tierBonus: TIER_BONUS,
  });
  const partyOnly = createTruthDare('truth-or-dare-2', {
    ...TRUTH_OR_DARE_2_CONFIG, allowedIntensities: ['party'], tierBonus: TIER_BONUS,
  });
  // spicy lives on the lover deck; party+spicy, draw plays spicy first.
  const spicyTop = createTruthDare('truth-or-dare-2', {
    ...TRUTH_OR_DARE_2_CONFIG, allowedIntensities: ['party', 'spicy'], deck: 'lover', tierBonus: TIER_BONUS,
  });

  function doneTruth(module: ReturnType<typeof createTruthDare>) {
    const s0 = module.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const [v1, v2] = othersOf(s0);
    const s = fold(module, s0, [choose(active, 'truth'), declare(active, 'done'), vote(v1!, 'done'), vote(v2!, 'done')]);
    return s;
  }

  it('a verdicted-done TRUTH is weighted by tier: soft 10, party 13, spicy 16', () => {
    expect(doneTruth(softOnly).lastResult).toMatchObject({ intensity: 'soft', pointsAwarded: 10 });
    expect(doneTruth(partyOnly).lastResult).toMatchObject({ intensity: 'party', pointsAwarded: 13 });
    expect(doneTruth(spicyTop).lastResult).toMatchObject({ intensity: 'spicy', pointsAwarded: 16 });
  });

  it('the tier bonus STACKS on the dare bonus: party dare = 10 + 5 + 3 = 18', () => {
    const s0 = partyOnly.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const [v1, v2] = othersOf(s0);
    const s = fold(partyOnly, s0, [choose(active, 'dare'), declare(active, 'done'), vote(v1!, 'done'), vote(v2!, 'done')]);
    expect(s.lastResult).toMatchObject({ choice: 'dare', intensity: 'party', pointsAwarded: 18 });
    expect(s.scores[active]).toBe(18);
  });

  it('pass and chicken are NEVER tier-weighted (flat 3 / 0 regardless of tier)', () => {
    // a pass on a spicy turn is still exactly passPoints
    const sp0 = spicyTop.init('s', PLAYERS, TOD_PACK);
    const sp = fold(spicyTop, sp0, [choose(sp0.activePlayer, 'dare'), pass(sp0.activePlayer)]);
    expect(sp.lastResult).toMatchObject({ intensity: 'spicy', verdict: 'passed', pointsAwarded: 3 });
    // a self-chicken on a spicy turn is still 0
    const sc0 = spicyTop.init('s2', PLAYERS, TOD_PACK);
    const sc = fold(spicyTop, sc0, [choose(sc0.activePlayer, 'dare'), declare(sc0.activePlayer, 'chickened')]);
    expect(sc.lastResult).toMatchObject({ intensity: 'spicy', verdict: 'chickened', pointsAwarded: 0 });
  });

  it('DEFAULT identity: the shipped FUN config (all-zero tierBonus) is byte-unchanged at 10/15', () => {
    expect(TRUTH_OR_DARE_2_CONFIG.tierBonus).toEqual({ soft: 0, party: 0, spicy: 0 });
    const { state, active } = turnWithVotes('s', 'truth', ['done', 'done']);
    expect(state.scores[active]).toBe(10); // not 13 — default map adds nothing
    const dare = turnWithVotes('s', 'dare', ['done', 'done']);
    expect(dare.state.scores[dare.active]).toBe(15); // not 18
  });
});

describe('CC-5 P1-2 drama tags (derived from the public verdict tally)', () => {
  it('a close split (1 done / 1 chickened) tags contested', () => {
    const { state } = turnWithVotes('s', 'truth', ['done', 'chickened']);
    expect(state.lastResult?.verdict).toBe('done'); // tie -> done
    expect(state.lastResult?.tally).toEqual({ done: 1, chickened: 1 });
    expect(state.lastResult?.dramaTag).toBe('contested');
  });

  it('a 2 done / 1 chickened split (margin 1) also tags contested', () => {
    const { state } = turnWithVotes('s4', 'dare', ['done', 'done', 'chickened']);
    expect(state.lastResult?.tally).toEqual({ done: 2, chickened: 1 });
    expect(state.lastResult?.dramaTag).toBe('contested');
  });

  it('a 1 done / 2 chickened split (margin 1) is contested, NOT a unanimous roast', () => {
    const { state } = turnWithVotes('s4', 'dare', ['done', 'chickened', 'chickened']);
    expect(state.lastResult?.verdict).toBe('chickened');
    expect(state.lastResult?.tally).toEqual({ done: 1, chickened: 2 });
    expect(state.lastResult?.dramaTag).toBe('contested'); // close > roast
  });

  it('a unanimous-against roast (0 done / 3 chickened) tags roasted', () => {
    const { state } = turnWithVotes('s4', 'dare', ['chickened', 'chickened', 'chickened']);
    expect(state.lastResult?.verdict).toBe('chickened');
    expect(state.lastResult?.tally).toEqual({ done: 0, chickened: 3 });
    expect(state.lastResult?.dramaTag).toBe('roasted');
  });

  it('a clear unanimous done (2-0) carries NO tag', () => {
    const { state } = turnWithVotes('s', 'truth', ['done', 'done']);
    expect(state.lastResult?.tally).toEqual({ done: 2, chickened: 0 });
    expect(state.lastResult?.dramaTag).toBeNull();
  });

  it('a unanimous chicken (0 done / 2 chickened) is roasted, not contested', () => {
    const { state } = turnWithVotes('s4', 'dare', ['chickened', 'chickened']);
    expect(state.lastResult?.tally).toEqual({ done: 0, chickened: 2 });
    expect(state.lastResult?.dramaTag).toBe('roasted');
  });

  it('zero votes cast (benefit of the doubt done) carries NO tag', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const s1 = fold(tod, s0, [choose(active, 'truth'), declare(active, 'done'), deadline(1)]);
    expect(s1.lastResult?.tally).toEqual({ done: 0, chickened: 0 });
    expect(s1.lastResult?.dramaTag).toBeNull();
  });

  it('an escape (passed) never carries a drama tag', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const s1 = fold(tod, s0, [choose(s0.activePlayer, 'dare'), pass(s0.activePlayer)]);
    expect(s1.lastResult?.verdict).toBe('passed');
    expect(s1.lastResult?.dramaTag).toBeNull();
  });

  it('a self-declared chicken (skips the vote) carries NO tag (no contested vote)', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const s1 = fold(tod, s0, [choose(s0.activePlayer, 'dare'), declare(s0.activePlayer, 'chickened')]);
    expect(s1.lastResult?.verdict).toBe('chickened');
    expect(s1.lastResult?.tally).toEqual({ done: 0, chickened: 0 });
    expect(s1.lastResult?.dramaTag).toBeNull();
  });
});

describe('CC-4 P1-3 escape-react beat (non-scoring, counts-only)', () => {
  const reactTod = createTruthDare('truth-or-dare-2', { ...TRUTH_OR_DARE_2_CONFIG, reactOnEscape: true });
  const reactDrink = createTruthDare('truth-or-drink', { ...TRUTH_OR_DRINK_CONFIG, reactOnEscape: true });

  it('spectators react during the escape reveal; public per-enum counts accumulate, nobody scores', () => {
    const s0 = reactTod.init('s4', PLAYERS4, TOD_PACK);
    const active = s0.activePlayer;
    const [v1, v2, v3] = othersOf(s0);
    // self-declared chicken -> score, beat live.
    const sScore = fold(reactTod, s0, [choose(active, 'dare'), declare(active, 'chickened')]);
    expect(sScore.phase).toBe('score');
    const before = { ...sScore.scores };
    const sReacted = fold(reactTod, sScore, [react(v1!, 'coward'), react(v2!, 'coward'), react(v3!, 'respect')]);
    // counts-only public aggregate, no names
    expect(sReacted.lastResult?.reactions).toEqual({ ouch: 0, respect: 1, coward: 2 });
    const v = reactTod.view(sReacted, 'p-spectator-outsider');
    if (v.phase !== 'score') throw new Error('expected score view');
    expect(v.reactionCounts).toEqual({ ouch: 0, respect: 1, coward: 2 });
    // NON-SCORING: not a single score moved from the react
    expect(sReacted.scores).toEqual(before);
  });

  it('a react NEVER resolves the turn: score still advances only on its own deadline', () => {
    const s0 = reactTod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const [v1] = othersOf(s0);
    const sScore = fold(reactTod, s0, [choose(active, 'dare'), declare(active, 'chickened')]);
    const sReacted = fold(reactTod, sScore, [react(v1!, 'ouch')]);
    expect(sReacted.phase).toBe('score'); // still score — the react did not advance
    expect(reactTod.phaseKey(sReacted)).toBe(reactTod.phaseKey(sScore));
    // only the deadline advances the reveal
    const sNext = reactTod.reduce(sReacted, deadline(1)).state;
    expect(sNext.phase).not.toBe('score');
  });

  it('the escape react beat fires on a drink escape too (counts-only, non-scoring)', () => {
    const s0 = reactDrink.init('s', PLAYERS, DRINK_PACK);
    const active = s0.activePlayer;
    const [v1, v2] = othersOf(s0);
    const sScore = fold(reactDrink, s0, [pass(active)]); // drink escape
    expect(sScore.lastResult?.verdict).toBe('passed');
    const sReacted = fold(reactDrink, sScore, [react(v1!, 'respect'), react(v2!, 'coward')]);
    expect(sReacted.lastResult?.reactions).toEqual({ ouch: 0, respect: 1, coward: 1 });
    expect(sReacted.scores[v1!]).toBe(0);
    expect(sReacted.scores[v2!]).toBe(0);
  });

  it('reject-invalid is SAME-REFERENCE: duplicate, active player, disconnected, bad enum, beat-off', () => {
    const s0 = reactTod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const [v1, v2] = othersOf(s0);
    const sScore = fold(reactTod, s0, [choose(active, 'dare'), declare(active, 'chickened')]);
    // the active player never reacts to their own escape
    expect(reactTod.reduce(sScore, react(active, 'ouch')).state).toBe(sScore);
    // bad enum
    expect(reactTod.reduce(sScore, react(v1!, 'nope' as never)).state).toBe(sScore);
    // non-roster / hostile
    expect(reactTod.reduce(sScore, react('ghost', 'ouch')).state).toBe(sScore);
    expect(reactTod.reduce(sScore, react('__proto__', 'ouch')).state).toBe(sScore);
    // first react locks: a re-react is same-ref
    const sBet = fold(reactTod, sScore, [react(v1!, 'ouch')]);
    expect(reactTod.reduce(sBet, react(v1!, 'coward')).state).toBe(sBet);
    // disconnected spectator is ineligible
    const sLeft = reactTod.reduce(sScore, { type: 'playerLeft', playerId: v2!, at: 1 }).state;
    expect(reactTod.reduce(sLeft, react(v2!, 'ouch')).state).toBe(sLeft);
    // beat OFF on the shipped config: react is always a no-op even at an escape score
    const off0 = tod.init('s', PLAYERS, TOD_PACK);
    const offScore = fold(tod, off0, [choose(off0.activePlayer, 'dare'), declare(off0.activePlayer, 'chickened')]);
    expect(offScore.phase).toBe('score');
    expect(tod.reduce(offScore, react(othersOf(offScore)[0]!, 'ouch')).state).toBe(offScore);
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
