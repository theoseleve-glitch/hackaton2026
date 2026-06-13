import { describe, expect, it } from 'vitest';
import {
  createPerformJudge,
  DEVINE_L_ACTION_CONFIG,
  DEVINE_L_OBJET_CONFIG,
  DOUBLE_LE_MOUVEMENT_CONFIG,
  MIME_INVERSE_CONFIG,
} from '@bloop/game-perform-judge';
import { act, deadline, fold, left, makeContent, others, rate, vote, walkToOver } from './fixtures.js';

const guided = createPerformJudge('devine-l-action', DEVINE_L_ACTION_CONFIG);
const credit = createPerformJudge('devine-l-objet', DEVINE_L_OBJET_CONFIG);
const puppet = createPerformJudge('mime-inverse', MIME_INVERSE_CONFIG);
const rateMod = createPerformJudge('double-le-mouvement', DOUBLE_LE_MOUVEMENT_CONFIG);

const P3 = ['p1', 'p2', 'p3'];
const P4 = ['p1', 'p2', 'p3', 'p4'];
const P5 = ['p1', 'p2', 'p3', 'p4', 'p5'];

describe('guided scoring (devine-l-action §2.9 exact)', () => {
  function atVerdict() {
    const s0 = guided.init('s', P4, makeContent());
    return fold(guided, s0, [deadline(0), act(s0.performer, { kind: 'claimDone' }, 1)]);
  }

  it('réussi: performer +10, EVERY connected helper +5', () => {
    const s = atVerdict();
    const [h1, h2, h3] = others(s) as [string, string, string];
    const s2 = fold(guided, s, [vote(h1, 'yes', 2), vote(h2, 'yes', 3), vote(h3, 'no', 4)]);
    expect(s2.phase).toBe('reveal');
    expect(s2.lastResult?.outcome).toBe('success');
    expect(s2.lastResult?.tally).toEqual({ yes: 2, no: 1 });
    expect(s2.scores[s.performer]).toBe(10);
    expect(s2.scores[h1]).toBe(5);
    expect(s2.scores[h2]).toBe(5);
    expect(s2.scores[h3]).toBe(5); // cooperative: every connected helper, vote regardless
  });

  it('a disconnected helper earns nothing on réussi', () => {
    const s = atVerdict();
    const [h1, h2, h3] = others(s) as [string, string, string];
    const s2 = fold(guided, s, [vote(h1, 'yes', 2), left(h3, 3), vote(h2, 'yes', 4)]);
    expect(s2.phase).toBe('reveal'); // the leave shrank the expected set
    expect(s2.scores[h3]).toBe(0);
    expect(s2.scores[h1]).toBe(5);
    expect(s2.scores[s.performer]).toBe(10);
  });

  it('raté: majority no -> 0 for everyone', () => {
    const s = atVerdict();
    const [h1, h2, h3] = others(s) as [string, string, string];
    const s2 = fold(guided, s, [vote(h1, 'no', 2), vote(h2, 'no', 3), vote(h3, 'yes', 4)]);
    expect(s2.lastResult?.outcome).toBe('fail');
    expect(Object.values(s2.scores).every((n) => n === 0)).toBe(true);
  });

  it('ties and zero cast votes resolve réussi (benefit of the doubt)', () => {
    const s0 = guided.init('s', P3, makeContent());
    const s = fold(guided, s0, [deadline(0), act(s0.performer, { kind: 'claimDone' }, 1)]);
    const [h1, h2] = others(s) as [string, string];
    const tie = fold(guided, s, [vote(h1, 'yes', 2), vote(h2, 'no', 3)]);
    expect(tie.lastResult?.outcome).toBe('success');
    const zero = fold(guided, s, [deadline(9)]);
    expect(zero.lastResult?.outcome).toBe('success');
    expect(zero.scores[s.performer]).toBe(10);
  });

  it('pass -> performer +2, nothing for helpers', () => {
    const s0 = guided.init('s', P3, makeContent());
    const s = fold(guided, s0, [deadline(0), act(s0.performer, { kind: 'pass' }, 1)]);
    expect(s.lastResult?.outcome).toBe('passed');
    expect(s.scores[s0.performer]).toBe(2);
    expect(others(s).every((h) => s.scores[h] === 0)).toBe(true);
  });
});

describe('credit scoring (devine-l-objet §2.15 exact)', () => {
  /** ready deadline at t=1000 -> performStartedAt = 1000; mimeMs 45000 -> fast cutoff 23500. */
  function claimAt(at: number) {
    const s0 = credit.init('s', P4, makeContent());
    const s = fold(credit, s0, [deadline(1_000)]);
    const guesser = others(s)[0]!;
    return { s: fold(credit, s, [act(s.performer, { kind: 'claimFound', guesser }, at)]), guesser, performer: s.performer };
  }

  it('validated find: +10 performer AND +10 credited guesser', () => {
    const { s, guesser, performer } = claimAt(30_000); // second half: no fast bonus
    const voters = P4.filter((p) => p !== performer && p !== guesser);
    const s2 = fold(credit, s, [vote(voters[0]!, 'yes', 31_000), vote(voters[1]!, 'yes', 31_001)]);
    expect(s2.lastResult?.outcome).toBe('success');
    expect(s2.lastResult?.fast).toBe(false);
    expect(s2.scores[performer]).toBe(10);
    expect(s2.scores[guesser]).toBe(10);
    expect(voters.every((p) => s2.scores[p] === 0)).toBe(true); // validation votes are unscored
  });

  it('fast bonus: claim within the first half of the timer -> +15/+15', () => {
    const { s, guesser, performer } = claimAt(23_500); // 22500 elapsed = exactly half
    const s2 = fold(credit, s, [deadline(24_000)]); // zero votes -> valid
    expect(s2.lastResult?.fast).toBe(true);
    expect(s2.scores[performer]).toBe(15);
    expect(s2.scores[guesser]).toBe(15);
  });

  it('one tick past half the timer is no longer fast', () => {
    const { s } = claimAt(23_501);
    const s2 = fold(credit, s, [deadline(24_000)]);
    expect(s2.lastResult?.fast).toBe(false);
    expect(s2.lastResult?.points[s2.lastResult!.performer]).toBe(10);
  });

  it('contested: majority invalid -> 0/0', () => {
    const { s, guesser, performer } = claimAt(30_000);
    const voters = P4.filter((p) => p !== performer && p !== guesser);
    const s2 = fold(credit, s, [vote(voters[0]!, 'no', 31_000), vote(voters[1]!, 'no', 31_001)]);
    expect(s2.lastResult?.outcome).toBe('contested');
    expect(Object.values(s2.scores).every((n) => n === 0)).toBe(true);
  });

  it('validation ties resolve valid', () => {
    const { s, guesser, performer } = claimAt(30_000);
    const voters = P4.filter((p) => p !== performer && p !== guesser);
    const s2 = fold(credit, s, [vote(voters[0]!, 'yes', 31_000), vote(voters[1]!, 'no', 31_001)]);
    expect(s2.lastResult?.outcome).toBe('success');
  });

  it('an emptied validator set auto-validates', () => {
    const s0 = credit.init('s', P3, makeContent());
    const s = fold(credit, s0, [deadline(1_000)]);
    const guesser = others(s)[0]!;
    const lone = others(s)[1]!; // the only eligible validator in a 3-player room
    const s2 = fold(credit, s, [act(s.performer, { kind: 'claimFound', guesser }, 2_000), left(lone, 3_000)]);
    expect(s2.phase).toBe('reveal');
    expect(s2.lastResult?.outcome).toBe('success');
    expect(s2.scores[s.performer]).toBe(15); // claim at 2000 was fast
  });
});

describe('puppet scoring (mime-inverse §2.13 exact)', () => {
  it('success-early: puppet +100 +50 speed, EVERY connected commander +50', () => {
    const s = puppet.init('s', P5, makeContent());
    const cs = others(s); // 4 commanders, goal 3
    const s2 = fold(puppet, s, [
      act(cs[0]!, { kind: 'tap' }, 1), act(cs[1]!, { kind: 'tap' }, 2), act(cs[2]!, { kind: 'tap' }, 3),
    ]);
    expect(s2.lastResult?.outcome).toBe('success-early');
    expect(s2.scores[s.performer]).toBe(150);
    for (const c of cs) expect(s2.scores[c]).toBe(50); // including the non-tapper
  });

  it('verdict success: puppet +100 (no speed bonus), commanders +50', () => {
    const s = puppet.init('s', P3, makeContent());
    const [c1, c2] = others(s) as [string, string];
    const s2 = fold(puppet, s, [deadline(1), vote(c1, 'yes', 2), vote(c2, 'no', 3)]);
    expect(s2.lastResult?.outcome).toBe('success'); // 1/2 >= 0.5, ties generous
    expect(s2.scores[s.performer]).toBe(100);
    expect(s2.scores[c1]).toBe(50);
    expect(s2.scores[c2]).toBe(50);
  });

  it('zero votes cast at the verdict deadline -> fail (puppet is not zeroVotesSucceed)', () => {
    const s = puppet.init('s', P3, makeContent());
    const s2 = fold(puppet, s, [deadline(1), deadline(2)]);
    expect(s2.lastResult?.outcome).toBe('fail');
    expect(Object.values(s2.scores).every((n) => n === 0)).toBe(true);
  });

  it('an empty commander set with no taps voids the turn', () => {
    const s = puppet.init('s', P3, makeContent());
    const [c1, c2] = others(s) as [string, string];
    const s2 = fold(puppet, s, [left(c1, 1), left(c2, 2), deadline(3)]);
    expect(s2.phase).toBe('reveal');
    expect(s2.lastResult?.outcome).toBe('void');
    expect(Object.values(s2.scores).every((n) => n === 0)).toBe(true);
  });
});

describe('rate scoring (double-le-mouvement §2.12 exact)', () => {
  function atRate() {
    const s0 = rateMod.init('s', P4, makeContent());
    const s = fold(rateMod, s0, [deadline(0), deadline(1)]);
    const raters = P4.filter((p) => p !== s.performer && p !== s.partner);
    return { s, raters, mover: s.performer, dubber: s.partner! };
  }

  it('stars 4 and 5 -> avg 4.5 -> round(4.5 × 20) = 90 to BOTH crew members', () => {
    const { s, raters, mover, dubber } = atRate();
    const s2 = fold(rateMod, s, [rate(raters[0]!, 4, 2), rate(raters[1]!, 5, 3)]);
    expect(s2.lastResult?.stars).toEqual({ avg: 4.5, cast: 2, ovation: false });
    expect(s2.scores[mover]).toBe(90);
    expect(s2.scores[dubber]).toBe(90);
    expect(raters.every((p) => s2.scores[p] === 0)).toBe(true); // rating earns nothing
  });

  it('unanimous 5★ with >= 2 ballots: ovation, 100 + 25 each', () => {
    const { s, raters, mover, dubber } = atRate();
    const s2 = fold(rateMod, s, [rate(raters[0]!, 5, 2), rate(raters[1]!, 5, 3)]);
    expect(s2.lastResult?.stars).toEqual({ avg: 5, cast: 2, ovation: true });
    expect(s2.scores[mover]).toBe(125);
    expect(s2.scores[dubber]).toBe(125);
  });

  it('a single 5★ ballot is not an ovation', () => {
    const { s, raters, mover } = atRate();
    const s2 = fold(rateMod, s, [rate(raters[0]!, 5, 2), left(raters[1]!, 3)]);
    expect(s2.phase).toBe('reveal'); // the leave completed the expected set
    expect(s2.lastResult?.stars).toEqual({ avg: 5, cast: 1, ovation: false });
    expect(s2.scores[mover]).toBe(100);
  });

  it('zero ballots default to 3.0 stars -> 60 each', () => {
    const { s, mover, dubber } = atRate();
    const s2 = fold(rateMod, s, [deadline(9)]);
    expect(s2.lastResult?.stars).toEqual({ avg: 3, cast: 0, ovation: false });
    expect(s2.scores[mover]).toBe(60);
    expect(s2.scores[dubber]).toBe(60);
  });
});

describe('gameOver effect', () => {
  it('emits CLONED scores covering the full roster', () => {
    const init = guided.init('s', P3, makeContent(40));
    const { state, effects } = walkToOver(guided, init);
    const over = effects.find((e) => e.type === 'gameOver');
    if (over === undefined || over.type !== 'gameOver') throw new Error('expected gameOver');
    expect(over.scores).not.toBe(state.scores); // never alias live state
    expect(over.scores).toEqual(state.scores);
    for (const p of P3) expect(typeof over.scores[p]).toBe('number');
  });

  it('handles a __proto__ roster id end to end without corruption', () => {
    const weird = ['__proto__', 'p2', 'p3'];
    const m = createPerformJudge('devine-l-action', DEVINE_L_ACTION_CONFIG);
    let s = m.init('s', weird, makeContent());
    s = fold(m, s, [deadline(0), act(s.performer, { kind: 'claimDone' }, 1)]);
    const [h1, h2] = others(s) as [string, string];
    s = fold(m, s, [vote(h1, 'yes', 2), vote(h2, 'yes', 3)]);
    expect(s.scores[s.lastResult!.performer]).toBe(10);
    expect(s.scores[h1]).toBe(5);
    const { state, effects } = walkToOver(m, s);
    expect(state.phase).toBe('over');
    expect(effects.filter((e) => e.type === 'gameOver')).toHaveLength(1);
    expect(Object.keys(state.scores).sort()).toEqual([...weird].sort());
  });
});
