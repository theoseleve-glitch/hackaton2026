import { describe, expect, it } from 'vitest';
import { leakedSecrets } from '@bloop/engine';
import type { TruthDareState, Verdict } from '@bloop/game-truth-dare';
import {
  choose,
  declare,
  DRINK_PACK,
  drink,
  fold,
  othersOf,
  PLAYERS,
  predict,
  TOD_PACK,
  tod,
  vote,
  walkToOver,
} from './helpers';

/** Viewer classes that must never receive hidden state (server audit OUTSIDERS). */
const OUTSIDERS = ['viewer-not-in-roster', '__proto__'] as const;

/** State fields that must NEVER serialize into any view. */
const HIDDEN_KEYS = ['"decks"', '"cursors"', '"itemsById"', '"usedPromptIds"', '"verdicts"', '"predictions"', '"seed"'];

/** Next-undrawn text of every deck — value secrets until their draw. */
function undrawnTexts(s: TruthDareState): Array<{ value: string }> {
  const out: Array<{ value: string }> = [];
  for (const key of Object.keys(s.decks)) {
    const id = s.decks[key]?.[s.cursors[key] ?? 0];
    const t = id === undefined ? undefined : s.itemsById[id]?.text;
    if (t !== undefined) out.push({ value: t.fr }, { value: t.en });
  }
  return out;
}

/** Park mid-verdict with exactly ONE of two expected votes buffered. */
function midVerdict(v: Verdict): TruthDareState {
  const s0 = tod.init('redact', PLAYERS, TOD_PACK);
  const active = s0.activePlayer;
  const [v1] = othersOf(s0);
  return fold(tod, s0, [choose(active, 'truth'), declare(active, 'done'), vote(v1!, v)]);
}

/** Park mid-PROMPT with exactly ONE spectator's hidden prediction (CC-1) buffered. */
function midPrompt(bet: Verdict): TruthDareState {
  const s0 = tod.init('redact', PLAYERS, TOD_PACK);
  const active = s0.activePlayer;
  const [v1] = othersOf(s0);
  return fold(tod, s0, [choose(active, 'truth'), predict(v1!, bet)]);
}

/** One representative state per phase, from one scripted match. */
function statesPerPhase(): Record<'choose' | 'prompt' | 'verdict' | 'score' | 'over', TruthDareState> {
  const s0 = tod.init('phases', PLAYERS, TOD_PACK);
  const active = s0.activePlayer;
  const [v1, v2] = othersOf(s0);
  // Populate the hidden predictions buffer so the HIDDEN_KEYS check on prompt /
  // verdict / score exercises a NON-EMPTY buffer (the two spectators differ).
  const sPrompt = fold(tod, s0, [choose(active, 'dare'), predict(v1!, 'done'), predict(v2!, 'chickened')]);
  const sVerdict = fold(tod, sPrompt, [declare(active, 'done'), vote(v1!, 'done')]);
  const sScore = fold(tod, sVerdict, [vote(v2!, 'chickened')]);
  const sOver = walkToOver(tod, sScore).state;
  return { choose: s0, prompt: sPrompt, verdict: sVerdict, score: sScore, over: sOver };
}

describe('hidden in-flight verdicts (structural invariance)', () => {
  const sA = midVerdict('done');
  const sB = midVerdict('chickened');
  const active = sA.activePlayer;
  const [voter, other] = othersOf(sA);

  it('the fixture is live: same phaseKey, and the voter sees their own differing echo', () => {
    expect(tod.phaseKey(sA)).toBe(tod.phaseKey(sB));
    expect(tod.phaseKey(sA)).toBe('verdict:0');
    expect(tod.view(sA, voter!)).not.toEqual(tod.view(sB, voter!));
  });

  it("non-actors' views are INVARIANT under the hidden vote change", () => {
    for (const viewer of [active, other!, ...OUTSIDERS]) {
      expect(tod.view(sA, viewer)).toEqual(tod.view(sB, viewer));
    }
  });

  it('the voter echo is youVoted only — never anyone else’s vote', () => {
    const mine = tod.view(sA, voter!);
    if (mine.phase !== 'verdict') throw new Error('expected verdict view');
    expect(mine.youVoted).toBe('done');
    for (const viewer of [active, other!, ...OUTSIDERS]) {
      const v = tod.view(sA, viewer);
      if (v.phase !== 'verdict') throw new Error('expected verdict view');
      expect(v.youVoted).toBeNull();
      expect(v.votesIn).toBe(1); // count only
      expect(v.votersExpected).toBe(2);
    }
  });

  it('youCanVote: voters who have not voted yes; active, voted and outsiders no', () => {
    const can = (viewer: string) => {
      const v = tod.view(sA, viewer);
      return v.phase === 'verdict' ? v.youCanVote : null;
    };
    expect(can(other!)).toBe(true);
    expect(can(voter!)).toBe(false); // first vote locked
    expect(can(active)).toBe(false);
    for (const o of OUTSIDERS) expect(can(o)).toBe(false);
  });
});

describe('CC-1 hidden call-your-shot predictions (structural invariance)', () => {
  const sA = midPrompt('done');
  const sB = midPrompt('chickened');
  const active = sA.activePlayer;
  const [predictor, other] = othersOf(sA);

  it('the fixture is live: same phaseKey, and the predictor sees their own differing echo', () => {
    expect(tod.phaseKey(sA)).toBe(tod.phaseKey(sB));
    expect(tod.phaseKey(sA)).toBe('prompt:0');
    expect(tod.view(sA, predictor!)).not.toEqual(tod.view(sB, predictor!));
  });

  it("GUARD a — non-owners' views are INVARIANT under the hidden prediction change", () => {
    // The active player, the OTHER spectator, and hostile outsiders must not be
    // able to tell a 'done' prediction from a 'chickened' one.
    for (const viewer of [active, other!, ...OUTSIDERS]) {
      expect(tod.view(sA, viewer)).toEqual(tod.view(sB, viewer));
    }
  });

  it('GUARD a — a prediction value NEVER leaks into any non-owner view (engine leakedSecrets)', () => {
    const viewers = [...PLAYERS, ...OUTSIDERS];
    // the predictor's bet is an owner-scoped value secret
    const secrets = [{ value: 'done', owner: predictor! }];
    expect(leakedSecrets(tod, sA, viewers, secrets)).toEqual([]);
  });

  it('the predictor echo is youPredicted only — never anyone else’s bet; others see count only', () => {
    const mine = tod.view(sA, predictor!);
    if (mine.phase !== 'prompt') throw new Error('expected prompt view');
    expect(mine.youPredicted).toBe('done');
    expect(mine.youCanPredict).toBe(false); // first bet locked
    for (const viewer of [active, other!, ...OUTSIDERS]) {
      const v = tod.view(sA, viewer);
      if (v.phase !== 'prompt') throw new Error('expected prompt view');
      expect(v.youPredicted).toBeNull();
      expect(v.predictionsIn).toBe(1); // count only, no names
    }
  });

  it('youCanPredict: non-active connected spectators who have not bet; active and outsiders no', () => {
    const can = (viewer: string) => {
      const v = tod.view(sA, viewer);
      return v.phase === 'prompt' ? v.youCanPredict : null;
    };
    expect(can(other!)).toBe(true); // not yet bet
    expect(can(predictor!)).toBe(false); // first bet locked
    expect(can(active)).toBe(false); // the active player can never predict
    for (const o of OUTSIDERS) expect(can(o)).toBe(false); // non-roster
  });
});

describe('hidden state never serializes (field-level)', () => {
  const states = statesPerPhase();

  it.each(Object.entries(states))('phase %s: no hidden key in any viewer view', (_phase, s) => {
    for (const viewer of [...PLAYERS, ...OUTSIDERS]) {
      const json = JSON.stringify(tod.view(s, viewer));
      for (const key of HIDDEN_KEYS) expect(json).not.toContain(key);
    }
  });
});

describe('undrawn deck texts are value secrets (engine leakedSecrets)', () => {
  const states = statesPerPhase();
  const viewers = [...PLAYERS, ...OUTSIDERS];

  it.each(Object.entries(states))('phase %s: no undrawn text leaks to any viewer', (_phase, s) => {
    const secrets = undrawnTexts(s);
    expect(secrets.length).toBeGreaterThan(0);
    expect(leakedSecrets(tod, s, viewers, secrets)).toEqual([]);
  });

  it('drink: the next forfeit card stays secret while the escape is still on the table', () => {
    const s0 = drink.init('redact', PLAYERS, DRINK_PACK);
    expect(s0.phase).toBe('prompt');
    const secrets = undrawnTexts(s0);
    expect(secrets.length).toBeGreaterThan(0);
    expect(leakedSecrets(drink, s0, viewers, secrets)).toEqual([]);
  });
});

describe('spectator + hostile viewers are safe in every phase', () => {
  const states = statesPerPhase();

  it.each(Object.entries(states))('phase %s: outsider views are JSON-round-trippable and identical', (_phase, s) => {
    for (const viewer of OUTSIDERS) {
      const view = tod.view(s, viewer);
      expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    }
    // both outsiders are non-players: their projections must be indistinguishable
    expect(tod.view(s, OUTSIDERS[0])).toEqual(tod.view(s, OUTSIDERS[1]));
  });

  it('roster views are JSON-round-trippable in every phase too', () => {
    for (const s of Object.values(states)) {
      for (const p of PLAYERS) {
        const view = tod.view(s, p);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
      }
    }
  });
});
