// Presence semantics: a disconnected player never blocks; a leave can
// complete an expected set; a rejoin is re-expected; room collapse (< 3
// connected) ends the match at the next resolution point.
import { describe, expect, it } from 'vitest';
import type { Effect } from '@bloop/engine';
import {
  ack, accuse, content, deadline, FIVE, followersOf, game, left, liveToReveal, openGuess, rejoined, toLive,
} from './fixtures.js';

const FOUR = ['p1', 'p2', 'p3', 'p4'];

describe('briefing presence', () => {
  it('a leave can complete the ack set and start the round', () => {
    let s = game.init('s', FIVE, content(3));
    const [f0, f1, f2, f3] = followersOf(s);
    s = game.reduce(s, ack(f0!, 1_000)).state;
    s = game.reduce(s, ack(f1!, 1_100)).state;
    s = game.reduce(s, ack(f2!, 1_200)).state;
    expect(s.phase).toBe('briefing'); // f3 still expected
    const live = game.reduce(s, left(f3!, 1_300)).state;
    expect(live.phase).toBe('live');
    expect(live.segmentStartedAt).toBe(1_300);
  });

  it('a rejoined follower is re-expected while the briefing is open', () => {
    let s = game.init('s', FIVE, content(3));
    const [f0, f1, f2, f3] = followersOf(s);
    s = game.reduce(s, left(f3!, 500)).state;
    s = game.reduce(s, ack(f0!, 1_000)).state;
    s = game.reduce(s, ack(f1!, 1_100)).state;
    s = game.reduce(s, rejoined(f3!, 1_200)).state;
    s = game.reduce(s, ack(f2!, 1_300)).state;
    expect(s.phase).toBe('briefing'); // f3 must ack again before the early start
    const live = game.reduce(s, ack(f3!, 1_400)).state;
    expect(live.phase).toBe('live');
  });

  it('presence events are idempotent and roster-gated (same reference)', () => {
    const s0 = game.init('s', FIVE, content(3));
    expect(game.reduce(s0, left('ghost', 100)).state).toBe(s0);
    expect(game.reduce(s0, rejoined('p1', 100)).state).toBe(s0); // already connected
    const s1 = game.reduce(s0, left('p1', 200)).state;
    expect(game.reduce(s1, left('p1', 300)).state).toBe(s1); // already disconnected
  });
});

describe('mid-round presence', () => {
  it('a disconnect NEVER eliminates and never rescores — the seat just greys', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const f0 = followersOf(live)[0]!;
    const s = game.reduce(live, left(f0, 2_000)).state;
    expect(s.eliminated[f0]).toBeUndefined();
    expect(s.scores).toEqual(live.scores);
    expect(s.phase).toBe('live');
    const v = game.view(s, 'p1');
    expect(v.seats.find((seat) => seat.id === f0)).toMatchObject({ connected: false, eliminated: false });
  });

  it('all detectives disconnected: the round cruises to timeUp and roster scoring still applies', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const det = live.detectives[0]!;
    const s = game.reduce(live, left(det, 2_000)).state;
    expect(s.phase).toBe('live');
    const r = game.reduce(s, deadline(181_000)).state;
    expect(r.phase).toBe('reveal');
    expect(r.lastOutcome?.kind).toBe('timeUp');
    expect(r.lastOutcome?.perfect).toBe(true);
    expect(r.scores[det]).toBe(1); // scoring is roster-based, not presence-based
    for (const f of followersOf(r)) expect(r.scores[f]).toBe(3);
  });

  it('the guesser leaving mid-guess resolves as a deadline: attempt spent, nothing greyed, live resumes', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const det = live.detectives[0]!;
    const g = game.reduce(live, openGuess(det, 31_000)).state;
    const s = game.reduce(g, left(det, 35_000)).state;
    expect(s.phase).toBe('live');
    expect(s.teamGuessesLeft).toBe(2);
    expect(s.usedCandidates).toEqual([]);
    expect(s.liveSeg).toBe(1);
    expect(s.connected[det]).toBe(false);
  });

  it('a NON-guesser leaving mid-guess changes presence only', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const det = live.detectives[0]!;
    const f0 = followersOf(live)[0]!;
    const g = game.reduce(live, openGuess(det, 31_000)).state;
    const s = game.reduce(g, left(f0, 32_000)).state;
    expect(s.phase).toBe('guess');
    expect(s.teamGuessesLeft).toBe(3);
    expect(s.connected[f0]).toBe(false);
  });

  it('exactly two playable followers still resume live — the fewer-than-two guard is strict', () => {
    // 4 players = 1 detective + 3 followers; one follower leaves pre-tribunal.
    const live = toLive(game.init('s', FOUR, content(3)), 1_000);
    const [f0, f1, f2] = followersOf(live);
    const gone = game.reduce(live, left(f2!, 2_000)).state;
    expect(gone.phase).toBe('live'); // mid-phase presence flip only
    const trib = game.reduce(gone, accuse(f0!, f1!, 3_000)).state;
    expect(trib.phase).toBe('tribunal');
    const r = game.reduce(trib, deadline(28_000)).state; // not guilty -> f0+f1 playable = exactly 2
    expect(r.phase).toBe('live');
  });
});

describe('room collapse (< 3 connected)', () => {
  it('briefing deadline with a collapsed room ends the match: endReason roomCollapsed + gameOver(current scores)', () => {
    let s = game.init('s', FOUR, content(3));
    s = game.reduce(s, left('p1', 100)).state;
    s = game.reduce(s, left('p2', 200)).state;
    const { state: over, effects } = game.reduce(s, deadline(20_000));
    expect(over.phase).toBe('over');
    expect(over.endReason).toBe('roomCollapsed');
    expect(game.phaseDurationMs(over)).toBeNull();
    const eff = effects.find((e): e is Extract<Effect, { type: 'gameOver' }> => e.type === 'gameOver');
    expect(eff).toBeDefined();
    expect(eff!.scores).toEqual(over.scores);
    expect(eff!.scores).not.toBe(over.scores);
  });

  it('a leave that completes the briefing set while collapsed also ends the match', () => {
    let s = game.init('s', FOUR, content(3));
    const [f0, f1, f2] = followersOf(s);
    s = game.reduce(s, ack(f0!, 1_000)).state;
    s = game.reduce(s, left(f1!, 2_000)).state; // 3 connected — not collapsed yet
    expect(s.phase).toBe('briefing'); // f2 still expected
    const over = game.reduce(s, left(f2!, 3_000)).state; // completes the set AND collapses
    expect(over.phase).toBe('over');
    expect(over.endReason).toBe('roomCollapsed');
  });

  it('live deadline with a collapsed room goes straight to over, skipping the reveal', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    let s = game.reduce(live, left(followersOf(live)[0]!, 2_000)).state;
    s = game.reduce(s, left(followersOf(live)[1]!, 2_100)).state;
    s = game.reduce(s, left(followersOf(live)[2]!, 2_200)).state; // 2 connected
    const over = game.reduce(s, deadline(181_000)).state;
    expect(over.phase).toBe('over');
    expect(over.endReason).toBe('roomCollapsed');
  });

  it('tribunal resolution with a collapsed room ends the match', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const det = live.detectives[0]!;
    const [f0, f1, f2, f3] = followersOf(live);
    let s = game.reduce(live, accuse(f0!, f1!, 5_000)).state;
    s = game.reduce(s, left(f2!, 6_000)).state;
    s = game.reduce(s, left(f3!, 7_000)).state;
    s = game.reduce(s, left(det, 8_000)).state; // 2 connected, tribunal still open (f0 expected)
    expect(s.phase).toBe('tribunal');
    const over = game.reduce(s, deadline(30_000)).state;
    expect(over.phase).toBe('over');
    expect(over.endReason).toBe('roomCollapsed');
  });

  it('reveal deadline with a collapsed room ends the match instead of starting the next round', () => {
    let s = game.init('s', FIVE, content(3));
    s = game.reduce(s, deadline(0)).state; // -> live
    s = liveToReveal(s);                    // drain live (through spotlights) -> reveal
    expect(s.phase).toBe('reveal');
    s = game.reduce(s, left('p1', 200_001)).state;
    s = game.reduce(s, left('p2', 200_002)).state;
    s = game.reduce(s, left('p3', 200_003)).state;
    const over = game.reduce(s, deadline(400_000)).state;
    expect(over.phase).toBe('over');
    expect(over.endReason).toBe('roomCollapsed');
  });

  it('a collapsed-then-rejoined room continues normally', () => {
    let s = game.init('s', FIVE, content(3));
    s = game.reduce(s, left('p1', 100)).state;
    s = game.reduce(s, left('p2', 200)).state;
    s = game.reduce(s, left('p3', 300)).state;
    s = game.reduce(s, rejoined('p2', 400)).state; // back to 3 before any resolution point
    const liveS = game.reduce(s, deadline(20_000)).state;
    expect(liveS.phase).toBe('live');
  });
});
