import { describe, expect, it } from 'vitest';
import { asTracerView, promptText, secondsLeft } from '../src/games/tracer-view';

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

describe('bilingual {fr,en} prompts (pires-potes wave-2 packs)', () => {
  const card = { fr: 'Qui accuserait les satellites ?', en: 'Who would blame the satellites?' };
  const voteView = {
    phase: 'vote', round: 2, totalRounds: 7, prompt: card,
    hasVoted: { p1: false, p2: true }, myVote: null, scores: { p1: 1, p2: 0 },
  };

  it('promptText picks the locale on LText cards and passes plain strings through', () => {
    expect(promptText(card, 'fr')).toBe(card.fr);
    expect(promptText(card, 'en')).toBe(card.en);
    expect(promptText('Plain legacy card?', 'fr')).toBe('Plain legacy card?');
  });

  it('asTracerView resolves an LText vote prompt to the requested locale string', () => {
    const fr = asTracerView(voteView, 'fr');
    const en = asTracerView(voteView, 'en');
    if (fr === null || en === null || fr.phase !== 'vote' || en.phase !== 'vote') {
      throw new Error('expected vote views');
    }
    expect(fr.prompt).toBe(card.fr);
    expect(en.prompt).toBe(card.en);
    expect(fr.hasVoted).toEqual(voteView.hasVoted); // rest of the view untouched
  });

  it('asTracerView resolves an LText reveal prompt too', () => {
    const v = asTracerView({
      phase: 'reveal', round: 0, totalRounds: 7, prompt: card,
      tally: { p1: 2, p2: 0 }, scores: { p1: 1, p2: 0 },
    }, 'fr');
    if (v === null || v.phase !== 'reveal') throw new Error('expected reveal view');
    expect(v.prompt).toBe(card.fr);
    expect(v.tally).toEqual({ p1: 2, p2: 0 });
  });

  it('rejects malformed prompts: half-translated cards, arrays, numbers', () => {
    const base = { ...voteView };
    expect(asTracerView({ ...base, prompt: { fr: 'seulement FR' } })).toBeNull();
    expect(asTracerView({ ...base, prompt: ['Qui ?'] })).toBeNull();
    expect(asTracerView({ ...base, prompt: 42 })).toBeNull();
  });
});
