import { describe, expect, it } from 'vitest';
import {
  createSpotlightGuess,
  DEVINE_LA_QUESTION_CONFIG,
  JEU_DE_LA_NOTE_CONFIG,
} from '@bloop/game-spotlight-guess';
import {
  answer, deadline, guess, guessersOf, left, ready, rejoined, reverseContent, scaleContent, spotOf,
} from './fixtures.js';

const players = ['p1', 'p2', 'p3', 'p4'];
const note = createSpotlightGuess('jeu-de-la-note', JEU_DE_LA_NOTE_CONFIG);
const dq = createSpotlightGuess('devine-la-question', DEVINE_LA_QUESTION_CONFIG);

describe('presence bookkeeping', () => {
  it('left/rejoined flip the map; unknown ids and redundant flips are same-reference no-ops', () => {
    const s0 = note.init('s', players, scaleContent);
    expect(note.reduce(s0, left('ghost')).state).toBe(s0);
    expect(note.reduce(s0, rejoined('p1')).state).toBe(s0); // already connected
    const s1 = note.reduce(s0, left('p1')).state;
    expect(s1.connected['p1']).toBe(false);
    expect(note.reduce(s1, left('p1')).state).toBe(s1); // already disconnected
    const s2 = note.reduce(s1, rejoined('p1')).state;
    expect(s2.connected['p1']).toBe(true);
    expect(s2.players).toEqual(players); // the roster never shrinks
    expect(s2.scores['p1']).toBe(0); // scores survive the round trip
  });
});

describe('the spotlight leaving voids the round (secret-keeper gone)', () => {
  it('scale: during target', () => {
    const s0 = note.init('s', players, scaleContent);
    const r = note.reduce(s0, left(spotOf(s0)));
    expect(r.state.phase).toBe('reveal');
    expect(r.state.voided).toBe(true);
    expect(r.effects.some((e) => e.type === 'analytics' && e.name === 'round_skipped')).toBe(true);
    for (const p of players) expect(r.state.lastGained[p]).toBe(0);
  });

  it('scale: during talk', () => {
    const s0 = note.init('s', players, scaleContent);
    const talk = note.reduce(s0, ready(spotOf(s0))).state;
    const r = note.reduce(talk, left(spotOf(talk)));
    expect(r.state.phase).toBe('reveal');
    expect(r.state.voided).toBe(true);
  });

  it('scale: during guess the round resolves NORMALLY (target fixed, talk happened)', () => {
    let s = note.init('s', players, scaleContent);
    s = note.reduce(s, deadline(0)).state;
    s = note.reduce(s, deadline(1)).state;
    expect(s.phase).toBe('guess');
    const spot = spotOf(s);
    const afterLeave = note.reduce(s, left(spot)).state;
    expect(afterLeave.phase).toBe('guess'); // NOT voided
    expect(afterLeave.voided).toBe(false);
    // the remaining guessers still resolve the round
    const t = afterLeave.targets[afterLeave.round]!;
    let r = afterLeave;
    for (const g of guessersOf(afterLeave).filter((p) => afterLeave.connected[p] === true)) {
      r = note.reduce(r, guess(g, t)).state;
    }
    expect(r.phase).toBe('reveal');
    expect(r.voided).toBe(false);
  });

  it('reverse: during answer', () => {
    const s0 = dq.init('s', players, reverseContent);
    const r = dq.reduce(s0, left(spotOf(s0)));
    expect(r.state.phase).toBe('reveal');
    expect(r.state.voided).toBe(true);
  });

  it('reverse: during guess the round continues (chosenAnswer already public)', () => {
    const s0 = dq.init('s', players, reverseContent);
    const g = dq.reduce(s0, answer(spotOf(s0), 0)).state;
    const afterLeave = dq.reduce(g, left(spotOf(g))).state;
    expect(afterLeave.phase).toBe('guess');
    expect(afterLeave.voided).toBe(false);
  });
});

describe('a disconnected player never blocks; a leave can complete the expected set', () => {
  it('scale: the last awaited guesser leaving resolves the round immediately', () => {
    let s = note.init('s', players, scaleContent);
    s = note.reduce(s, deadline(0)).state;
    s = note.reduce(s, deadline(1)).state;
    const [g1, g2, g3] = guessersOf(s);
    s = note.reduce(s, guess(g1!, 5)).state;
    s = note.reduce(s, guess(g2!, 6)).state;
    expect(s.phase).toBe('guess'); // g3 still expected
    const done = note.reduce(s, left(g3!)).state;
    expect(done.phase).toBe('reveal'); // the leave completed the set
    expect(done.lastGained[g3!]).toBe(0); // no guess, no points
  });

  it('reverse: same — and the leaver scores nothing', () => {
    const s0 = dq.init('s', players, reverseContent);
    let s = dq.reduce(s0, answer(spotOf(s0), 0)).state;
    const real = s.reverseRounds[0]!.realIndex;
    const [g1, g2, g3] = guessersOf(s);
    s = dq.reduce(s, guess(g1!, real)).state;
    s = dq.reduce(s, guess(g2!, real)).state;
    expect(s.phase).toBe('guess');
    const done = dq.reduce(s, left(g3!)).state;
    expect(done.phase).toBe('reveal');
    expect(done.lastGained[g3!]).toBe(0);
    expect(done.lastGained[spotOf(done)]).toBe(150); // two correct guessers
  });

  it('a fully passive, fully disconnected room still rolls to over on deadlines alone', () => {
    for (const [mod, pack] of [[note, scaleContent], [dq, reverseContent]] as const) {
      let s = mod.init('s', players, pack);
      for (const p of players) s = mod.reduce(s, left(p)).state;
      for (let i = 0; i < 60 && s.phase !== 'over'; i++) {
        s = mod.reduce(s, deadline(i)).state;
      }
      expect(s.phase).toBe('over');
      expect(mod.phaseDurationMs(s)).toBeNull();
    }
  });
});

describe('rejoin semantics', () => {
  it('a rejoined guesser is expected again mid-guess', () => {
    let s = note.init('s', players, scaleContent);
    s = note.reduce(s, deadline(0)).state;
    s = note.reduce(s, deadline(1)).state;
    const [g1, g2, g3] = guessersOf(s);
    s = note.reduce(s, left(g3!)).state; // expected set shrinks to g1,g2
    s = note.reduce(s, guess(g1!, 5)).state;
    expect(s.phase).toBe('guess');
    s = note.reduce(s, rejoined(g3!)).state; // g3 expected again
    s = note.reduce(s, guess(g2!, 6)).state;
    expect(s.phase).toBe('guess'); // g2 alone no longer completes the set
    s = note.reduce(s, guess(g3!, 7)).state;
    expect(s.phase).toBe('reveal');
  });

  it('reverse: a rejoined guesser can still lock at the current tier', () => {
    const s0 = dq.init('s', players, reverseContent);
    let s = dq.reduce(s0, answer(spotOf(s0), 0)).state;
    const [g1] = guessersOf(s);
    s = dq.reduce(s, left(g1!)).state;
    s = dq.reduce(s, deadline(1)).state; // -> tier 1
    s = dq.reduce(s, rejoined(g1!)).state;
    const lock = dq.reduce(s, guess(g1!, 0)).state;
    expect(lock.guesses[g1!]).toEqual({ value: 0, tier: 1 });
  });
});

describe('rotation skips disconnected seats', () => {
  it('the next round spotlight is never a disconnected player', () => {
    let s = note.init('s', players, scaleContent);
    const firstSpot = spotOf(s);
    const order = s.turnOrder;
    const nextSeat = order[(s.spotIndex + 1) % order.length]!;
    s = note.reduce(s, left(nextSeat)).state; // the would-be next speaker is gone
    for (let i = 0; i < 4 && s.round === 0; i++) s = note.reduce(s, deadline(i)).state;
    expect(s.round).toBe(1);
    expect(spotOf(s)).not.toBe(nextSeat); // skipped
    expect(spotOf(s)).not.toBe(firstSpot);
    expect(s.connected[spotOf(s)]).toBe(true);
  });
});
