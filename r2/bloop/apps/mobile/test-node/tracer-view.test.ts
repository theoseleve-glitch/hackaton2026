import { describe, expect, it } from 'vitest';
import { asTracerView, secondsLeft } from '../src/games/tracer-view';

describe('tracer view guard (mobile narrows the opaque view — types only cross the firewall)', () => {
  it('accepts a vote view', () => {
    const v = { phase: 'vote', round: 0, totalRounds: 3, prompt: 'Who…?', hasVoted: { p1: true, p2: false }, myVote: null, scores: { p1: 0, p2: 0 } };
    expect(asTracerView(v)).toEqual(v);
  });

  it('accepts a reveal view', () => {
    const v = { phase: 'reveal', round: 1, totalRounds: 3, prompt: 'Who…?', tally: { p1: 2, p2: 0 }, scores: { p1: 1, p2: 0 } };
    expect(asTracerView(v)).toEqual(v);
  });

  it('accepts an over view', () => {
    expect(asTracerView({ phase: 'over', scores: { p1: 3 } })).toEqual({ phase: 'over', scores: { p1: 3 } });
  });

  it('rejects junk and near-misses', () => {
    expect(asTracerView(null)).toBeNull();
    expect(asTracerView({ phase: 'vote', round: 0 })).toBeNull(); // missing fields
    expect(asTracerView({ phase: 'lobby' })).toBeNull(); // unknown phase
    expect(asTracerView({ phase: 'vote', round: 'x', totalRounds: 3, prompt: '', hasVoted: {}, myVote: null, scores: {} })).toBeNull();
  });

  it('secondsLeft clamps at 0 and passes null through', () => {
    expect(secondsLeft(null, 1_000)).toBeNull();
    expect(secondsLeft(31_000, 1_000)).toBe(30);
    expect(secondsLeft(1_100, 1_000)).toBe(1); // ceil
    expect(secondsLeft(500, 1_000)).toBe(0);
  });
});
