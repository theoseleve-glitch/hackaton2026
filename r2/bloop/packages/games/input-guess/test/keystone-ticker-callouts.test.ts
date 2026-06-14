import { describe, expect, it } from 'vitest';
import {
  CINQUANTE_CINQUANTE_CONFIG,
  createInputGuess,
  QUIZZ_CULTURE_GE_CONFIG,
  type InputGuessState,
} from '@bloop/game-input-guess';
import {
  cardIndexOf, crowdContent, crowdItem, guess, numberContent, numberItemOf, pick,
} from './fixtures.js';

const players = ['p1', 'p2', 'p3'];
const quizz = createInputGuess('quizz-culture-ge', QUIZZ_CULTURE_GE_CONFIG);
const cc = createInputGuess('cinquante-cinquante', CINQUANTE_CINQUANTE_CONFIG);
const qContent = numberContent(3);
const cContent = crowdContent(3);

function guessView(s: InputGuessState, viewer: string) {
  const v = quizz.view(s, viewer);
  if (v.phase !== 'guess' || v.mode !== 'closest-number') throw new Error('expected closest guess view');
  return v;
}

// ===========================================================================
// (a) LIVE SUBMISSION TICKER — identity + count, never a value
// ===========================================================================

describe('keystone (a) — live submission ticker exposes who-locked, never the value', () => {
  it('submitOrder is append-only on FIRST submission; a re-guess does not re-append', () => {
    const s0 = quizz.init('s', players, qContent);
    const s1 = quizz.reduce(s0, guess('p2', 10)).state;
    expect(s1.submitOrder).toEqual(['p2']);
    const s2 = quizz.reduce(s1, guess('p1', 20)).state;
    expect(s2.submitOrder).toEqual(['p2', 'p1']); // first-lock order, NOT roster order
    const s3 = quizz.reduce(s2, guess('p2', 999)).state; // p2 changes their guess
    expect(s3.submitOrder).toEqual(['p2', 'p1']); // unchanged — already locked
    expect(s3.submissions).toEqual({ p2: 999, p1: 20 }); // value did change
  });

  it('the guess view exposes submittedCount + lockOrder (identity only) — no value, ever', () => {
    const s0 = quizz.init('s', players, qContent);
    const s1 = quizz.reduce(s0, guess('p2', 424242)).state;
    for (const viewer of ['p1', 'p3', 'spectator', '__proto__']) {
      const v = guessView(s1, viewer);
      expect(v.submittedCount).toBe(1);
      expect(v.lockOrder).toEqual(['p2']);
      expect(v.hasSubmitted).toEqual({ p1: false, p2: true, p3: false });
      // a NON-owner never sees p2's value through any field
      expect(v.mySubmission).toBeNull();
      const json = JSON.stringify(v);
      expect(json).not.toContain('424242');
      expect(json).not.toContain('"answer"');
      expect(json).not.toContain('FUNFACT-SECRET');
    }
  });

  it('submittedCount tracks the live race as players lock in', () => {
    let s = quizz.init('s', players, qContent);
    expect(guessView(s, 'p3').submittedCount).toBe(0);
    s = quizz.reduce(s, guess('p1', 5)).state;
    expect(guessView(s, 'p3').submittedCount).toBe(1);
    s = quizz.reduce(s, guess('p2', 6)).state;
    expect(guessView(s, 'p3').submittedCount).toBe(2);
    expect(guessView(s, 'p3').lockOrder).toEqual(['p1', 'p2']);
  });

  it('crowd-target ticker likewise carries identity + count only — never the picked index meaning', () => {
    const s0 = cc.init('s', players, cContent);
    const s1 = cc.reduce(s0, pick('p1', 3)).state;
    const v = cc.view(s1, 'p2');
    if (v.phase !== 'guess' || v.mode !== 'crowd-target') throw new Error('expected pick view');
    expect(v.submittedCount).toBe(1);
    expect(v.lockOrder).toEqual(['p1']);
    expect(v.mySubmission).toBeNull(); // non-owner never sees p1's pick
    expect(JSON.stringify(v)).not.toContain('crowdYesPct');
  });

  it('lockOrder is value-INVARIANT for a non-owner: same identity/order under different hidden guesses', () => {
    const s0 = quizz.init('s', players, qContent);
    // same submit ORDER (p1 then p2), different hidden VALUES
    const a = quizz.reduce(quizz.reduce(s0, guess('p1', 11)).state, guess('p2', 22)).state;
    const b = quizz.reduce(quizz.reduce(s0, guess('p1', 88)).state, guess('p2', 99)).state;
    for (const viewer of ['p3', 'spectator', '__proto__']) {
      expect(quizz.view(a, viewer)).toEqual(quizz.view(b, viewer)); // whole non-owner view invariant
    }
  });

  it('the view never aliases hidden state — lockOrder is a fresh array each call', () => {
    const s1 = quizz.reduce(quizz.init('s', players, qContent), guess('p1', 5)).state;
    const v = guessView(s1, 'p2');
    expect(v.lockOrder).not.toBe(s1.submitOrder);
    expect(v.lockOrder).toEqual(s1.submitOrder);
  });
});

// ===========================================================================
// (b) THE TICKER NEVER CHANGES THE PRIMARY EARLY-RESOLVE (allActed) CONDITION
// ===========================================================================

describe('keystone (b) — ticker is decoupled from the primary early-resolve (allActed)', () => {
  it('early-resolve still triggers exactly when ALL connected players have submitted — not on ticker count', () => {
    const s0 = quizz.init('s', players, qContent);
    const s1 = quizz.reduce(s0, guess('p1', 10)).state;
    expect(s1.phase).toBe('guess'); // submitOrder=[p1] but room not complete
    const s2 = quizz.reduce(s1, guess('p2', 20)).state;
    expect(s2.phase).toBe('guess'); // submitOrder=[p1,p2], still one expected
    const s3 = quizz.reduce(s2, guess('p3', 30)).state;
    expect(s3.phase).toBe('reveal'); // resolves only on the 3rd, exactly as before
  });

  it('a disconnect that completes the connected set still early-resolves (ticker untouched)', () => {
    const s0 = quizz.init('s', players, qContent);
    const s1 = quizz.reduce(s0, guess('p1', 10)).state;
    const s2 = quizz.reduce(s1, guess('p2', 20)).state;
    expect(s2.phase).toBe('guess');
    expect(s2.submitOrder).toEqual(['p1', 'p2']);
    const s3 = quizz.reduce(s2, { type: 'playerLeft', playerId: 'p3', at: 0 }).state;
    expect(s3.phase).toBe('reveal'); // p3 leaving completes the set; ticker did not gate this
  });

  it('earlyAdvanceOnAllSubmitted=false: ticker fills but the phase does NOT resolve early', () => {
    const noEarly = createInputGuess('quizz-culture-ge', { ...QUIZZ_CULTURE_GE_CONFIG, earlyAdvanceOnAllSubmitted: false });
    let s = noEarly.init('s', players, qContent);
    for (const p of players) s = noEarly.reduce(s, guess(p, 10)).state;
    expect(s.submitOrder).toEqual(['p1', 'p2', 'p3']); // ticker full
    expect(s.phase).toBe('guess'); // but no early-advance — waits for the clock
  });
});

// ===========================================================================
// (c) REJECT-INVALID => SAME STATE REFERENCE (no ticker/side-effect mutation)
// ===========================================================================

describe('keystone (c) — reject-invalid returns the SAME state reference (no ticker mutation)', () => {
  it('wrong phase: a guess during reveal is rejected by reference (ticker untouched)', () => {
    const s0 = quizz.init('s', players, qContent);
    const revealed = quizz.reduce(s0, { type: 'deadline', at: 0 }).state;
    expect(revealed.phase).toBe('reveal');
    expect(quizz.reduce(revealed, guess('p1', 42)).state).toBe(revealed); // === same ref
  });

  it('ineligible actor (non-roster) is rejected by reference and never enters submitOrder', () => {
    const s0 = quizz.init('s', players, qContent);
    const r = quizz.reduce(s0, guess('ghost', 42)).state;
    expect(r).toBe(s0);
    expect(r.submitOrder).toEqual([]);
  });

  it('invalid payloads (float / negative / over-cap / wrong-kind) are rejected by reference', () => {
    const s0 = quizz.init('s', players, qContent);
    expect(quizz.reduce(s0, guess('p1', 4.5)).state).toBe(s0);
    expect(quizz.reduce(s0, guess('p1', -1)).state).toBe(s0);
    expect(quizz.reduce(s0, guess('p1', 1_000_000_000)).state).toBe(s0);
    expect(quizz.reduce(s0, pick('p1', 1)).state).toBe(s0); // wrong action kind for the mode
    expect(s0.submitOrder).toEqual([]);
  });

  it('crowd-target out-of-range pick is rejected by reference (ticker untouched)', () => {
    const s0 = cc.init('s', players, cContent);
    expect(cc.reduce(s0, pick('p1', 6)).state).toBe(s0); // only 0..5
    expect(cc.reduce(s0, pick('ghost', 0)).state).toBe(s0);
    expect(s0.submitOrder).toEqual([]);
  });
});

// ===========================================================================
// REVEAL CALL-OUTS — derived PURELY from public reveal data, deterministic
// ===========================================================================

describe('keystone — closest-number reveal call-outs (pile / closest / wildest)', () => {
  function reveal(guesses: Record<string, number>, roster = players): InputGuessState {
    let s = quizz.init('s', roster, qContent);
    for (const [p, v] of Object.entries(guesses)) s = quizz.reduce(s, guess(p, v)).state;
    if (s.phase !== 'reveal') s = quizz.reduce(s, { type: 'deadline', at: 0 }).state;
    return s;
  }

  it('names the closest and wildest answerers, derived from the public guesses', () => {
    const s0 = quizz.init('s', ['p1', 'p2', 'p3', 'p4'], qContent);
    const a = numberItemOf(s0, 0).answer;
    let s = s0;
    s = quizz.reduce(s, guess('p1', a + 1)).state;   // closest
    s = quizz.reduce(s, guess('p2', a + 5)).state;
    s = quizz.reduce(s, guess('p3', a - 9)).state;
    s = quizz.reduce(s, guess('p4', a + 50)).state;  // wildest
    if (s.lastResult?.kind !== 'closest-number') throw new Error('expected closest result');
    expect(s.lastResult.callOuts.closest).toEqual(['p1']);
    expect(s.lastResult.callOuts.wildest).toEqual(['p4']);
    expect(s.lastResult.callOuts.pile).toEqual([]); // nobody exact
  });

  it('an exact hit lands in BOTH pile and closest (Pile !)', () => {
    const s = reveal({ p1: numberItemOf(quizz.init('s', players, qContent), 0).answer, p2: 1, p3: 2 });
    if (s.lastResult?.kind !== 'closest-number') throw new Error('expected closest result');
    expect(s.lastResult.callOuts.pile).toEqual(['p1']);
    expect(s.lastResult.callOuts.closest).toEqual(['p1']);
    expect(s.lastResult.callOuts.pile).toEqual(s.lastResult.exact);
  });

  it('ties surface ALL tied players in stable ascending-id order', () => {
    const s0 = quizz.init('s', ['p1', 'p2', 'p3'], qContent);
    const a = numberItemOf(s0, 0).answer;
    let s = s0;
    s = quizz.reduce(s, guess('p2', a + 3)).state; // tied closest (d=3)
    s = quizz.reduce(s, guess('p1', a - 3)).state; // tied closest (d=3)
    s = quizz.reduce(s, guess('p3', a + 3)).state; // also d=3 -> everyone tied -> all closest AND all wildest
    if (s.lastResult?.kind !== 'closest-number') throw new Error('expected closest result');
    expect(s.lastResult.callOuts.closest).toEqual(['p1', 'p2', 'p3']); // ascending id, not lock order
  });

  it('no answerers -> empty call-outs (a superlative nobody earned is not awarded)', () => {
    const s = reveal({});
    if (s.lastResult?.kind !== 'closest-number') throw new Error('expected closest result');
    expect(s.lastResult.callOuts).toEqual({ pile: [], closest: [], wildest: [] });
  });

  it('call-outs are replay-identical for the same seed + same inputs (deterministic, no RNG)', () => {
    const a = reveal({ p1: 105, p2: 130, p3: 99 });
    const b = reveal({ p1: 105, p2: 130, p3: 99 });
    if (a.lastResult?.kind !== 'closest-number' || b.lastResult?.kind !== 'closest-number') {
      throw new Error('expected closest result');
    }
    expect(a.lastResult.callOuts).toEqual(b.lastResult.callOuts);
  });
});

describe('keystone — crowd-target reveal call-outs (loneGenius / mostFooled)', () => {
  // target 80 — distances: a:4 (closest), b:9, c:18, d:25, e:33, f:42 (worst).
  function packOf(...items: ReturnType<typeof crowdItem>[]) {
    return { id: 'test-crowd-custom', version: 1 as const, data: { items } };
  }
  function allPick(s0: InputGuessState, byPlayer: Record<string, string>): InputGuessState {
    let s = s0;
    for (const [p, completionId] of Object.entries(byPlayer)) {
      s = cc.reduce(s, pick(p, cardIndexOf(s0, 0, completionId))).state;
    }
    return s;
  }

  it('loneGenius = the SOLE picker of a winning card; mostFooled = picker of the worst card actually picked', () => {
    const s0 = cc.init('s', players, packOf(crowdItem('it1')));
    const s = allPick(s0, { p1: 'a', p2: 'b', p3: 'f' }); // p1 alone hits closest; p3 picked the worst
    if (s.lastResult?.kind !== 'crowd-target') throw new Error('expected crowd result');
    expect(s.lastResult.callOuts.loneGenius).toEqual(['p1']);
    expect(s.lastResult.callOuts.mostFooled).toEqual(['p3']);
  });

  it('loneGenius is empty when TWO players share the closest card (no lone hero)', () => {
    const s0 = cc.init('s', players, packOf(crowdItem('it1')));
    const s = allPick(s0, { p1: 'a', p2: 'a', p3: 'f' }); // both hit closest
    if (s.lastResult?.kind !== 'crowd-target') throw new Error('expected crowd result');
    expect(s.lastResult.callOuts.loneGenius).toEqual([]);
    expect(s.lastResult.callOuts.mostFooled).toEqual(['p3']);
  });

  it('mostFooled lists ALL pickers of the worst picked card, in stable id order', () => {
    const s0 = cc.init('s', players, packOf(crowdItem('it1')));
    const s = allPick(s0, { p1: 'a', p2: 'f', p3: 'f' }); // p2 and p3 both on the worst card
    if (s.lastResult?.kind !== 'crowd-target') throw new Error('expected crowd result');
    expect(s.lastResult.callOuts.loneGenius).toEqual(['p1']);
    expect(s.lastResult.callOuts.mostFooled).toEqual(['p2', 'p3']);
  });

  it('zero pickers -> empty call-outs', () => {
    const s0 = cc.init('s', players, packOf(crowdItem('it1')));
    const s = cc.reduce(s0, { type: 'deadline', at: 0 }).state;
    if (s.lastResult?.kind !== 'crowd-target') throw new Error('expected crowd result');
    expect(s.lastResult.callOuts).toEqual({ loneGenius: [], mostFooled: [] });
  });

  it('call-outs are public-derived: they only reference players visible in the public picks map', () => {
    const s0 = cc.init('s', players, packOf(crowdItem('it1')));
    const s = allPick(s0, { p1: 'a', p2: 'b', p3: 'f' });
    if (s.lastResult?.kind !== 'crowd-target') throw new Error('expected crowd result');
    const named = [...s.lastResult.callOuts.loneGenius, ...s.lastResult.callOuts.mostFooled];
    for (const id of named) expect(s.lastResult.picks[id]).not.toBeUndefined();
  });
});
