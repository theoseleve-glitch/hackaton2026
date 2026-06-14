import { describe, expect, it } from 'vitest';
import type { ContentPack, GameEvent } from '@bloop/engine';
import {
  createLastStanding,
  JEU_DU_THEME_CONFIG,
  type LastStandingAction,
  type LastStandingContent,
  type LastStandingState,
} from '@bloop/game-last-standing';

// P0-1 keystone — the spotlight survives/chokes side-bet. Proves: it kills say
// idle (every non-spotlight player gets an act), lets ELIMINATED players keep
// scoring a SEPARATE currency, NEVER leaks, NEVER gates the primary
// early-resolve, and reject-invalid returns the SAME state reference.

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
const left = (playerId: string, at = 0): GameEvent<LastStandingAction> => ({ type: 'playerLeft', playerId, at });

const OUTSIDERS = ['viewer-not-in-roster', '__proto__'] as const;

/** init -> draw deadline -> the first say turn. */
function toSay(g = game, ps = players, seed = 's'): LastStandingState {
  const s = g.reduce(g.init(seed, ps, content), deadline()).state;
  expect(s.phase).toBe('say');
  return s;
}

const bettorsOf = (s: LastStandingState): string[] => s.players.filter((p) => p !== s.spotlight);

/** Drive a say turn to a VALID resolution (survives): word + all jurors valid + result deadline. */
function resolveValid(s: LastStandingState): LastStandingState {
  const spot = s.spotlight!;
  let n = game.reduce(s, act(spot, { kind: 'wordSaid' })).state;
  for (const p of s.players) {
    if (p !== spot && n.phase === 'judge') n = game.reduce(n, act(p, { kind: 'judge', vote: 'valid' })).state;
  }
  expect(n.lastTurn?.outcome).toBe('valid');
  return n;
}

describe('P0-1 side-bet — placement and locking', () => {
  it('a non-spotlight player may bet during say; the bet is owner-echoed only with a public count', () => {
    const s = toSay();
    const [b1] = bettorsOf(s) as [string, string];
    const next = game.reduce(s, act(b1, { kind: 'bet', value: 'survives' })).state;
    expect(next).not.toBe(s);
    expect(next.phase).toBe('say'); // bet does NOT advance the phase
    const v = game.view(next, b1);
    if (v.phase !== 'say') throw new Error('expected say');
    expect(v.myBet).toBe('survives'); // owner echo
    expect(v.betsIn).toBe(1);
    expect(v.youCanBet).toBe(false); // already bet
  });

  it('the spotlight can NEVER bet (same reference)', () => {
    const s = toSay();
    expect(game.reduce(s, act(s.spotlight!, { kind: 'bet', value: 'survives' })).state).toBe(s);
    const v = game.view(s, s.spotlight!);
    if (v.phase !== 'say') throw new Error('expected say');
    expect(v.youCanBet).toBe(false); // spotlight is never offered the bet
  });

  it('GUARD: a re-bet over an existing stake is a no-op (same reference) — locked on first tap', () => {
    const s = toSay();
    const b1 = bettorsOf(s)[0]!;
    const mid = game.reduce(s, act(b1, { kind: 'bet', value: 'survives' })).state;
    expect(game.reduce(mid, act(b1, { kind: 'bet', value: 'chokes' })).state).toBe(mid);
  });

  it('GUARD: bets are rejected (same reference) out of phase, off-roster, and on bad values', () => {
    const s = toSay();
    const b1 = bettorsOf(s)[0]!;
    expect(game.reduce(s, act('ghost', { kind: 'bet', value: 'survives' })).state).toBe(s);
    const bad = { kind: 'bet', value: 'maybe' } as unknown as LastStandingAction;
    expect(game.reduce(s, act(b1, bad)).state).toBe(s);
    // out of phase: in judge, a bet is rejected
    const judge = game.reduce(s, act(s.spotlight!, { kind: 'wordSaid' })).state;
    expect(judge.phase).toBe('judge');
    expect(game.reduce(judge, act(b1, { kind: 'bet', value: 'survives' })).state).toBe(judge);
  });

  it('a disconnected non-spotlight player cannot bet (same reference)', () => {
    let s = toSay();
    const b1 = bettorsOf(s)[0]!;
    s = game.reduce(s, left(b1)).state;
    expect(s.phase).toBe('say');
    expect(game.reduce(s, act(b1, { kind: 'bet', value: 'survives' })).state).toBe(s);
  });
});

describe('P0-1 side-bet — eliminated players keep scoring (dead-rubber fix)', () => {
  it('an ELIMINATED player may bet and earns betPoints — without affecting alive/scores', () => {
    // turn 1: rotation[0] times out -> eliminated. turn 2: rotation[1] is spotlight,
    // and the eliminated rotation[0] places a bet.
    let s = toSay();
    const dead = s.spotlight!;
    s = game.reduce(s, deadline()).state; // timeout -> result (dead eliminated)
    expect(s.alive[dead]).toBe(false);
    s = game.reduce(s, deadline()).state; // next say (turn 2)
    expect(s.phase).toBe('say');
    expect(s.spotlight).not.toBe(dead);
    // the eliminated player IS an eligible bettor
    const v = game.view(s, dead);
    if (v.phase !== 'say') throw new Error('expected say');
    expect(v.youCanBet).toBe(true);
    s = game.reduce(s, act(dead, { kind: 'bet', value: 'survives' })).state;
    expect(s.alive[dead]).toBe(false); // betting never resurrects
    const resolved = resolveValid(s); // spotlight survives -> dead predicted right
    expect(resolved.betPoints[dead]).toBe(1); // earned the side-currency while eliminated
    expect(resolved.scores[dead]).toBe(0); // primary score untouched
    expect(resolved.alive[dead]).toBe(false); // elimination logic never touched
  });
});

describe('P0-1 side-bet — resolution against the public outcome', () => {
  it('"survives" pays on a VALID turn; "chokes" pays nothing', () => {
    const s = toSay();
    const [b1, b2] = bettorsOf(s) as [string, string];
    let n = game.reduce(s, act(b1, { kind: 'bet', value: 'survives' })).state;
    n = game.reduce(n, act(b2, { kind: 'bet', value: 'chokes' })).state;
    const resolved = resolveValid(n);
    expect(resolved.betPoints[b1]).toBe(1); // right call
    expect(resolved.betPoints[b2] ?? 0).toBe(0); // wrong call, no points, no dock
  });

  it('"chokes" pays on every non-valid outcome (timeout, giveUp, rejected, left)', () => {
    // timeout
    {
      const s = toSay();
      const [b1] = bettorsOf(s) as [string];
      const n = game.reduce(s, act(b1, { kind: 'bet', value: 'chokes' })).state;
      const r = game.reduce(n, deadline()).state; // say deadline -> timeout
      expect(r.lastTurn?.outcome).toBe('timeout');
      expect(r.betPoints[b1]).toBe(1);
    }
    // giveUp
    {
      const s = toSay();
      const [b1] = bettorsOf(s) as [string];
      const n = game.reduce(s, act(b1, { kind: 'bet', value: 'chokes' })).state;
      const r = game.reduce(n, act(s.spotlight!, { kind: 'giveUp' })).state;
      expect(r.lastTurn?.outcome).toBe('gaveUp');
      expect(r.betPoints[b1]).toBe(1);
    }
    // rejected (unanimous reject)
    {
      const s = toSay();
      const spot = s.spotlight!;
      const [b1, b2] = bettorsOf(s) as [string, string];
      let n = game.reduce(s, act(b1, { kind: 'bet', value: 'chokes' })).state;
      n = game.reduce(n, act(spot, { kind: 'wordSaid' })).state;
      n = game.reduce(n, act(b1, { kind: 'judge', vote: 'reject' })).state;
      n = game.reduce(n, act(b2, { kind: 'judge', vote: 'reject' })).state;
      expect(n.lastTurn?.outcome).toBe('rejected');
      expect(n.betPoints[b1]).toBe(1);
    }
    // left (spotlight leaves mid-say)
    {
      const s = toSay();
      const spot = s.spotlight!;
      const [b1] = bettorsOf(s) as [string];
      const n = game.reduce(s, act(b1, { kind: 'bet', value: 'chokes' })).state;
      const r = game.reduce(n, left(spot)).state;
      expect(r.lastTurn?.outcome).toBe('left');
      expect(r.betPoints[b1]).toBe(1);
    }
  });

  it('betPointsConfig = 0 disables the payout (no currency moves)', () => {
    const free = createLastStanding('jeu-du-theme', { ...JEU_DU_THEME_CONFIG, betPointsConfig: 0 });
    let s = free.reduce(free.init('s', players, content), deadline()).state;
    const b1 = s.players.find((p) => p !== s.spotlight)!;
    s = free.reduce(s, act(b1, { kind: 'bet', value: 'survives' })).state;
    const spot = s.spotlight!;
    let n = free.reduce(s, act(spot, { kind: 'wordSaid' })).state;
    for (const p of players) {
      if (p !== spot && n.phase === 'judge') n = free.reduce(n, act(p, { kind: 'judge', vote: 'valid' })).state;
    }
    expect(n.lastTurn?.outcome).toBe('valid');
    expect(n.betPoints[b1] ?? 0).toBe(0);
  });

  it('the spotBets buffer is reset every turn — a stale bet never carries over', () => {
    let s = toSay();
    const [b1] = bettorsOf(s) as [string];
    s = game.reduce(s, act(b1, { kind: 'bet', value: 'survives' })).state;
    s = resolveValid(s); // result
    s = game.reduce(s, deadline()).state; // next say (turn 2)
    expect(s.phase).toBe('say');
    expect(Object.keys(s.spotBets)).toEqual([]); // fresh buffer
    const v = game.view(s, b1);
    if (v.phase !== 'say') throw new Error('expected say');
    expect(v.betsIn).toBe(0);
    expect(v.myBet).toBeNull();
  });
});

describe('P0-1 side-bet — GUARD (a): never leaks to a non-owner', () => {
  it("a placed bet is invisible to every other viewer (non-owner invariance)", () => {
    const s = toSay();
    const [b1, b2] = bettorsOf(s) as [string, string];
    const sSurvives = game.reduce(s, act(b1, { kind: 'bet', value: 'survives' })).state;
    const sChokes = game.reduce(s, act(b1, { kind: 'bet', value: 'chokes' })).state;
    expect(game.phaseKey(sSurvives)).toBe(game.phaseKey(sChokes)); // both still say:t1
    // the bettor sees their OWN echo differ…
    expect(JSON.stringify(game.view(sSurvives, b1))).not.toBe(JSON.stringify(game.view(sChokes, b1)));
    // …every other viewer (the spotlight, the other bettor, outsiders) sees byte-identical views
    const nonOwners = [s.spotlight!, b2, ...OUTSIDERS];
    for (const viewer of nonOwners) {
      expect(game.view(sSurvives, viewer)).toEqual(game.view(sChokes, viewer));
    }
  });

  it('a bet value string never appears in any non-owner view JSON', () => {
    const s = toSay();
    const [b1, b2] = bettorsOf(s) as [string, string];
    const n = game.reduce(s, act(b1, { kind: 'bet', value: 'chokes' })).state;
    for (const viewer of [s.spotlight!, b2, ...OUTSIDERS]) {
      const json = JSON.stringify(game.view(n, viewer));
      expect(json).not.toContain('chokes'); // the only placed call must not surface
      expect(json).not.toContain('"spotBets"'); // the hidden buffer never serializes
    }
    // …but the owner DOES see their own call
    expect(JSON.stringify(game.view(n, b1))).toContain('chokes');
  });
});

describe('P0-1 side-bet — GUARD (b): never changes the primary early-resolve (allActed)', () => {
  it('a full set of bets does NOT advance say, resolve the turn, or open judge', () => {
    const s = toSay();
    const bettors = bettorsOf(s);
    let n = s;
    for (const b of bettors) n = game.reduce(n, act(b, { kind: 'bet', value: 'survives' })).state;
    // EVERY eligible bettor has bet — yet the say phase is unchanged structurally.
    expect(n.phase).toBe('say');
    expect(n.spotlight).toBe(s.spotlight);
    expect(game.phaseKey(n)).toBe(game.phaseKey(s)); // same turn, same phase — no early-resolve
    expect(Object.keys(n.judgeVotes)).toEqual([]); // bets never enter the jury buffer
    // the spotlight still must act to advance
    const judge = game.reduce(n, act(s.spotlight!, { kind: 'wordSaid' })).state;
    expect(judge.phase).toBe('judge');
  });

  it('judge early-resolve depends ONLY on jury votes — bets placed earlier do not count toward it', () => {
    const four = ['p1', 'p2', 'p3', 'p4'];
    let s = toSay(game, four);
    const spot = s.spotlight!;
    const [j1, j2, j3] = bettorsOf(s) as [string, string, string];
    // all three place bets during say
    s = game.reduce(s, act(j1, { kind: 'bet', value: 'survives' })).state;
    s = game.reduce(s, act(j2, { kind: 'bet', value: 'survives' })).state;
    s = game.reduce(s, act(j3, { kind: 'bet', value: 'chokes' })).state;
    s = game.reduce(s, act(spot, { kind: 'wordSaid' })).state;
    expect(s.phase).toBe('judge');
    // only TWO of three jurors vote — the bets must NOT complete the set early
    let n = game.reduce(s, act(j1, { kind: 'judge', vote: 'valid' })).state;
    n = game.reduce(n, act(j2, { kind: 'judge', vote: 'valid' })).state;
    expect(n.phase).toBe('judge'); // j3 still expected — bets did not pre-satisfy allActed
    n = game.reduce(n, act(j3, { kind: 'judge', vote: 'valid' })).state;
    expect(n.phase).toBe('result'); // now the jury set is complete
  });
});

describe('P0-1 side-bet — GUARD (c): reject-invalid returns the SAME state reference', () => {
  it('wrong phase / ineligible / duplicate / spotlight / bad value all return ===', () => {
    const s = toSay();
    const b1 = bettorsOf(s)[0]!;
    // spotlight
    expect(game.reduce(s, act(s.spotlight!, { kind: 'bet', value: 'survives' })).state).toBe(s);
    // off-roster ineligible
    expect(game.reduce(s, act('ghost', { kind: 'bet', value: 'survives' })).state).toBe(s);
    expect(game.reduce(s, act('__proto__', { kind: 'bet', value: 'survives' })).state).toBe(s);
    // bad value
    const bad = { kind: 'bet', value: 'nope' } as unknown as LastStandingAction;
    expect(game.reduce(s, act(b1, bad)).state).toBe(s);
    // duplicate
    const mid = game.reduce(s, act(b1, { kind: 'bet', value: 'survives' })).state;
    expect(game.reduce(mid, act(b1, { kind: 'bet', value: 'chokes' })).state).toBe(mid);
    // wrong phase (draw)
    const draw = game.init('s', players, content);
    expect(draw.phase).toBe('draw');
    expect(game.reduce(draw, act('p1', { kind: 'bet', value: 'survives' })).state).toBe(draw);
    // wrong phase (over)
    let over = game.init('s', players, content);
    for (let i = 0; i < 60 && over.phase !== 'over'; i++) over = game.reduce(over, deadline(i)).state;
    expect(over.phase).toBe('over');
    expect(game.reduce(over, act('p1', { kind: 'bet', value: 'survives' })).state).toBe(over);
  });
});
