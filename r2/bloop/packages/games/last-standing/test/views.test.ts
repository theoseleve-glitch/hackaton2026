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

function toSay(g = game): LastStandingState {
  const s = g.reduce(g.init('s', players, content), deadline()).state;
  expect(s.phase).toBe('say');
  return s;
}

describe('per-phase views', () => {
  it('draw: bilingual theme + letter, no spotlight yet, full shot clock advertised', () => {
    const s = game.init('s', players, content);
    const v = game.view(s, 'p1');
    if (v.phase !== 'draw') throw new Error('expected draw');
    expect(v.current).toEqual({ theme: { fr: 'Thème Un', en: 'Theme One' }, letter: 'A' });
    expect(v.spotlight).toBeNull();
    expect(v.sayMsThisLap).toBe(8_000);
    expect(v.round).toBe(0);
    expect(v.totalRounds).toBe(3);
    expect(v.rotation.slice().sort()).toEqual([...players].sort());
    for (const p of players) {
      expect(v.alive[p]).toBe(true);
      expect(v.connected[p]).toBe(true);
      expect(v.scores[p]).toBe(0);
      expect(v.wordsValidated[p]).toBe(0);
    }
    expect(v.lastTurn).toBeNull();
  });

  it('a later draw clears the previous round\'s stale spotlight and lastTurn', () => {
    let s = toSay();
    while (s.phase !== 'roundEnd') s = game.reduce(s, deadline()).state;
    const draw = game.reduce(s, deadline()).state;
    const v = game.view(draw, 'p1');
    if (v.phase !== 'draw') throw new Error('expected draw');
    expect(v.spotlight).toBeNull();
    expect(v.lastTurn).toBeNull();
    expect(v.round).toBe(1);
  });

  it('say: only the spotlight is told it is the spotlight; canGiveUp follows config', () => {
    const s = toSay();
    const spot = s.spotlight!;
    const vSpot = game.view(s, spot);
    if (vSpot.phase !== 'say') throw new Error('expected say');
    expect(vSpot.youAreSpotlight).toBe(true);
    expect(vSpot.canGiveUp).toBe(true);
    const other = players.find((p) => p !== spot)!;
    const vOther = game.view(s, other);
    if (vOther.phase !== 'say') throw new Error('expected say');
    expect(vOther.youAreSpotlight).toBe(false);
    expect(vOther.canGiveUp).toBe(false);
    expect(vOther.spotlight).toBe(spot);

    const noQuit = createLastStanding('jeu-du-theme', { ...JEU_DU_THEME_CONFIG, allowGiveUp: false });
    const s2 = toSay(noQuit);
    const v2 = noQuit.view(s2, s2.spotlight!);
    if (v2.phase !== 'say') throw new Error('expected say');
    expect(v2.canGiveUp).toBe(false);
  });

  it('judge: youCanVote gating, own-vote echo only, counts only', () => {
    let s = toSay();
    const spot = s.spotlight!;
    s = game.reduce(s, act(spot, { kind: 'wordSaid' })).state;
    const [j1, j2] = players.filter((p) => p !== spot) as [string, string];

    const vSpot = game.view(s, spot);
    if (vSpot.phase !== 'judge') throw new Error('expected judge');
    expect(vSpot.youCanVote).toBe(false); // never your own word
    expect(vSpot.votesIn).toBe(0);
    expect(vSpot.votersExpected).toBe(2);

    const mid = game.reduce(s, act(j1, { kind: 'judge', vote: 'reject' })).state;
    const vJ1 = game.view(mid, j1);
    if (vJ1.phase !== 'judge') throw new Error('expected judge');
    expect(vJ1.youCanVote).toBe(false); // already voted
    expect(vJ1.myVote).toBe('reject'); // own echo
    expect(vJ1.votesIn).toBe(1);
    const vJ2 = game.view(mid, j2);
    if (vJ2.phase !== 'judge') throw new Error('expected judge');
    expect(vJ2.youCanVote).toBe(true);
    expect(vJ2.myVote).toBeNull(); // never anyone else's ballot
    expect(vJ2.votesIn).toBe(1);
  });

  it('judge: deadPlayersJudge=false drops eliminated players from votersExpected and gating', () => {
    const noDead = createLastStanding('jeu-du-theme', { ...JEU_DU_THEME_CONFIG, deadPlayersJudge: false });
    let s = toSay(noDead);
    const firstSpot = s.spotlight!;
    s = noDead.reduce(s, deadline()).state; // timeout — firstSpot eliminated
    s = noDead.reduce(s, deadline()).state; // next say
    s = noDead.reduce(s, act(s.spotlight!, { kind: 'wordSaid' })).state;
    const v = noDead.view(s, firstSpot);
    if (v.phase !== 'judge') throw new Error('expected judge');
    expect(v.youCanVote).toBe(false);
    expect(v.votersExpected).toBe(1); // only the single living non-spotlight juror
  });

  it('judge: a disconnected juror is not counted in votersExpected and cannot vote', () => {
    let s = toSay();
    const spot = s.spotlight!;
    const [j1, j2] = players.filter((p) => p !== spot) as [string, string];
    s = game.reduce(s, act(spot, { kind: 'wordSaid' })).state;
    s = game.reduce(s, { type: 'playerLeft', playerId: j2, at: 0 }).state;
    const v = game.view(s, j1);
    if (v.phase !== 'judge') throw new Error('expected judge');
    expect(v.votersExpected).toBe(1);
    const vGone = game.view(s, j2);
    if (vGone.phase !== 'judge') throw new Error('expected judge');
    expect(vGone.youCanVote).toBe(false);
  });

  it('result: the stamp beat exposes player, outcome and anonymous tally', () => {
    let s = toSay();
    const spot = s.spotlight!;
    s = game.reduce(s, act(spot, { kind: 'wordSaid' })).state;
    for (const p of players) {
      if (p !== spot && s.phase === 'judge') s = game.reduce(s, act(p, { kind: 'judge', vote: 'valid' })).state;
    }
    const v = game.view(s, 'viewer-not-in-roster');
    if (v.phase !== 'result') throw new Error('expected result');
    expect(v.lastTurn).toEqual({ player: spot, outcome: 'valid', tally: { valid: 2, reject: 0 } });
    expect(v.scores[spot]).toBe(1);
    expect(v.wordsValidated[spot]).toBe(1);
  });

  it('roundEnd: winners + pointsAwarded; over: final scores, rotation, wordsValidated', () => {
    let s = toSay();
    while (s.phase !== 'roundEnd') s = game.reduce(s, deadline()).state;
    const vEnd = game.view(s, 'p1');
    if (vEnd.phase !== 'roundEnd') throw new Error('expected roundEnd');
    expect(vEnd.roundWinners).toEqual(s.roundWinners);
    expect(vEnd.roundWinners).toHaveLength(1);
    expect(vEnd.pointsAwarded).toBe(3);

    while (s.phase !== 'over') s = game.reduce(s, deadline()).state;
    const vOver = game.view(s, '__proto__');
    if (vOver.phase !== 'over') throw new Error('expected over');
    expect(vOver.scores).toEqual(s.scores);
    expect(vOver.rotation).toEqual(s.rotation);
    expect(vOver.wordsValidated).toEqual(s.wordsValidated);
    expect(game.phaseKey(s)).toBe('over');
  });

  it('sayMsThisLap mirrors phaseDurationMs(say) as the lap deepens', () => {
    let s = toSay();
    for (let i = 0; i < 10 && s.phase !== 'over'; i++) {
      if (s.phase === 'say') {
        const v = game.view(s, 'p1');
        if (v.phase !== 'say') throw new Error('expected say');
        expect(v.sayMsThisLap).toBe(game.phaseDurationMs(s));
      }
      s = game.reduce(s, deadline(i)).state;
    }
  });
});
