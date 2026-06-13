import { describe, expect, it } from 'vitest';
import type { ContentPack, GameEvent } from '@bloop/engine';
import {
  createLastStanding,
  JEU_DU_THEME_CONFIG,
  type LastStandingAction,
  type LastStandingContent,
  type LastStandingState,
} from '@bloop/game-last-standing';

const content: ContentPack<LastStandingContent> = {
  id: 'test-pack', version: 1,
  data: {
    items: [
      { id: 'i1', theme: { fr: 'Thème Un', en: 'Theme One' }, letters: ['A'], difficulty: 1 },
      { id: 'i2', theme: { fr: 'Thème Deux', en: 'Theme Two' }, letters: ['B'], difficulty: 2 },
      { id: 'i3', theme: { fr: 'Thème Trois', en: 'Theme Three' }, letters: ['C'], difficulty: 3 },
    ],
  },
};
const players = ['p1', 'p2', 'p3'];
const game = createLastStanding('jeu-du-theme', JEU_DU_THEME_CONFIG);

const act = (playerId: string, action: LastStandingAction, at = 0): GameEvent<LastStandingAction> =>
  ({ type: 'action', playerId, action, at });
const deadline = (at = 0): GameEvent<LastStandingAction> => ({ type: 'deadline', at });

/** init -> draw deadline -> the first say turn. */
function toSay(g = game, ps = players, seed = 's'): LastStandingState {
  const s = g.reduce(g.init(seed, ps, content), deadline()).state;
  expect(s.phase).toBe('say');
  return s;
}

const jurorsOf = (s: LastStandingState): string[] => s.players.filter((p) => p !== s.spotlight);

describe('wordSaid and giveUp', () => {
  it('wordSaid by the spotlight stops the clock and enters judge with an empty ballot box', () => {
    const s = toSay();
    const next = game.reduce(s, act(s.spotlight!, { kind: 'wordSaid' })).state;
    expect(next.phase).toBe('judge');
    expect(next.turnSeq).toBe(s.turnSeq); // same turn — only the phase kind changes
    expect(Object.keys(next.judgeVotes)).toEqual([]);
  });

  it('rejects (same reference) wordSaid from non-spotlight, non-roster, or out of phase', () => {
    const s = toSay();
    const other = jurorsOf(s)[0]!;
    expect(game.reduce(s, act(other, { kind: 'wordSaid' })).state).toBe(s);
    expect(game.reduce(s, act('ghost', { kind: 'wordSaid' })).state).toBe(s);
    expect(game.reduce(s, act('__proto__', { kind: 'wordSaid' })).state).toBe(s);
    const judge = game.reduce(s, act(s.spotlight!, { kind: 'wordSaid' })).state;
    expect(game.reduce(judge, act(s.spotlight!, { kind: 'wordSaid' })).state).toBe(judge);
  });

  it('giveUp self-eliminates, skips the jury, and scores nothing', () => {
    const s = toSay();
    const spot = s.spotlight!;
    const { state: next, effects } = game.reduce(s, act(spot, { kind: 'giveUp' }));
    expect(next.phase).toBe('result');
    expect(next.alive[spot]).toBe(false);
    expect(next.lastTurn).toEqual({ player: spot, outcome: 'gaveUp', tally: { valid: 0, reject: 0 } });
    expect(next.scores[spot]).toBe(0);
    expect(effects).toEqual([
      { type: 'analytics', name: 'turn_resolved', props: { outcome: 'gaveUp', turnSeq: 1 } },
    ]);
  });

  it('giveUp is a no-op when allowGiveUp is off, and for non-spotlight players', () => {
    const noQuit = createLastStanding('jeu-du-theme', { ...JEU_DU_THEME_CONFIG, allowGiveUp: false });
    const s = toSay(noQuit);
    expect(noQuit.reduce(s, act(s.spotlight!, { kind: 'giveUp' })).state).toBe(s);
    const s2 = toSay();
    expect(game.reduce(s2, act(jurorsOf(s2)[0]!, { kind: 'giveUp' })).state).toBe(s2);
  });

  it('a say deadline is a timeout elimination', () => {
    const s = toSay();
    const spot = s.spotlight!;
    const { state: next, effects } = game.reduce(s, deadline());
    expect(next.phase).toBe('result');
    expect(next.alive[spot]).toBe(false);
    expect(next.lastTurn?.outcome).toBe('timeout');
    expect(effects[0]).toEqual({ type: 'analytics', name: 'turn_resolved', props: { outcome: 'timeout', turnSeq: 1 } });
  });
});

describe('judge mechanics', () => {
  function toJudge(g = game, ps = players): LastStandingState {
    const s = toSay(g, ps);
    const next = g.reduce(s, act(s.spotlight!, { kind: 'wordSaid' })).state;
    expect(next.phase).toBe('judge');
    return next;
  }

  it('all jurors voting resolves early; unanimous valid scores +validWordPoints', () => {
    const s = toJudge();
    const [j1, j2] = jurorsOf(s) as [string, string];
    const mid = game.reduce(s, act(j1, { kind: 'judge', vote: 'valid' })).state;
    expect(mid.phase).toBe('judge'); // j2 still expected
    const { state: done, effects } = game.reduce(mid, act(j2, { kind: 'judge', vote: 'valid' }));
    expect(done.phase).toBe('result');
    expect(done.scores[s.spotlight!]).toBe(1);
    expect(done.wordsValidated[s.spotlight!]).toBe(1);
    expect(done.alive[s.spotlight!]).toBe(true);
    expect(done.lastTurn).toEqual({ player: s.spotlight, outcome: 'valid', tally: { valid: 2, reject: 0 } });
    expect(effects[0]).toEqual({ type: 'analytics', name: 'turn_resolved', props: { outcome: 'valid', turnSeq: 1 } });
  });

  it('unanimous reject eliminates the spotlight (2/2 > 0.5 strict)', () => {
    const s = toJudge();
    const [j1, j2] = jurorsOf(s) as [string, string];
    const mid = game.reduce(s, act(j1, { kind: 'judge', vote: 'reject' })).state;
    const done = game.reduce(mid, act(j2, { kind: 'judge', vote: 'reject' })).state;
    expect(done.phase).toBe('result');
    expect(done.alive[s.spotlight!]).toBe(false);
    expect(done.scores[s.spotlight!]).toBe(0);
    expect(done.lastTurn).toEqual({ player: s.spotlight, outcome: 'rejected', tally: { valid: 0, reject: 2 } });
  });

  it('a perfect tie is VALID (benefit of the doubt: 1/2 is not > 0.5)', () => {
    const s = toJudge();
    const [j1, j2] = jurorsOf(s) as [string, string];
    const mid = game.reduce(s, act(j1, { kind: 'judge', vote: 'valid' })).state;
    const done = game.reduce(mid, act(j2, { kind: 'judge', vote: 'reject' })).state;
    expect(done.lastTurn?.outcome).toBe('valid');
    expect(done.scores[s.spotlight!]).toBe(1);
  });

  it('strict majority with 3 jurors: 2 reject / 1 valid rejects', () => {
    const four = ['p1', 'p2', 'p3', 'p4'];
    const s = toJudge(game, four);
    const [j1, j2, j3] = jurorsOf(s) as [string, string, string];
    let n = game.reduce(s, act(j1, { kind: 'judge', vote: 'reject' })).state;
    n = game.reduce(n, act(j2, { kind: 'judge', vote: 'valid' })).state;
    n = game.reduce(n, act(j3, { kind: 'judge', vote: 'reject' })).state;
    expect(n.phase).toBe('result');
    expect(n.lastTurn).toEqual({ player: s.spotlight, outcome: 'rejected', tally: { valid: 1, reject: 2 } });
    expect(n.alive[s.spotlight!]).toBe(false);
  });

  it('the judge deadline resolves with the votes cast; zero votes -> VALID', () => {
    const s = toJudge();
    const zero = game.reduce(s, deadline()).state;
    expect(zero.lastTurn).toEqual({ player: s.spotlight, outcome: 'valid', tally: { valid: 0, reject: 0 } });
    expect(zero.scores[s.spotlight!]).toBe(1);

    const one = game.reduce(s, act(jurorsOf(s)[0]!, { kind: 'judge', vote: 'reject' })).state;
    const done = game.reduce(one, deadline()).state; // 1/1 > 0.5 -> rejected
    expect(done.lastTurn?.outcome).toBe('rejected');
    expect(done.alive[s.spotlight!]).toBe(false);
  });

  it('first vote locked: a second vote from the same juror is a no-op (same reference)', () => {
    const s = toJudge();
    const j1 = jurorsOf(s)[0]!;
    const mid = game.reduce(s, act(j1, { kind: 'judge', vote: 'valid' })).state;
    expect(game.reduce(mid, act(j1, { kind: 'judge', vote: 'reject' })).state).toBe(mid);
  });

  it('rejects (same reference) spotlight self-votes, ghosts, bad values and out-of-phase votes', () => {
    const s = toJudge();
    expect(game.reduce(s, act(s.spotlight!, { kind: 'judge', vote: 'valid' })).state).toBe(s);
    expect(game.reduce(s, act('ghost', { kind: 'judge', vote: 'valid' })).state).toBe(s);
    const bad = { kind: 'judge', vote: 'maybe' } as unknown as LastStandingAction;
    expect(game.reduce(s, act(jurorsOf(s)[0]!, bad)).state).toBe(s);
    const unknown = { kind: 'nope' } as unknown as LastStandingAction;
    expect(game.reduce(s, act(jurorsOf(s)[0]!, unknown)).state).toBe(s);
    const say = toSay();
    expect(game.reduce(say, act(jurorsOf(say)[0]!, { kind: 'judge', vote: 'valid' })).state).toBe(say);
  });

  it('eliminated players join the jury when deadPlayersJudge is on (default)', () => {
    let s = toSay();
    const firstSpot = s.spotlight!;
    s = game.reduce(s, deadline()).state; // timeout — firstSpot eliminated
    s = game.reduce(s, deadline()).state; // next say
    const secondSpot = s.spotlight!;
    s = game.reduce(s, act(secondSpot, { kind: 'wordSaid' })).state;
    const mid = game.reduce(s, act(firstSpot, { kind: 'judge', vote: 'valid' })).state;
    expect(mid).not.toBe(s); // the dead juror's vote counts
    const lastJuror = players.find((p) => p !== firstSpot && p !== secondSpot)!;
    const done = game.reduce(mid, act(lastJuror, { kind: 'judge', vote: 'valid' })).state;
    expect(done.phase).toBe('result'); // both jurors voted -> early resolve
    expect(done.lastTurn?.tally).toEqual({ valid: 2, reject: 0 });
  });

  it('deadPlayersJudge off: an eliminated player cannot vote and is not expected', () => {
    const noDead = createLastStanding('jeu-du-theme', { ...JEU_DU_THEME_CONFIG, deadPlayersJudge: false });
    let s = toSay(noDead);
    const firstSpot = s.spotlight!;
    s = noDead.reduce(s, deadline()).state; // timeout — firstSpot eliminated
    s = noDead.reduce(s, deadline()).state; // next say
    const secondSpot = s.spotlight!;
    s = noDead.reduce(s, act(secondSpot, { kind: 'wordSaid' })).state;
    expect(noDead.reduce(s, act(firstSpot, { kind: 'judge', vote: 'reject' })).state).toBe(s);
    const lastJuror = players.find((p) => p !== firstSpot && p !== secondSpot)!;
    const done = noDead.reduce(s, act(lastJuror, { kind: 'judge', vote: 'valid' })).state;
    expect(done.phase).toBe('result'); // the single living juror IS the whole expected set
  });

  it('handles "__proto__" as a roster player end to end', () => {
    const weird = ['__proto__', 'p2', 'p3'];
    let s = toSay(game, weird);
    const spot = s.spotlight!;
    s = game.reduce(s, act(spot, { kind: 'wordSaid' })).state;
    for (const p of weird) {
      if (p !== spot && s.phase === 'judge') s = game.reduce(s, act(p, { kind: 'judge', vote: 'valid' })).state;
    }
    expect(s.phase).toBe('result');
    expect(s.scores[spot]).toBe(1);
    expect(s.scores['__proto__']).toBe(spot === '__proto__' ? 1 : 0);
  });
});

describe('exact scoring across a full round (design barème)', () => {
  it('one valid word, one jury rejection, one giveUp; survivor +3; cloned gameOver scores', () => {
    const one = createLastStanding('jeu-du-theme', { ...JEU_DU_THEME_CONFIG, totalRounds: 1 });
    let s = one.reduce(one.init('s', players, content), deadline()).state;
    const [a, b, c] = s.rotation as [string, string, string];

    // turn 1 — a says a word, both jurors validate: a +1
    s = one.reduce(s, act(a, { kind: 'wordSaid' })).state;
    s = one.reduce(s, act(b, { kind: 'judge', vote: 'valid' })).state;
    s = one.reduce(s, act(c, { kind: 'judge', vote: 'valid' })).state;
    expect(s.phase).toBe('result');
    s = one.reduce(s, deadline()).state;

    // turn 2 — b gets rejected unanimously: eliminated, no points
    expect(s.spotlight).toBe(b);
    s = one.reduce(s, act(b, { kind: 'wordSaid' })).state;
    s = one.reduce(s, act(a, { kind: 'judge', vote: 'reject' })).state;
    s = one.reduce(s, act(c, { kind: 'judge', vote: 'reject' })).state;
    expect(s.alive[b]).toBe(false);
    s = one.reduce(s, deadline()).state;

    // turn 3 — c gives up: a is the last one standing
    expect(s.spotlight).toBe(c);
    s = one.reduce(s, act(c, { kind: 'giveUp' })).state;
    s = one.reduce(s, deadline()).state;
    expect(s.phase).toBe('roundEnd');
    expect(s.roundWinners).toEqual([a]);
    expect(s.scores[a]).toBe(1 + 3); // validWordPoints + survivorPoints
    expect(s.scores[b]).toBe(0);
    expect(s.scores[c]).toBe(0);
    expect(s.wordsValidated[a]).toBe(1);

    const { state: over, effects } = one.reduce(s, deadline());
    expect(over.phase).toBe('over');
    const gameOver = effects.find((e) => e.type === 'gameOver');
    if (gameOver === undefined || gameOver.type !== 'gameOver') throw new Error('expected gameOver effect');
    expect(gameOver.scores).toEqual(over.scores);
    expect(gameOver.scores).not.toBe(over.scores); // CLONED, never aliasing live state
  });
});
