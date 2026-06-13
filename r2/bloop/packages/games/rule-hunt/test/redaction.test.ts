// Redaction invariants 1-6 (design 2.16 §10). Fixture strings are distinctive
// ('REGLE-SECRETE…', 'LEURRE…') so substring checks cannot false-positive.
import { describe, expect, it } from 'vitest';
import { leakedSecrets } from '@bloop/engine';
import type { RuleHuntState, RuleHuntView } from '@bloop/game-rule-hunt';
import {
  accuse, content, deadline, FIVE, followersOf, game, openGuess, toLive, toTribunal, tribunalVote,
} from './fixtures.js';

const OUTSIDERS = ['spectator-not-in-roster', '__proto__'] as const;
const SECRET_MARKERS = ['REGLE-SECRETE', 'SECRET-RULE', 'LEURRE', 'DECOY'] as const;

const json = (state: RuleHuntState, viewer: string) => JSON.stringify(game.view(state, viewer));

function preRevealStates(): Array<[string, RuleHuntState]> {
  const briefing = game.init('s', FIVE, content(3));
  const live = toLive(briefing, 1_000);
  const tribunal = toTribunal(live, 5_000);
  return [['briefing', briefing], ['live', live], ['tribunal', tribunal]];
}

describe('invariant 1+6 — the rule text never reaches detectives or unknown viewers pre-reveal', () => {
  it('detective, spectator and __proto__ views carry NO rule or decoy text in briefing/live/tribunal', () => {
    for (const [, state] of preRevealStates()) {
      for (const viewer of [state.detectives[0]!, ...OUTSIDERS]) {
        const s = json(state, viewer);
        for (const marker of SECRET_MARKERS) expect(s).not.toContain(marker);
      }
    }
  });

  it('followers see exactly the CURRENT rule — never decoys, never future rules', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const current = live.items[0]!;
    for (const f of followersOf(live)) {
      const v = game.view(live, f);
      expect(v.myRule).toEqual(current.rule);
      const s = json(live, f);
      expect(s).not.toContain('LEURRE');
      expect(s).not.toContain('DECOY');
      for (const other of live.items.slice(1)) {
        expect(s).not.toContain(other.rule.fr);
        expect(s).not.toContain(other.rule.en);
      }
    }
  });

  it('an ELIMINATED follower keeps the rule on screen (they knew it)', () => {
    const trib = toTribunal(toLive(game.init('s', FIVE, content(3)), 1_000));
    const [f0, f1, f2, f3] = followersOf(trib);
    let s = game.reduce(trib, tribunalVote(f0!, true, 6_000)).state;
    s = game.reduce(s, tribunalVote(f2!, true, 7_000)).state;
    s = game.reduce(s, tribunalVote(f3!, true, 8_000)).state;
    expect(s.eliminated[f1!]).toBe(true);
    const v = game.view(s, f1!);
    expect(v.iAmEliminated).toBe(true);
    expect(v.myRule).toEqual(s.items[0]!.rule);
  });
});

describe('invariant 2+3 — the guess grid', () => {
  function guessState(): RuleHuntState {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    return game.reduce(live, openGuess(live.detectives[0]!, 31_000)).state;
  }

  it('candidates are byte-identical for EVERY roster viewer (no per-viewer reorder side channel)', () => {
    const g = guessState();
    const serialized = g.players.map((p) => {
      const v = game.view(g, p);
      if (v.phase !== 'guess') throw new Error('expected guess view');
      expect(v.candidates).not.toBeNull();
      return JSON.stringify(v.candidates);
    });
    expect(new Set(serialized).size).toBe(1);
    // the grid embeds the true rule UNDISTINGUISHED — its index never serializes
    expect(serialized[0]).toContain('REGLE-SECRETE');
  });

  it('candidates are OMITTED for unknown viewers — a spectator never gets a 1-in-8 shortlist', () => {
    const g = guessState();
    for (const viewer of OUTSIDERS) {
      const v = game.view(g, viewer);
      if (v.phase !== 'guess') throw new Error('expected guess view');
      expect(v.candidates).toBeNull();
      const s = json(g, viewer);
      for (const marker of SECRET_MARKERS) expect(s).not.toContain(marker);
    }
  });

  it('only the opener is iAmGuessing; the guesser id is public', () => {
    const g = guessState();
    const det = g.detectives[0]!;
    for (const p of [...g.players, ...OUTSIDERS]) {
      const v = game.view(g, p);
      if (v.phase !== 'guess') throw new Error('expected guess view');
      expect(v.guesser).toBe(det);
      expect(v.iAmGuessing).toBe(p === det);
    }
  });
});

describe('invariant 2+4+5 — state-only fields never serialize into any view', () => {
  it('no view at any phase contains trueCandidateIndex, detectiveOrder, seed, or the raw votes map', () => {
    let s = game.init('s', FIVE, content(3));
    const states: RuleHuntState[] = [s];
    s = toLive(s, 1_000);
    states.push(s);
    s = toTribunal(s, 5_000);
    s = game.reduce(s, tribunalVote(followersOf(s)[0]!, true, 6_000)).state;
    states.push(s); // tribunal with a buffered ballot
    s = game.reduce(s, deadline(30_000)).state; // resolve -> live (lastTribunal public)
    states.push(s);
    s = game.reduce(s, openGuess(s.detectives[0]!, 40_000)).state;
    states.push(s);
    for (let i = 0; i < 25 && s.phase !== 'over'; i++) {
      s = game.reduce(s, deadline(100_000 + i)).state;
      states.push(s);
    }
    expect(s.phase).toBe('over');
    for (const state of states) {
      for (const viewer of [...state.players, ...OUTSIDERS]) {
        const str = json(state, viewer);
        expect(str).not.toContain('trueCandidateIndex');
        expect(str).not.toContain('detectiveOrder');
        expect(str).not.toContain('"seed"');
        expect(str).not.toContain('"votes"');
      }
    }
  });

  it('tribunal ballots: owner echo only; the resolved tribunal publishes aggregate tally + abstainers', () => {
    const trib = toTribunal(toLive(game.init('s', FIVE, content(3)), 1_000));
    const [f0, , f2, f3] = followersOf(trib);
    const s = game.reduce(trib, tribunalVote(f0!, true, 6_000)).state;
    for (const p of [...s.players, ...OUTSIDERS]) {
      const v = game.view(s, p);
      if (v.phase !== 'tribunal') throw new Error('expected tribunal view');
      expect(v.myVote).toBe(p === f0 ? true : null);
      expect(v.hasVoted[f0!]).toBe(true); // WHO voted is public, WHAT they voted is not
    }
    const done = game.reduce(s, deadline(30_000)).state;
    const v = game.view(done, OUTSIDERS[0]);
    expect(v.lastTribunal?.tally).toEqual({ guilty: 1, notGuilty: 0 });
    expect([...(v.lastTribunal?.abstained ?? [])].sort()).toEqual([f2, f3].sort());
  });
});

describe('non-actor invariance + leakedSecrets (mirror of the server audit)', () => {
  it("changing hidden ballots never changes a non-voter's view", () => {
    const build = (a: boolean, b: boolean): RuleHuntState => {
      const trib = toTribunal(toLive(game.init('s', FIVE, content(3)), 1_000));
      const [, , f2, f3] = followersOf(trib);
      let s = game.reduce(trib, tribunalVote(f2!, a, 6_000)).state;
      s = game.reduce(s, tribunalVote(f3!, b, 7_000)).state;
      if (s.phase !== 'tribunal') throw new Error('tribunal must stay open (accuser still expected)');
      return s;
    };
    const sA = build(true, false);
    const sB = build(false, true);
    expect(game.phaseKey(sA)).toBe(game.phaseKey(sB));
    const [f0, f1, f2, f3] = followersOf(sA);
    const nonActors = [sA.detectives[0]!, f0!, f1!, ...OUTSIDERS];
    for (const viewer of nonActors) {
      expect(game.view(sA, viewer)).toEqual(game.view(sB, viewer));
    }
    // and the actors DO see their own differing echo
    expect(game.view(sA, f2!)).not.toEqual(game.view(sB, f2!));
    expect(game.view(sA, f3!)).not.toEqual(game.view(sB, f3!));
  });

  it('engine leakedSecrets: current decoys + future rules leak into NO view at the tribunal state', () => {
    const trib = toTribunal(toLive(game.init('s', FIVE, content(3)), 1_000));
    const item = trib.items[0]!;
    const secrets = [
      ...item.decoys.flatMap((d) => [{ value: d.fr }, { value: d.en }]),
      ...trib.items.slice(1).flatMap((i) => [{ value: i.rule.fr }, { value: i.rule.en }]),
    ];
    expect(leakedSecrets(game, trib, [...trib.players, ...OUTSIDERS], secrets)).toEqual([]);
  });
});

describe('reveal and over go public; every view stays JSON-serializable', () => {
  it('the reveal publishes the rule to everyone, spectators included', () => {
    let s = toLive(game.init('s', FIVE, content(3)), 1_000);
    s = game.reduce(s, deadline(181_000)).state;
    expect(s.phase).toBe('reveal');
    for (const viewer of [...s.players, ...OUTSIDERS]) {
      const v = game.view(s, viewer);
      if (v.phase !== 'reveal') throw new Error('expected reveal view');
      expect(v.outcome.ruleText).toEqual(s.items[0]!.rule);
      expect(v.outcome.trueIndex).toBe(s.trueCandidateIndex);
      expect(v.candidates).toHaveLength(8);
    }
  });

  it('unknown viewers get a safe, role-less projection at every phase of a deadline walk', () => {
    let s = game.init('s', FIVE, content(3));
    for (let i = 0; i < 30; i++) {
      for (const viewer of OUTSIDERS) {
        const v: RuleHuntView = game.view(s, viewer);
        expect(JSON.parse(JSON.stringify(v))).toEqual(v);
        expect(v.myRole).toBeNull();
        expect(v.myRule).toBeNull();
        expect(v.iAmEliminated).toBe(false);
        expect(v.myAccusationsLeft).toBe(0);
      }
      // both outsider classes see the exact same projection
      expect(game.view(s, OUTSIDERS[0])).toEqual(game.view(s, OUTSIDERS[1]));
      if (s.phase === 'over') break;
      s = game.reduce(s, deadline(100_000 + i)).state;
    }
    expect(s.phase).toBe('over');
  });

  it('roster views are JSON-serializable at every phase, including tribunal and guess', () => {
    let s = toLive(game.init('s', FIVE, content(3)), 1_000);
    const [f0, f1] = followersOf(s);
    const states = [s];
    s = game.reduce(s, accuse(f0!, f1!, 5_000)).state;
    states.push(s);
    s = game.reduce(s, deadline(30_000)).state;
    states.push(s);
    s = game.reduce(s, openGuess(s.detectives[0]!, 40_000)).state;
    states.push(s);
    for (const state of states) {
      for (const viewer of state.players) {
        const v = game.view(state, viewer);
        expect(JSON.parse(JSON.stringify(v))).toEqual(v);
      }
    }
  });
});
