// CC-4 — audience live-reaction taps (`react` channel) during `perform`.
// The keystone is a NON-SCORING, fixed-enum, audience-only micro-agency channel:
// public per-enum counts, owner-only echo for "what did I react", cleared at
// phase exit, riding into the reveal card. These guards prove the three hard
// invariants from the brief: (a) a react NEVER leaks to a non-owner, (b) it
// NEVER changes the primary early-resolve (allActed) condition, (c) every
// reject-invalid (wrong phase / ineligible actor / duplicate / bad enum)
// returns the SAME state reference.
import { describe, expect, it } from 'vitest';
import {
  createPerformJudge,
  DEVINE_L_ACTION_CONFIG,
  DEVINE_L_OBJET_CONFIG,
  DOUBLE_LE_MOUVEMENT_CONFIG,
  MIME_INVERSE_CONFIG,
  performJudgeActionSchema,
  type PerformJudgeAction,
} from '@bloop/game-perform-judge';
import { act, deadline, fold, left, makeContent, others } from './fixtures.js';

const guided = createPerformJudge('devine-l-action', DEVINE_L_ACTION_CONFIG);
const credit = createPerformJudge('devine-l-objet', DEVINE_L_OBJET_CONFIG);
const puppet = createPerformJudge('mime-inverse', MIME_INVERSE_CONFIG);
const rateMod = createPerformJudge('double-le-mouvement', DOUBLE_LE_MOUVEMENT_CONFIG);

const P3 = ['p1', 'p2', 'p3'];
const P4 = ['p1', 'p2', 'p3', 'p4'];
const P5 = ['p1', 'p2', 'p3', 'p4', 'p5'];
const OUTSIDERS = ['spectator-x', '__proto__'];

const react = (_playerId: string, reaction: 'fire' | 'laugh' | 'cringe'): PerformJudgeAction =>
  ({ kind: 'react', reaction });

/** credit perform: performer mimes; the room is idle audience (the dead beat). */
function creditPerform() {
  const s0 = credit.init('s', P4, makeContent());
  return fold(credit, s0, [deadline(0)]);
}

/** rate perform: crew (mover + dubber) on stage; the rest of the room is audience. */
function ratePerform() {
  const s0 = rateMod.init('s', P4, makeContent());
  return fold(rateMod, s0, [deadline(0)]); // auto-picks offer[0]
}

describe('CC-4 react — boundary schema (fixed enum, zero free text)', () => {
  it('accepts the three reactions and rejects junk reactions', () => {
    for (const r of ['fire', 'laugh', 'cringe']) {
      expect(performJudgeActionSchema.safeParse({ kind: 'react', reaction: r }).success).toBe(true);
    }
    for (const bad of [
      { kind: 'react', reaction: 'boo' }, { kind: 'react', reaction: '' },
      { kind: 'react', reaction: 1 }, { kind: 'react' }, { kind: 'react', reaction: null },
    ]) {
      expect(performJudgeActionSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('CC-4 react — accepted from the audience, accumulates public counts', () => {
  it('credit: an idle audience member reacts; the count is public to everyone', () => {
    const s = creditPerform();
    const audience = others(s); // performer mimes; all non-performers are audience
    const s2 = fold(credit, s, [act(audience[0]!, react(audience[0]!, 'fire'), 1)]);
    expect(s2.phase).toBe('perform'); // STILL perform — a react never resolves
    // public per-enum count visible to every viewer (performer, other audience, outsider)
    for (const viewer of [s.performer, audience[1]!, ...OUTSIDERS]) {
      const v = credit.view(s2, viewer);
      if (v.phase !== 'perform') throw new Error('expected perform');
      expect(v.reactionCounts).toEqual({ fire: 1, laugh: 0, cringe: 0 });
    }
  });

  it('rate: the audience (non-crew) reacts during the dead 30s watch beat', () => {
    const s = ratePerform();
    const audience = P4.filter((p) => p !== s.performer && p !== s.partner);
    expect(audience.length).toBeGreaterThan(0);
    let s2 = s;
    s2 = fold(rateMod, s2, [act(audience[0]!, react(audience[0]!, 'laugh'), 1)]);
    const v = rateMod.view(s2, s.performer);
    if (v.phase !== 'perform') throw new Error('expected perform');
    expect(v.reactionCounts).toEqual({ fire: 0, laugh: 1, cringe: 0 });
  });

  it('reactions ride into the reveal card as a public aggregate', () => {
    let s = creditPerform();
    const audience = others(s);
    s = fold(credit, s, [
      act(audience[0]!, react(audience[0]!, 'fire'), 1),
      act(audience[1]!, react(audience[1]!, 'fire'), 2),
      act(audience[2]!, react(audience[2]!, 'cringe'), 3),
    ]);
    // timeout the mime -> reveal (MISSED). The reaction tally rides in.
    s = fold(credit, s, [deadline(50_000)]);
    expect(s.phase).toBe('reveal');
    expect(s.lastResult?.reactions).toEqual({ fire: 2, laugh: 0, cringe: 1 });
    const v = credit.view(s, OUTSIDERS[0]!);
    if (v.phase !== 'reveal') throw new Error('expected reveal');
    expect(v.result.reactions).toEqual({ fire: 2, laugh: 0, cringe: 1 });
  });

  it('reactions are cleared at the next turn entry (fresh per perform beat)', () => {
    let s = creditPerform();
    const audience = others(s);
    s = fold(credit, s, [act(audience[0]!, react(audience[0]!, 'fire'), 1)]);
    expect(Object.keys(s.reactions)).toHaveLength(1);
    // walk past reveal into the next turn's perform
    s = fold(credit, s, [deadline(50_000)]); // -> reveal
    s = fold(credit, s, [deadline(60_000)]); // reveal -> next turn (ready)
    s = fold(credit, s, [deadline(61_000)]); // ready -> perform
    expect(s.phase).toBe('perform');
    expect(Object.keys(s.reactions)).toHaveLength(0);
    const v = credit.view(s, s.performer);
    if (v.phase !== 'perform') throw new Error('expected perform');
    expect(v.reactionCounts).toEqual({ fire: 0, laugh: 0, cringe: 0 });
  });
});

describe('GUARD (a) — a react NEVER leaks to a non-owner', () => {
  it('only the owner sees their own reaction; non-owners see counts only, no value link', () => {
    const s = creditPerform();
    const audience = others(s); // [a0, a1, a2]
    // a0 reacts fire, a1 reacts cringe
    const s2 = fold(credit, s, [
      act(audience[0]!, react(audience[0]!, 'fire'), 1),
      act(audience[1]!, react(audience[1]!, 'cringe'), 2),
    ]);
    const v0 = credit.view(s2, audience[0]!);
    const v1 = credit.view(s2, audience[1]!);
    const v2 = credit.view(s2, audience[2]!); // reacted-not
    if (v0.phase !== 'perform' || v1.phase !== 'perform' || v2.phase !== 'perform') {
      throw new Error('expected perform');
    }
    // owner echo: each sees ONLY their own reaction
    expect(v0.myReaction).toBe('fire');
    expect(v1.myReaction).toBe('cringe');
    expect(v2.myReaction).toBeNull();
    // public counts are identical for everyone, but no per-player linkage anywhere
    for (const viewer of [s.performer, audience[2]!, ...OUTSIDERS]) {
      const v = credit.view(s2, viewer);
      if (v.phase !== 'perform') throw new Error('expected perform');
      expect(v.reactionCounts).toEqual({ fire: 1, laugh: 0, cringe: 1 });
      // the hidden `reactions` map never serializes into any view
      expect(JSON.stringify(v)).not.toContain('"reactions"');
    }
  });

  it("non-owner views are INVARIANT when only the owner-private reaction enum changes", () => {
    // two reactors swap enums: public per-enum counts stay identical, only each
    // owner's echo flips. A non-owner view must be byte-identical across scripts.
    const s = creditPerform();
    const audience = others(s);
    const sA = fold(credit, s, [
      act(audience[0]!, react(audience[0]!, 'fire'), 1),
      act(audience[1]!, react(audience[1]!, 'cringe'), 2),
    ]);
    const sB = fold(credit, s, [
      act(audience[0]!, react(audience[0]!, 'cringe'), 1),
      act(audience[1]!, react(audience[1]!, 'fire'), 2),
    ]);
    expect(credit.phaseKey(sA)).toBe(credit.phaseKey(sB));
    // non-owners (performer, third audience, outsiders) cannot distinguish
    for (const viewer of [s.performer, audience[2]!, ...OUTSIDERS]) {
      expect(credit.view(sA, viewer)).toEqual(credit.view(sB, viewer));
    }
    // but each owner DOES see their own flip
    const a0a = credit.view(sA, audience[0]!);
    const a0b = credit.view(sB, audience[0]!);
    if (a0a.phase !== 'perform' || a0b.phase !== 'perform') throw new Error('expected perform');
    expect(a0a.myReaction).toBe('fire');
    expect(a0b.myReaction).toBe('cringe');
  });

  it('a player id colliding with a prototype key gets a correct null echo, not a foreign value', () => {
    // __proto__ is in the audit roster set elsewhere; here verify hasOwnProperty
    // guarding: a real reactor uses a normal id, and __proto__ (non-roster, never
    // reacted) must see myReaction null and canReact false — never another's value.
    const s = creditPerform();
    const audience = others(s);
    const s2 = fold(credit, s, [act(audience[0]!, react(audience[0]!, 'fire'), 1)]);
    const v = credit.view(s2, '__proto__');
    if (v.phase !== 'perform') throw new Error('expected perform');
    expect(v.myReaction).toBeNull();
    expect(v.canReact).toBe(false); // not a connected roster audience member
  });
});

describe('GUARD (b) — a react NEVER changes the primary early-resolve (allActed)', () => {
  it('rate: audience reacts do NOT count toward the crew-done early-resolve', () => {
    const s = ratePerform();
    const audience = P4.filter((p) => p !== s.performer && p !== s.partner);
    // flood the audience with reactions — the crew has NOT pressed Done
    let s2 = s;
    for (const a of audience) s2 = fold(rateMod, s2, [act(a, react(a, 'fire'), 1)]);
    expect(s2.phase).toBe('perform'); // reactions never resolve the perform beat
    // the early-resolve still requires BOTH crew `done` taps, unchanged
    s2 = fold(rateMod, s2, [act(s.performer, { kind: 'done' }, 2)]);
    expect(s2.phase).toBe('perform'); // one of two crew done
    s2 = fold(rateMod, s2, [act(s.partner!, { kind: 'done' }, 3)]);
    expect(s2.phase).toBe('judge'); // BOTH crew done -> early-resolve, as before
  });

  it('puppet: a commander react does NOT count toward the strict tap-majority', () => {
    const s = puppet.init('s', P5, makeContent());
    const cs = others(s); // 4 commanders -> goal floor(4/2)+1 = 3
    // every commander REACTS (not taps) — must NOT trip success-early
    let s2 = s;
    for (const c of cs) s2 = fold(puppet, s2, [act(c, react(c, 'cringe'), 1)]);
    expect(s2.phase).toBe('perform'); // reactions are not taps
    expect(s2.lastResult).toBeNull();
    // the scoring tap channel is untouched: 3 real taps still resolve early
    s2 = fold(puppet, s2, [
      act(cs[0]!, { kind: 'tap' }, 2),
      act(cs[1]!, { kind: 'tap' }, 3),
      act(cs[2]!, { kind: 'tap' }, 4),
    ]);
    expect(s2.phase).toBe('reveal');
    expect(s2.lastResult?.outcome).toBe('success-early');
  });

  it('reacting does not change which players are still expected to tap/done (buffers stay separate)', () => {
    const s = ratePerform();
    const audience = P4.filter((p) => p !== s.performer && p !== s.partner);
    const before = JSON.stringify(rateMod.view(s, s.performer));
    const s2 = fold(rateMod, s, [act(audience[0]!, react(audience[0]!, 'laugh'), 1)]);
    const after = rateMod.view(s2, s.performer);
    if (after.phase !== 'perform') throw new Error('expected perform');
    // crewDone flags / myDone are unchanged by a react (only reactionCounts moved)
    const beforeObj = JSON.parse(before);
    expect(after.crewDone).toEqual(beforeObj.crewDone);
    expect(after.myDone).toEqual(beforeObj.myDone);
    expect(after.reactionCounts).toEqual({ fire: 0, laugh: 1, cringe: 0 });
  });
});

describe('GUARD (c) — reject-invalid returns the SAME state reference', () => {
  it('wrong phase: react in ready / judge / reveal is rejected (same ref)', () => {
    // ready (credit) — audience cannot react before the perform beat
    const ready = credit.init('s', P4, makeContent());
    expect(ready.phase).toBe('ready');
    expect(credit.reduce(ready, act('p1', react('p1', 'fire'), 1)).state).toBe(ready);
    // judge — react after the mime is over is rejected
    let j = creditPerform();
    j = fold(credit, j, [act(j.performer, { kind: 'claimFound', guesser: others(j)[0]! }, 1)]);
    expect(j.phase).toBe('judge');
    expect(credit.reduce(j, act(others(j)[1]!, react(others(j)[1]!, 'fire'), 2)).state).toBe(j);
    // reveal — react is rejected
    const rev = fold(credit, creditPerform(), [deadline(50_000)]);
    expect(rev.phase).toBe('reveal');
    expect(credit.reduce(rev, act('p1', react('p1', 'fire'), 2)).state).toBe(rev);
  });

  it('ineligible actor: the performer cannot react (they are on stage)', () => {
    const s = creditPerform();
    expect(credit.reduce(s, act(s.performer, react(s.performer, 'fire'), 1)).state).toBe(s);
  });

  it('ineligible actor: a rate crew member (mover or dubber) cannot react', () => {
    const s = ratePerform();
    expect(rateMod.reduce(s, act(s.performer, react(s.performer, 'fire'), 1)).state).toBe(s);
    expect(rateMod.reduce(s, act(s.partner!, react(s.partner!, 'fire'), 1)).state).toBe(s);
  });

  it('ineligible actor: a disconnected audience member cannot react', () => {
    const s = creditPerform();
    const a0 = others(s)[0]!;
    const s2 = fold(credit, s, [left(a0, 1)]);
    expect(credit.reduce(s2, act(a0, react(a0, 'fire'), 2)).state).toBe(s2);
  });

  it('ineligible actor: a non-roster / __proto__ id cannot react', () => {
    const s = creditPerform();
    expect(credit.reduce(s, act('ghost', react('ghost', 'fire'), 1)).state).toBe(s);
    expect(credit.reduce(s, act('__proto__', react('__proto__', 'fire'), 1)).state).toBe(s);
  });

  it('duplicate: a second react by the same player is rejected (first locks)', () => {
    const s = creditPerform();
    const a0 = others(s)[0]!;
    const s2 = fold(credit, s, [act(a0, react(a0, 'fire'), 1)]);
    // same enum AND a different enum are both rejected — one stake per beat
    expect(credit.reduce(s2, act(a0, react(a0, 'fire'), 2)).state).toBe(s2);
    expect(credit.reduce(s2, act(a0, react(a0, 'cringe'), 3)).state).toBe(s2);
  });

  it('bad enum: an unknown reaction value is re-guarded in the reducer (same ref)', () => {
    const s = creditPerform();
    const a0 = others(s)[0]!;
    // bypass the zod boundary to prove the reducer re-guards the enum itself
    expect(credit.reduce(s, act(a0, { kind: 'react', reaction: 'boo' } as unknown as PerformJudgeAction, 1) as never).state).toBe(s);
  });
});

describe('CC-4 react — guided audience (helpers) also get the channel', () => {
  it('guided: a connected non-performer helper may react during perform', () => {
    const s0 = guided.init('s', P3, makeContent());
    const s = fold(guided, s0, [deadline(0)]);
    const helper = others(s)[0]!;
    const s2 = fold(guided, s, [act(helper, react(helper, 'laugh'), 1)]);
    expect(s2.phase).toBe('perform');
    const v = guided.view(s2, helper);
    if (v.phase !== 'perform') throw new Error('expected perform');
    expect(v.myReaction).toBe('laugh');
    expect(v.reactionCounts).toEqual({ fire: 0, laugh: 1, cringe: 0 });
    // the performer still cannot react (on stage), even in guided
    expect(guided.reduce(s2, act(s.performer, react(s.performer, 'fire'), 2)).state).toBe(s2);
  });
});
