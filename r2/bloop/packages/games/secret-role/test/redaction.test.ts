import { describe, expect, it } from 'vitest';
import { leakedSecrets } from '@bloop/engine';
import { ack, content, dl, game, lean, players, roles, run, toVotePhase, vote } from './helpers.js';

const OUTSIDERS = ['spectator', '__proto__'] as const;

describe('vote buffer — hidden until atomic resolution', () => {
  it('buffers a vote; views expose hasVoted booleans + owner echo only, never the votes map', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const s1 = run(s0, [vote('p1', 'p2'), vote('p2', 'p3')]);
    expect(s1.phase).toBe('vote');
    const v3 = game.view(s1, 'p3');
    if (v3.phase !== 'vote') throw new Error('expected vote view');
    expect(v3.hasVoted).toEqual({ p1: true, p2: true, p3: false, p4: false });
    expect(v3.myVote).toBeNull();
    expect(v3.votableTargets).toEqual(['p1', 'p2', 'p4']);
    expect(JSON.stringify(v3)).not.toContain('"votes"');
    const v1 = game.view(s1, 'p1');
    if (v1.phase !== 'vote') throw new Error('expected vote view');
    expect(v1.myVote).toBe('p2');
  });

  it('self-vote, non-roster target, and re-vote are same-reference no-ops (first vote locks)', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    expect(game.reduce(s0, vote('p1', 'p1')).state).toBe(s0);
    expect(game.reduce(s0, vote('p1', 'ghost')).state).toBe(s0);
    const s1 = game.reduce(s0, vote('p1', 'p2')).state;
    expect(game.reduce(s1, vote('p1', 'p3')).state).toBe(s1);
    expect(s1.votes['p1']).toBe('p2');
  });

  it('resolves when the last expected vote lands; the resolved record shows tallies, never ballots', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const { imp, civs } = roles(s0);
    const s1 = run(s0, [vote(civs[0]!, imp), vote(civs[1]!, imp), vote(civs[2]!, imp)]);
    expect(s1.phase).toBe('vote');
    const s2 = game.reduce(s1, vote(imp, civs[0]!)).state;
    expect(s2.phase).toBe('finalReveal'); // caught on vote 1
    const record = s2.voteRecords[0]!;
    expect(record.tally).toEqual({ [imp]: 3, [civs[0]!]: 1 });
    expect(record.topAccused).toBe(imp);
    expect(record.caught).toBe(true);
    expect(record.abstained).toEqual([]);
    expect(s2.votes).toEqual({}); // buffer cleared at promotion
  });

  it('deadline resolves with only the buffered votes; abstainers are listed, a top tie clears nobody', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const s1 = run(s0, [vote('p1', 'p2'), vote('p2', 'p1'), dl(5)]);
    expect(s1.phase).toBe('verdict'); // 1-1 tie = miss
    const record = s1.voteRecords[0]!;
    expect(record.topAccused).toBeNull();
    expect(record.caught).toBe(false);
    expect(record.abstained.sort()).toEqual(['p3', 'p4']);
  });
});

describe('secretReveal redaction — the biggest surface of the wave', () => {
  it('civilians see ONLY the majority item; the impostor sees ONLY the decoy; nobody sees a role flag', () => {
    const s0 = game.init('s', players, content);
    const { imp, civs } = roles(s0);
    const matchItem = s0.items[0]!;
    for (const c of civs) {
      const v = game.view(s0, c);
      if (v.phase !== 'secretReveal') throw new Error('expected secretReveal view');
      expect(v.myItem).toEqual(matchItem.majority);
      const json = JSON.stringify(v);
      expect(json).not.toContain(matchItem.impostor.fr);
      expect(json).not.toContain(matchItem.impostor.en);
      expect(json).not.toContain('"role"');
    }
    const vi = game.view(s0, imp);
    if (vi.phase !== 'secretReveal') throw new Error('expected secretReveal view');
    expect(vi.myItem).toEqual(matchItem.impostor);
    const json = JSON.stringify(vi);
    expect(json).not.toContain(matchItem.majority.fr);
    expect(json).not.toContain(matchItem.majority.en);
    expect(json).not.toContain('"role"');
  });

  it('outsiders get a null myItem and the public theme only', () => {
    const s0 = game.init('s', players, content);
    const matchItem = s0.items[0]!;
    for (const outsider of OUTSIDERS) {
      const v = game.view(s0, outsider);
      if (v.phase !== 'secretReveal') throw new Error('expected secretReveal view');
      expect(v.myItem).toBeNull();
      expect(v.theme).toEqual(matchItem.theme);
      const json = JSON.stringify(v);
      expect(json).not.toContain(matchItem.majority.fr);
      expect(json).not.toContain(matchItem.impostor.fr);
    }
  });

  it('leakedSecrets: the decoy word never reaches a non-impostor view at secretReveal', () => {
    const s0 = game.init('s', players, content);
    const { imp } = roles(s0);
    const matchItem = s0.items[0]!;
    const viewers = [...players, ...OUTSIDERS];
    expect(leakedSecrets(game, s0, viewers, [
      { value: matchItem.impostor.fr, owner: imp },
      { value: matchItem.impostor.en, owner: imp },
    ])).toEqual([]);
  });

  it('leakedSecrets: mid-vote, NO word value appears in ANY view (words are out of band)', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const s1 = run(s0, [vote('p1', 'p2'), vote('p2', 'p3')]);
    const matchItem = s1.items[0]!;
    const viewers = [...players, ...OUTSIDERS];
    expect(leakedSecrets(game, s1, viewers, [
      { value: matchItem.majority.fr },
      { value: matchItem.majority.en },
      { value: matchItem.impostor.fr },
      { value: matchItem.impostor.en },
    ])).toEqual([]);
  });

  it('the impostor identity and pending points never surface before finalReveal', () => {
    let s = game.init('s', players, content);
    const phases: string[] = [];
    // walk every pre-reveal phase: secretReveal, discuss p0, vote p0 (a correct
    // ballot is in flight, tied by a wrong one so vote 1 MISSES), verdict, discuss p1
    const { imp, civs } = roles(s);
    const script = [dl(1), dl(2), vote(civs[0]!, imp), vote(civs[1]!, civs[0]!), dl(3), dl(4)];
    for (const e of script) {
      for (const viewer of [...players, ...OUTSIDERS]) {
        const json = JSON.stringify(game.view(s, viewer));
        expect(json).not.toContain('"impostor"');
        expect(json).not.toContain('pendingPoints');
        expect(json).not.toContain('"leans"'); // the lean buffer is hidden too
      }
      phases.push(s.phase);
      s = game.reduce(s, e).state;
    }
    expect(phases).toEqual(['secretReveal', 'discuss', 'vote', 'vote', 'vote', 'verdict']);
    expect(s.phase).toBe('discuss'); // period 2 — still pre-reveal
    for (const viewer of [...players, ...OUTSIDERS]) {
      const json = JSON.stringify(game.view(s, viewer));
      expect(json).not.toContain('"impostor"');
      expect(json).not.toContain('pendingPoints');
      expect(json).not.toContain('"leans"');
    }
  });

  it('a POPULATED lean buffer in discuss leaks neither the buffer nor a foreign suspect', () => {
    const s0 = run(game.init('s', players, content), [dl(1)]); // discuss p0
    expect(s0.phase).toBe('discuss');
    const { imp, civs } = roles(s0);
    // every player leans (civilians correctly on the impostor; the impostor on a civ)
    const s1 = run(s0, players.map((p) => (p === imp ? lean(p, civs[0]!) : lean(p, imp))));
    expect(s1.leans[civs[0]!]).toBe(imp); // hidden state IS populated
    for (const viewer of [...players, ...OUTSIDERS]) {
      const json = JSON.stringify(game.view(s1, viewer));
      expect(json).not.toContain('"leans"');
    }
    // each owner sees ONLY their own suspect; the impostor's identity (held in
    // civilians' leans) never surfaces as a foreign value in a non-owner view.
    const vImp = game.view(s1, imp);
    if (vImp.phase !== 'discuss') throw new Error('expected discuss view');
    expect(vImp.myLean).toBe(civs[0]!); // the impostor sees only their OWN lean
    expect(vImp.leanCount).toBe(players.length);
  });
});

describe('non-actor invariance (audit-fixture shape)', () => {
  it("changing hidden vote targets leaves non-actors' views identical", () => {
    const base = toVotePhase(game.init('audit-seed', players, content));
    const sA = run(base, [vote('p1', 'p2'), vote('p2', 'p3')]);
    const sB = run(base, [vote('p1', 'p3'), vote('p2', 'p4')]);
    expect(game.phaseKey(sA)).toBe(game.phaseKey(sB));
    for (const viewer of ['p3', 'p4', ...OUTSIDERS]) {
      expect(game.view(sA, viewer)).toEqual(game.view(sB, viewer));
    }
    // and at least one actor SEES its own differing choice
    expect(JSON.stringify(game.view(sA, 'p1'))).not.toBe(JSON.stringify(game.view(sB, 'p1')));
  });

  it("changing who acked is visible (acks are public booleans), but ack content carries no secret", () => {
    const s0 = game.init('s', players, content);
    const s1 = game.reduce(s0, ack('p1')).state;
    const v = game.view(s1, 'p2');
    if (v.phase !== 'secretReveal') throw new Error('expected secretReveal view');
    expect(v.acked).toEqual({ p1: true, p2: false, p3: false, p4: false });
    expect(v.iAcked).toBe(false);
  });
});

describe('hostile and outsider viewers', () => {
  it('every phase yields a JSON-serializable view for roster, spectator and __proto__ viewers', () => {
    let s = game.init('s', players, content);
    const { imp, civs } = roles(s);
    // exercise the richest path: ack -> discuss -> vote (miss) -> verdict -> discuss2 -> vote (caught) -> finalReveal -> over
    const script = [
      dl(1), dl(2),
      vote(civs[0]!, civs[1]!), vote(civs[1]!, civs[0]!), dl(3), // tie -> verdict
      dl(4), dl(5),
      vote(civs[0]!, imp), vote(civs[1]!, imp), vote(civs[2]!, imp), // imp still expected — resolves on the next deadline
      dl(6), dl(7), dl(8), dl(9), dl(10), dl(11), dl(12), dl(13),
      dl(14), dl(15), dl(16), dl(17), dl(18), dl(19), dl(20), dl(21), // through to over
    ];
    for (const e of script) {
      for (const viewer of [...players, ...OUTSIDERS]) {
        const v = game.view(s, viewer);
        expect(JSON.parse(JSON.stringify(v))).toEqual(v);
      }
      s = game.reduce(s, e).state;
    }
    expect(s.phase).toBe('over');
    for (const viewer of [...players, ...OUTSIDERS]) {
      const v = game.view(s, viewer);
      expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    }
  });

  it('handles a "__proto__" roster id without corrupting maps or scores', () => {
    const weird = ['__proto__', 'p2', 'p3', 'p4'];
    const s0 = game.init('s', weird, content);
    const { imp, civs } = roles(s0);
    expect([...civs, imp].sort()).toEqual([...weird].sort());
    const s1 = toVotePhase(s0);
    const s2 = run(s1, [vote(civs[0]!, imp), vote(civs[1]!, imp), vote(civs[2]!, imp), vote(imp, civs[0]!)]);
    expect(s2.phase).toBe('finalReveal'); // caught on vote 1
    for (const c of civs) expect(s2.scores[c]).toBe(3); // +1 ballot +2 team bonus
    expect(s2.scores[imp]).toBe(0);
    const v = game.view(s2, '__proto__');
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });

  it('a vote targeting "__proto__" counts as a plain key, never prototype pollution', () => {
    const s0 = toVotePhase(game.init('s', ['__proto__', 'p2', 'p3', 'p4'], content));
    const s1 = run(s0, [vote('p2', '__proto__'), vote('p3', '__proto__'), dl(5)]);
    const record = s1.voteRecords[0]!;
    expect(record.tally['__proto__']).toBe(2);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});
