// P1 retention-DEPTH (brief P1-2 + CC-5): final-round weighting (CC-2
// roundMultiplier) + the over-view cliffhanger epilogue (CC-5: closeFinish,
// longest hot-seat streak, mvp). These guards prove the green-gates the brief
// marks as load-bearing:
//   IDENTITY  with NO config opts the award is the legacy `+1` and the over
//             view's epilogue derives from public scores only — every existing
//             exact-score test stays green (asserted here as a regression lock).
//   CC-2      a weighted final round multiplies the award (ONLY on the boosted
//             round), the view carries the `roundMultiplier` so it reads caused.
//   CC-5      the epilogue is derived at 'over' from ALREADY-PUBLIC state
//             (scores + the public hot-seat history) — no new in-match secret,
//             and it never serialises a ballot.
//   REDACTION the new reveal fields (roundMultiplier / hotSeat) are aggregate,
//             byte-identical for every viewer, and never leak `votes`.
import { describe, expect, it } from 'vitest';
import type { ContentPack, GameEvent } from '@bloop/engine';
import {
  createTracer,
  tracer,
  type TracerAction,
  type TracerContent,
  type TracerState,
} from '@bloop/game-tracer';

const content: ContentPack<TracerContent> = {
  id: 't', version: 1,
  data: { prompts: ['P1?', 'P2?', 'P3?', 'P4?'] },
};
const players = ['p1', 'p2', 'p3'];
const vote = (playerId: string, target: string, at = 0): GameEvent<TracerAction> =>
  ({ type: 'action', playerId, action: { kind: 'vote', target }, at });

/** Drive a round to its VERDICT slam: vote all, then suspense -> verdict hop. */
function playToVerdict(
  mod: typeof tracer,
  s: TracerState,
  ballots: GameEvent<TracerAction>[],
): TracerState {
  for (const b of ballots) s = mod.reduce(s, b).state;
  // if early-resolve didn't fire (e.g. zero/partial votes), force the suspense hop
  if (s.phase === 'vote') s = mod.reduce(s, { type: 'deadline', at: 90 }).state;
  return mod.reduce(s, { type: 'deadline', at: 91 }).state; // suspense -> verdict
}

/** suspense/verdict already past — advance verdict -> next round (vote or over). */
const stepNext = (mod: typeof tracer, s: TracerState): TracerState =>
  mod.reduce(s, { type: 'deadline', at: 92 }).state;

describe('CC-2 final-round weighting — DEFAULTS TO IDENTITY', () => {
  it('no config opts => every round awards exactly +1 (legacy behaviour, regression lock)', () => {
    // p1,p2 -> p3 on every round: p3 should score exactly +1/round, never more.
    let s: TracerState = tracer.init('s', players, content);
    for (let r = 0; r < 3; r++) {
      s = playToVerdict(tracer, s, [vote('p1', 'p3', r * 3), vote('p2', 'p3', r * 3 + 1), vote('p3', 'p1', r * 3 + 2)]);
      expect(s.scores.p3).toBe(r + 1); // +1 each round, no multiplier
      if (r < 2) s = stepNext(tracer, s);
    }
  });

  it('the reveal view carries roundMultiplier === 1 on every unweighted round', () => {
    const s = playToVerdict(tracer, tracer.init('s', players, content),
      [vote('p1', 'p3', 0), vote('p2', 'p3', 1), vote('p3', 'p1', 2)]);
    const v = tracer.view(s, 'p1');
    if (v.phase !== 'reveal') throw new Error('expected reveal');
    expect(v.roundMultiplier).toBe(1);
    expect(v.delta).toEqual({ p3: 1 });
  });
});

describe('CC-2 final-round weighting — the climax decides the crown', () => {
  // final round (round totalRounds-1) pays ×3 via finalRoundMultiplier.
  const weighted = createTracer('weighted', { totalRounds: 3, finalRoundMultiplier: 3 });

  it('only the FINAL round multiplies the award; earlier rounds stay +1', () => {
    let s = weighted.init('s', players, content);
    expect(s.config.totalRounds).toBe(3);
    // round 0 (not final): p3 wins -> +1
    s = playToVerdict(weighted, s, [vote('p1', 'p3', 0), vote('p2', 'p3', 1), vote('p3', 'p1', 2)]);
    expect(s.scores.p3).toBe(1);
    const v0 = weighted.view(s, 'p1');
    if (v0.phase !== 'reveal') throw new Error('expected reveal');
    expect(v0.roundMultiplier).toBe(1); // not the climax yet
    s = stepNext(weighted, s);
    // round 1 (not final): p3 wins -> +1 (total 2)
    s = playToVerdict(weighted, s, [vote('p1', 'p3', 10), vote('p2', 'p3', 11), vote('p3', 'p1', 12)]);
    expect(s.scores.p3).toBe(2);
    s = stepNext(weighted, s);
    // round 2 (FINAL): p1 wins -> +3, overtaking p3 — the climax decides it
    s = playToVerdict(weighted, s, [vote('p2', 'p1', 20), vote('p3', 'p1', 21), vote('p1', 'p2', 22)]);
    const vf = weighted.view(s, 'p2');
    if (vf.phase !== 'reveal') throw new Error('expected reveal');
    expect(vf.roundMultiplier).toBe(3); // ROUND DOUBLE/TRIPLE chrome
    expect(vf.delta).toEqual({ p1: 3 }); // honest climb shows the weighted award
    expect(s.scores).toEqual({ p1: 3, p2: 0, p3: 2 }); // trailing p1 storms back to the crown
  });

  it('a tie on the weighted round shares the multiplied award (both climb ×N)', () => {
    const w2 = createTracer('w2', { totalRounds: 1, finalRoundMultiplier: 2 });
    let s = w2.init('s', ['p1', 'p2'], content); // single round IS the final
    s = playToVerdict(w2, s, [vote('p1', 'p2', 0), vote('p2', 'p1', 1)]); // 1-1 tie at max
    expect(s.scores).toEqual({ p1: 2, p2: 2 }); // both designated, both ×2
    const v = w2.view(s, 'p1');
    if (v.phase !== 'reveal') throw new Error('expected reveal');
    expect(v.designated).toEqual(['p1', 'p2']);
    expect(v.delta).toEqual({ p1: 2, p2: 2 });
    expect(v.roundMultiplier).toBe(2);
  });

  it('doubleFromRound triggers the multiplier from an absolute round onward', () => {
    const w = createTracer('wd', { totalRounds: 3, finalRoundMultiplier: 2, doubleFromRound: 1 });
    let s = w.init('s', players, content);
    s = playToVerdict(w, s, [vote('p1', 'p3', 0), vote('p2', 'p3', 1), vote('p3', 'p1', 2)]); // r0 -> +1
    expect(s.scores.p3).toBe(1);
    s = stepNext(w, s);
    s = playToVerdict(w, s, [vote('p1', 'p3', 10), vote('p2', 'p3', 11), vote('p3', 'p1', 12)]); // r1 -> ×2 -> +2
    const v = w.view(s, 'p1');
    if (v.phase !== 'reveal') throw new Error('expected reveal');
    expect(v.roundMultiplier).toBe(2);
    expect(s.scores.p3).toBe(3);
  });

  it('a misconfigured multiplier (<= 0) is clamped to identity — never zeroes the award', () => {
    const bad = createTracer('bad', { totalRounds: 1, finalRoundMultiplier: 0 });
    let s = bad.init('s', players, content);
    s = playToVerdict(bad, s, [vote('p1', 'p3', 0), vote('p2', 'p3', 1), vote('p3', 'p1', 2)]);
    expect(s.scores.p3).toBe(1); // ×1, not ×0
    const v = bad.view(s, 'p1');
    if (v.phase !== 'reveal') throw new Error('expected reveal');
    expect(v.roundMultiplier).toBe(1);
  });
});

describe('CC-5 cliffhanger epilogue — derived at over from PUBLIC state only', () => {
  it('closeFinish flags a nailbiter (top-2 gap within threshold) with the mvp', () => {
    // 3 rounds, p3 wins r0+r1, p1 wins r2: scores p3:2 p1:1 -> gap 1 -> close.
    let s: TracerState = tracer.init('s', players, content);
    s = playToVerdict(tracer, s, [vote('p1', 'p3', 0), vote('p2', 'p3', 1), vote('p3', 'p1', 2)]);
    s = stepNext(tracer, s);
    s = playToVerdict(tracer, s, [vote('p1', 'p3', 10), vote('p2', 'p3', 11), vote('p3', 'p1', 12)]);
    s = stepNext(tracer, s);
    s = playToVerdict(tracer, s, [vote('p2', 'p1', 20), vote('p3', 'p1', 21), vote('p1', 'p2', 22)]);
    s = stepNext(tracer, s); // -> over
    expect(s.phase).toBe('over');
    const v = tracer.view(s, 'p1');
    if (v.phase !== 'over') throw new Error('expected over');
    expect(v.scores).toEqual({ p1: 1, p2: 0, p3: 2 });
    expect(v.cliffhanger.closeFinish).toBe(true); // gap of 1 == default threshold
    expect(v.cliffhanger.topGap).toBe(1);
    expect(v.cliffhanger.mvp).toBe('p3'); // sole leader
  });

  it('a runaway (gap above threshold) is NOT a close finish', () => {
    // p3 wins all 3 -> p3:3 vs 0 -> gap 3 > default 1 -> not close.
    let s: TracerState = tracer.init('s', players, content);
    for (let r = 0; r < 3; r++) {
      s = playToVerdict(tracer, s, [vote('p1', 'p3', r * 3), vote('p2', 'p3', r * 3 + 1), vote('p3', 'p1', r * 3 + 2)]);
      s = stepNext(tracer, s);
    }
    const v = tracer.view(s, 'spectator');
    if (v.phase !== 'over') throw new Error('expected over');
    expect(v.cliffhanger.closeFinish).toBe(false);
    expect(v.cliffhanger.topGap).toBe(3);
    expect(v.cliffhanger.mvp).toBe('p3');
  });

  it('a tied-for-first crown has NO single mvp (mvp === null)', () => {
    // single round, 1-1 tie: p1 & p2 both at 1, tie for first.
    const m = createTracer('tie', { totalRounds: 1 });
    let s = m.init('s', ['p1', 'p2'], content);
    s = playToVerdict(m, s, [vote('p1', 'p2', 0), vote('p2', 'p1', 1)]);
    s = stepNext(m, s);
    const v = m.view(s, 'p1');
    if (v.phase !== 'over') throw new Error('expected over');
    expect(v.scores).toEqual({ p1: 1, p2: 1 });
    expect(v.cliffhanger.mvp).toBeNull();
    expect(v.cliffhanger.topGap).toBe(0);
    expect(v.cliffhanger.closeFinish).toBe(true); // gap 0 <= threshold
  });

  it('the longest hot-seat streak names the player who was pointed at most rounds running', () => {
    // p3 designated r0 & r1 (streak 2), then p1 designated r2 (p3 streak resets).
    let s: TracerState = tracer.init('s', players, content);
    s = playToVerdict(tracer, s, [vote('p1', 'p3', 0), vote('p2', 'p3', 1), vote('p3', 'p1', 2)]);
    s = stepNext(tracer, s);
    s = playToVerdict(tracer, s, [vote('p1', 'p3', 10), vote('p2', 'p3', 11), vote('p3', 'p1', 12)]);
    s = stepNext(tracer, s);
    s = playToVerdict(tracer, s, [vote('p2', 'p1', 20), vote('p3', 'p1', 21), vote('p1', 'p2', 22)]);
    s = stepNext(tracer, s);
    const v = tracer.view(s, 'p2');
    if (v.phase !== 'over') throw new Error('expected over');
    expect(v.cliffhanger.longestHotSeat).toEqual({ value: 2, players: ['p3'] });
  });

  it('the epilogue carries NO secret and never serialises a ballot', () => {
    let s: TracerState = tracer.init('audit', players, content);
    for (let r = 0; r < 3; r++) {
      s = playToVerdict(tracer, s, [vote('p1', 'p2', r * 3), vote('p2', 'p3', r * 3 + 1), vote('p3', 'p1', r * 3 + 2)]);
      s = stepNext(tracer, s);
    }
    // identical for every viewer (aggregate-derived, no per-viewer secret)
    const ref = tracer.view(s, players[0]!);
    for (const viewer of [...players, 'spectator-x', '__proto__']) {
      const v = tracer.view(s, viewer);
      expect(v).toEqual(ref);
      expect(JSON.stringify(v)).not.toContain('"votes"');
      expect(JSON.stringify(v)).not.toContain('"hotStreaks"'); // raw running map never leaks
    }
  });
});

describe('CC-5 hot-seat tease in the reveal view (live current streak)', () => {
  it('suspense holds an EMPTY hotSeat map; the verdict slam reveals the live streak', () => {
    // p3 wins r0 (streak 1) and r1 (streak 2).
    let s: TracerState = tracer.init('s', players, content);
    s = playToVerdict(tracer, s, [vote('p1', 'p3', 0), vote('p2', 'p3', 1), vote('p3', 'p1', 2)]);
    s = stepNext(tracer, s);
    // r1: drive to suspense first to check it holds empty, then verdict
    let r1 = tracer.reduce(s, vote('p1', 'p3', 10)).state;
    r1 = tracer.reduce(r1, vote('p2', 'p3', 11)).state;
    r1 = tracer.reduce(r1, vote('p3', 'p1', 12)).state; // early-resolve -> suspense
    expect(r1.revealStep).toBe('suspense');
    const sv = tracer.view(r1, 'p1');
    if (sv.phase !== 'reveal') throw new Error('expected reveal');
    expect(sv.hotSeat).toEqual({}); // streak not advanced yet — held at suspense
    const verdict = tracer.reduce(r1, { type: 'deadline', at: 13 }).state;
    const vv = tracer.view(verdict, 'p1');
    if (vv.phase !== 'reveal') throw new Error('expected reveal');
    expect(vv.hotSeat).toEqual({ p3: 2 }); // p3 on a 2-round roll — the tease
  });

  it('the reveal hotSeat / roundMultiplier are byte-identical for every viewer (no leak)', () => {
    const s = playToVerdict(tracer, tracer.init('s', players, content),
      [vote('p1', 'p3', 0), vote('p2', 'p3', 1), vote('p3', 'p1', 2)]);
    const ref = tracer.view(s, players[0]!);
    if (ref.phase !== 'reveal') throw new Error('expected reveal');
    for (const viewer of [...players, 'spectator-x', '__proto__']) {
      const v = tracer.view(s, viewer);
      if (v.phase !== 'reveal') throw new Error('expected reveal');
      expect(v.hotSeat).toEqual(ref.hotSeat);
      expect(v.roundMultiplier).toEqual(ref.roundMultiplier);
      expect(JSON.stringify(v)).not.toContain('"votes"');
    }
  });
});
