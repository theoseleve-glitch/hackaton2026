// The pause/resume clock bank — the platform's trickiest determinism surface
// (design 2.16 risks). Everything below is pure event-`at` arithmetic.
import { describe, expect, it } from 'vitest';
import { replay, type GameEvent } from '@bloop/engine';
import type { RuleHuntAction } from '@bloop/game-rule-hunt';
import {
  accuse, ack, content, deadline, FIVE, followersOf, game, openGuess, pickCandidate,
  toLive, tribunalVote, wrongIndex,
} from './fixtures.js';

describe('clock banking on interrupts', () => {
  it('an accusation banks the elapsed segment and pauses the clock', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const [accuser, accused] = followersOf(live);
    const trib = game.reduce(live, accuse(accuser!, accused!, 61_300)).state;
    expect(trib.phase).toBe('tribunal');
    expect(trib.liveRemainingMs).toBe(180_000 - 60_300);
    expect(game.phaseDurationMs(trib)).toBe(25_000); // tribunal runs on its own clock
  });

  it('resume restarts the segment at the resolving event and re-arms the banked remainder', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const [accuser, accused] = followersOf(live);
    const trib = game.reduce(live, accuse(accuser!, accused!, 61_300)).state;
    const { state: resumed, effects } = game.reduce(trib, deadline(86_300));
    expect(resumed.phase).toBe('live');
    expect(resumed.segmentStartedAt).toBe(86_300);
    expect(resumed.liveSeg).toBe(1);
    expect(game.phaseDurationMs(resumed)).toBe(119_700);
    expect(effects).toEqual([
      { type: 'analytics', name: 'tribunal_resolved', props: { round: 0, guilty: false } },
    ]);
  });

  it('chained interrupts keep banking; interruptSeq makes every instance key-unique', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const det = live.detectives[0]!;
    const [accuser, accused] = followersOf(live);
    const trib = game.reduce(live, accuse(accuser!, accused!, 61_300)).state; // bank 119_700
    const resumed = game.reduce(trib, deadline(86_300)).state;
    const guess = game.reduce(resumed, openGuess(det, 96_300)).state; // bank 119_700 - 10_000
    expect(guess.phase).toBe('guess');
    expect(guess.liveRemainingMs).toBe(109_700);
    expect(game.phaseKey(guess)).toBe('guess:r0:i2');
    expect(game.phaseDurationMs(guess)).toBe(20_000);
    const resumed2 = game.reduce(guess, deadline(116_300)).state;
    expect(resumed2.phase).toBe('live');
    expect(resumed2.liveSeg).toBe(2);
    expect(game.phaseDurationMs(resumed2)).toBe(109_700);
  });

  it('the live deadline empties the bank and reveals timeUp', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const { state: reveal } = game.reduce(live, deadline(181_000));
    expect(reveal.phase).toBe('reveal');
    expect(reveal.liveRemainingMs).toBe(0);
    expect(reveal.lastOutcome?.kind).toBe('timeUp');
    expect(reveal.lastOutcome?.perfect).toBe(true);
  });
});

describe('interrupt-vs-deadline race', () => {
  it('an interrupt landing exactly on clock exhaustion banks 0 and the round ends after the sub-phase', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const [accuser, accused] = followersOf(live);
    const trib = game.reduce(live, accuse(accuser!, accused!, 181_000)).state; // 180_000 elapsed
    expect(trib.phase).toBe('tribunal');
    expect(trib.liveRemainingMs).toBe(0);
    const ended = game.reduce(trib, deadline(206_000)).state;
    expect(ended.phase).toBe('reveal'); // no resume with an empty bank
    expect(ended.lastOutcome?.kind).toBe('timeUp');
  });

  it('an interrupt PAST exhaustion (shell race) clamps the bank at 0, never negative', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const [accuser, accused] = followersOf(live);
    const trib = game.reduce(live, accuse(accuser!, accused!, 999_999)).state;
    expect(trib.liveRemainingMs).toBe(0);
  });

  it('a tiny remainder resumes live for exactly that remainder', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const [accuser, accused] = followersOf(live);
    const trib = game.reduce(live, accuse(accuser!, accused!, 180_999)).state;
    expect(trib.liveRemainingMs).toBe(1);
    const resumed = game.reduce(trib, deadline(200_000)).state;
    expect(resumed.phase).toBe('live');
    expect(game.phaseDurationMs(resumed)).toBe(1);
    const done = game.reduce(resumed, deadline(200_001)).state;
    expect(done.phase).toBe('reveal');
  });

  it('an event `at` before the segment start clamps elapsed at 0 (defensive)', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const [accuser, accused] = followersOf(live);
    const trib = game.reduce(live, accuse(accuser!, accused!, 500)).state;
    expect(trib.liveRemainingMs).toBe(180_000);
  });
});

describe('replay determinism (engine replay, identical pack version)', () => {
  it('a full interrupted match replays to a byte-identical state', () => {
    const pack = content(3);
    const s0 = game.init('match-seed', FIVE, pack);
    const det = s0.detectives[0]!;
    const [f0, f1, f2, f3] = followersOf(s0);
    const events: Array<GameEvent<RuleHuntAction>> = [
      ack(f0!, 1_000), ack(f1!, 1_100), ack(f2!, 1_200), ack(f3!, 1_300), // -> live
      accuse(f0!, f1!, 20_000),                                            // -> tribunal (bank)
      tribunalVote(f0!, true, 21_000), tribunalVote(f2!, true, 22_000),
      tribunalVote(f3!, false, 23_000),                                    // -> conviction, resume live
      openGuess(det, 40_000),                                              // -> guess (bank)
    ];
    let s = s0;
    for (const e of events) s = game.reduce(s, e).state;
    const wrong = wrongIndex(s);
    const tail: Array<GameEvent<RuleHuntAction>> = [
      pickCandidate(det, wrong, 45_000), // wrong pick -> resume live
      deadline(300_000),                 // live exhausts -> reveal
      deadline(312_000),                 // -> round 1
      deadline(340_000),                 // briefing deadline -> live
      deadline(520_000),                 // -> reveal
      deadline(532_000),                 // -> round 2
      deadline(560_000), deadline(740_000), deadline(752_000), // -> over
    ];
    for (const e of tail) s = game.reduce(s, e).state;
    expect(s.phase).toBe('over');

    const replayed = replay(game, 'match-seed', [...FIVE], pack, [...events, ...tail]);
    expect(replayed).toEqual(s);
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(s));
  });
});
