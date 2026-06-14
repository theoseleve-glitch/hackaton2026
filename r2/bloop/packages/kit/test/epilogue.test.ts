import { describe, expect, it } from 'vitest';
import {
  emptyPlayerMap,
  isCloseFinish,
  leaderboard,
  mvp,
  statLeaders,
  superlativeWinners,
  topGap,
} from '@bloop/kit';

const scores = (o: Record<string, number>) => Object.assign(emptyPlayerMap<number>(), o);

describe('leaderboard', () => {
  it('ranks highest score first', () => {
    const board = leaderboard(scores({ p1: 1, p2: 5, p3: 3 }));
    expect(board.map((e) => e.playerId)).toEqual(['p2', 'p3', 'p1']);
    expect(board.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('breaks ties by ascending playerId (stable, replay-identical) and shares rank', () => {
    const board = leaderboard(scores({ pb: 5, pa: 5, pc: 1 }));
    expect(board.map((e) => e.playerId)).toEqual(['pa', 'pb', 'pc']);
    expect(board.map((e) => e.rank)).toEqual([1, 1, 3]); // competition ranking
  });

  it('treats missing/garbage scores as 0 and never mutates input', () => {
    const s = scores({ p1: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    s['p2'] = Number.NaN as any;
    const board = leaderboard(s);
    expect(board.find((e) => e.playerId === 'p2')!.score).toBe(0);
    expect(s['p1']).toBe(2);
  });

  it('is empty for an empty score map', () => {
    expect(leaderboard(emptyPlayerMap<number>())).toEqual([]);
  });
});

describe('topGap', () => {
  it('is top1 - top2', () => {
    expect(topGap(scores({ p1: 7, p2: 3, p3: 1 }))).toBe(4);
  });
  it('is 0 for a tie at the top', () => {
    expect(topGap(scores({ p1: 5, p2: 5 }))).toBe(0);
  });
  it('is 0 for fewer than two players', () => {
    expect(topGap(scores({ p1: 9 }))).toBe(0);
    expect(topGap(emptyPlayerMap<number>())).toBe(0);
  });
});

describe('isCloseFinish', () => {
  it('is true when the top-2 gap is within threshold', () => {
    expect(isCloseFinish(scores({ p1: 5, p2: 4 }), 1)).toBe(true);
    expect(isCloseFinish(scores({ p1: 5, p2: 5 }), 0)).toBe(true);
  });
  it('is false when the leader has run away', () => {
    expect(isCloseFinish(scores({ p1: 9, p2: 1 }), 1)).toBe(false);
  });
  it('is false for fewer than two players or a bad threshold', () => {
    expect(isCloseFinish(scores({ p1: 5 }), 3)).toBe(false);
    expect(isCloseFinish(scores({ p1: 5, p2: 5 }), -1)).toBe(false);
  });
});

describe('mvp', () => {
  it('is the sole top player', () => {
    expect(mvp(scores({ p1: 2, p2: 7, p3: 3 }))).toBe('p2');
  });
  it('is null on a contested crown (tie for first)', () => {
    expect(mvp(scores({ p1: 5, p2: 5, p3: 1 }))).toBeNull();
  });
  it('is null for an empty roster', () => {
    expect(mvp(emptyPlayerMap<number>())).toBeNull();
  });
});

describe('superlativeWinners', () => {
  it('returns players satisfying the predicate, in stable id order', () => {
    const survived = Object.assign(emptyPlayerMap<boolean>(), {
      p3: true,
      p1: true,
      p2: false,
    });
    expect(superlativeWinners(survived, (v) => v === true)).toEqual(['p1', 'p3']);
  });
  it('is empty when nobody qualifies', () => {
    const m = Object.assign(emptyPlayerMap<number>(), { p1: 0, p2: 0 });
    expect(superlativeWinners(m, (v) => v > 0)).toEqual([]);
  });
});

describe('statLeaders', () => {
  it('returns the max-value holder and the value (e.g. longest streak)', () => {
    const streaks = scores({ p1: 2, p2: 5, p3: 1 });
    expect(statLeaders(streaks)).toEqual({ value: 5, players: ['p2'] });
  });
  it('returns all tied leaders in stable id order', () => {
    const streaks = scores({ pb: 4, pa: 4, pc: 2 });
    expect(statLeaders(streaks)).toEqual({ value: 4, players: ['pa', 'pb'] });
  });
  it('awards nothing when every value is <= 0 (superlative nobody earned)', () => {
    expect(statLeaders(scores({ p1: 0, p2: 0 }))).toEqual({ value: 0, players: [] });
    expect(statLeaders(emptyPlayerMap<number>())).toEqual({ value: 0, players: [] });
  });
  it('does not mutate input', () => {
    const s = scores({ p1: 3 });
    statLeaders(s);
    expect(s).toEqual({ p1: 3 });
  });
});
