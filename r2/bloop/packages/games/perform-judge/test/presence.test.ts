import { describe, expect, it } from 'vitest';
import {
  createPerformJudge,
  DEVINE_L_ACTION_CONFIG,
  DEVINE_L_OBJET_CONFIG,
  DOUBLE_LE_MOUVEMENT_CONFIG,
  MIME_INVERSE_CONFIG,
} from '@bloop/game-perform-judge';
import { act, deadline, fold, left, makeContent, others, rejoined, vote, walkToOver } from './fixtures.js';

const guided = createPerformJudge('devine-l-action', DEVINE_L_ACTION_CONFIG);
const credit = createPerformJudge('devine-l-objet', DEVINE_L_OBJET_CONFIG);
const puppet = createPerformJudge('mime-inverse', MIME_INVERSE_CONFIG);
const rateMod = createPerformJudge('double-le-mouvement', DOUBLE_LE_MOUVEMENT_CONFIG);

const P3 = ['p1', 'p2', 'p3'];
const P4 = ['p1', 'p2', 'p3', 'p4'];
const P5 = ['p1', 'p2', 'p3', 'p4', 'p5'];

describe('presence flips', () => {
  it('left/rejoined flip; unknown ids and redundant flips are same-reference no-ops', () => {
    const s = guided.init('s', P3, makeContent());
    expect(guided.reduce(s, left('ghost', 0)).state).toBe(s);
    expect(guided.reduce(s, rejoined('p1', 0)).state).toBe(s); // already connected
    const helper = others(s)[0]!;
    const s1 = fold(guided, s, [left(helper, 1)]);
    expect(s1.connected[helper]).toBe(false);
    expect(guided.reduce(s1, left(helper, 2)).state).toBe(s1);
    const s2 = fold(guided, s1, [rejoined(helper, 3)]);
    expect(s2.connected[helper]).toBe(true);
    expect(s2.scores[helper]).toBe(0); // seat greyed, never freed; scores preserved
  });
});

describe('a disconnected player never blocks a phase', () => {
  it('guided verdict: the absent helper is not expected; the present one resolves alone', () => {
    let s = guided.init('s', P3, makeContent());
    const [h1, h2] = others(s) as [string, string];
    s = fold(guided, s, [left(h2, 0), deadline(1), act(s.performer, { kind: 'claimDone' }, 2)]);
    expect(s.phase).toBe('judge');
    const s2 = fold(guided, s, [vote(h1, 'yes', 3)]);
    expect(s2.phase).toBe('reveal'); // h2 was never expected
  });

  it('a leave can COMPLETE the expected set mid-judge', () => {
    let s = guided.init('s', P3, makeContent());
    const [h1, h2] = others(s) as [string, string];
    s = fold(guided, s, [deadline(0), act(s.performer, { kind: 'claimDone' }, 1), vote(h1, 'yes', 2)]);
    expect(s.phase).toBe('judge');
    const s2 = fold(guided, s, [left(h2, 3)]);
    expect(s2.phase).toBe('reveal'); // the leave completed the set
    expect(s2.lastResult?.outcome).toBe('success');
  });

  it('a rejoined judge is re-expected', () => {
    let s = guided.init('s', P3, makeContent());
    const [h1, h2] = others(s) as [string, string];
    s = fold(guided, s, [deadline(0), act(s.performer, { kind: 'claimDone' }, 1), left(h2, 2), rejoined(h2, 3)]);
    const s2 = fold(guided, s, [vote(h1, 'yes', 4)]);
    expect(s2.phase).toBe('judge'); // h2 is expected again
    const s3 = fold(guided, s2, [vote(h2, 'yes', 5)]);
    expect(s3.phase).toBe('reveal');
  });
});

describe('performer departures', () => {
  it('guided: ready -> void; perform -> fail; verdict -> the votes still decide', () => {
    const s0 = guided.init('s', P4, makeContent());
    const r = fold(guided, s0, [left(s0.performer, 0)]);
    expect(r.phase).toBe('reveal');
    expect(r.lastResult?.outcome).toBe('void');

    const p = fold(guided, s0, [deadline(0), left(s0.performer, 1)]);
    expect(p.phase).toBe('reveal');
    expect(p.lastResult?.outcome).toBe('fail');

    let j = fold(guided, s0, [deadline(0), act(s0.performer, { kind: 'claimDone' }, 1)]);
    const hs = others(j);
    j = fold(guided, j, [vote(hs[0]!, 'yes', 2), left(j.performer, 3)]);
    expect(j.phase).toBe('judge'); // verdict carries on without the performer
    const done = fold(guided, j, [vote(hs[1]!, 'yes', 4), vote(hs[2]!, 'yes', 5)]);
    expect(done.phase).toBe('reveal');
    expect(done.lastResult?.outcome).toBe('success');
    expect(done.scores[s0.performer]).toBe(10); // scores preserved for the greyed seat
  });

  it('credit: performer leaving mid-mime is MISSED, no pass burnt', () => {
    const s0 = credit.init('s', P3, makeContent());
    const s = fold(credit, s0, [deadline(0), left(s0.performer, 1)]);
    expect(s.phase).toBe('reveal');
    expect(s.lastResult?.outcome).toBe('fail');
    expect(s.passesLeft[s0.performer]).toBe(1);
  });

  it('puppet: the spotlight leaving voids the turn (perform AND verdict)', () => {
    const s0 = puppet.init('s', P3, makeContent());
    const a = fold(puppet, s0, [left(s0.performer, 1)]);
    expect(a.phase).toBe('reveal');
    expect(a.lastResult?.outcome).toBe('void');
    const b = fold(puppet, s0, [deadline(1), left(s0.performer, 2)]);
    expect(b.phase).toBe('reveal');
    expect(b.lastResult?.outcome).toBe('void');
  });

  it('rate: the mover leaving voids straight into the next turn', () => {
    const s0 = rateMod.init('s', P5, makeContent());
    const { state: s, effects } = rateMod.reduce(s0, left(s0.performer, 1));
    expect(s.phase).toBe('ready');
    expect(s.turnSeq).toBe(1); // new turn, nobody scored
    expect(Object.values(s.scores).every((n) => n === 0)).toBe(true);
    expect(effects.some((e) => e.type === 'analytics' && e.name === 'crew_left')).toBe(true);
    expect(s.performer).not.toBe(s0.performer);
  });
});

describe('rate dubber semantics', () => {
  it('dubber leaving during the brief is reassigned to the next connected seat', () => {
    const s0 = rateMod.init('s', P5, makeContent());
    const oldDubber = s0.partner!;
    const s = fold(rateMod, s0, [left(oldDubber, 1)]);
    expect(s.phase).toBe('ready');
    expect(s.partner).not.toBe(oldDubber);
    expect(s.partner).not.toBe(s.performer);
    expect(s.partner).not.toBeNull();
  });

  it('dubber leaving mid-perform finishes solo and is STILL scored as a duo', () => {
    const s0 = rateMod.init('s', P4, makeContent());
    const dubber = s0.partner!;
    let s = fold(rateMod, s0, [deadline(0), left(dubber, 1)]);
    expect(s.phase).toBe('perform');
    expect(s.partner).toBe(dubber); // not reassigned mid-show
    s = fold(rateMod, s, [deadline(2), deadline(3)]); // rate with zero ballots -> default 3.0
    expect(s.lastResult?.outcome).toBe('success');
    expect(s.scores[dubber]).toBe(60);
  });

  it('the mover done-tap resolves perform once the dubber has left', () => {
    const s0 = rateMod.init('s', P4, makeContent());
    let s = fold(rateMod, s0, [deadline(0), act(s0.performer, { kind: 'done' }, 1)]);
    expect(s.phase).toBe('perform'); // still waiting on the dubber
    s = fold(rateMod, s, [left(s0.partner!, 2)]);
    expect(s.phase).toBe('judge'); // the leave completed the crew set
  });
});

describe('puppet early-majority under churn', () => {
  it('a commander leave that shrinks E below the tap count resolves success-early', () => {
    const s0 = puppet.init('s', P5, makeContent());
    const cs = others(s0); // 4 commanders, goal 3
    let s = fold(puppet, s0, [act(cs[0]!, { kind: 'tap' }, 1), act(cs[1]!, { kind: 'tap' }, 2)]);
    expect(s.phase).toBe('perform'); // 2 of 4 < 3
    s = fold(puppet, s, [left(cs[3]!, 3)]); // E shrinks to 3, goal floor(3/2)+1 = 2
    expect(s.phase).toBe('reveal');
    expect(s.lastResult?.outcome).toBe('success-early');
  });
});

describe('a fully passive / disconnected room still ends', () => {
  it('guided: everyone leaves at the start; deadlines alone roll to over', () => {
    let s = guided.init('s', P3, makeContent(40));
    for (const p of P3) s = guided.reduce(s, left(p, 0)).state;
    const { state, effects } = walkToOver(guided, s, 60);
    expect(state.phase).toBe('over');
    expect(effects.filter((e) => e.type === 'gameOver')).toHaveLength(1);
  });

  it('rate: everyone leaves mid-game; the walk still terminates', () => {
    let s = rateMod.init('s', P4, makeContent(20));
    s = fold(rateMod, s, [deadline(0)]); // into perform
    for (const p of P4) s = rateMod.reduce(s, left(p, 1)).state;
    expect(s.phase === 'ready' || s.phase === 'perform' || s.phase === 'judge' || s.phase === 'reveal').toBe(true);
    const { state } = walkToOver(rateMod, s, 60);
    expect(state.phase).toBe('over');
  });
});
