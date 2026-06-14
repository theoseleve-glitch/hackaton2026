import { describe, expect, it } from 'vitest';
import {
  createSpotlightGuess,
  DEVINE_LA_QUESTION_CONFIG,
  JEU_DE_LA_NOTE_CONFIG,
  type SpotlightGuessState,
  type SpotlightGuessView,
} from '@bloop/game-spotlight-guess';
import {
  answer, deadline, guess, guessersOf, left, react, ready, reverseContent, reverseItems,
  scaleContent, spotOf,
} from './fixtures.js';

const players = ['p1', 'p2', 'p3'];
const OUTSIDERS = ['viewer-not-in-roster', '__proto__'] as const;
const note = createSpotlightGuess('jeu-de-la-note', JEU_DE_LA_NOTE_CONFIG);
const dq = createSpotlightGuess('devine-la-question', DEVINE_LA_QUESTION_CONFIG);

const json = (v: SpotlightGuessView) => JSON.stringify(v);

describe('scale — the target reaches ONLY the spotlight pre-reveal', () => {
  const s0 = note.init('s', players, scaleContent);
  const spot = spotOf(s0);
  const talk = note.reduce(s0, ready(spot)).state;
  const guessPhase = note.reduce(talk, deadline(1)).state;

  it.each([['target', s0], ['talk', talk], ['guess', guessPhase]] as const)(
    'in %s phase: spotlight echo only, everyone else gets null', (_phase, s) => {
      for (const viewer of [...players, ...OUTSIDERS]) {
        const v = note.view(s, viewer);
        if (!('myTarget' in v)) throw new Error('expected a pre-reveal scale view');
        if (viewer === spot) expect(v.myTarget).toBe(s.targets[0]);
        else expect(v.myTarget).toBeNull();
      }
    });

  it('the hidden targets array never serializes into any view, any phase', () => {
    let s = s0;
    for (let i = 0; i < 40; i++) {
      for (const viewer of [...players, ...OUTSIDERS]) {
        expect(json(note.view(s, viewer))).not.toContain('"targets"');
      }
      if (s.phase === 'over') break;
      s = note.reduce(s, deadline(i)).state;
    }
  });

  it('the reveal promotes the target and every submitted guess atomically', () => {
    const [g1, g2] = guessersOf(guessPhase);
    let s = note.reduce(guessPhase, guess(g1!, 4)).state;
    s = note.reduce(s, guess(g2!, 9)).state;
    expect(s.phase).toBe('reveal');
    const v = note.view(s, OUTSIDERS[0]);
    if (v.phase !== 'reveal' || v.mode !== 'scale') throw new Error('expected scale reveal');
    expect(v.target).toBe(s.targets[0]);
    expect(v.guesses[g1!]).toBe(4);
    expect(v.guesses[g2!]).toBe(9);
    expect(v.voided).toBe(false);
  });

  it('a voided round reveals NO target (the performance never happened)', () => {
    const voided = note.reduce(s0, left(spot)).state; // spotlight leaves during target
    expect(voided.phase).toBe('reveal');
    expect(voided.voided).toBe(true);
    for (const viewer of [...players, ...OUTSIDERS]) {
      const v = note.view(voided, viewer);
      if (v.phase !== 'reveal' || v.mode !== 'scale') throw new Error('expected scale reveal');
      expect(v.target).toBeNull();
    }
  });
});

describe('scale — the guess buffer is hidden until reveal', () => {
  it("non-actors' views are invariant when a hidden guess changes; the owner sees the echo", () => {
    const s0 = note.init('s', players, scaleContent);
    const base = note.reduce(note.reduce(s0, deadline(0)).state, deadline(1)).state;
    const [g1, g2] = guessersOf(base);
    const a = note.reduce(base, guess(g1!, 2)).state;
    const b = note.reduce(base, guess(g1!, 9)).state;
    expect(note.phaseKey(a)).toBe(note.phaseKey(b));
    // owner echo differs
    expect(note.view(a, g1!)).not.toEqual(note.view(b, g1!));
    // every other viewer is invariant
    for (const viewer of [spotOf(base), g2!, ...OUTSIDERS]) {
      expect(note.view(a, viewer)).toEqual(note.view(b, viewer));
    }
    // acted-booleans are public, values are not
    const v = note.view(a, g2!);
    if (v.phase !== 'guess' || v.mode !== 'scale') throw new Error('expected guess view');
    expect(v.hasGuessed[g1!]).toBe(true);
    expect(v.myGuess).toBeNull();
  });

  // KEYSTONE (P0-A) — the SAME no-leak invariant must hold for live-dials placed
  // during the talk phase (a new, earlier write into the existing hidden buffer).
  it("GUARD no-leak: a talk-phase live-dial NEVER leaks to a non-owner; only the owner echoes it", () => {
    const s0 = note.init('s', players, scaleContent);
    const talk = note.reduce(s0, ready(spotOf(s0))).state; // target -> talk
    expect(talk.phase).toBe('talk');
    const [g1, g2] = guessersOf(talk);
    const a = note.reduce(talk, guess(g1!, 2)).state; // live-dial during talk
    const b = note.reduce(talk, guess(g1!, 9)).state; // a different hidden dial
    expect(a.phase).toBe('talk'); // talk never short-circuits on a dial
    expect(note.phaseKey(a)).toBe(note.phaseKey(b));
    // owner echo differs between the two hidden values
    expect(note.view(a, g1!)).not.toEqual(note.view(b, g1!));
    // every NON-owner view is byte-identical regardless of the hidden dial value
    for (const viewer of [spotOf(talk), g2!, ...OUTSIDERS]) {
      expect(note.view(a, viewer)).toEqual(note.view(b, viewer));
    }
    // the dial value never serializes into a non-owner talk view
    for (const viewer of [spotOf(talk), g2!, ...OUTSIDERS]) {
      expect(json(note.view(a, viewer))).not.toContain('"value"');
    }
    // acted-booleans are public from talk on; the value stays owner-only
    const vOther = note.view(a, g2!);
    if (vOther.phase !== 'talk' || vOther.mode !== 'scale') throw new Error('expected talk view');
    expect(vOther.hasGuessed[g1!]).toBe(true);
    expect(vOther.myGuess).toBeNull();
    const vOwner = note.view(a, g1!);
    if (vOwner.phase !== 'talk' || vOwner.mode !== 'scale') throw new Error('expected talk view');
    expect(vOwner.myGuess).toBe(2); // owner sees only their OWN dial
  });
});

describe('reverse — KEYSTONE react-lite (P0-B-lite): content-free, zero-leak liveness tap', () => {
  const s0 = dq.init('s', players, reverseContent);
  const spot = spotOf(s0);
  const item = reverseItems.find((i) => i.id === s0.reverseRounds[0]!.itemId)!;

  it('GUARD no-leak: the react carries NO question/option/candidate/hint (zero triangulation)', () => {
    const [g1, g2] = guessersOf(s0);
    let a = dq.reduce(s0, react(g1!)).state; // g1 taps
    a = dq.reduce(a, react(g2!)).state; // g2 taps too
    expect(a.phase).toBe('answer'); // reacts never advance the spotlight-only beat
    // NON-spotlight viewers (guessers + outsiders) see nothing of the item — the
    // react beat adds only a content-free count, never the secret question text.
    for (const viewer of [g1!, g2!, ...OUTSIDERS]) {
      const v = dq.view(a, viewer);
      if (v.phase !== 'answer' || v.mode !== 'reverse-question') throw new Error('expected answer view');
      expect(v.reactCount).toBe(2); // public aggregate only
      const blob = json(v);
      expect(blob).not.toContain(item.question.fr);
      expect(blob).not.toContain(item.question.en);
      for (const ans of item.answers) expect(blob).not.toContain(ans.fr);
      for (const d of item.decoys) expect(blob).not.toContain(d.fr);
      for (const h of item.hints) expect(blob).not.toContain(h.fr);
    }
  });

  it('GUARD no-leak: owner echoes its OWN tap; a non-owner view is INVARIANT under who-tapped', () => {
    const [g1, g2] = guessersOf(s0);
    const tappedG1 = dq.reduce(s0, react(g1!)).state; // only g1 tapped
    // owner (g1) sees its own true echo
    const vOwner = dq.view(tappedG1, g1!);
    if (vOwner.phase !== 'answer' || vOwner.mode !== 'reverse-question') throw new Error('answer view');
    expect(vOwner.myReact).toBe(true);
    expect(vOwner.reactCount).toBe(1);

    // Structural leak check: a NON-owner's view must be byte-identical whether g1
    // tapped or g2 tapped — only the (equal) count is public, never WHO. Compare
    // the view of a fixed third party (the spotlight) across the two who-tapped
    // worlds; if it differs, the marker leaked identity.
    const tappedG2 = dq.reduce(s0, react(g2!)).state; // only g2 tapped (same count = 1)
    expect(dq.view(tappedG1, spot)).toEqual(dq.view(tappedG2, spot));
    for (const outsider of OUTSIDERS) {
      expect(dq.view(tappedG1, outsider)).toEqual(dq.view(tappedG2, outsider));
    }
    // and the non-owner echo is honest: a non-tapper sees myReact:false + the count
    const vOther = dq.view(tappedG1, g2!);
    if (vOther.phase !== 'answer' || vOther.mode !== 'reverse-question') throw new Error('answer view');
    expect(vOther.myReact).toBe(false);
    expect(vOther.reactCount).toBe(1);
  });
});

describe('reverse — the answer beat leaks NOTHING to guessers', () => {
  const s0 = dq.init('s', players, reverseContent);
  const spot = spotOf(s0);

  it('guessers and spectators see no question, no options, no candidates, no hints', () => {
    const round0 = s0.reverseRounds[0]!;
    const item = reverseItems.find((i) => i.id === round0.itemId)!;
    for (const viewer of [...players.filter((p) => p !== spot), ...OUTSIDERS]) {
      const v = dq.view(s0, viewer);
      if (v.phase !== 'answer' || v.mode !== 'reverse-question') throw new Error('expected answer view');
      expect(v.question).toBeNull();
      expect(v.answers).toBeNull();
      const blob = json(v);
      expect(blob).not.toContain(item.question.fr);
      expect(blob).not.toContain(item.question.en);
      for (const a of item.answers) expect(blob).not.toContain(a.fr);
      for (const d of item.decoys) expect(blob).not.toContain(d.fr);
      for (const h of item.hints) expect(blob).not.toContain(h.fr);
    }
  });

  it('the spotlight sees the real question and the answer options', () => {
    const v = dq.view(s0, spot);
    if (v.phase !== 'answer' || v.mode !== 'reverse-question') throw new Error('expected answer view');
    const round0 = s0.reverseRounds[0]!;
    const item = reverseItems.find((i) => i.id === round0.itemId)!;
    expect(v.question).toEqual(item.question);
    expect(v.answers).toEqual(item.answers);
  });
});

describe('reverse — realIndex and picks are hidden until reveal', () => {
  const s0 = dq.init('s', players, reverseContent);
  const spot = spotOf(s0);
  const g = dq.reduce(s0, answer(spot, 0)).state;
  const item = reverseItems.find((i) => i.id === g.reverseRounds[0]!.itemId)!;

  it('only the mystery player carries its own realIndex echo mid-guess', () => {
    for (const viewer of [...players, ...OUTSIDERS]) {
      const v = dq.view(g, viewer);
      if (v.phase !== 'guess' || v.mode !== 'reverse-question') throw new Error('expected guess view');
      if (viewer === spot) expect(v.myRealIndex).toBe(g.reverseRounds[0]!.realIndex);
      else expect(v.myRealIndex).toBeNull();
      expect(v.candidates).toHaveLength(5); // candidates are public from guess on
      expect(v.chosenAnswer).toEqual(item.answers[0]);
    }
  });

  it('hints open one tier at a time, for everyone at once', () => {
    for (const viewer of [...players, ...OUTSIDERS]) {
      expect(json(dq.view(g, viewer))).not.toContain(item.hints[0]!.fr);
      expect(json(dq.view(g, viewer))).not.toContain(item.hints[1]!.fr);
    }
    const h1 = dq.reduce(g, deadline(1)).state;
    for (const viewer of [...players, ...OUTSIDERS]) {
      const blob = json(dq.view(h1, viewer));
      expect(blob).toContain(item.hints[0]!.fr);
      expect(blob).not.toContain(item.hints[1]!.fr);
    }
    const h2 = dq.reduce(h1, deadline(2)).state;
    for (const viewer of [...players, ...OUTSIDERS]) {
      expect(json(dq.view(h2, viewer))).toContain(item.hints[1]!.fr);
    }
  });

  it("locks are booleans to others; non-actors' views are invariant under a changed pick", () => {
    const [g1, g2] = guessersOf(g);
    const a = dq.reduce(g, guess(g1!, 0)).state;
    const b = dq.reduce(g, guess(g1!, 3)).state;
    expect(dq.phaseKey(a)).toBe(dq.phaseKey(b));
    expect(dq.view(a, g1!)).not.toEqual(dq.view(b, g1!)); // owner echo
    for (const viewer of [spot, g2!, ...OUTSIDERS]) {
      expect(dq.view(a, viewer)).toEqual(dq.view(b, viewer));
    }
    const v = dq.view(a, g2!);
    if (v.phase !== 'guess' || v.mode !== 'reverse-question') throw new Error('expected guess view');
    expect(v.locked[g1!]).toBe(true);
    expect(v.myGuess).toBeNull();
  });

  it('the reveal flips realIndex and every pick public', () => {
    const [g1, g2] = guessersOf(g);
    let s = dq.reduce(g, guess(g1!, g.reverseRounds[0]!.realIndex)).state;
    s = dq.reduce(s, guess(g2!, 0)).state;
    expect(s.phase).toBe('reveal');
    const v = dq.view(s, OUTSIDERS[0]);
    if (v.phase !== 'reveal' || v.mode !== 'reverse-question') throw new Error('expected reveal view');
    expect(v.realIndex).toBe(s.reverseRounds[0]!.realIndex);
    expect(v.picks[g1!]).toEqual({ value: s.reverseRounds[0]!.realIndex, tier: 0 });
    expect(v.gained[g1!]).toBe(300);
  });

  it('a voided reveal exposes no realIndex', () => {
    const voided = dq.reduce(s0, deadline(0)).state;
    for (const viewer of [...players, ...OUTSIDERS]) {
      const v = dq.view(voided, viewer);
      if (v.phase !== 'reveal' || v.mode !== 'reverse-question') throw new Error('expected reveal view');
      expect(v.realIndex).toBeNull();
    }
  });
});

describe('hostile and unknown viewers across every phase', () => {
  it.each([
    ['jeu-de-la-note', note, scaleContent],
    ['devine-la-question', dq, reverseContent],
  ] as const)('%s: every deadline-reached phase serves outsiders a safe, JSON-round-trippable view', (_id, mod, pack) => {
    let s: SpotlightGuessState = mod.init('s', players, pack);
    for (let i = 0; i < 40; i++) {
      for (const viewer of [...OUTSIDERS, '']) {
        const v = mod.view(s, viewer);
        expect(JSON.parse(JSON.stringify(v))).toEqual(v);
        if ('myTarget' in v) expect(v.myTarget).toBeNull();
        if ('myRealIndex' in v) expect(v.myRealIndex).toBeNull();
        if ('myGuess' in v) expect(v.myGuess).toBeNull();
      }
      if (s.phase === 'over') break;
      s = mod.reduce(s, deadline(i)).state;
    }
    expect(s.phase).toBe('over');
  });
});
