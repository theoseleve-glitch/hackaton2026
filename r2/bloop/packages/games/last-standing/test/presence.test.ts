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
      { id: 'itm-aaa', theme: { fr: 'Thème Un', en: 'Theme One' }, letters: ['A'], difficulty: 1 },
      { id: 'itm-bbb', theme: { fr: 'Thème Deux', en: 'Theme Two' }, letters: ['B'], difficulty: 2 },
      { id: 'itm-ccc', theme: { fr: 'Thème Trois', en: 'Theme Three' }, letters: ['C'], difficulty: 3 },
    ],
  },
};
const players = ['p1', 'p2', 'p3'];
const game = createLastStanding('jeu-du-theme', JEU_DU_THEME_CONFIG);

const act = (playerId: string, action: LastStandingAction, at = 0): GameEvent<LastStandingAction> =>
  ({ type: 'action', playerId, action, at });
const deadline = (at = 0): GameEvent<LastStandingAction> => ({ type: 'deadline', at });
const left = (playerId: string, at = 0): GameEvent<LastStandingAction> => ({ type: 'playerLeft', playerId, at });
const rejoined = (playerId: string, at = 0): GameEvent<LastStandingAction> =>
  ({ type: 'playerRejoined', playerId, at });

function toSay(g = game, ps = players): LastStandingState {
  const s = g.reduce(g.init('s', ps, content), deadline()).state;
  expect(s.phase).toBe('say');
  return s;
}

function toJudge(g = game, ps = players): LastStandingState {
  const s = toSay(g, ps);
  const next = g.reduce(s, act(s.spotlight!, { kind: 'wordSaid' })).state;
  expect(next.phase).toBe('judge');
  return next;
}

const jurorsOf = (s: LastStandingState): string[] => s.players.filter((p) => p !== s.spotlight);

describe('presence: a disconnected player never blocks a phase', () => {
  it('a disconnected juror is not expected: the remaining juror alone completes the set', () => {
    let s = toJudge();
    const [j1, j2] = jurorsOf(s) as [string, string];
    s = game.reduce(s, left(j2)).state;
    expect(s.phase).toBe('judge'); // j1 is still expected
    const done = game.reduce(s, act(j1, { kind: 'judge', vote: 'valid' })).state;
    expect(done.phase).toBe('result');
    expect(done.lastTurn?.tally).toEqual({ valid: 1, reject: 0 });
  });

  it('a juror leave COMPLETES the expected set and resolves immediately', () => {
    const s = toJudge();
    const [j1, j2] = jurorsOf(s) as [string, string];
    const mid = game.reduce(s, act(j1, { kind: 'judge', vote: 'reject' })).state;
    expect(mid.phase).toBe('judge'); // j2 still expected
    const done = game.reduce(mid, left(j2)).state;
    expect(done.phase).toBe('result'); // the leave shrank the set to {j1} — already acted
    expect(done.lastTurn?.outcome).toBe('rejected'); // 1/1 > 0.5 strict
  });

  it('the LAST eligible juror leaving empties the set: auto-valid with zero votes', () => {
    let s = toJudge();
    const [j1, j2] = jurorsOf(s) as [string, string];
    s = game.reduce(s, left(j1)).state;
    expect(s.phase).toBe('judge');
    const done = game.reduce(s, left(j2)).state;
    expect(done.phase).toBe('result');
    expect(done.lastTurn).toEqual({ player: s.spotlight, outcome: 'valid', tally: { valid: 0, reject: 0 } });
  });

  it('a disconnected juror cannot vote (same reference)', () => {
    let s = toJudge();
    const j1 = jurorsOf(s)[0]!;
    s = game.reduce(s, left(j1)).state;
    expect(game.reduce(s, act(j1, { kind: 'judge', vote: 'reject' })).state).toBe(s);
  });

  it('a rejoined juror is RE-EXPECTED before the phase can resolve early', () => {
    let s = toJudge();
    const [j1, j2] = jurorsOf(s) as [string, string];
    s = game.reduce(s, left(j2)).state;
    s = game.reduce(s, rejoined(j2)).state;
    const mid = game.reduce(s, act(j1, { kind: 'judge', vote: 'valid' })).state;
    expect(mid.phase).toBe('judge'); // j2 is back in the expected set
    const done = game.reduce(mid, act(j2, { kind: 'judge', vote: 'valid' })).state;
    expect(done.phase).toBe('result');
    expect(done.lastTurn?.tally).toEqual({ valid: 2, reject: 0 });
  });

  it('a vote cast by a juror who then left still counts (first vote locked)', () => {
    const four = ['p1', 'p2', 'p3', 'p4'];
    let s = toJudge(game, four);
    const [j1, j2, j3] = jurorsOf(s) as [string, string, string];
    s = game.reduce(s, act(j1, { kind: 'judge', vote: 'reject' })).state;
    s = game.reduce(s, left(j1)).state;
    expect(s.phase).toBe('judge'); // j2 + j3 still expected
    s = game.reduce(s, act(j2, { kind: 'judge', vote: 'valid' })).state;
    const done = game.reduce(s, act(j3, { kind: 'judge', vote: 'valid' })).state;
    expect(done.phase).toBe('result');
    expect(done.lastTurn?.tally).toEqual({ valid: 2, reject: 1 }); // j1's reject survived the leave
    expect(done.lastTurn?.outcome).toBe('valid'); // 1/3 is not > 0.5
  });
});

describe('presence: spotlight disconnects', () => {
  it('the spotlight leaving mid-say is a round elimination (outcome left)', () => {
    const s = toSay();
    const spot = s.spotlight!;
    const { state: next, effects } = game.reduce(s, left(spot));
    expect(next.phase).toBe('result');
    expect(next.alive[spot]).toBe(false);
    expect(next.connected[spot]).toBe(false);
    expect(next.lastTurn).toEqual({ player: spot, outcome: 'left', tally: { valid: 0, reject: 0 } });
    expect(effects[0]).toEqual({ type: 'analytics', name: 'turn_resolved', props: { outcome: 'left', turnSeq: 1 } });
  });

  it('the spotlight leaving mid-judge resolves with the votes cast (the claim stands)', () => {
    let s = toJudge();
    const spot = s.spotlight!;
    const j1 = jurorsOf(s)[0]!;
    s = game.reduce(s, act(j1, { kind: 'judge', vote: 'reject' })).state;
    const done = game.reduce(s, left(spot)).state;
    expect(done.phase).toBe('result');
    expect(done.lastTurn).toEqual({ player: spot, outcome: 'rejected', tally: { valid: 0, reject: 1 } });
    expect(done.alive[spot]).toBe(false);
  });

  it('the spotlight leaving mid-judge with zero votes is auto-valid and still scores', () => {
    const s = toJudge();
    const spot = s.spotlight!;
    const done = game.reduce(s, left(spot)).state;
    expect(done.phase).toBe('result');
    expect(done.lastTurn?.outcome).toBe('valid');
    expect(done.scores[spot]).toBe(1);
    expect(done.alive[spot]).toBe(true); // eliminated for the round only on rejection
  });

  it('a disconnected-but-alive player is eliminated at turn ENTRY (an absentee can never win by hiding)', () => {
    let s = toSay();
    const nextUp = s.rotation[1]!;
    s = game.reduce(s, left(nextUp)).state; // not the spotlight: presence flip only
    expect(s.phase).toBe('say');
    s = game.reduce(s, deadline()).state; // spotlight times out -> result
    const { state: entry, effects } = game.reduce(s, deadline()); // enterTurn lands on the absentee
    expect(entry.phase).toBe('result');
    expect(entry.lastTurn).toEqual({ player: nextUp, outcome: 'left', tally: { valid: 0, reject: 0 } });
    expect(entry.alive[nextUp]).toBe(false);
    expect(effects[0]).toEqual({ type: 'analytics', name: 'turn_resolved', props: { outcome: 'left', turnSeq: 2 } });
  });
});

describe('presence: rejoin semantics and no-ops', () => {
  it('an eliminated rejoiner stays out for the current round and is auto back in at the next draw', () => {
    let s = toSay();
    const spot = s.spotlight!;
    s = game.reduce(s, left(spot)).state; // eliminated 'left' -> result
    s = game.reduce(s, rejoined(spot)).state;
    expect(s.connected[spot]).toBe(true);
    expect(s.alive[spot]).toBe(false); // rejoin flips presence ONLY — still out this round
    s = game.reduce(s, deadline()).state; // result -> say (2 alive remain)
    s = game.reduce(s, deadline()).state; // timeout -> result (1 alive)
    s = game.reduce(s, deadline()).state; // -> roundEnd:r0
    expect(s.phase).toBe('roundEnd');
    const draw = game.reduce(s, deadline()).state; // -> draw:r1
    expect(draw.phase).toBe('draw');
    expect(draw.alive[spot]).toBe(true); // back in: alive resets to the connected snapshot
  });

  it('redundant presence flips and unknown ids are no-ops (same reference)', () => {
    let s = toSay();
    expect(game.reduce(s, rejoined('p1')).state).toBe(s); // already connected
    expect(game.reduce(s, left('ghost')).state).toBe(s); // not in the roster
    expect(game.reduce(s, left('__proto__')).state).toBe(s);
    const j = s.players.find((p) => p !== s.spotlight)!;
    s = game.reduce(s, left(j)).state;
    expect(game.reduce(s, left(j)).state).toBe(s); // already disconnected
  });

  it('a passive room that lost two players still rolls forward to over on deadlines alone', () => {
    let s = game.init('s', players, content);
    expect(s.phase).toBe('draw');
    s = game.reduce(s, left('p1')).state;
    s = game.reduce(s, left('p2')).state;
    for (let i = 0; i < 60 && s.phase !== 'over'; i++) {
      const next = game.reduce(s, deadline(i)).state;
      expect(next).not.toBe(s); // every timed phase consumes its deadline
      s = next;
    }
    expect(s.phase).toBe('over');
    expect(game.phaseDurationMs(s)).toBeNull();
  });
});
