// P1 retention-DEPTH for perform-judge:
//   - CC-2 "Money Round" final-lap multiplier (kit `roundMultiplier`, default
//     identity so every existing exact-score test stays green on lap 0).
//   - P1-2 aggregate-only drama stamps ('nailbiter' / 'split') — never a per-voter
//     ballot.
//   - CC-5 'over' epilogue cards derived PURELY from already-public state
//     (final scores + running public reaction/nailbiter tallies). No new secret.
import { describe, expect, it } from 'vitest';
import { roundMultiplier } from '@bloop/kit';
import {
  createPerformJudge,
  DEVINE_L_ACTION_CONFIG,
  DEVINE_L_OBJET_CONFIG,
  DOUBLE_LE_MOUVEMENT_CONFIG,
  MIME_INVERSE_CONFIG,
} from '@bloop/game-perform-judge';
import { act, deadline, fold, makeContent, others, rate, vote } from './fixtures.js';

const guided = createPerformJudge('devine-l-action', DEVINE_L_ACTION_CONFIG);
const credit = createPerformJudge('devine-l-objet', DEVINE_L_OBJET_CONFIG);
const puppet = createPerformJudge('mime-inverse', MIME_INVERSE_CONFIG);
const rateMod = createPerformJudge('double-le-mouvement', DOUBLE_LE_MOUVEMENT_CONFIG);

const P3 = ['p1', 'p2', 'p3'];
const P4 = ['p1', 'p2', 'p3', 'p4'];
const P5 = ['p1', 'p2', 'p3', 'p4', 'p5'];

/** Drive a guided turn to its verdict beat (ready -> perform -> claimDone). */
function guidedToVerdict(state: ReturnType<typeof guided.init>) {
  return fold(guided, state, [deadline(0), act(state.performer, { kind: 'claimDone' }, 1)]);
}

/** Resolve the CURRENT guided turn as a réussi (all helpers vote yes). */
function guidedReussi(state: ReturnType<typeof guided.init>) {
  const v = guidedToVerdict(state);
  return fold(guided, v, others(v).map((h, i) => vote(h, 'yes', 10 + i)));
}

/** Walk a guided match to the start of its FINAL-lap (lap === laps-1) turn. */
function guidedAtFinalLap(players: string[]) {
  let s = guided.init('s', players, makeContent(40));
  // play whole turns until lap flips to laps-1, stopping at that turn's ready beat
  for (let i = 0; i < 50 && !(s.lap === s.config.laps - 1); i++) {
    s = guidedReussi(s); // -> reveal
    s = fold(guided, s, [deadline(1_000 + i)]); // reveal -> next turn entry
  }
  return s;
}

describe('CC-2 Money Round — config defaults to identity off the final lap', () => {
  it('lap-0 guided réussi is byte-identical to the pre-feature payout (×1)', () => {
    const s = guided.init('s', P4, makeContent());
    expect(s.lap).toBe(0);
    const r = guidedReussi(s);
    expect(r.lastResult?.outcome).toBe('success');
    expect(r.lastResult?.moneyRound).toBe(false); // not the final lap
    expect(r.scores[s.performer]).toBe(10); // base, un-multiplied
    for (const h of others(s)) expect(r.scores[h]).toBe(5);
  });

  it('single-lap puppet/rate never trigger the multiplier (final lap == only lap, ×1)', () => {
    // puppet success-early on lap 0 (its only lap): base 150 / 50, moneyRound false
    const ps = puppet.init('s', P5, makeContent());
    const cs = others(ps);
    const pr = fold(puppet, ps, [
      act(cs[0]!, { kind: 'tap' }, 1), act(cs[1]!, { kind: 'tap' }, 2), act(cs[2]!, { kind: 'tap' }, 3),
    ]);
    expect(pr.lap).toBe(0);
    expect(pr.config.laps).toBe(1);
    expect(pr.lastResult?.moneyRound).toBe(false);
    expect(pr.scores[ps.performer]).toBe(150);

    // rate stars resolve on lap 0 (its only lap): base 90, moneyRound false
    let rs = rateMod.init('s', P4, makeContent());
    rs = fold(rateMod, rs, [deadline(0), deadline(1)]);
    const raters = P4.filter((p) => p !== rs.performer && p !== rs.partner);
    const rr = fold(rateMod, rs, [rate(raters[0]!, 4, 2), rate(raters[1]!, 5, 3)]);
    expect(rr.lastResult?.moneyRound).toBe(false);
    expect(rr.scores[rs.performer]).toBe(90);
  });
});

describe('CC-2 Money Round — guided/credit final lap scores ×1.5', () => {
  it('guided final-lap réussi: performer 10→15, every helper 5→8 (rounded), moneyRound flagged', () => {
    const s = guidedAtFinalLap(P4);
    expect(s.lap).toBe(s.config.laps - 1); // final lap
    const before = { ...s.scores };
    const r = guidedReussi(s);
    expect(r.lastResult?.moneyRound).toBe(true);
    // delta this turn = round(10 × 1.5)=15 for the performer; round(5 × 1.5)=8 helpers
    expect(r.scores[s.performer]! - (before[s.performer] ?? 0)).toBe(15);
    for (const h of others(s)) expect(r.scores[h]! - (before[h] ?? 0)).toBe(8);
    expect(r.lastResult?.points[s.performer]).toBe(15); // the reveal carries the boosted points
  });

  it('credit final-lap validated find pays the boosted award to BOTH performer and guesser', () => {
    // walk a 2-lap credit match to its final lap, then credit + validate
    let s = credit.init('s', P4, makeContent(40));
    for (let i = 0; i < 50 && !(s.lap === s.config.laps - 1); i++) {
      const g = others(s)[0]!;
      s = fold(credit, s, [deadline(1_000 + i)]); // ready -> perform
      s = fold(credit, s, [act(s.performer, { kind: 'claimFound', guesser: g }, 2_000 + i)]);
      const voters = others(s).filter((p) => p !== g);
      s = fold(credit, s, voters.map((p, j) => vote(p, 'yes', 3_000 + i + j))); // -> reveal
      s = fold(credit, s, [deadline(4_000 + i)]); // reveal -> next turn
    }
    expect(s.lap).toBe(s.config.laps - 1);
    const before = { ...s.scores };
    const guesser = others(s)[0]!;
    // perform opens at t=9000 (the ready deadline); half = 9000 + 45000/2 = 31500.
    // claim at 32000 => strictly past half => no fast bonus => base 10.
    s = fold(credit, s, [deadline(9_000), act(s.performer, { kind: 'claimFound', guesser }, 32_000)]);
    const voters = others(s).filter((p) => p !== guesser);
    s = fold(credit, s, voters.map((p, j) => vote(p, 'yes', 33_000 + j)));
    expect(s.lastResult?.outcome).toBe('success');
    expect(s.lastResult?.moneyRound).toBe(true);
    // second-half claim -> no fast bonus -> base 10, ×1.5 = 15 to each
    expect(s.lastResult?.fast).toBe(false);
    expect(s.scores[s.lastResult!.performer]! - (before[s.lastResult!.performer] ?? 0)).toBe(15);
    expect(s.scores[guesser]! - (before[guesser] ?? 0)).toBe(15);
  });

  it('the multiplier matches the kit roundMultiplier contract exactly', () => {
    // guided is a 2-lap match: lap 0 -> ×1, lap 1 (final) -> ×1.5
    const opts = { finalRoundMultiplier: 1.5 };
    expect(roundMultiplier(0, 2, opts)).toBe(1);
    expect(roundMultiplier(1, 2, opts)).toBe(1.5);
  });
});

describe('CC-2 Money Round — isFinalLap view flag', () => {
  it('is false on lap 0 and true on the final lap of a multi-lap config', () => {
    const s0 = guided.init('s', P4, makeContent(40));
    const v0 = guided.view(s0, s0.performer);
    if (v0.phase === 'over') throw new Error('not over');
    expect(v0.isFinalLap).toBe(false);
    const sf = guidedAtFinalLap(P4);
    const vf = guided.view(sf, sf.performer);
    if (vf.phase === 'over') throw new Error('not over');
    expect(vf.isFinalLap).toBe(true);
  });

  it('is always false for single-lap puppet/rate (multiplier disarmed)', () => {
    const pv = puppet.view(puppet.init('s', P3, makeContent()), 'p1');
    if (pv.phase === 'over') throw new Error('not over');
    expect(pv.isFinalLap).toBe(false);
    const rv = rateMod.view(rateMod.init('s', P4, makeContent()), 'p1');
    if (rv.phase === 'over') throw new Error('not over');
    expect(rv.isFinalLap).toBe(false);
  });
});

describe('P1-2 drama stamp — aggregate only, never a ballot', () => {
  it("guided 'nailbiter' on a one-vote margin; landslide is null", () => {
    // 4-player guided: performer + 3 helpers. yes,yes,no => 2-1 (margin 1) = nailbiter
    const s = guided.init('s', P4, makeContent());
    const v = guidedToVerdict(s);
    const [h1, h2, h3] = others(v) as [string, string, string];
    const nail = fold(guided, v, [vote(h1, 'yes', 2), vote(h2, 'yes', 3), vote(h3, 'no', 4)]);
    expect(nail.lastResult?.tally).toEqual({ yes: 2, no: 1 });
    expect(nail.lastResult?.drama).toBe('nailbiter');

    // 3-0 landslide (all yes) = margin 3 = no drama
    const land = fold(guided, guidedToVerdict(guided.init('s', P4, makeContent())),
      (others(v) as string[]).map((h, i) => vote(h, 'yes', 10 + i)));
    expect(land.lastResult?.drama).toBeNull();
  });

  it("puppet verdict 'nailbiter' surfaces on a 1-1 split", () => {
    const s = puppet.init('s', P3, makeContent());
    const [c1, c2] = others(s) as [string, string];
    const r = fold(puppet, s, [deadline(1), vote(c1, 'yes', 2), vote(c2, 'no', 3)]);
    expect(r.lastResult?.tally).toEqual({ yes: 1, no: 1 });
    expect(r.lastResult?.drama).toBe('nailbiter');
  });

  it("rate 'split' on a polarised table (>= 3-star spread); tight table is null", () => {
    // P4 => crew of 2, exactly 2 raters; both rate -> early-resolve (no deadline).
    function atRate() {
      let s = rateMod.init('s', P4, makeContent());
      s = fold(rateMod, s, [deadline(0), deadline(1)]);
      const raters = P4.filter((p) => p !== s.performer && p !== s.partner);
      return { s, raters };
    }
    const split = (() => {
      const { s, raters } = atRate();
      return fold(rateMod, s, [rate(raters[0]!, 1, 2), rate(raters[1]!, 5, 3)]); // spread 4
    })();
    expect(split.phase).toBe('reveal');
    expect(split.lastResult?.stars?.min).toBe(1);
    expect(split.lastResult?.stars?.max).toBe(5);
    expect(split.lastResult?.drama).toBe('split');

    const tight = (() => {
      const { s, raters } = atRate();
      return fold(rateMod, s, [rate(raters[0]!, 4, 2), rate(raters[1]!, 5, 3)]); // spread 1
    })();
    expect(tight.lastResult?.drama).toBeNull();
  });

  it('a single ballot is never a split (needs >= 2 ratings)', () => {
    let s = rateMod.init('s', P4, makeContent());
    s = fold(rateMod, s, [deadline(0), deadline(1)]);
    const raters = P4.filter((p) => p !== s.performer && p !== s.partner);
    const r = fold(rateMod, s, [rate(raters[0]!, 1, 2), deadline(9)]); // one ballot then timeout
    expect(r.lastResult?.stars?.cast).toBe(1);
    expect(r.lastResult?.drama).toBeNull();
  });
});

describe('CC-5 epilogue — derived at over from already-public state, no new secret', () => {
  it('over view carries bestPerformer (mvp of scores) + reaction/gap/nailbiter cards', () => {
    // a curated 3-player puppet match: feed reactions + a nailbiter, walk to over
    let s = puppet.init('s', P3, makeContent(40));
    // turn 0: one audience react (audience = the non-performer who is NOT a tapper
    // here we just have commanders; reactors = connected non-performers)
    const aud = others(s)[0]!;
    s = fold(puppet, s, [act(aud, { kind: 'react', reaction: 'fire' }, 1)]);
    // resolve this turn 1-1 (nailbiter) via verdict
    const [c1, c2] = others(s) as [string, string];
    s = fold(puppet, s, [deadline(2), vote(c1, 'yes', 3), vote(c2, 'no', 4)]);
    expect(s.lastResult?.drama).toBe('nailbiter');
    // drive to over
    for (let i = 0; i < 60 && s.phase !== 'over'; i++) {
      s = puppet.reduce(s, deadline(1_000 + i)).state;
    }
    expect(s.phase).toBe('over');
    const v = puppet.view(s, 'p1');
    if (v.phase !== 'over') throw new Error('expected over');
    // bestPerformer = sole top scorer (or null on a tie)
    const sorted = Object.entries(s.scores).sort((a, b) => b[1] - a[1]);
    const topTied = sorted.length > 1 && sorted[1]![1] === sorted[0]![1];
    expect(v.epilogue.bestPerformer).toBe(topTied ? null : sorted[0]![0]);
    expect(v.epilogue.nailbiters).toBeGreaterThanOrEqual(1);
    expect(v.epilogue.reactionTotals[s.rotation[0]!]).toBeGreaterThanOrEqual(1); // first performer drew the react
    expect(typeof v.epilogue.topGap).toBe('number');
    expect(typeof v.epilogue.closeFinish).toBe('boolean');
  });

  it('crowdFavourite is the performer(s) who drew the most reactions (statLeaders fold)', () => {
    // credit match: pile reactions onto the first performer only, then walk to over
    let s = credit.init('s', P4, makeContent(40));
    s = fold(credit, s, [deadline(0)]); // ready -> perform (turn 0)
    const firstPerformer = s.performer;
    const audience = others(s);
    s = fold(credit, s, [
      act(audience[0]!, { kind: 'react', reaction: 'fire' }, 1),
      act(audience[1]!, { kind: 'react', reaction: 'laugh' }, 2),
    ]);
    for (let i = 0; i < 80 && s.phase !== 'over'; i++) {
      s = credit.reduce(s, deadline(2_000 + i)).state;
    }
    expect(s.phase).toBe('over');
    const v = credit.view(s, 'p1');
    if (v.phase !== 'over') throw new Error('expected over');
    expect(v.epilogue.reactionTotals[firstPerformer]).toBe(2);
    expect(v.epilogue.crowdFavourite).toContain(firstPerformer);
  });

  it('the over epilogue is JSON-serializable for roster + hostile viewers and leaks no prompt', () => {
    let s = guided.init('s', P3, makeContent(40));
    for (let i = 0; i < 60 && s.phase !== 'over'; i++) s = guided.reduce(s, deadline(1_000 + i)).state;
    expect(s.phase).toBe('over');
    for (const viewer of ['p1', 'p2', 'p3', 'spectator-x', '__proto__']) {
      const v = guided.view(s, viewer);
      expect(JSON.parse(JSON.stringify(v))).toEqual(v); // round-trips, no undefined
      // the epilogue carries scores/tallies only — never an item prompt
      expect(JSON.stringify(v)).not.toContain('secret-prompt');
    }
  });
});
