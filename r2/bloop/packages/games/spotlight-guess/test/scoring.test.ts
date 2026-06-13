import { describe, expect, it } from 'vitest';
import {
  band,
  createSpotlightGuess,
  DEVINE_LA_QUESTION_CONFIG,
  JEU_DE_LA_NOTE_CONFIG,
  type SpotlightGuessState,
} from '@bloop/game-spotlight-guess';
import {
  answer, deadline, guess, guessersOf, reverseContent, scaleContent, spotOf, wheelContent,
} from './fixtures.js';

const note = createSpotlightGuess('jeu-de-la-note', JEU_DE_LA_NOTE_CONFIG);
const dq = createSpotlightGuess('devine-la-question', DEVINE_LA_QUESTION_CONFIG);

/** A guess value at exactly distance d from the target, kept inside the domain. */
function at(target: number, d: number, lo: number, hi: number): number {
  return target - d >= lo ? target - d : target + d;
}

function toGuess(mod: typeof note, s0: SpotlightGuessState): SpotlightGuessState {
  let s = mod.reduce(s0, deadline(0)).state; // target -> talk
  return mod.reduce(s, deadline(1)).state; // talk -> guess
}

describe('closeness bands (design §2.10, binding)', () => {
  it('scale10: 0→4, 1→2, 2→1, ≥3→0', () => {
    expect(band('scale10', 0)).toBe(4);
    expect(band('scale10', 1)).toBe(2);
    expect(band('scale10', 2)).toBe(1);
    expect(band('scale10', 3)).toBe(0);
    expect(band('scale10', 9)).toBe(0);
  });

  it('wheel100: ≤5→4, ≤10→3, ≤20→2, ≤33→1, else 0', () => {
    expect(band('wheel100', 0)).toBe(4);
    expect(band('wheel100', 5)).toBe(4);
    expect(band('wheel100', 6)).toBe(3);
    expect(band('wheel100', 10)).toBe(3);
    expect(band('wheel100', 11)).toBe(2);
    expect(band('wheel100', 20)).toBe(2);
    expect(band('wheel100', 21)).toBe(1);
    expect(band('wheel100', 33)).toBe(1);
    expect(band('wheel100', 34)).toBe(0);
  });
});

describe('scale round scoring — guesser bands + speaker lower-median', () => {
  it('odd guess count: distances [0,1,2] pay 4/2/1 and the speaker takes band(d=1)=2', () => {
    const four = ['p1', 'p2', 'p3', 'p4'];
    const s0 = note.init('s', four, scaleContent);
    const s = toGuess(note, s0);
    const t = s.targets[0]!;
    const spot = spotOf(s);
    const [g1, g2, g3] = guessersOf(s);
    let r = note.reduce(s, guess(g1!, t)).state;
    r = note.reduce(r, guess(g2!, at(t, 1, 1, 10))).state;
    const done = note.reduce(r, guess(g3!, at(t, 2, 1, 10))).state;
    expect(done.phase).toBe('reveal');
    expect(done.lastGained[g1!]).toBe(4);
    expect(done.lastGained[g2!]).toBe(2);
    expect(done.lastGained[g3!]).toBe(1);
    expect(done.lastGained[spot]).toBe(2); // lower median of [0,1,2] is 1 -> band 2
    expect(done.scores[g1!]).toBe(4);
    expect(done.scores[spot]).toBe(2);
  });

  it('even guess count: lower median of [0,1] is 0 — the speaker takes the better band', () => {
    const s0 = note.init('s', ['p1', 'p2', 'p3'], scaleContent);
    const s = toGuess(note, s0);
    const t = s.targets[0]!;
    const spot = spotOf(s);
    const [g1, g2] = guessersOf(s);
    let r = note.reduce(s, guess(g1!, t)).state;
    const done = note.reduce(r, guess(g2!, at(t, 1, 1, 10))).state;
    expect(done.lastGained[spot]).toBe(4); // sorted [0,1], index floor((2-1)/2)=0 -> d=0 -> 4
  });

  it('ties share the band — every closest guesser scores 4', () => {
    const s0 = note.init('s', ['p1', 'p2', 'p3'], scaleContent);
    const s = toGuess(note, s0);
    const t = s.targets[0]!;
    const [g1, g2] = guessersOf(s);
    let r = note.reduce(s, guess(g1!, t)).state;
    const done = note.reduce(r, guess(g2!, t)).state;
    expect(done.lastGained[g1!]).toBe(4);
    expect(done.lastGained[g2!]).toBe(4);
    expect(done.lastGained[spotOf(done)]).toBe(4);
  });

  it('wheel100 distances pay the wheel bands; speaker takes the median band', () => {
    const six = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    const s0 = note.init('s', six, wheelContent);
    const s = toGuess(note, s0);
    const t = s.targets[0]!;
    const spot = spotOf(s);
    const gs = guessersOf(s);
    const ds = [0, 7, 15, 30, 50];
    let r = s;
    for (let i = 0; i < gs.length; i++) {
      r = note.reduce(r, guess(gs[i]!, at(t, ds[i]!, 0, 100))).state;
    }
    expect(r.phase).toBe('reveal');
    expect(r.lastGained[gs[0]!]).toBe(4);
    expect(r.lastGained[gs[1]!]).toBe(3);
    expect(r.lastGained[gs[2]!]).toBe(2);
    expect(r.lastGained[gs[3]!]).toBe(1);
    expect(r.lastGained[gs[4]!]).toBe(0);
    expect(r.lastGained[spot]).toBe(2); // median of [0,7,15,30,50] is 15 -> band 2
  });

  it('deadline resolves partial guesses: missing guessers score 0, speaker medians the submitted set', () => {
    const four = ['p1', 'p2', 'p3', 'p4'];
    const s0 = note.init('s', four, scaleContent);
    const s = toGuess(note, s0);
    const t = s.targets[0]!;
    const spot = spotOf(s);
    const [g1] = guessersOf(s);
    const mid = note.reduce(s, guess(g1!, t)).state;
    const done = note.reduce(mid, deadline(2)).state; // two guessers never acted
    expect(done.phase).toBe('reveal');
    expect(done.lastGained[g1!]).toBe(4);
    for (const g of guessersOf(done).filter((p) => p !== g1)) expect(done.lastGained[g]).toBe(0);
    expect(done.lastGained[spot]).toBe(4); // submitted distances = [0]
  });

  it('no guesses at all: everyone scores 0, including the speaker', () => {
    const s0 = note.init('s', ['p1', 'p2', 'p3'], scaleContent);
    const s = toGuess(note, s0);
    const done = note.reduce(s, deadline(2)).state;
    expect(done.phase).toBe('reveal');
    for (const p of done.players) expect(done.lastGained[p]).toBe(0);
  });
});

describe('reverse round scoring — tier ladder + reader bonus', () => {
  it('locks pay 300/200/100 by tier; the mystery player gains 75 per correct guesser', () => {
    const five = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const s0 = dq.init('s', five, reverseContent);
    const spot = spotOf(s0);
    const s1 = dq.reduce(s0, answer(spot, 0)).state;
    const real = s1.reverseRounds[0]!.realIndex;
    const wrong = (real + 1) % s1.reverseRounds[0]!.candidates.length;
    const [g1, g2, g3, g4] = guessersOf(s1);

    let s = dq.reduce(s1, guess(g1!, real)).state; // tier 0 -> 300
    s = dq.reduce(s, deadline(1)).state; // hint 1
    s = dq.reduce(s, guess(g2!, real)).state; // tier 1 -> 200
    s = dq.reduce(s, deadline(2)).state; // hint 2
    s = dq.reduce(s, guess(g3!, wrong)).state; // tier 2, wrong -> 0
    s = dq.reduce(s, guess(g4!, real)).state; // tier 2 -> 100, completes the set

    expect(s.phase).toBe('reveal');
    expect(s.lastGained[g1!]).toBe(300);
    expect(s.lastGained[g2!]).toBe(200);
    expect(s.lastGained[g3!]).toBe(0);
    expect(s.lastGained[g4!]).toBe(100);
    expect(s.lastGained[spot]).toBe(3 * 75); // three correct guessers
    expect(s.scores[spot]).toBe(225);
  });

  it('nobody correct: everyone 0, reader bonus 0', () => {
    const s0 = dq.init('s', ['p1', 'p2', 'p3'], reverseContent);
    const spot = spotOf(s0);
    const s1 = dq.reduce(s0, answer(spot, 0)).state;
    const wrong = (s1.reverseRounds[0]!.realIndex + 1) % s1.reverseRounds[0]!.candidates.length;
    const [g1, g2] = guessersOf(s1);
    let s = dq.reduce(s1, guess(g1!, wrong)).state;
    s = dq.reduce(s, guess(g2!, wrong)).state;
    expect(s.phase).toBe('reveal');
    for (const p of s.players) expect(s.lastGained[p]).toBe(0);
  });

  it('a voided round pays zero to everyone', () => {
    const s0 = dq.init('s', ['p1', 'p2', 'p3'], reverseContent);
    const voided = dq.reduce(s0, deadline(0)).state; // answer deadline -> void
    expect(voided.voided).toBe(true);
    for (const p of voided.players) {
      expect(voided.lastGained[p]).toBe(0);
      expect(voided.scores[p]).toBe(0);
    }
  });
});

describe('gameOver effect — cloned scores', () => {
  it('the emitted scores equal but never alias live state (both games)', () => {
    for (const [mod, pack] of [[note, scaleContent], [dq, reverseContent]] as const) {
      let s = mod.init('s', ['p1', 'p2', 'p3'], pack);
      let overScores: Record<string, number> | null = null;
      for (let i = 0; i < 40 && s.phase !== 'over'; i++) {
        const r = mod.reduce(s, deadline(i));
        s = r.state;
        const g = r.effects.find((e) => e.type === 'gameOver');
        if (g !== undefined && g.type === 'gameOver') overScores = g.scores;
      }
      expect(s.phase).toBe('over');
      expect(overScores).not.toBeNull();
      expect(overScores).toEqual(s.scores);
      expect(overScores).not.toBe(s.scores);
      overScores!['p1'] = 9_999; // mutating the effect must never touch live state
      expect(s.scores['p1']).not.toBe(9_999);
    }
  });
});
