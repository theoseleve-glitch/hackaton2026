import { describe, expect, it } from 'vitest';
import {
  createSpotlightGuess,
  DEVINE_LA_QUESTION_CONFIG,
  JEU_DE_LA_NOTE_CONFIG,
  spotlightGuessActionSchema,
} from '@bloop/game-spotlight-guess';
import {
  answer, deadline, guess, guessersOf, openVotes, ready, reverseContent, scaleContent, spotOf,
} from './fixtures.js';

const players = ['p1', 'p2', 'p3'];
const note = createSpotlightGuess('jeu-de-la-note', JEU_DE_LA_NOTE_CONFIG);
const dq = createSpotlightGuess('devine-la-question', DEVINE_LA_QUESTION_CONFIG);

describe('scale actions — acceptance and same-reference rejection', () => {
  it('ready: spotlight only, target phase only', () => {
    const s0 = note.init('s', players, scaleContent);
    const spot = spotOf(s0);
    const other = guessersOf(s0)[0]!;
    expect(note.reduce(s0, ready(other)).state).toBe(s0); // non-spotlight rejected
    expect(note.reduce(s0, ready('ghost')).state).toBe(s0); // non-roster rejected
    const talk = note.reduce(s0, ready(spot)).state;
    expect(talk.phase).toBe('talk');
    expect(note.reduce(talk, ready(spot)).state).toBe(talk); // wrong phase rejected
  });

  it('openVotes: spotlight only, talk phase only, gated by speakerCanEndTalk', () => {
    const s0 = note.init('s', players, scaleContent);
    const spot = spotOf(s0);
    expect(note.reduce(s0, openVotes(spot)).state).toBe(s0); // wrong phase
    const talk = note.reduce(s0, ready(spot)).state;
    expect(note.reduce(talk, openVotes(guessersOf(talk)[0]!)).state).toBe(talk); // not spotlight
    expect(note.reduce(talk, openVotes(spot)).state.phase).toBe('guess');

    const noEnd = createSpotlightGuess('x', { ...JEU_DE_LA_NOTE_CONFIG, speakerCanEndTalk: false });
    const t0 = noEnd.init('s', players, scaleContent);
    const t1 = noEnd.reduce(t0, ready(spotOf(t0))).state;
    expect(noEnd.reduce(t1, openVotes(spotOf(t1))).state).toBe(t1); // disabled by config
  });

  it('guess: non-spotlight only, integer in the item domain, overwrites allowed (lockOnSubmit=false)', () => {
    let s = note.init('s', players, scaleContent);
    s = note.reduce(s, deadline(0)).state; // -> talk
    s = note.reduce(s, deadline(1)).state; // -> guess
    const spot = spotOf(s);
    const [g1] = guessersOf(s);
    expect(note.reduce(s, guess(spot, 5)).state).toBe(s); // the spotlight never guesses
    expect(note.reduce(s, guess(g1!, 0)).state).toBe(s); // below scale10 domain
    expect(note.reduce(s, guess(g1!, 11)).state).toBe(s); // above scale10 domain
    expect(note.reduce(s, guess(g1!, 5.5)).state).toBe(s); // non-integer
    const a = note.reduce(s, guess(g1!, 5)).state;
    expect(a.guesses[g1!]).toEqual({ value: 5, tier: 0 });
    const b = note.reduce(a, guess(g1!, 8)).state; // overwrite until resolve
    expect(b.guesses[g1!]).toEqual({ value: 8, tier: 0 });
    expect(b.phase).toBe('guess');
  });

  it('guess in the wrong phase is rejected', () => {
    const s0 = note.init('s', players, scaleContent);
    expect(note.reduce(s0, guess(guessersOf(s0)[0]!, 5)).state).toBe(s0); // target phase
    const talk = note.reduce(s0, deadline(0)).state;
    expect(note.reduce(talk, guess(guessersOf(talk)[0]!, 5)).state).toBe(talk); // talk phase
  });

  it('answer actions are foreign to scale mode', () => {
    const s0 = note.init('s', players, scaleContent);
    expect(note.reduce(s0, answer(spotOf(s0), 0)).state).toBe(s0);
  });
});

describe('reverse actions — acceptance and same-reference rejection', () => {
  it('answer: spotlight only, valid index only, advances to guess h0', () => {
    const s0 = dq.init('s', players, reverseContent);
    const spot = spotOf(s0);
    const other = guessersOf(s0)[0]!;
    const nAnswers = s0.reverseRounds[0]!.answers.length;
    expect(dq.reduce(s0, answer(other, 0)).state).toBe(s0); // guessers can't answer
    expect(dq.reduce(s0, answer(spot, -1)).state).toBe(s0);
    expect(dq.reduce(s0, answer(spot, nAnswers)).state).toBe(s0); // out of range
    expect(dq.reduce(s0, answer(spot, 0.5)).state).toBe(s0); // non-integer
    const s1 = dq.reduce(s0, answer(spot, nAnswers - 1)).state;
    expect(s1.phase).toBe('guess');
    expect(s1.hintTier).toBe(0);
    expect(s1.chosenAnswer).toBe(nAnswers - 1);
    expect(dq.reduce(s1, answer(spot, 0)).state).toBe(s1); // answer after answer rejected
  });

  it('guess: connected non-spotlight, valid candidate index, FIRST WRITE WINS (lockOnSubmit=true)', () => {
    const s0 = dq.init('s', players, reverseContent);
    const s1 = dq.reduce(s0, answer(spotOf(s0), 0)).state;
    const spot = spotOf(s1);
    const [g1] = guessersOf(s1);
    const nCands = s1.reverseRounds[0]!.candidates.length;
    expect(dq.reduce(s1, guess(spot, 0)).state).toBe(s1); // mystery player never guesses
    expect(dq.reduce(s1, guess(g1!, -1)).state).toBe(s1);
    expect(dq.reduce(s1, guess(g1!, nCands)).state).toBe(s1); // out of range
    expect(dq.reduce(s1, guess(g1!, 1.5)).state).toBe(s1);
    const s2 = dq.reduce(s1, guess(g1!, 2)).state;
    expect(s2.guesses[g1!]).toEqual({ value: 2, tier: 0 });
    expect(dq.reduce(s2, guess(g1!, 3)).state).toBe(s2); // the lock is final — tier ladder demands commitment
  });

  it('a disconnected guesser cannot lock', () => {
    const s0 = dq.init('s', players, reverseContent);
    const s1 = dq.reduce(s0, answer(spotOf(s0), 0)).state;
    const [g1, g2] = guessersOf(s1);
    const s2 = dq.reduce(s1, { type: 'playerLeft', playerId: g1!, at: 1 }).state;
    expect(dq.reduce(s2, guess(g1!, 0)).state).toBe(s2);
    // ...and the other guesser alone completes the expected set
    const s3 = dq.reduce(s2, guess(g2!, 0)).state;
    expect(s3.phase).toBe('reveal');
  });

  it('locks record the CURRENT hint tier', () => {
    const s0 = dq.init('s', players, reverseContent);
    const s1 = dq.reduce(s0, answer(spotOf(s0), 0)).state;
    const [g1, g2] = guessersOf(s1);
    const h1 = dq.reduce(s1, deadline(1)).state; // -> tier 1
    const a = dq.reduce(h1, guess(g1!, 0)).state;
    expect(a.guesses[g1!]).toEqual({ value: 0, tier: 1 });
    const h2 = dq.reduce(a, deadline(2)).state; // -> tier 2
    const b = dq.reduce(h2, guess(g2!, 1)).state;
    expect(b.guesses[g2!]?.tier).toBe(2);
    expect(b.phase).toBe('reveal'); // all connected guessers locked
  });

  it('ready/openVotes are foreign to reverse mode', () => {
    const s0 = dq.init('s', players, reverseContent);
    expect(dq.reduce(s0, ready(spotOf(s0))).state).toBe(s0);
    expect(dq.reduce(s0, openVotes(spotOf(s0))).state).toBe(s0);
  });

  it('non-roster actors are always rejected', () => {
    const s0 = dq.init('s', players, reverseContent);
    expect(dq.reduce(s0, answer('intruder', 0)).state).toBe(s0);
    expect(dq.reduce(s0, guess('__proto__', 0)).state).toBe(s0);
  });
});

describe('action wire schema (zod)', () => {
  it('accepts every legal payload shape', () => {
    expect(spotlightGuessActionSchema.safeParse({ kind: 'ready' }).success).toBe(true);
    expect(spotlightGuessActionSchema.safeParse({ kind: 'openVotes' }).success).toBe(true);
    expect(spotlightGuessActionSchema.safeParse({ kind: 'answer', answerIndex: 0 }).success).toBe(true);
    expect(spotlightGuessActionSchema.safeParse({ kind: 'guess', value: 0 }).success).toBe(true);
    expect(spotlightGuessActionSchema.safeParse({ kind: 'guess', value: 100 }).success).toBe(true);
  });

  it('rejects malformed payloads before they reach the reducer', () => {
    expect(spotlightGuessActionSchema.safeParse({ kind: 'guess', value: 101 }).success).toBe(false);
    expect(spotlightGuessActionSchema.safeParse({ kind: 'guess', value: -1 }).success).toBe(false);
    expect(spotlightGuessActionSchema.safeParse({ kind: 'guess', value: 3.5 }).success).toBe(false);
    expect(spotlightGuessActionSchema.safeParse({ kind: 'guess', value: Number.NaN }).success).toBe(false);
    expect(spotlightGuessActionSchema.safeParse({ kind: 'guess' }).success).toBe(false);
    expect(spotlightGuessActionSchema.safeParse({ kind: 'answer', answerIndex: 8 }).success).toBe(false);
    expect(spotlightGuessActionSchema.safeParse({ kind: 'vote', target: 'p1' }).success).toBe(false);
    expect(spotlightGuessActionSchema.safeParse(null).success).toBe(false);
  });
});
