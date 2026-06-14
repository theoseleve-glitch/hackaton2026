import { describe, expect, it } from 'vitest';
import {
  CINQUANTE_CINQUANTE_CONFIG,
  createInputGuess,
  QUIZZ_CULTURE_GE_CONFIG,
  type ClosestNumberConfig,
  type CrowdTargetConfig,
  type InputGuessState,
} from '@bloop/game-input-guess';
import {
  cardIndexOf, crowdContent, crowdItem, guess, numberContent, numberItemOf, pick,
} from './fixtures.js';

const players = ['p1', 'p2', 'p3'];

// ===========================================================================
// CC-2 — "on fire" streak. DEFAULT-IDENTITY: with no streakBonus configured the
// streak counter advances but adds ZERO points (existing exact-score tests are
// proof; here we re-prove it locally and then test an opt-in bonus config).
// ===========================================================================

describe('CC-2 streak (closest-number) — counter advances, default bonus is identity', () => {
  const quizz = createInputGuess('quizz-culture-ge', QUIZZ_CULTURE_GE_CONFIG);
  const content = numberContent(4);

  /** Play one round: everyone guesses `byPlayer[p]` (absent => no guess), resolve. */
  function playRound(s0: InputGuessState, byPlayer: Record<string, number>): InputGuessState {
    let s = s0;
    for (const [p, v] of Object.entries(byPlayer)) s = quizz.reduce(s, guess(p, v)).state;
    if (s.phase !== 'reveal') s = quizz.reduce(s, { type: 'deadline', at: 0 }).state;
    return s;
  }
  /** Advance reveal -> next guess. */
  function nextRound(s: InputGuessState): InputGuessState {
    return quizz.reduce(s, { type: 'deadline', at: 1 }).state;
  }

  it('a top-2 finish increments the streak; a non-top finish resets it to 0', () => {
    const s0 = quizz.init('streak-seed', players, content);
    const a0 = numberItemOf(s0, 0).answer;
    // round 0: p1 closest, p2 second, p3 worst (3rd of 3 => NOT top-2)
    let s = playRound(s0, { p1: a0 + 1, p2: a0 + 5, p3: a0 + 99 });
    if (s.lastResult?.kind !== 'closest-number') throw new Error('expected closest');
    expect(s.lastResult.streak).toMatchObject({ p1: 1, p2: 1, p3: 0 });
    expect(s.streak).toMatchObject({ p1: 1, p2: 1, p3: 0 });

    s = nextRound(s);
    const a1 = numberItemOf(s, 1).answer;
    // round 1: p1 closest again (streak->2, ON FIRE), p3 now second (streak->1), p2 worst (reset)
    s = playRound(s, { p1: a1 + 1, p3: a1 + 4, p2: a1 + 80 });
    if (s.lastResult?.kind !== 'closest-number') throw new Error('expected closest');
    expect(s.lastResult.streak).toMatchObject({ p1: 2, p2: 0, p3: 1 });
  });

  it('with the SHIPPED config (no streakBonus) a 2-round streak adds ZERO bonus points', () => {
    const s0 = quizz.init('streak-seed', players, content);
    const a0 = numberItemOf(s0, 0).answer;
    let s = playRound(s0, { p1: a0 + 1, p2: a0 + 5, p3: a0 + 9 });
    const afterR0 = { ...s.scores };
    s = nextRound(s);
    const a1 = numberItemOf(s, 1).answer;
    // p1 wins again (streak 2). Pure 100/50/25 each round — no streak top-up.
    s = playRound(s, { p1: a1 + 1, p2: a1 + 5, p3: a1 + 9 });
    expect(s.lastResult?.kind === 'closest-number' && s.lastResult.streak.p1).toBe(2);
    // p1 scored 100 (r0) + 100 (r1) = 200 EXACTLY — the streak added nothing.
    expect(s.scores.p1).toBe((afterR0.p1 ?? 0) + 100);
    expect(s.scores.p1).toBe(200);
  });
});

describe('CC-2 streak (closest-number) — opt-in bonus config awards small capped points', () => {
  // perStreak +20, cap 3: streak 1 -> +20, 2 -> +40, 3+ -> +60 (capped).
  const cfg: ClosestNumberConfig = { ...QUIZZ_CULTURE_GE_CONFIG, streakBonus: 20, streakCap: 3 };
  const fire = createInputGuess('quizz-culture-ge', cfg);
  const content = numberContent(5);

  function playRound(s0: InputGuessState, byPlayer: Record<string, number>): InputGuessState {
    let s = s0;
    for (const [p, v] of Object.entries(byPlayer)) s = fire.reduce(s, guess(p, v)).state;
    if (s.phase !== 'reveal') s = fire.reduce(s, { type: 'deadline', at: 0 }).state;
    return s;
  }
  const next = (s: InputGuessState) => fire.reduce(s, { type: 'deadline', at: 1 }).state;

  it('the streak bonus stacks per consecutive top-2 finish and is capped', () => {
    const s0 = fire.init('fire-seed', players, content);
    const a0 = numberItemOf(s0, 0).answer;
    // round 0: p1 closest -> 100 rank + streak1*20 = 120
    let s = playRound(s0, { p1: a0 + 1, p2: a0 + 5, p3: a0 + 9 });
    if (s.lastResult?.kind !== 'closest-number') throw new Error('expected closest');
    expect(s.lastResult.pointsEarned.p1).toBe(120);
    expect(s.scores.p1).toBe(120);

    s = next(s);
    const a1 = numberItemOf(s, 1).answer;
    // round 1: p1 closest again -> 100 + streak2*20 = 140  (running 260)
    s = playRound(s, { p1: a1 + 1, p2: a1 + 5, p3: a1 + 9 });
    if (s.lastResult?.kind !== 'closest-number') throw new Error('expected closest');
    expect(s.lastResult.pointsEarned.p1).toBe(140);
    expect(s.scores.p1).toBe(260);

    s = next(s);
    const a2 = numberItemOf(s, 2).answer;
    // round 2: p1 closest -> 100 + streak3*20 = 160 (running 420)
    s = playRound(s, { p1: a2 + 1, p2: a2 + 5, p3: a2 + 9 });
    if (s.lastResult?.kind !== 'closest-number') throw new Error('expected closest');
    expect(s.lastResult.streak.p1).toBe(3);
    expect(s.lastResult.pointsEarned.p1).toBe(160);

    s = next(s);
    const a3 = numberItemOf(s, 3).answer;
    // round 3: p1 closest -> streak hits 4 but CAP 3 holds the bonus at +60 -> 160
    s = playRound(s, { p1: a3 + 1, p2: a3 + 5, p3: a3 + 9 });
    if (s.lastResult?.kind !== 'closest-number') throw new Error('expected closest');
    expect(s.lastResult.streak.p1).toBe(4);
    expect(s.lastResult.pointsEarned.p1).toBe(160); // capped: 100 + min(4,3)*20
  });

  it('breaking the streak resets the bonus to the streak-1 amount', () => {
    const s0 = fire.init('fire-seed', players, content);
    const a0 = numberItemOf(s0, 0).answer;
    let s = playRound(s0, { p1: a0 + 1, p2: a0 + 5, p3: a0 + 9 }); // p1 streak1 -> 120
    s = next(s);
    const a1 = numberItemOf(s, 1).answer;
    // round 1: p1 goes WILD (3rd of 3 distinct distances => NOT top-2) -> streak
    // resets; p2/p3 take the top-2 spots. p1 still earns the rank-2 payout (25)
    // but NO streak bonus is added on top.
    s = playRound(s, { p2: a1 + 1, p3: a1 + 5, p1: a1 + 500 });
    if (s.lastResult?.kind !== 'closest-number') throw new Error('expected closest');
    expect(s.lastResult.streak.p1).toBe(0);
    expect(s.lastResult.pointsEarned.p1).toBe(25); // rank-2 only, no streak top-up
    s = next(s);
    const a2 = numberItemOf(s, 2).answer;
    // round 2: p1 wins again -> streak back to 1 -> 100 + 20 = 120 (not the old 140)
    s = playRound(s, { p1: a2 + 1, p2: a2 + 5, p3: a2 + 9 });
    if (s.lastResult?.kind !== 'closest-number') throw new Error('expected closest');
    expect(s.lastResult.streak.p1).toBe(1);
    expect(s.lastResult.pointsEarned.p1).toBe(120);
  });
});

describe('CC-2 streak (crowd-target) — winning-card pick continues the streak', () => {
  const cc = createInputGuess('cinquante-cinquante', CINQUANTE_CINQUANTE_CONFIG);
  // perStreak +1, cap 2 opt-in config.
  const cfg: CrowdTargetConfig = { ...CINQUANTE_CINQUANTE_CONFIG, streakBonus: 1, streakCap: 2 };
  const fire = createInputGuess('cinquante-cinquante', cfg);

  function packOf(...items: ReturnType<typeof crowdItem>[]) {
    return { id: 'sk-crowd', version: 1 as const, data: { items } };
  }
  // distances (target 80): a:4 (closest), b:9, c:18, d:25, e:33, f:42 (worst).
  const twoRounds = packOf(crowdItem('r0'), crowdItem('r1'));

  function allPick(module: typeof cc, s0: InputGuessState, by: Record<string, string>): InputGuessState {
    let s = s0;
    for (const [p, cid] of Object.entries(by)) s = module.reduce(s, pick(p, cardIndexOf(s0, s0.round, cid))).state;
    if (s.phase !== 'reveal') s = module.reduce(s, { type: 'deadline', at: 0 }).state;
    return s;
  }

  it('a winning-card pick counts as top-2; a non-winning pick resets', () => {
    const s0 = cc.init('s', players, twoRounds);
    let s = allPick(cc, s0, { p1: 'a', p2: 'a', p3: 'f' }); // p1,p2 hit closest; p3 worst
    if (s.lastResult?.kind !== 'crowd-target') throw new Error('expected crowd');
    expect(s.lastResult.streak).toMatchObject({ p1: 1, p2: 1, p3: 0 });
    s = cc.reduce(s, { type: 'deadline', at: 1 }).state; // -> round 1
    s = allPick(cc, s, { p1: 'a', p2: 'b', p3: 'a' }); // p1,p3 hit closest; p2 not
    if (s.lastResult?.kind !== 'crowd-target') throw new Error('expected crowd');
    expect(s.lastResult.streak).toMatchObject({ p1: 2, p2: 0, p3: 1 });
  });

  it('default config adds no bonus; opt-in +1/cap2 stacks then caps', () => {
    // default (identity): closest card pays exactly 3, no streak top-up.
    const ds = cc.init('s', players, twoRounds);
    let s = allPick(cc, ds, { p1: 'a', p2: 'b', p3: 'f' });
    expect(s.scores.p1).toBe(3); // 3 + 0 streak bonus
    s = cc.reduce(s, { type: 'deadline', at: 1 }).state;
    s = allPick(cc, s, { p1: 'a', p2: 'b', p3: 'f' });
    expect(s.scores.p1).toBe(6); // 3 + 3, still no streak bonus

    // opt-in: round0 closest -> 3 + streak1 = 4; round1 closest -> 3 + streak2 = 5 (running 9)
    const fs = fire.init('s', players, twoRounds);
    let f = allPick(fire, fs, { p1: 'a', p2: 'b', p3: 'f' });
    if (f.lastResult?.kind !== 'crowd-target') throw new Error('expected crowd');
    expect(f.lastResult.pointsEarned.p1).toBe(4);
    f = fire.reduce(f, { type: 'deadline', at: 1 }).state;
    f = allPick(fire, f, { p1: 'a', p2: 'b', p3: 'f' });
    if (f.lastResult?.kind !== 'crowd-target') throw new Error('expected crowd');
    expect(f.lastResult.streak.p1).toBe(2);
    expect(f.lastResult.pointsEarned.p1).toBe(5); // 3 + min(2,2)*1
    expect(f.scores.p1).toBe(9);
  });
});

// ===========================================================================
// CC-5 — 'over' epilogue derived from PUBLIC state only (no new secret).
// ===========================================================================

describe('CC-5 over epilogue (closest-number) — superlatives from public stats', () => {
  const quizz = createInputGuess('quizz-culture-ge', QUIZZ_CULTURE_GE_CONFIG);

  /** Play `rounds` rounds to over with the given per-player guesses each round. */
  function playToOver(
    module: ReturnType<typeof createInputGuess>,
    s0: InputGuessState,
    perRound: (round: number, answer: number) => Record<string, number>,
  ): InputGuessState {
    let s = s0;
    for (let r = 0; s.phase !== 'over' && r < 50; r++) {
      if (s.phase === 'guess') {
        const a = numberItemOf(s, s.round).answer;
        for (const [p, v] of Object.entries(perRound(s.round, a))) s = module.reduce(s, guess(p, v)).state;
      }
      s = module.reduce(s, { type: 'deadline', at: r }).state; // resolve or advance
    }
    return s;
  }

  it('mostExact / closestOverall / biggestWhiff / mvp are derived at over from public state', () => {
    const two = createInputGuess('quizz-culture-ge', { ...QUIZZ_CULTURE_GE_CONFIG, totalRounds: 2 });
    const content = numberContent(2);
    const s0 = two.init('epi-seed', players, content);
    // p1 nails both exactly; p2 close-ish; p3 wild every round.
    const s = playToOver(two, s0, (_round, a) => ({ p1: a, p2: a + 3, p3: a + 200 }));
    expect(s.phase).toBe('over');

    const v = two.view(s, 'spectator');
    if (v.phase !== 'over') throw new Error('expected over view');
    expect(v.epilogue.mvp).toBe('p1');         // top score
    expect(v.epilogue.mostExact).toEqual(['p1']); // 2 exact hits
    expect(v.epilogue.closestOverall).toEqual(['p1']); // total distance 0
    expect(v.epilogue.biggestWhiff).toEqual(['p3']);   // max single-round whiff
    // stats are public evidence for the roast layer
    expect(v.stats.p1?.exactCount).toBe(2);
    expect(v.stats.p3?.worstDistance).toBe(200);
  });

  it('a contested crown yields mvp=null and the close-finish flag fires within threshold', () => {
    const one = createInputGuess('quizz-culture-ge', { ...QUIZZ_CULTURE_GE_CONFIG, totalRounds: 1 });
    const content = numberContent(1);
    const s0 = one.init('tie-seed', players, content);
    const a = numberItemOf(s0, 0).answer;
    // p1 and p2 tie exactly -> both 150, p3 worst.
    let s = one.reduce(s0, guess('p1', a)).state;
    s = one.reduce(s, guess('p2', a)).state;
    s = one.reduce(s, guess('p3', a + 50)).state;
    s = one.reduce(s, { type: 'deadline', at: 0 }).state;
    expect(s.phase).toBe('over');
    const v = one.view(s, 'p3');
    if (v.phase !== 'over') throw new Error('expected over view');
    expect(v.epilogue.mvp).toBeNull();      // tie for first
    expect(v.epilogue.topGap).toBe(0);      // tied leaders
    expect(v.epilogue.closeFinish).toBe(true); // gap 0 <= threshold 100
    expect(v.epilogue.mostExact.sort()).toEqual(['p1', 'p2']);
  });

  it('onFire surfaces the longest streak (>=2); empty when nobody caught fire', () => {
    const three = createInputGuess('quizz-culture-ge', { ...QUIZZ_CULTURE_GE_CONFIG, totalRounds: 3 });
    const content = numberContent(3);
    const s0 = three.init('onfire-seed', players, content);
    // p1 top-2 all three rounds (streak 3); others swap so nobody else strings two.
    let round = 0;
    let s = s0;
    while (s.phase !== 'over' && round < 10) {
      if (s.phase === 'guess') {
        const a = numberItemOf(s, s.round).answer;
        // p1 always closest; p2/p3 alternate the 2nd spot vs a wild 3rd.
        const second = s.round % 2 === 0 ? 'p2' : 'p3';
        const wild = second === 'p2' ? 'p3' : 'p2';
        s = three.reduce(s, guess('p1', a + 1)).state;
        s = three.reduce(s, guess(second, a + 5)).state;
        s = three.reduce(s, guess(wild, a + 400)).state;
      }
      s = three.reduce(s, { type: 'deadline', at: round }).state;
      round += 1;
    }
    expect(s.phase).toBe('over');
    const v = three.view(s, 'spectator');
    if (v.phase !== 'over') throw new Error('expected over view');
    expect(v.epilogue.onFire).toEqual(['p1']);
    expect(v.stats.p1?.bestStreak).toBe(3);
  });

  it('a passive room (zero guesses) yields empty superlatives and a clean over view', () => {
    const content = numberContent(3);
    let s = quizz.init('s', players, content);
    while (s.phase !== 'over') s = quizz.reduce(s, { type: 'deadline', at: 0 }).state;
    const v = quizz.view(s, 'p1');
    if (v.phase !== 'over') throw new Error('expected over view');
    expect(v.epilogue.mostExact).toEqual([]);
    expect(v.epilogue.closestOverall).toEqual([]);
    expect(v.epilogue.biggestWhiff).toEqual([]);
    expect(v.epilogue.onFire).toEqual([]);
    expect(v.epilogue.mvp).toBeNull(); // everyone tied at 0
    expect(JSON.parse(JSON.stringify(v))).toEqual(v); // serializable
  });

  it('the epilogue is replay-identical for the same seed + inputs (deterministic, no RNG/clock)', () => {
    const two = createInputGuess('quizz-culture-ge', { ...QUIZZ_CULTURE_GE_CONFIG, totalRounds: 2 });
    const content = numberContent(2);
    const run = () => {
      const s0 = two.init('det-seed', players, content);
      const s = playToOver(two, s0, (_r, a) => ({ p1: a, p2: a + 4, p3: a + 50 }));
      const v = two.view(s, 'spectator');
      if (v.phase !== 'over') throw new Error('expected over');
      return v.epilogue;
    };
    expect(run()).toEqual(run());
  });
});

describe('CC-5 over epilogue (crowd-target) — derived from public picks/distances', () => {
  const cc = createInputGuess('cinquante-cinquante', CINQUANTE_CINQUANTE_CONFIG);

  it('biggestWhiff and closestOverall fold the per-round picked-card distances', () => {
    const two = createInputGuess('cinquante-cinquante', { ...CINQUANTE_CINQUANTE_CONFIG, totalRounds: 2 });
    const pack = { id: 'epi-crowd', version: 1 as const, data: { items: [crowdItem('r0'), crowdItem('r1')] } };
    const s0 = two.init('s', players, pack);
    // each round: p1 closest (d4), p2 second (d9), p3 worst (d42).
    let s = s0;
    for (let r = 0; r < 2; r++) {
      s = two.reduce(s, pick('p1', cardIndexOf(s, s.round, 'a'))).state;
      s = two.reduce(s, pick('p2', cardIndexOf(s, s.round, 'b'))).state;
      s = two.reduce(s, pick('p3', cardIndexOf(s, s.round, 'f'))).state;
      s = two.reduce(s, { type: 'deadline', at: r }).state; // reveal -> next/over
    }
    expect(s.phase).toBe('over');
    const v = two.view(s, 'spectator');
    if (v.phase !== 'over') throw new Error('expected over view');
    expect(v.epilogue.mvp).toBe('p1');                 // 3+3 = 6
    expect(v.epilogue.closestOverall).toEqual(['p1']); // total distance 8 (4+4)
    expect(v.epilogue.biggestWhiff).toEqual(['p3']);   // worst 42
    expect(v.stats.p1?.totalDistance).toBe(8);
    expect(v.stats.p3?.worstDistance).toBe(42);
  });
});

// ===========================================================================
// CC-5 redaction — the over epilogue adds NO new secret: it references only
// public players and never leaks a hidden value.
// ===========================================================================

describe('CC-5 over epilogue introduces no new secret', () => {
  const cc = createInputGuess('cinquante-cinquante', CINQUANTE_CINQUANTE_CONFIG);

  it('over view is value-invariant across viewers and carries no crowdYesPct-as-secret leak path', () => {
    const two = createInputGuess('cinquante-cinquante', { ...CINQUANTE_CINQUANTE_CONFIG, totalRounds: 1 });
    const pack = { id: 'sec-crowd', version: 1 as const, data: { items: [crowdItem('r0')] } };
    const s0 = two.init('s', players, pack);
    let s = s0;
    s = two.reduce(s, pick('p1', cardIndexOf(s, 0, 'a'))).state;
    s = two.reduce(s, pick('p2', cardIndexOf(s, 0, 'b'))).state;
    s = two.reduce(s, pick('p3', cardIndexOf(s, 0, 'c'))).state;
    s = two.reduce(s, { type: 'deadline', at: 0 }).state;
    expect(s.phase).toBe('over');
    // at over, reveal data is already public — but the epilogue must only name
    // players present in public scores/stats, never raw secrets.
    for (const viewer of [...players, 'spectator', '__proto__']) {
      const v = two.view(s, viewer);
      if (v.phase !== 'over') throw new Error('expected over view');
      const named = [
        v.epilogue.mvp, ...v.epilogue.mostExact, ...v.epilogue.closestOverall,
        ...v.epilogue.biggestWhiff, ...v.epilogue.onFire,
      ].filter((x): x is string => x !== null);
      for (const id of named) expect(Object.prototype.hasOwnProperty.call(v.scores, id)).toBe(true);
      expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    }
    // the over view is identical for every viewer (no per-viewer secret at over).
    const a = JSON.stringify(two.view(s, 'p1'));
    const b = JSON.stringify(two.view(s, 'spectator'));
    expect(a).toBe(b);
  });
});
