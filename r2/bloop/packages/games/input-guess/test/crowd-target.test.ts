import { describe, expect, it } from 'vitest';
import type { ContentPack } from '@bloop/engine';
import {
  CINQUANTE_CINQUANTE_CONFIG,
  createInputGuess,
  type InputGuessContent,
  type InputGuessState,
} from '@bloop/game-input-guess';
import { cardIndexOf, crowdContent, crowdItem, crowdItemOf, guess, pick } from './fixtures.js';

const players = ['p1', 'p2', 'p3'];
const cc = createInputGuess('cinquante-cinquante', CINQUANTE_CINQUANTE_CONFIG);
const content = crowdContent(3);

function packOf(...items: ReturnType<typeof crowdItem>[]): ContentPack<InputGuessContent> {
  return { id: 'test-crowd-custom', version: 1, data: { items } };
}

/** Everyone picks the display index of the given authored completion id (round 0). */
function allPick(s0: InputGuessState, byPlayer: Record<string, string>): InputGuessState {
  let s = s0;
  for (const [p, completionId] of Object.entries(byPlayer)) {
    s = cc.reduce(s, pick(p, cardIndexOf(s0, 0, completionId))).state;
  }
  return s;
}

describe('pick submission (hidden buffer)', () => {
  it('records a pick without revealing it; early-resolves on allActed', () => {
    const s0 = cc.init('s', players, content);
    const i = cardIndexOf(s0, 0, 'a');
    const { state: s1, effects } = cc.reduce(s0, pick('p1', i));
    expect(s1.submissions).toEqual({ p1: i });
    expect(s1.phase).toBe('guess');
    expect(effects).toEqual([]);
    const s2 = cc.reduce(s1, pick('p2', cardIndexOf(s0, 0, 'b'))).state;
    expect(s2.phase).toBe('guess');
    const s3 = cc.reduce(s2, pick('p3', cardIndexOf(s0, 0, 'c'))).state;
    expect(s3.phase).toBe('reveal');
  });

  it('lets a player change their pick before resolve (last wins)', () => {
    const s0 = cc.init('s', players, content);
    const s1 = cc.reduce(s0, pick('p1', 0)).state;
    const s2 = cc.reduce(s1, pick('p1', 3)).state;
    expect(s2.submissions).toEqual({ p1: 3 });
  });

  it('rejects (same reference) non-roster, wrong-mode, and out-of-range card indexes', () => {
    const s0 = cc.init('s', players, content);
    expect(cc.reduce(s0, pick('ghost', 0)).state).toBe(s0); // non-roster
    expect(cc.reduce(s0, guess('p1', 3)).state).toBe(s0); // wrong action kind for the mode
    expect(cc.reduce(s0, pick('p1', 6)).state).toBe(s0); // only 6 cards (0..5)
    expect(cc.reduce(s0, pick('p1', -1)).state).toBe(s0);
    expect(cc.reduce(s0, pick('p1', 1.5)).state).toBe(s0); // float
    expect(cc.reduce(s0, pick('p1', Number.NaN)).state).toBe(s0);
    expect(cc.reduce(s0, pick('p1', 5)).state).not.toBe(s0); // last card OK
  });

  it('ignores picks outside the pick phase (same reference)', () => {
    const s0 = cc.init('s', players, content);
    const revealed = cc.reduce(s0, { type: 'deadline', at: 0 }).state;
    expect(revealed.phase).toBe('reveal');
    expect(cc.reduce(revealed, pick('p1', 0)).state).toBe(revealed);
  });
});

describe('crowd-target scoring (design §2.5, exact)', () => {
  // target 80 — distances: a:4 (closest), b:9 (second), c:18, d:25, e:33, f:42.
  it('closest card pays +3, second-smallest DISTINCT distance pays +1, others 0', () => {
    const s0 = cc.init('s', players, packOf(crowdItem('it1')));
    const s = allPick(s0, { p1: 'a', p2: 'b', p3: 'c' });
    expect(s.phase).toBe('reveal');
    expect(s.scores).toEqual({ p1: 3, p2: 1, p3: 0 });
    if (s.lastResult?.kind !== 'crowd-target') throw new Error('expected crowd result');
    expect(s.lastResult.winningCards).toEqual([cardIndexOf(s0, 0, 'a')]);
    expect(s.lastResult.secondCards).toEqual([cardIndexOf(s0, 0, 'b')]);
    expect(s.lastResult.bullseye).toBe(false); // d=4 > bullseyeWindowPct 2
    expect(s.lastResult.targetYesPct).toBe(80);
  });

  it('a bullseye (winning d ≤ 2) pays +2 on top: a bullseye round pays 5', () => {
    // target 50 — a:51 d1 (bullseye), b:58 d8 (second), c:30 d20…
    const item = crowdItem('it1', 50, [51, 58, 30, 70, 20, 90]);
    const s0 = cc.init('s', players, packOf(item));
    const s = allPick(s0, { p1: 'a', p2: 'b', p3: 'f' });
    expect(s.scores).toEqual({ p1: 5, p2: 1, p3: 0 });
    if (s.lastResult?.kind !== 'crowd-target') throw new Error('expected crowd result');
    expect(s.lastResult.bullseye).toBe(true);
  });

  it('distance ties: ALL tied-closest cards pay the full +3 (no splitting)', () => {
    // target 30 — a:33 d3, b:27 d3 (designed tie), c:45 d15, d:38 d8 (second), e:22 d8, f:9 d21
    const item = crowdItem('it1', 30, [33, 27, 45, 38, 22, 9]);
    const s0 = cc.init('s', players, packOf(item));
    const s = allPick(s0, { p1: 'a', p2: 'b', p3: 'd' });
    expect(s.scores).toEqual({ p1: 3, p2: 3, p3: 1 });
    if (s.lastResult?.kind !== 'crowd-target') throw new Error('expected crowd result');
    expect([...s.lastResult.winningCards].sort())
      .toEqual([cardIndexOf(s0, 0, 'a'), cardIndexOf(s0, 0, 'b')].sort());
    expect([...s.lastResult.secondCards].sort())
      .toEqual([cardIndexOf(s0, 0, 'd'), cardIndexOf(s0, 0, 'e')].sort());
  });

  it('all six cards rank by distance even when nobody picked them', () => {
    // target 80: closest card is 'a' but nobody picks it — picking 'b' (second) still pays only +1.
    const s0 = cc.init('s', players, packOf(crowdItem('it1')));
    const s = allPick(s0, { p1: 'b', p2: 'c', p3: 'f' });
    expect(s.scores).toEqual({ p1: 1, p2: 0, p3: 0 });
  });

  it('deadline non-pickers score 0 and are never auto-assigned a card', () => {
    const s0 = cc.init('s', players, packOf(crowdItem('it1')));
    const s1 = cc.reduce(s0, pick('p1', cardIndexOf(s0, 0, 'a'))).state;
    const { state: s2 } = cc.reduce(s1, { type: 'deadline', at: 0 });
    expect(s2.phase).toBe('reveal');
    expect(s2.scores).toEqual({ p1: 3, p2: 0, p3: 0 });
    if (s2.lastResult?.kind !== 'crowd-target') throw new Error('expected crowd result');
    expect(s2.lastResult.picks).toEqual({ p1: cardIndexOf(s0, 0, 'a') });
    expect(s2.lastResult.pointsEarned).toEqual({ p1: 3 });
  });

  it('zero pickers: nothing awarded, round still advances on deadline', () => {
    const s0 = cc.init('s', players, content);
    const s1 = cc.reduce(s0, { type: 'deadline', at: 0 }).state;
    expect(s1.phase).toBe('reveal');
    expect(s1.scores).toEqual({ p1: 0, p2: 0, p3: 0 });
    expect(cc.reduce(s1, { type: 'deadline', at: 1 }).state.phase).toBe('guess');
  });
});

describe('crowd-target pick-phase redaction', () => {
  it('pick-phase cards carry id+text only — crowdYesPct never appears', () => {
    const s0 = cc.init('s', players, content);
    const s1 = cc.reduce(s0, pick('p1', 2)).state;
    for (const viewer of [...players, 'spectator', '__proto__']) {
      const v = cc.view(s1, viewer);
      if (v.phase !== 'guess' || v.mode !== 'crowd-target') throw new Error('expected pick view');
      expect(JSON.stringify(v)).not.toContain('crowdYesPct');
      expect(v.cards.length).toBe(6);
      expect(v.targetYesPct).toBe(80); // the ANNOUNCED target is public
      expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    }
  });

  it('owner echo only: others see hasSubmitted flags, never the picked index', () => {
    const s0 = cc.init('s', players, content);
    const s1 = cc.reduce(s0, pick('p1', 2)).state;
    const v1 = cc.view(s1, 'p1');
    if (v1.phase !== 'guess') throw new Error('expected pick view');
    expect(v1.mySubmission).toBe(2);
    const v2 = cc.view(s1, 'p2');
    if (v2.phase !== 'guess') throw new Error('expected pick view');
    expect(v2.mySubmission).toBeNull();
    expect(v2.hasSubmitted).toEqual({ p1: true, p2: false, p3: false });
  });

  it("non-actors' views are INVARIANT under hidden-pick changes", () => {
    const s0 = cc.init('s', players, content);
    const a1 = cc.reduce(cc.reduce(s0, pick('p1', 0)).state, pick('p2', 1)).state;
    const a2 = cc.reduce(cc.reduce(s0, pick('p1', 4)).state, pick('p2', 5)).state;
    expect(cc.phaseKey(a1)).toBe(cc.phaseKey(a2));
    for (const viewer of ['p3', 'spectator', '__proto__']) {
      expect(cc.view(a1, viewer)).toEqual(cc.view(a2, viewer));
    }
  });

  it('the reveal flips everything at once: percentages, distances, picks, points', () => {
    const s0 = cc.init('s', players, packOf(crowdItem('it1')));
    const s = allPick(s0, { p1: 'a', p2: 'b', p3: 'c' });
    const v = cc.view(s, 'spectator');
    if (v.phase !== 'reveal' || v.mode !== 'crowd-target') throw new Error('expected reveal view');
    const cardA = v.cards[cardIndexOf(s0, 0, 'a')];
    expect(cardA?.crowdYesPct).toBe(84);
    expect(cardA?.distance).toBe(4);
    expect(v.result.picks).toEqual({
      p1: cardIndexOf(s0, 0, 'a'), p2: cardIndexOf(s0, 0, 'b'), p3: cardIndexOf(s0, 0, 'c'),
    });
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });

  it('handles "__proto__" as a roster player without corrupting buffers or scores', () => {
    const weird = ['__proto__', 'p2', 'p3'];
    const s0 = cc.init('s', weird, packOf(crowdItem('it1')));
    const s1 = cc.reduce(s0, pick('__proto__', cardIndexOf(s0, 0, 'a'))).state;
    expect(s1.phase).toBe('guess'); // p2/p3 still expected
    const s2 = cc.reduce(s1, pick('p2', cardIndexOf(s0, 0, 'b'))).state;
    const s3 = cc.reduce(s2, pick('p3', cardIndexOf(s0, 0, 'c'))).state;
    expect(s3.phase).toBe('reveal');
    expect(s3.scores['__proto__']).toBe(3);
    expect(s3.scores['p2']).toBe(1);
    expect(s3.scores['p3']).toBe(0);
  });
});
