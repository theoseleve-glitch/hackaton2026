// The exact scoring matrix (design 2.16 §9) — applied atomically on reveal entry.
import { describe, expect, it } from 'vitest';
import type { Effect } from '@bloop/engine';
import type { RuleHuntState } from '@bloop/game-rule-hunt';
import {
  accuse, content, deadline, FIVE, followersOf, game, openGuess, pickCandidate, toLive, tribunalVote,
} from './fixtures.js';

/** toLive + convict followers[1] (f0/f2/f3 vote guilty). Returns the resumed live state. */
function withConviction(seed = 's'): RuleHuntState {
  const live = toLive(game.init(seed, FIVE, content(3)), 1_000);
  const [f0, f1, f2, f3] = followersOf(live);
  let s = game.reduce(live, accuse(f0!, f1!, 5_000)).state;
  s = game.reduce(s, tribunalVote(f0!, true, 6_000)).state;
  s = game.reduce(s, tribunalVote(f2!, true, 7_000)).state;
  s = game.reduce(s, tribunalVote(f3!, true, 8_000)).state;
  if (s.phase !== 'live' || s.eliminated[f1!] !== true) throw new Error('conviction setup failed');
  return s;
}

describe('scoring matrix', () => {
  it("kind 'guessed': each detective +4, each surviving follower +1, eliminated followers +0", () => {
    const s = withConviction();
    const det = s.detectives[0]!;
    const [f0, f1, f2, f3] = followersOf(s);
    const g = game.reduce(s, openGuess(det, 20_000)).state;
    const r = game.reduce(g, pickCandidate(det, g.trueCandidateIndex, 21_000)).state;
    expect(r.phase).toBe('reveal');
    expect(r.lastOutcome?.kind).toBe('guessed');
    expect(r.lastOutcome?.perfect).toBe(false); // one conviction happened
    expect(r.scores[det]).toBe(4);
    expect(r.scores[f1!]).toBe(0); // eliminated
    expect(r.scores[f0!]).toBe(1);
    expect(r.scores[f2!]).toBe(1);
    expect(r.scores[f3!]).toBe(1);
  });

  it("kind 'timeUp' + perfect (zero convictions): each follower +3, each detective +1", () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const det = live.detectives[0]!;
    const r = game.reduce(live, deadline(181_000)).state;
    expect(r.phase).toBe('reveal');
    expect(r.lastOutcome).toMatchObject({ kind: 'timeUp', guesser: null, pickedIndex: null, perfect: true });
    expect(r.scores[det]).toBe(1);
    for (const f of followersOf(r)) expect(r.scores[f]).toBe(3);
  });

  it("kind 'timeUp' + infractions: surviving follower +2, eliminated follower +1, detective +1", () => {
    const s = withConviction();
    const det = s.detectives[0]!;
    const [f0, f1, f2, f3] = followersOf(s);
    const r = game.reduce(s, deadline(300_000)).state;
    expect(r.phase).toBe('reveal');
    expect(r.lastOutcome?.perfect).toBe(false);
    expect(r.scores[det]).toBe(1);
    expect(r.scores[f1!]).toBe(1); // took the fall — funny never cruel
    expect(r.scores[f0!]).toBe(2);
    expect(r.scores[f2!]).toBe(2);
    expect(r.scores[f3!]).toBe(2);
  });

  it('tribunals and wrong guesses move no points directly', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const det = live.detectives[0]!;
    const [f0, f1] = followersOf(live);
    let s = game.reduce(live, accuse(f0!, f1!, 5_000)).state;
    s = game.reduce(s, deadline(30_000)).state; // tribunal resolves (not guilty), resume live
    s = game.reduce(s, openGuess(det, 40_000)).state;
    s = game.reduce(s, pickCandidate(det, (s.trueCandidateIndex + 1) % 8, 41_000)).state; // wrong
    expect(s.phase).toBe('live');
    for (const p of s.players) expect(s.scores[p]).toBe(0);
  });

  it('scores accumulate across rounds within the match', () => {
    let s = game.init('s', FIVE, content(3));
    const detR0 = s.detectives[0]!;
    // round 0: perfect timeUp via deadlines
    s = game.reduce(s, deadline(0)).state; // -> live
    s = game.reduce(s, deadline(1)).state; // -> reveal
    expect(s.scores[detR0]).toBe(1);
    s = game.reduce(s, deadline(2)).state; // -> round 1 briefing
    const detR1 = s.detectives[0]!;
    expect(detR1).not.toBe(detR0);
    // round 1: detective guesses correctly
    const live = toLive(s, 10_000);
    const g = game.reduce(live, openGuess(detR1, 11_000)).state;
    const r = game.reduce(g, pickCandidate(detR1, g.trueCandidateIndex, 12_000)).state;
    // detR1 was a follower in round 0 (+3), now a guessing detective (+4)
    expect(r.scores[detR1]).toBe(7);
    // detR0 was a detective (+1), then a surviving follower of a guessed round (+1)
    expect(r.scores[detR0]).toBe(2);
  });
});

describe('gameOver effect', () => {
  function driveToOver(): { state: RuleHuntState; effects: Effect[] } {
    let s = game.init('s', FIVE, content(1)); // 1 item caps totalRounds at 1
    let effects: Effect[] = [];
    for (let i = 0; i < 10 && s.phase !== 'over'; i++) {
      const out = game.reduce(s, deadline(i * 1_000));
      s = out.state;
      effects = out.effects;
    }
    return { state: s, effects };
  }

  it('emits gameOver with the final scores at over, endReason finished', () => {
    const { state, effects } = driveToOver();
    expect(state.phase).toBe('over');
    expect(state.endReason).toBe('finished');
    const over = effects.find((e): e is Extract<Effect, { type: 'gameOver' }> => e.type === 'gameOver');
    expect(over).toBeDefined();
    expect(over!.scores).toEqual(state.scores);
  });

  it('the gameOver scores map is CLONED — it never aliases live state', () => {
    const { state, effects } = driveToOver();
    const over = effects.find((e): e is Extract<Effect, { type: 'gameOver' }> => e.type === 'gameOver')!;
    expect(over.scores).not.toBe(state.scores);
    const before = state.scores['p1'];
    over.scores['p1'] = 999;
    expect(state.scores['p1']).toBe(before);
  });
});
