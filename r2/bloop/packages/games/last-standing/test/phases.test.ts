import { describe, expect, it } from 'vitest';
import type { ContentPack, GameEvent } from '@bloop/engine';
import {
  createLastStanding,
  JEU_DU_THEME_CONFIG,
  type LastStandingAction,
  type LastStandingContent,
  type LastStandingState,
} from '@bloop/game-last-standing';

const content: ContentPack<LastStandingContent> = {
  id: 'test-pack', version: 1,
  data: {
    items: [
      { id: 'i1', theme: { fr: 'Thème Un', en: 'Theme One' }, letters: ['A'], difficulty: 1 },
      { id: 'i2', theme: { fr: 'Thème Deux', en: 'Theme Two' }, letters: ['B'], difficulty: 2 },
      { id: 'i3', theme: { fr: 'Thème Trois', en: 'Theme Three' }, letters: ['C'], difficulty: 3 },
    ],
  },
};
const players = ['p1', 'p2', 'p3'];
const game = createLastStanding('jeu-du-theme', JEU_DU_THEME_CONFIG);

const act = (playerId: string, action: LastStandingAction, at = 0): GameEvent<LastStandingAction> =>
  ({ type: 'action', playerId, action, at });
const deadline = (at = 0): GameEvent<LastStandingAction> => ({ type: 'deadline', at });

/** One fully validated turn from a 'say' state: wordSaid -> all jurors valid -> result deadline. */
function validatedTurn(s: LastStandingState): LastStandingState {
  const spot = s.spotlight;
  if (spot === null) throw new Error('expected a spotlight');
  let n = game.reduce(s, act(spot, { kind: 'wordSaid' })).state;
  for (const p of s.players) {
    if (p === spot || n.phase !== 'judge') continue;
    n = game.reduce(n, act(p, { kind: 'judge', vote: 'valid' })).state;
  }
  expect(n.phase).toBe('result');
  return game.reduce(n, deadline()).state;
}

describe('init determinism and deck building', () => {
  it('same seed -> same deck, rotation and drawn letter; state starts at draw:r0', () => {
    const a = game.init('seed-1', players, content);
    const b = game.init('seed-1', players, content);
    expect(a.deck.map((i) => i.id)).toEqual(b.deck.map((i) => i.id));
    expect(a.rotation).toEqual(b.rotation);
    expect(a.current).toEqual(b.current);
    expect(game.phaseKey(a)).toBe('draw:r0');
    expect(a.themeCursor).toBe(1);
    expect(a.rotation.slice().sort()).toEqual([...players].sort());
  });

  it('ascending curve orders the deck by difficulty buckets 1 < 2 < 3', () => {
    const s = game.init('s', players, content); // authored order is already 1,2,3 — buckets of one each
    expect(s.deck.map((i) => i.difficulty)).toEqual([1, 2, 3]);
    expect(s.current?.itemId).toBe('i1');
    expect(s.current?.letter).toBe('A'); // single-letter list -> deterministic
  });

  it('shuffled curve keeps the deck a permutation of the pool', () => {
    const shuffled = createLastStanding('jeu-du-theme', { ...JEU_DU_THEME_CONFIG, difficultyCurve: 'shuffled' });
    const s = shuffled.init('s', players, content);
    expect(s.deck.map((i) => i.id).sort()).toEqual(['i1', 'i2', 'i3']);
  });

  it('caps totalRounds at the pool size', () => {
    const small: ContentPack<LastStandingContent> = {
      id: 'small', version: 1, data: { items: content.data.items.slice(0, 2) },
    };
    const s = game.init('s', players, small); // 2 items < 3 totalRounds
    expect(s.config.totalRounds).toBe(2);
  });
});

describe('phase chain, durations and phaseKey discipline', () => {
  it('walks draw -> say -> judge -> result -> say with per-TURN keys and exact durations', () => {
    const s0 = game.init('s', players, content);
    expect(game.phaseKey(s0)).toBe('draw:r0');
    expect(game.phaseDurationMs(s0)).toBe(4_000);

    const s1 = game.reduce(s0, deadline()).state;
    expect(s1.phase).toBe('say');
    expect(s1.spotlight).toBe(s1.rotation[0]); // first turn = first seat of the seeded rotation
    expect(game.phaseKey(s1)).toBe('say:t1');
    expect(game.phaseDurationMs(s1)).toBe(8_000);

    const s2 = game.reduce(s1, act(s1.spotlight!, { kind: 'wordSaid' })).state;
    expect(game.phaseKey(s2)).toBe('judge:t1');
    expect(game.phaseDurationMs(s2)).toBe(6_000);

    const s3 = game.reduce(s2, deadline()).state; // zero votes -> valid
    expect(game.phaseKey(s3)).toBe('result:t1');
    expect(game.phaseDurationMs(s3)).toBe(2_000);

    const s4 = game.reduce(s3, deadline()).state;
    expect(s4.phase).toBe('say');
    expect(game.phaseKey(s4)).toBe('say:t2'); // key changes per TURN — the shell re-arms
    expect(s4.spotlight).toBe(s4.rotation[1]);
  });

  it('reaches roundEnd:r0 once a single survivor remains, then draw:r1 with alive reset', () => {
    const s0 = game.init('s', players, content);
    let s = game.reduce(s0, deadline()).state; // say t1
    s = game.reduce(s, deadline()).state; // timeout -> result (rotation[0] eliminated)
    s = game.reduce(s, deadline()).state; // say t2
    s = game.reduce(s, deadline()).state; // timeout -> result (rotation[1] eliminated)
    const end = game.reduce(s, deadline()).state; // 1 alive -> roundEnd
    expect(game.phaseKey(end)).toBe('roundEnd:r0');
    expect(game.phaseDurationMs(end)).toBe(4_000);
    expect(end.roundWinners).toEqual([end.players.find((p) => end.alive[p] === true)]);

    const r1 = game.reduce(end, deadline()).state;
    expect(game.phaseKey(r1)).toBe('draw:r1');
    expect(r1.current?.itemId).toBe('i2');
    expect(r1.current?.letter).toBe('B');
    expect(r1.lapInRound).toBe(0);
    expect(r1.turnsThisRound).toBe(0);
    for (const p of players) expect(r1.alive[p]).toBe(true); // alive reset to the connected snapshot
  });

  it('decaying shot clock: 8s -> 6.5s -> 5s -> 3.5s -> 3s floor, one step per completed lap', () => {
    let s = game.reduce(game.init('s', players, content), deadline()).state; // say t1
    const seen: number[] = [];
    for (let turn = 1; turn <= 13; turn++) {
      expect(s.phase).toBe('say');
      seen.push(game.phaseDurationMs(s)!);
      if (turn < 13) s = validatedTurn(s);
    }
    expect(seen).toEqual([
      8_000, 8_000, 8_000, // lap 0
      6_500, 6_500, 6_500, // lap 1
      5_000, 5_000, 5_000, // lap 2
      3_500, 3_500, 3_500, // lap 3
      3_000, // lap 4 hits the minSayMs floor (8000 - 6000 = 2000 -> 3000)
    ]);
    expect(s.lapInRound).toBe(4);
  });

  it('the hard turn cap ends the round and every survivor takes the bonus', () => {
    const capped = createLastStanding('jeu-du-theme', { ...JEU_DU_THEME_CONFIG, maxTurnsPerRoundFactor: 1 });
    let s = capped.reduce(capped.init('s', players, content), deadline()).state; // say t1; cap = 3 turns
    for (let turn = 1; turn <= 3; turn++) {
      const spot = s.spotlight!;
      s = capped.reduce(s, act(spot, { kind: 'wordSaid' })).state;
      for (const p of players) {
        if (p !== spot && s.phase === 'judge') s = capped.reduce(s, act(p, { kind: 'judge', vote: 'valid' })).state;
      }
      s = capped.reduce(s, deadline()).state; // result -> next turn, or roundEnd at the cap
    }
    expect(s.phase).toBe('roundEnd');
    expect(s.roundWinners.slice().sort()).toEqual([...players].sort()); // cap case: ALL still-alive crowned
    for (const p of players) expect(s.scores[p]).toBe(1 + 3); // 1 validated word + survivorPoints each
  });

  it('a deadline-only walk from init terminates at over with phaseDurationMs null', () => {
    let s = game.init('s', players, content);
    for (let i = 0; i < 60 && s.phase !== 'over'; i++) {
      const next = game.reduce(s, deadline(1_000 + i)).state;
      expect(next).not.toBe(s); // every timed phase must consume its deadline
      s = next;
    }
    expect(s.phase).toBe('over');
    expect(game.phaseKey(s)).toBe('over');
    expect(game.phaseDurationMs(s)).toBeNull();
  });

  it('emits round_completed at roundEnd (the interstitial-ad boundary) and gameOver at over', () => {
    const one = createLastStanding('jeu-du-theme', { ...JEU_DU_THEME_CONFIG, totalRounds: 1 });
    let s = one.reduce(one.init('s', players, content), deadline()).state;
    s = one.reduce(s, deadline()).state; // timeout t1
    s = one.reduce(s, deadline()).state; // say t2
    s = one.reduce(s, deadline()).state; // timeout t2
    const { state: end, effects } = one.reduce(s, deadline()); // -> roundEnd
    expect(end.phase).toBe('roundEnd');
    expect(effects).toEqual([{ type: 'analytics', name: 'round_completed', props: { round: 0 } }]);
    const { state: over, effects: overFx } = one.reduce(end, deadline());
    expect(over.phase).toBe('over');
    expect(overFx).toEqual([{ type: 'gameOver', scores: over.scores }]);
  });

  it('the over phase is untimed and absorbs every event (same reference)', () => {
    let s = game.init('s', players, content);
    for (let i = 0; i < 60 && s.phase !== 'over'; i++) s = game.reduce(s, deadline(i)).state;
    expect(s.phase).toBe('over');
    expect(game.reduce(s, deadline(99)).state).toBe(s);
    expect(game.reduce(s, act('p1', { kind: 'wordSaid' })).state).toBe(s);
    expect(game.reduce(s, { type: 'playerLeft', playerId: 'p1', at: 0 }).state).toBe(s);
  });

  it('a collapsed room (<2 connected) at draw entry goes straight to over with gameOver', () => {
    const s0 = game.init('s', players, content);
    let s = game.reduce(s0, deadline()).state; // say t1
    s = game.reduce(s, deadline()).state; // timeout -> result
    s = game.reduce(s, deadline()).state; // say t2
    s = game.reduce(s, deadline()).state; // timeout -> result
    s = game.reduce(s, deadline()).state; // roundEnd:r0
    s = game.reduce(s, { type: 'playerLeft', playerId: 'p1', at: 0 }).state;
    s = game.reduce(s, { type: 'playerLeft', playerId: 'p2', at: 1 }).state;
    const { state: over, effects } = game.reduce(s, deadline()); // afterRound -> draw guard
    expect(over.phase).toBe('over');
    expect(effects[0]).toEqual({ type: 'analytics', name: 'room_collapsed', props: { round: 1 } });
    const gameOver = effects.find((e) => e.type === 'gameOver');
    expect(gameOver).toBeDefined();
  });
});
