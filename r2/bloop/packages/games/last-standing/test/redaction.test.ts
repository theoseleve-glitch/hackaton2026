import { describe, expect, it } from 'vitest';
import { leakedSecrets, type ContentPack, type GameEvent } from '@bloop/engine';
import {
  createLastStanding,
  JEU_DU_THEME_CONFIG,
  type LastStandingAction,
  type LastStandingContent,
  type LastStandingState,
} from '@bloop/game-last-standing';

// Distinctive strings so the substring audit is meaningful: any leak of an
// undrawn theme, an item id or the seed would match unambiguously.
const content: ContentPack<LastStandingContent> = {
  id: 'test-pack', version: 1,
  data: {
    items: [
      { id: 'itm-xq1-aaa', theme: { fr: 'THEME-SECRET-UN-FR', en: 'THEME-SECRET-ONE-EN' }, letters: ['A'], difficulty: 1 },
      { id: 'itm-xq2-bbb', theme: { fr: 'THEME-SECRET-DEUX-FR', en: 'THEME-SECRET-TWO-EN' }, letters: ['B'], difficulty: 2 },
      { id: 'itm-xq3-ccc', theme: { fr: 'THEME-SECRET-TROIS-FR', en: 'THEME-SECRET-THREE-EN' }, letters: ['C'], difficulty: 3 },
    ],
  },
};
const players = ['p1', 'p2', 'p3'];
const SEED = 'seed-secret-zk9x7';
const game = createLastStanding('jeu-du-theme', JEU_DU_THEME_CONFIG);

const act = (playerId: string, action: LastStandingAction, at = 0): GameEvent<LastStandingAction> =>
  ({ type: 'action', playerId, action, at });
const deadline = (at = 0): GameEvent<LastStandingAction> => ({ type: 'deadline', at });

const OUTSIDERS = ['viewer-not-in-roster', '__proto__'] as const;

/** Everything that must never surface in ANY view: seed, undrawn themes, the drawn item id. */
function hiddenValues(s: LastStandingState): Array<{ value: string }> {
  const secrets: Array<{ value: string }> = [{ value: s.seed }];
  for (const item of s.deck.slice(s.themeCursor)) {
    secrets.push({ value: item.theme.fr }, { value: item.theme.en }, { value: item.id });
  }
  if (s.current !== null) secrets.push({ value: s.current.itemId });
  return secrets;
}

function toJudge(): LastStandingState {
  const s = game.reduce(game.init(SEED, players, content), deadline()).state;
  const next = game.reduce(s, act(s.spotlight!, { kind: 'wordSaid' })).state;
  expect(next.phase).toBe('judge');
  return next;
}

describe('hidden-state redaction', () => {
  it('seed, undrawn themes and item ids never appear in any view across a full deadline walk', () => {
    let s = game.init(SEED, players, content);
    const viewers = [...players, ...OUTSIDERS];
    for (let i = 0; i < 60; i++) {
      expect(leakedSecrets(game, s, viewers, hiddenValues(s))).toEqual([]);
      if (s.phase === 'over') break;
      s = game.reduce(s, deadline(i)).state;
    }
    expect(s.phase).toBe('over');
  });

  it('the drawn theme + letter ARE public (they are shouted in the room anyway)', () => {
    const s = game.reduce(game.init(SEED, players, content), deadline()).state;
    for (const viewer of [...players, ...OUTSIDERS]) {
      const v = game.view(s, viewer);
      if (v.phase === 'over') throw new Error('unexpected over');
      expect(v.current).toEqual({ theme: s.current!.theme, letter: s.current!.letter });
    }
  });

  it("a juror's in-flight ballot is invisible to every other viewer (non-actor invariance)", () => {
    const s = toJudge();
    const [j1] = players.filter((p) => p !== s.spotlight) as [string];
    const sValid = game.reduce(s, act(j1, { kind: 'judge', vote: 'valid' })).state;
    const sReject = game.reduce(s, act(j1, { kind: 'judge', vote: 'reject' })).state;
    expect(game.phaseKey(sValid)).toBe(game.phaseKey(sReject)); // both still mid-judge
    // the voter sees their own echo differ…
    expect(JSON.stringify(game.view(sValid, j1))).not.toBe(JSON.stringify(game.view(sReject, j1)));
    // …every other viewer sees byte-identical views
    const nonActors = [...players.filter((p) => p !== j1), ...OUTSIDERS];
    for (const viewer of nonActors) {
      expect(game.view(sValid, viewer)).toEqual(game.view(sReject, viewer));
    }
  });

  it('individual votes stay private even AFTER resolution — the result publishes counts only', () => {
    const four = ['p1', 'p2', 'p3', 'p4'];
    let s = game.reduce(game.init(SEED, four, content), deadline()).state;
    const spot = s.spotlight!;
    const [j1, j2, j3] = four.filter((p) => p !== spot) as [string, string, string];
    s = game.reduce(s, act(spot, { kind: 'wordSaid' })).state;
    // j1 dissents alone: the tally must not let anyone attribute the reject
    const sA = [act(j1, { kind: 'judge', vote: 'reject' } as const), act(j2, { kind: 'judge', vote: 'valid' } as const), act(j3, { kind: 'judge', vote: 'valid' } as const)]
      .reduce((st, e) => game.reduce(st, e).state, s);
    const sB = [act(j1, { kind: 'judge', vote: 'valid' } as const), act(j2, { kind: 'judge', vote: 'reject' } as const), act(j3, { kind: 'judge', vote: 'valid' } as const)]
      .reduce((st, e) => game.reduce(st, e).state, s);
    expect(sA.phase).toBe('result');
    expect(sB.phase).toBe('result');
    expect(sA.lastTurn?.tally).toEqual({ valid: 2, reject: 1 });
    // identical tallies from different voters -> identical views for EVERYONE (no per-voter trace)
    for (const viewer of [...four, ...OUTSIDERS]) {
      expect(game.view(sA, viewer)).toEqual(game.view(sB, viewer));
    }
  });

  it("a juror's in-flight SIDE-BET is invisible to every other viewer (P0-1 non-actor invariance)", () => {
    // p3 opens; p1/p2 bet during say. p1 diverges on its survives/chokes call.
    const say = game.reduce(game.init(SEED, players, content), deadline()).state;
    expect(say.phase).toBe('say');
    const [b1] = players.filter((p) => p !== say.spotlight) as [string, string];
    const sSurvives = game.reduce(say, act(b1, { kind: 'bet', value: 'survives' })).state;
    const sChokes = game.reduce(say, act(b1, { kind: 'bet', value: 'chokes' })).state;
    expect(game.phaseKey(sSurvives)).toBe(game.phaseKey(sChokes)); // both still mid-say
    // the bettor sees their own echo differ…
    expect(JSON.stringify(game.view(sSurvives, b1))).not.toBe(JSON.stringify(game.view(sChokes, b1)));
    // …every other viewer (the spotlight, the other bettor, outsiders) is byte-identical
    const nonActors = [...players.filter((p) => p !== b1), ...OUTSIDERS];
    for (const viewer of nonActors) {
      expect(game.view(sSurvives, viewer)).toEqual(game.view(sChokes, viewer));
    }
  });

  it('no internal field name (deck, judgeVotes, spotBets, usedLetters, seed, itemId, roundsSurvived) leaks into any view JSON', () => {
    let s = game.init(SEED, players, content);
    for (let i = 0; i < 60; i++) {
      for (const viewer of [...players, ...OUTSIDERS]) {
        const json = JSON.stringify(game.view(s, viewer));
        // roundsSurvived is the raw P1 CC-5 counter: only its DERIVED epilogue
        // surfaces at 'over' — the raw map name never appears in any view.
        for (const key of ['"deck"', '"themeCursor"', '"judgeVotes"', '"spotBets"', '"usedLetters"', '"seed"', '"itemId"', '"difficulty"', '"letters"', '"roundsSurvived"']) {
          expect(json).not.toContain(key);
        }
      }
      if (s.phase === 'over') break;
      s = game.reduce(s, deadline(i)).state;
    }
    expect(s.phase).toBe('over');
  });

  it('the P1 CC-5 epilogue appears ONLY at over (no mid-match leak of the superlative signal)', () => {
    let s = game.init(SEED, players, content);
    for (let i = 0; i < 60; i++) {
      for (const viewer of [...players, ...OUTSIDERS]) {
        const v = game.view(s, viewer);
        if (v.phase === 'over') {
          expect(v.epilogue).toBeDefined();
        } else {
          // no in-game phase view carries the epilogue field
          expect((v as unknown as Record<string, unknown>).epilogue).toBeUndefined();
        }
      }
      if (s.phase === 'over') break;
      s = game.reduce(s, deadline(i)).state;
    }
    expect(s.phase).toBe('over');
  });

  it('views are JSON-serializable for roster, spectator and hostile viewers in every phase', () => {
    const states: LastStandingState[] = [];
    let s = game.init(SEED, players, content);
    states.push(s);
    s = game.reduce(s, deadline()).state; // say
    states.push(s);
    s = game.reduce(s, act(s.spotlight!, { kind: 'wordSaid' })).state; // judge
    states.push(s);
    const j1 = players.find((p) => p !== states[2]!.spotlight)!;
    s = game.reduce(s, act(j1, { kind: 'judge', vote: 'reject' })).state; // mid-judge, ballot in flight
    states.push(s);
    s = game.reduce(s, deadline()).state; // result
    states.push(s);
    while (s.phase !== 'roundEnd') s = game.reduce(s, deadline()).state;
    states.push(s); // roundEnd
    while (s.phase !== 'over') s = game.reduce(s, deadline()).state;
    states.push(s); // over
    const seen = new Set(states.map((st) => st.phase));
    expect([...seen].sort()).toEqual(['draw', 'judge', 'over', 'result', 'roundEnd', 'say']);
    for (const st of states) {
      for (const viewer of [...players, ...OUTSIDERS]) {
        const view = game.view(st, viewer);
        // toEqual (not toStrictEqual): views may carry null-prototype player maps by design
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
      }
    }
  });

  it('unknown and hostile viewers get the spectator-safe projection (never can act, never crash)', () => {
    const judge = toJudge();
    for (const outsider of OUTSIDERS) {
      const v = game.view(judge, outsider);
      if (v.phase !== 'judge') throw new Error('expected judge view');
      expect(v.youCanVote).toBe(false);
      expect(v.myVote).toBeNull();
    }
    const say = game.reduce(game.init(SEED, players, content), deadline()).state;
    for (const outsider of OUTSIDERS) {
      const v = game.view(say, outsider);
      if (v.phase !== 'say') throw new Error('expected say view');
      expect(v.youAreSpotlight).toBe(false);
      expect(v.canGiveUp).toBe(false);
    }
  });
});
