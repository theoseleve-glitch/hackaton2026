import { describe, expect, it } from 'vitest';
import type { ContentPack } from '@bloop/engine';
import {
  createWhoSaidThat,
  whoSaidThat,
  type WhoSaidThatContent,
  type WhoSaidThatState,
} from '@bloop/game-who-said-that';

const content: ContentPack<WhoSaidThatContent> = {
  id: 'qadc-test',
  version: 1,
  data: { statements: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] },
};
const players = ['p1', 'p2', 'p3', 'p4'];

function confess(state: WhoSaidThatState, p: string, value: boolean, at = 0): WhoSaidThatState {
  return whoSaidThat.reduce(state, { type: 'action', playerId: p, action: { kind: 'confess', value }, at }).state;
}
function accuse(state: WhoSaidThatState, p: string, target: string, at = 0): WhoSaidThatState {
  return whoSaidThat.reduce(state, { type: 'action', playerId: p, action: { kind: 'accuse', target }, at }).state;
}

/** Run one full round (confess set + accusation set) and return the reveal state. */
function playRound(
  state: WhoSaidThatState,
  confessions: Record<string, boolean>,
  accusations: Record<string, string>,
): WhoSaidThatState {
  let s = state;
  let at = state.round * 100;
  for (const p of players) s = confess(s, p, confessions[p] ?? false, at++);
  // After the last confess, allActed -> attribute.
  for (const p of players) s = accuse(s, p, accusations[p]!, at++);
  return s; // now in reveal
}

describe('who-said-that scoring', () => {
  it('awards +hitPoints to an accuser who lands on a real confessor', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    // Confessors: p1, p4 said MOI.
    const s = playRound(
      s0,
      { p1: true, p2: false, p3: false, p4: true },
      // p2 -> p1 (hit), p3 -> p4 (hit), p1 -> p2 (miss), p4 -> p3 (miss)
      { p1: 'p2', p2: 'p1', p3: 'p4', p4: 'p3' },
    );
    expect(s.phase).toBe('reveal');
    expect(s.lastResult?.confessors).toEqual(['p1', 'p4']);
    expect(s.lastResult?.hits.sort()).toEqual(['p2', 'p3']);
    expect(s.scores['p2']).toBe(1);
    expect(s.scores['p3']).toBe(1);
    expect(s.scores['p1']).toBe(0); // missed (p2 is not a confessor)
  });

  it('awards +ghostBonus to a confessor NOBODY accused', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    // Confessors: p1, p2. Everybody accuses p3 (a non-confessor) -> nobody hits,
    // both confessors got away with it.
    const s = playRound(
      s0,
      { p1: true, p2: true, p3: false, p4: false },
      { p1: 'p3', p2: 'p3', p3: 'p4', p4: 'p3' },
    );
    expect(s.lastResult?.confessors).toEqual(['p1', 'p2']);
    expect(s.lastResult?.hits).toEqual([]);
    expect(s.lastResult?.ghosts.sort()).toEqual(['p1', 'p2']);
    expect(s.scores['p1']).toBe(1); // ghost bonus
    expect(s.scores['p2']).toBe(1); // ghost bonus
    expect(s.scores['p3']).toBe(0);
    expect(s.scores['p4']).toBe(0);
  });

  it('a confessor who WAS accused earns no ghost bonus; the hitter scores', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    // Confessor: p1 only. p2 accuses p1 (hit). p1 is accused -> no ghost.
    const s = playRound(
      s0,
      { p1: true, p2: false, p3: false, p4: false },
      { p1: 'p2', p2: 'p1', p3: 'p4', p4: 'p3' },
    );
    expect(s.lastResult?.confessors).toEqual(['p1']);
    expect(s.lastResult?.hits).toEqual(['p2']);
    expect(s.lastResult?.ghosts).toEqual([]); // p1 was accused
    expect(s.scores['p2']).toBe(1); // the hit
    expect(s.scores['p1']).toBe(0); // accused -> no ghost bonus
  });

  it('a player can be BOTH a confessor-ghost and a hitter (double award)', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    // Confessors: p1, p4. Accusations: p1 -> p4 (hit on p4), nobody accuses p1.
    // So p1 gets +hit (landed on p4) AND +ghost (nobody accused p1).
    const s = playRound(
      s0,
      { p1: true, p2: false, p3: false, p4: true },
      { p1: 'p4', p2: 'p4', p3: 'p2', p4: 'p3' },
    );
    expect(s.lastResult?.confessors).toEqual(['p1', 'p4']);
    // p1 and p2 both accused p4 (a confessor) -> both hit.
    expect(s.lastResult?.hits.sort()).toEqual(['p1', 'p2']);
    // p1 was not accused (accused set = {p4, p2, p3}) -> p1 ghosts.
    expect(s.lastResult?.ghosts).toEqual(['p1']);
    expect(s.scores['p1']).toBe(2); // hit (+1) + ghost (+1)
    expect(s.scores['p2']).toBe(1); // hit only
    expect(s.scores['p4']).toBe(0); // accused, and missed (p4 accused p3)
  });

  it('a zero-confessor round scores nobody (no hits possible, no ghosts)', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    const s = playRound(
      s0,
      { p1: false, p2: false, p3: false, p4: false },
      { p1: 'p2', p2: 'p1', p3: 'p4', p4: 'p3' },
    );
    expect(s.lastResult?.confessors).toEqual([]);
    expect(s.lastResult?.hits).toEqual([]);
    expect(s.lastResult?.ghosts).toEqual([]);
    expect(s.scores).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });

  it('respects a custom hitPoints / ghostBonus config', () => {
    const mod = createWhoSaidThat('weighted', { hitPoints: 3, ghostBonus: 5 });
    const s0 = mod.init('seed', players, content);
    let s = s0;
    let at = 0;
    // Confessors: p1, p2. p3 accuses p1 (hit). p2 unaccused (ghost).
    for (const [p, v] of Object.entries({ p1: true, p2: true, p3: false, p4: false })) {
      s = mod.reduce(s, { type: 'action', playerId: p, action: { kind: 'confess', value: v }, at: at++ }).state;
    }
    for (const [p, t] of Object.entries({ p1: 'p3', p2: 'p4', p3: 'p1', p4: 'p3' })) {
      s = mod.reduce(s, { type: 'action', playerId: p, action: { kind: 'accuse', target: t }, at: at++ }).state;
    }
    expect(s.phase).toBe('reveal');
    // accused set = {p3, p4, p1}. p1 confessor & accused -> no ghost. p2 confessor & unaccused -> ghost +5.
    expect(s.scores['p2']).toBe(5);
    // p3 accused p1 (a confessor) -> hit +3.
    expect(s.scores['p3']).toBe(3);
    expect(s.scores['p1']).toBe(0);
    expect(s.scores['p4']).toBe(0);
  });

  it('the per-round delta matches the score climb deterministically', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    const s = playRound(
      s0,
      { p1: true, p2: false, p3: false, p4: true },
      { p1: 'p4', p2: 'p4', p3: 'p2', p4: 'p3' },
    );
    expect(s.lastResult?.delta).toEqual({ p1: 2, p2: 1, p3: 0, p4: 0 });
  });

  it('scores carry forward across rounds', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    // Round 0: p2 hits p1.
    let s = playRound(
      s0,
      { p1: true, p2: false, p3: false, p4: false },
      { p1: 'p3', p2: 'p1', p3: 'p4', p4: 'p3' },
    );
    expect(s.scores['p2']).toBe(1);
    // reveal -> next confess.
    s = whoSaidThat.reduce(s, { type: 'deadline', at: 50 }).state;
    expect(s.phase).toBe('confess');
    expect(s.round).toBe(1);
    expect(s.scores['p2']).toBe(1); // carried
    // Round 1: p2 hits again.
    s = playRound(
      s,
      { p1: true, p2: false, p3: false, p4: false },
      { p1: 'p3', p2: 'p1', p3: 'p4', p4: 'p3' },
    );
    expect(s.scores['p2']).toBe(2);
  });

  it('gameOver clones scores — mutating the effect never touches live state', () => {
    let s = whoSaidThat.init('seed', players, content);
    let lastEffectScores: Record<string, number> | null = null;
    for (let i = 0; i < s.config.totalRounds; i++) {
      s = playRound(
        s,
        { p1: true, p2: false, p3: false, p4: false },
        { p1: 'p3', p2: 'p1', p3: 'p4', p4: 'p3' },
      );
      const { state: next, effects } = whoSaidThat.reduce(s, { type: 'deadline', at: i * 1000 });
      s = next;
      const go = effects.find((e) => e.type === 'gameOver');
      if (go && go.type === 'gameOver') lastEffectScores = go.scores;
    }
    expect(s.phase).toBe('over');
    expect(lastEffectScores).not.toBeNull();
    // mutate the cloned effect payload
    lastEffectScores!['p2'] = 999;
    expect(s.scores['p2']).not.toBe(999);
  });
});
