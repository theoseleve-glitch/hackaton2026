import { describe, expect, it } from 'vitest';
import {
  createPerformJudge,
  DEVINE_L_ACTION_CONFIG,
  DEVINE_L_OBJET_CONFIG,
  DOUBLE_LE_MOUVEMENT_CONFIG,
  MIME_INVERSE_CONFIG,
  performJudgeActionSchema,
} from '@bloop/game-perform-judge';
import { act, deadline, fold, left, makeContent, others, rate, vote } from './fixtures.js';

const guided = createPerformJudge('devine-l-action', DEVINE_L_ACTION_CONFIG);
const credit = createPerformJudge('devine-l-objet', DEVINE_L_OBJET_CONFIG);
const puppet = createPerformJudge('mime-inverse', MIME_INVERSE_CONFIG);
const rateMod = createPerformJudge('double-le-mouvement', DOUBLE_LE_MOUVEMENT_CONFIG);

const P3 = ['p1', 'p2', 'p3'];
const P4 = ['p1', 'p2', 'p3', 'p4'];
const P5 = ['p1', 'p2', 'p3', 'p4', 'p5'];

describe('zod action schema (boundary)', () => {
  it('accepts every reducer action and rejects junk', () => {
    for (const a of [
      { kind: 'ready' }, { kind: 'pick', index: 1 }, { kind: 'claimDone' }, { kind: 'giveUp' },
      { kind: 'pass' }, { kind: 'claimFound', guesser: 'p2' }, { kind: 'done' }, { kind: 'tap' },
      { kind: 'vote', vote: 'yes' }, { kind: 'rate', stars: 5 },
    ]) {
      expect(performJudgeActionSchema.safeParse(a).success).toBe(true);
    }
    for (const a of [
      { kind: 'vote', vote: 'maybe' }, { kind: 'rate', stars: 0 }, { kind: 'rate', stars: 6 },
      { kind: 'rate', stars: 2.5 }, { kind: 'pick', index: -1 }, { kind: 'pick', index: 1.5 },
      { kind: 'claimFound', guesser: '' }, { kind: 'nope' }, 'tap', null,
    ]) {
      expect(performJudgeActionSchema.safeParse(a).success).toBe(false);
    }
  });
});

describe('roster + phase gating (same-reference rejections)', () => {
  it('rejects non-roster actors, including __proto__', () => {
    const s = guided.init('s', P3, makeContent());
    expect(guided.reduce(s, act('ghost', { kind: 'ready' })).state).toBe(s);
    expect(guided.reduce(s, act('__proto__', { kind: 'ready' })).state).toBe(s);
  });

  it('guided ready: only the performer can tap Prêt; credit ready accepts no actions', () => {
    const g = guided.init('s', P3, makeContent());
    expect(guided.reduce(g, act(others(g)[0]!, { kind: 'ready' })).state).toBe(g);
    const g2 = guided.reduce(g, act(g.performer, { kind: 'ready' }, 1234)).state;
    expect(g2.phase).toBe('perform');
    expect(g2.performStartedAt).toBe(1234);

    const c = credit.init('s', P3, makeContent());
    expect(credit.reduce(c, act(c.performer, { kind: 'ready' })).state).toBe(c);
    expect(credit.reduce(c, act(c.performer, { kind: 'claimDone' })).state).toBe(c);
  });

  it('actions outside their phase are rejected', () => {
    let s = guided.init('s', P3, makeContent());
    expect(guided.reduce(s, vote('p1', 'yes')).state).toBe(s); // vote in ready
    s = fold(guided, s, [deadline(0)]);
    expect(guided.reduce(s, act(s.performer, { kind: 'ready' }, 1)).state).toBe(s); // ready in perform
    s = fold(guided, s, [deadline(1)]); // timeout -> reveal
    expect(guided.reduce(s, act(s.performer, { kind: 'claimDone' }, 2)).state).toBe(s);
  });
});

describe('guided perform actions', () => {
  function inPerform() {
    const s0 = guided.init('s', P3, makeContent());
    return fold(guided, s0, [deadline(0)]);
  }

  it('claimDone by a helper is rejected; by the performer it enters judge', () => {
    const s = inPerform();
    expect(guided.reduce(s, act(others(s)[0]!, { kind: 'claimDone' }, 1)).state).toBe(s);
    const s2 = fold(guided, s, [act(s.performer, { kind: 'claimDone' }, 1)]);
    expect(s2.phase).toBe('judge');
  });

  it('giveUp resolves to a 0-point fail', () => {
    const s = inPerform();
    const s2 = fold(guided, s, [act(s.performer, { kind: 'giveUp' }, 1)]);
    expect(s2.phase).toBe('reveal');
    expect(s2.lastResult?.outcome).toBe('fail');
    expect(Object.values(s2.scores).every((n) => n === 0)).toBe(true);
  });

  it('pass burns the single pass; a second pass by the same player is rejected', () => {
    const s = inPerform();
    const performer = s.performer;
    const s2 = fold(guided, s, [act(performer, { kind: 'pass' }, 1)]);
    expect(s2.lastResult?.outcome).toBe('passed');
    expect(s2.passesLeft[performer]).toBe(0);
    // walk to the same performer's second turn (3 players, lap 2)
    let w = s2;
    while (w.phase !== 'over' && !(w.phase === 'perform' && w.performer === performer)) {
      w = guided.reduce(w, deadline(2)).state;
    }
    expect(w.phase).toBe('perform');
    expect(guided.reduce(w, act(performer, { kind: 'pass' }, 3)).state).toBe(w);
  });

  it('a perform timeout does NOT burn a pass', () => {
    const s = inPerform();
    const s2 = fold(guided, s, [deadline(1)]);
    expect(s2.lastResult?.outcome).toBe('fail');
    expect(s2.passesLeft[s2.lastResult!.performer]).toBe(1);
  });
});

describe('credit claim-credit', () => {
  function inMime() {
    const s0 = credit.init('s', P3, makeContent());
    return fold(credit, s0, [deadline(1_000)]);
  }

  it('rejects a ghost / self / disconnected guesser', () => {
    const s = inMime();
    expect(credit.reduce(s, act(s.performer, { kind: 'claimFound', guesser: 'ghost' }, 1)).state).toBe(s);
    expect(credit.reduce(s, act(s.performer, { kind: 'claimFound', guesser: s.performer }, 1)).state).toBe(s);
    const gone = others(s)[0]!;
    const s2 = fold(credit, s, [left(gone, 2)]);
    expect(credit.reduce(s2, act(s2.performer, { kind: 'claimFound', guesser: gone }, 3)).state).toBe(s2);
  });

  it('a valid claim enters validate with the guesser on the table', () => {
    const s = inMime();
    const guesser = others(s)[0]!;
    const s2 = fold(credit, s, [act(s.performer, { kind: 'claimFound', guesser }, 5_000)]);
    expect(s2.phase).toBe('judge');
    expect(s2.claim).toEqual({ guesser, at: 5_000 });
    const v = credit.view(s2, guesser);
    if (v.phase !== 'judge') throw new Error('expected judge view');
    expect(v.claimedGuesser).toBe(guesser);
    expect(v.youCanVote).toBe(false); // the credited guesser never votes
  });

  it('only the performer can claim; a helper claim is rejected', () => {
    const s = inMime();
    const helper = others(s)[0]!;
    expect(credit.reduce(s, act(helper, { kind: 'claimFound', guesser: others(s)[1]! }, 1)).state).toBe(s);
  });

  it('credit pass costs 0 points and burns the pass; timeout (missed) burns nothing', () => {
    const s = inMime();
    const s2 = fold(credit, s, [act(s.performer, { kind: 'pass' }, 1)]);
    expect(s2.lastResult?.outcome).toBe('passed');
    expect(s2.passesLeft[s2.lastResult!.performer]).toBe(0);
    expect(Object.values(s2.scores).every((n) => n === 0)).toBe(true);
    const s3 = fold(credit, s, [deadline(1)]);
    expect(s3.lastResult?.outcome).toBe('fail');
    expect(s3.passesLeft[s3.lastResult!.performer]).toBe(1);
  });
});

describe('puppet taps', () => {
  it('rejects performer taps, disconnected taps and duplicates', () => {
    const s = puppet.init('s', P5, makeContent());
    expect(puppet.reduce(s, act(s.performer, { kind: 'tap' }, 1)).state).toBe(s);
    const c1 = others(s)[0]!;
    const s2 = fold(puppet, s, [left(c1, 1)]);
    expect(puppet.reduce(s2, act(c1, { kind: 'tap' }, 2)).state).toBe(s2);
    const c2 = others(s)[1]!;
    const s3 = fold(puppet, s, [act(c2, { kind: 'tap' }, 2)]);
    expect(puppet.reduce(s3, act(c2, { kind: 'tap' }, 3)).state).toBe(s3);
  });

  it('a strict majority of connected commanders resolves success-early', () => {
    const s = puppet.init('s', P5, makeContent());
    const cs = others(s); // 4 commanders -> goal floor(4/2)+1 = 3
    let s2 = fold(puppet, s, [act(cs[0]!, { kind: 'tap' }, 1), act(cs[1]!, { kind: 'tap' }, 2)]);
    expect(s2.phase).toBe('perform'); // 2 < 3
    s2 = fold(puppet, s2, [act(cs[2]!, { kind: 'tap' }, 3)]);
    expect(s2.phase).toBe('reveal');
    expect(s2.lastResult?.outcome).toBe('success-early');
  });

  it('taps carry over as pre-cast Oui at the verdict', () => {
    const s = puppet.init('s', P5, makeContent());
    const cs = others(s);
    let s2 = fold(puppet, s, [act(cs[0]!, { kind: 'tap' }, 1), act(cs[1]!, { kind: 'tap' }, 2), deadline(3)]);
    expect(s2.phase).toBe('judge');
    const v = puppet.view(s2, cs[0]!);
    if (v.phase !== 'judge') throw new Error('expected judge view');
    expect(v.votesIn).toBe(2);
    expect(v.myVote).toBe('yes'); // pre-cast and locked
    expect(puppet.reduce(s2, vote(cs[0]!, 'no', 4)).state).toBe(s2);
    s2 = fold(puppet, s2, [vote(cs[2]!, 'no', 4), vote(cs[3]!, 'no', 5)]);
    expect(s2.phase).toBe('reveal'); // all 4 acted -> resolved (2 yes / 2 no, ties generous)
    expect(s2.lastResult?.outcome).toBe('success');
  });
});

describe('rate brief + perform actions', () => {
  it('pick: wrong sender, bad index and non-integers are rejected; a valid pick starts the show', () => {
    const s = rateMod.init('s', P4, makeContent());
    const audience = P4.filter((p) => p !== s.performer && p !== s.partner);
    expect(rateMod.reduce(s, act(s.partner!, { kind: 'pick', index: 0 }, 1)).state).toBe(s);
    expect(rateMod.reduce(s, act(audience[0]!, { kind: 'pick', index: 0 }, 1)).state).toBe(s);
    expect(rateMod.reduce(s, act(s.performer, { kind: 'pick', index: 2 }, 1)).state).toBe(s);
    expect(rateMod.reduce(s, act(s.performer, { kind: 'pick', index: -1 }, 1)).state).toBe(s);
    expect(rateMod.reduce(s, act(s.performer, { kind: 'pick', index: 0.5 }, 1)).state).toBe(s);
    const s2 = fold(rateMod, s, [act(s.performer, { kind: 'pick', index: 1 }, 1)]);
    expect(s2.phase).toBe('perform');
    expect(s2.chosenIndex).toBe(1);
  });

  it('a brief timeout auto-picks offer[0] deterministically', () => {
    const s = rateMod.init('s', P4, makeContent());
    const s2 = fold(rateMod, s, [deadline(1)]);
    expect(s2.phase).toBe('perform');
    expect(s2.chosenIndex).toBe(0);
  });

  it('done: audience rejected, duplicates rejected; both crew done ends the show early', () => {
    const s0 = rateMod.init('s', P4, makeContent());
    const s = fold(rateMod, s0, [deadline(1)]);
    const audience = P4.filter((p) => p !== s.performer && p !== s.partner);
    expect(rateMod.reduce(s, act(audience[0]!, { kind: 'done' }, 2)).state).toBe(s);
    const s2 = fold(rateMod, s, [act(s.performer, { kind: 'done' }, 2)]);
    expect(s2.phase).toBe('perform');
    expect(rateMod.reduce(s2, act(s.performer, { kind: 'done' }, 3)).state).toBe(s2);
    const s3 = fold(rateMod, s2, [act(s.partner!, { kind: 'done' }, 3)]);
    expect(s3.phase).toBe('judge');
  });
});

describe('judge votes and stars', () => {
  it('guided: performer cannot vote; first vote locks; all-acted resolves', () => {
    let s = guided.init('s', P3, makeContent());
    s = fold(guided, s, [deadline(0), act(s.performer, { kind: 'claimDone' }, 1)]);
    const [h1, h2] = others(s) as [string, string];
    expect(guided.reduce(s, vote(s.performer, 'yes', 2)).state).toBe(s);
    const s2 = fold(guided, s, [vote(h1, 'yes', 2)]);
    expect(guided.reduce(s2, vote(h1, 'no', 3)).state).toBe(s2); // locked
    expect(guided.reduce(s2, rate(h2, 5, 3)).state).toBe(s2); // wrong action kind for verdict
    const s3 = fold(guided, s2, [vote(h2, 'yes', 3)]);
    expect(s3.phase).toBe('reveal');
  });

  it('rate: crew cannot rate; stars are re-guarded 1..5 integer; first tap locks', () => {
    let s = rateMod.init('s', P4, makeContent());
    s = fold(rateMod, s, [deadline(0), deadline(1)]);
    expect(s.phase).toBe('judge');
    const raters = P4.filter((p) => p !== s.performer && p !== s.partner);
    expect(rateMod.reduce(s, rate(s.performer, 5, 2)).state).toBe(s);
    expect(rateMod.reduce(s, rate(s.partner!, 5, 2)).state).toBe(s);
    expect(rateMod.reduce(s, rate(raters[0]!, 0, 2)).state).toBe(s);
    expect(rateMod.reduce(s, rate(raters[0]!, 6, 2)).state).toBe(s);
    expect(rateMod.reduce(s, rate(raters[0]!, 2.5, 2)).state).toBe(s);
    expect(rateMod.reduce(s, vote(raters[0]!, 'yes', 2)).state).toBe(s); // wrong kind for stars
    const s2 = fold(rateMod, s, [rate(raters[0]!, 4, 2)]);
    expect(rateMod.reduce(s2, rate(raters[0]!, 5, 3)).state).toBe(s2); // locked
    const s3 = fold(rateMod, s2, [rate(raters[1]!, 5, 3)]);
    expect(s3.phase).toBe('reveal');
  });

  it('reveal and scoreboard accept no actions', () => {
    let s = guided.init('s', P3, makeContent());
    s = fold(guided, s, [deadline(0), deadline(1)]); // timeout fail -> reveal
    expect(s.phase).toBe('reveal');
    expect(guided.reduce(s, vote(others(s)[0]!, 'yes', 2)).state).toBe(s);
    expect(guided.reduce(s, act(s.performer, { kind: 'pass' }, 2)).state).toBe(s);
  });
});
