import { describe, expect, it } from 'vitest';
import {
  content, deadline, EIGHT, FIVE, followersOf, game, left, openGuess, pickCandidate, toLive, wrongIndex,
} from './fixtures.js';

describe('opening the guess grid', () => {
  it('a detective opens the grid: clock banked, interruptSeq bumped, guess clock armed', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const det = live.detectives[0]!;
    const { state: g, effects } = game.reduce(live, openGuess(det, 31_000));
    expect(g.phase).toBe('guess');
    expect(g.guess).toEqual({ guesser: det });
    expect(g.liveRemainingMs).toBe(150_000); // 30s elapsed since segmentStartedAt 1_000
    expect(g.teamGuessesLeft).toBe(3); // the attempt is spent on RESOLUTION, not on opening
    expect(game.phaseKey(g)).toBe('guess:r0:i1');
    expect(game.phaseDurationMs(g)).toBe(20_000);
    expect(effects).toEqual([]);
  });

  it('rejects follower, disconnected detective, wrong phase, and empty attempt pool (same reference)', () => {
    const s0 = game.init('s', FIVE, content(3));
    const det = s0.detectives[0]!;
    const f0 = followersOf(s0)[0]!;
    expect(game.reduce(s0, openGuess(det, 100)).state).toBe(s0); // briefing
    const live = toLive(s0, 1_000);
    expect(game.reduce(live, openGuess(f0, 2_000)).state).toBe(live); // follower
    expect(game.reduce(live, openGuess('ghost', 2_000)).state).toBe(live);
    const gone = game.reduce(live, left(det, 2_000)).state;
    expect(game.reduce(gone, openGuess(det, 3_000)).state).toBe(gone); // disconnected
    const drained = { ...live, teamGuessesLeft: 0 };
    expect(game.reduce(drained, openGuess(det, 2_000)).state).toBe(drained);
  });

  it('either detective of a two-detective room may open; but only the OPENER may pick', () => {
    const live = toLive(game.init('s', EIGHT, content(3)), 1_000);
    const [d0, d1] = live.detectives;
    expect(live.detectives).toHaveLength(2);
    const g = game.reduce(live, openGuess(d1!, 2_000)).state;
    expect(g.phase).toBe('guess');
    expect(g.guess?.guesser).toBe(d1);
    // the non-opening detective cannot lock the pick
    expect(game.reduce(g, pickCandidate(d0!, g.trueCandidateIndex, 3_000)).state).toBe(g);
  });
});

describe('picking a candidate', () => {
  it('the correct index ends the round early: reveal kind guessed, attempt spent', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const det = live.detectives[0]!;
    const g = game.reduce(live, openGuess(det, 31_000)).state;
    const { state: r, effects } = game.reduce(g, pickCandidate(det, g.trueCandidateIndex, 35_000));
    expect(r.phase).toBe('reveal');
    expect(r.teamGuessesLeft).toBe(2);
    expect(r.lastOutcome).toEqual({
      kind: 'guessed',
      guesser: det,
      pickedIndex: g.trueCandidateIndex,
      perfect: true, // zero convictions this round
      trueIndex: g.trueCandidateIndex,
      ruleText: r.items[0]!.rule,
    });
    expect(effects).toEqual([
      { type: 'analytics', name: 'guess_attempted', props: { round: 0, correct: true } },
      { type: 'analytics', name: 'round_completed', props: { round: 0, kind: 'guessed', perfect: true } },
    ]);
  });

  it('a wrong pick greys the candidate, spends the attempt, and resumes live with the banked remainder', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const det = live.detectives[0]!;
    const g = game.reduce(live, openGuess(det, 31_000)).state;
    const wrong = wrongIndex(g);
    const { state: r, effects } = game.reduce(g, pickCandidate(det, wrong, 35_000));
    expect(r.phase).toBe('live');
    expect(r.teamGuessesLeft).toBe(2);
    expect(r.usedCandidates).toEqual([wrong]);
    expect(r.liveSeg).toBe(1);
    expect(r.segmentStartedAt).toBe(35_000);
    expect(r.liveRemainingMs).toBe(150_000); // bank untouched by guess-phase time
    expect(game.phaseDurationMs(r)).toBe(24_000); // resumed live is armed at the heat cadence
    expect(effects).toEqual([
      { type: 'analytics', name: 'guess_attempted', props: { round: 0, correct: false } },
    ]);
  });

  it('rejects non-guesser, out-of-range, fractional, and already-used indices (same reference)', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const det = live.detectives[0]!;
    const f0 = followersOf(live)[0]!;
    const g = game.reduce(live, openGuess(det, 31_000)).state;
    const wrong = wrongIndex(g);
    expect(game.reduce(g, pickCandidate(f0, wrong, 32_000)).state).toBe(g); // follower
    expect(game.reduce(g, pickCandidate(det, 8, 32_000)).state).toBe(g); // grid is 0..7
    expect(game.reduce(g, pickCandidate(det, -1, 32_000)).state).toBe(g);
    expect(game.reduce(g, pickCandidate(det, 2.5, 32_000)).state).toBe(g);
    // wrong pick, reopen, then the SAME index is inert
    const resumed = game.reduce(g, pickCandidate(det, wrong, 35_000)).state;
    const g2 = game.reduce(resumed, openGuess(det, 40_000)).state;
    expect(game.reduce(g2, pickCandidate(det, wrong, 41_000)).state).toBe(g2);
    // picks outside the guess phase are inert
    expect(game.reduce(live, pickCandidate(det, wrong, 2_000)).state).toBe(live);
  });

  it('the guess deadline SPENDS the attempt with no pick (anti pause-stalling) and resumes live', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const det = live.detectives[0]!;
    const g = game.reduce(live, openGuess(det, 31_000)).state;
    const { state: r, effects } = game.reduce(g, deadline(51_000));
    expect(r.phase).toBe('live');
    expect(r.teamGuessesLeft).toBe(2);
    expect(r.usedCandidates).toEqual([]); // nothing greyed — no pick was made
    expect(r.liveSeg).toBe(1);
    expect(effects).toEqual([]);
  });

  it('all attempts spent -> openGuess is inert for the rest of the round', () => {
    let s = toLive(game.init('s', FIVE, content(3)), 1_000);
    const det = s.detectives[0]!;
    for (let i = 0; i < 3; i++) {
      s = game.reduce(s, openGuess(det, 50_000 + i * 1_000)).state;
      s = game.reduce(s, deadline(50_500 + i * 1_000)).state; // spend with no pick
      expect(s.phase).toBe('live');
    }
    expect(s.teamGuessesLeft).toBe(0);
    expect(game.reduce(s, openGuess(det, 60_000)).state).toBe(s);
  });

  it('a wrong pick with an empty bank ends the round (timeUp, never a 0ms live resume)', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const det = live.detectives[0]!;
    const g = game.reduce(live, openGuess(det, 181_000)).state; // interrupt exactly at exhaustion
    expect(g.liveRemainingMs).toBe(0);
    const r = game.reduce(g, pickCandidate(det, wrongIndex(g), 185_000)).state;
    expect(r.phase).toBe('reveal');
    expect(r.lastOutcome?.kind).toBe('timeUp');
  });

  it('the attempt pool is per round: it refills at the next briefing', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const det = live.detectives[0]!;
    let s = game.reduce(live, openGuess(det, 31_000)).state;
    s = game.reduce(s, pickCandidate(det, wrongIndex(s), 32_000)).state;
    expect(s.teamGuessesLeft).toBe(2);
    s = game.reduce(s, deadline(300_000)).state; // live -> reveal
    s = game.reduce(s, deadline(312_000)).state; // reveal -> round 1 briefing
    expect(s.round).toBe(1);
    expect(s.teamGuessesLeft).toBe(3);
    expect(s.usedCandidates).toEqual([]);
  });
});
