import { describe, expect, it } from 'vitest';
import type { NightDayState } from '@bloop/game-night-day';
import {
  allOf,
  CONTENT,
  deadline,
  drive,
  game,
  mk,
  P5,
  roleOf,
  toNight,
  vote,
  walkUntil,
  wolfVote,
} from './helpers.js';

function gameOverEffect(effects: ReadonlyArray<{ type: string }>) {
  const fx = effects.find((e) => e.type === 'gameOver');
  if (fx === undefined || fx.type !== 'gameOver') throw new Error('expected gameOver effect');
  return fx as { type: 'gameOver'; scores: Record<string, number> };
}

describe('villageWins scoring (exact)', () => {
  it('living village +2, dead village +1, wolves 0 — with a cloned gameOver map', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const wolf = roleOf(s0, 'wolf');
    const victim = allOf(s0, 'villager')[0]!;
    // night 0: the wolf eats a villager; day 0: the village lynches the wolf.
    const votePhase = drive(game, s0, [
      deadline(1),
      wolfVote(wolf, victim, 2),
      deadline(3),
      deadline(4), // -> dawn (victim dies)
      deadline(5), // -> debate
      deadline(6), // -> vote
    ]);
    expect(votePhase.phase).toBe('vote');
    let s: NightDayState = votePhase;
    for (const p of P5.filter((x) => x !== wolf && x !== victim)) {
      s = game.reduce(s, vote(p, wolf)).state;
    }
    expect(s.phase).toBe('vote'); // the wolf himself is still an expected voter
    s = game.reduce(s, deadline(7)).state; // abstainer omitted; plurality lynches the wolf
    expect(s.phase).toBe('lynchReveal');
    expect(s.lastLynch?.evicted).toBe(wolf);
    const { state: over, effects } = game.reduce(s, deadline(8));
    expect(over.phase).toBe('over');
    expect(over.winners).toBe('village');
    expect(over.endReason).toBe('villageWins');
    const expected: Record<string, number> = {};
    for (const p of P5) expected[p] = p === wolf ? 0 : p === victim ? 1 : 2;
    expect(over.scores).toEqual(expected);
    const fx = gameOverEffect(effects);
    expect(fx.scores).toEqual(over.scores);
    expect(fx.scores).not.toBe(over.scores);
  });
});

describe('wolvesWin scoring (exact)', () => {
  it('parity ends it: living wolf +3, every village-team player +1 (dead or alive)', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const wolf = roleOf(s0, 'wolf');
    const prey = P5.filter((p) => p !== wolf);
    let s: NightDayState = s0;
    // three kill-nights with hung juries in between: 4 -> 3 -> 2 non-wolves.
    for (let night = 0; night < 3; night++) {
      const wolves = walkUntil(game, s, (x) => x.phase === 'nightWolves');
      s = game.reduce(wolves, wolfVote(wolf, prey[night]!, night * 10 + 1)).state;
      s = walkUntil(game, s, (x) => x.phase === 'dawn');
      if (night < 2) s = game.reduce(s, deadline(night * 10 + 2)).state; // debate continues
    }
    expect(s.phase).toBe('dawn');
    const { state: over, effects } = game.reduce(s, deadline(99));
    expect(over.phase).toBe('over');
    expect(over.winners).toBe('wolves');
    expect(over.endReason).toBe('wolvesWin');
    const expected: Record<string, number> = {};
    for (const p of P5) expected[p] = p === wolf ? 3 : 1;
    expect(over.scores).toEqual(expected);
    expect(gameOverEffect(effects).scores).toEqual(expected);
  });
});

describe('maxRounds floor', () => {
  it('maxRounds=1: one full passive cycle ends with the village ahead', () => {
    const quick = mk({ maxRounds: 1 });
    let s = quick.init('s', P5, CONTENT);
    const seen: string[] = [];
    for (let i = 0; i < 20 && s.phase !== 'over'; i++) {
      seen.push(quick.phaseKey(s));
      s = quick.reduce(s, deadline(i)).state;
    }
    expect(seen).toEqual([
      'roleReveal',
      'night:r0:seer',
      'night:r0:wolves',
      'night:r0:witch',
      'dawn:r0',
      'debate:r0',
      'vote:r0',
      'lynch:r0',
    ]);
    expect(s.phase).toBe('over');
    expect(s.endReason).toBe('maxRounds');
    expect(s.winners).toBe('village'); // 1 wolf < 4 non-wolves: the side with more alive wins
    const wolf = roleOf(s, 'wolf');
    for (const p of P5) expect(s.scores[p]).toBe(p === wolf ? 0 : 2);
  });
});

describe('scores stay match-local until the end', () => {
  it('scores are all zero through every pre-over phase', () => {
    let s = game.init('s', P5, CONTENT);
    for (let i = 0; i < 200 && s.phase !== 'over'; i++) {
      for (const p of P5) expect(s.scores[p]).toBe(0);
      const next = game.reduce(s, deadline(i)).state;
      if (next === s) break;
      s = next;
    }
    expect(s.phase).toBe('over');
  });

  it('the over view carries finalRoles, winners, endReason and the scores', () => {
    const s = walkUntil(game, game.init('s', P5, CONTENT), (x) => x.phase === 'over');
    const v = game.view(s, 'p1');
    if (v.phase !== 'over') throw new Error('expected over view');
    expect(v.finalRoles).toEqual(s.roles);
    expect(v.winners).toBe('village');
    expect(v.endReason).toBe('maxRounds');
    expect(v.scores).toEqual(s.scores);
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });
});
