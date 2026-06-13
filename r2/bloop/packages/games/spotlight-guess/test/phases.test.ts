import { describe, expect, it } from 'vitest';
import type { Effect } from '@bloop/engine';
import {
  createSpotlightGuess,
  DEVINE_LA_QUESTION_CONFIG,
  JEU_DE_LA_NOTE_CONFIG,
  type SpotlightGuessState,
} from '@bloop/game-spotlight-guess';
import {
  answer, deadline, guess, guessersOf, left, openVotes, ready, reverseContent, scaleContent,
  spotOf, wheelContent,
} from './fixtures.js';

const players = ['p1', 'p2', 'p3'];
const note = createSpotlightGuess('jeu-de-la-note', JEU_DE_LA_NOTE_CONFIG);
const dq = createSpotlightGuess('devine-la-question', DEVINE_LA_QUESTION_CONFIG);

describe('init determinism and pool capping', () => {
  it('same seed -> identical item order, targets and turnOrder', () => {
    const a = note.init('seed-x', players, scaleContent);
    const b = note.init('seed-x', players, scaleContent);
    expect(a.scaleRounds.map((r) => r.itemId)).toEqual(b.scaleRounds.map((r) => r.itemId));
    expect(a.targets).toEqual(b.targets);
    expect(a.turnOrder).toEqual(b.turnOrder);
    const c = dq.init('seed-x', players, reverseContent);
    const d = dq.init('seed-x', players, reverseContent);
    expect(c.reverseRounds.map((r) => r.itemId)).toEqual(d.reverseRounds.map((r) => r.itemId));
    expect(c.reverseRounds.map((r) => r.realIndex)).toEqual(d.reverseRounds.map((r) => r.realIndex));
  });

  it('caps totalRounds at the pool size', () => {
    expect(note.init('s', players, scaleContent).config.totalRounds).toBe(3); // 3 items < 8
    expect(dq.init('s', players, reverseContent).config.totalRounds).toBe(2); // 2 items < 6
  });

  it('scale targets are pre-drawn for ALL rounds, in domain', () => {
    const s = note.init('s', players, scaleContent);
    expect(s.targets).toHaveLength(s.config.totalRounds);
    for (const t of s.targets) {
      expect(Number.isInteger(t)).toBe(true);
      expect(t).toBeGreaterThanOrEqual(1);
      expect(t).toBeLessThanOrEqual(10);
    }
  });

  it('reverse rounds carry decoyCount+1 candidates with the real question inside', () => {
    const s = dq.init('s', players, reverseContent);
    for (const r of s.reverseRounds) {
      expect(r.candidates).toHaveLength(DEVINE_LA_QUESTION_CONFIG.decoyCount + 1);
      expect(r.realIndex).toBeGreaterThanOrEqual(0);
      expect(r.realIndex).toBeLessThan(r.candidates.length);
      expect(r.hints).toHaveLength(DEVINE_LA_QUESTION_CONFIG.hintTiers - 1);
    }
  });
});

describe('scale phase chain (jeu-de-la-note)', () => {
  it('target -ready-> talk -openVotes-> guess -allActed-> reveal -deadline-> next round, rotated', () => {
    const s0 = note.init('s', players, scaleContent);
    expect(s0.phase).toBe('target');
    expect(note.phaseKey(s0)).toBe('target:r0');
    expect(note.phaseDurationMs(s0)).toBe(8_000);
    const spot = spotOf(s0);

    const s1 = note.reduce(s0, ready(spot)).state;
    expect(note.phaseKey(s1)).toBe('talk:r0');
    expect(note.phaseDurationMs(s1)).toBe(45_000);

    const s2 = note.reduce(s1, openVotes(spot)).state;
    expect(note.phaseKey(s2)).toBe('guess:r0');
    expect(note.phaseDurationMs(s2)).toBe(20_000);

    const [g1, g2] = guessersOf(s2);
    const s3 = note.reduce(s2, guess(g1!, 5)).state;
    expect(s3.phase).toBe('guess'); // one guesser still expected
    const s4 = note.reduce(s3, guess(g2!, 7)).state;
    expect(note.phaseKey(s4)).toBe('reveal:r0');
    expect(note.phaseDurationMs(s4)).toBe(8_000);

    const s5 = note.reduce(s4, deadline(1)).state;
    expect(note.phaseKey(s5)).toBe('target:r1');
    expect(spotOf(s5)).not.toBe(spot); // rotation moved the spotlight
    expect(s5.guesses).toEqual({}); // buffer cleared
  });

  it('every phase advances on deadline alone (passive room) and terminates at over', () => {
    let s = note.init('s', players, scaleContent);
    const effects: Effect[] = [];
    let steps = 0;
    for (; steps < 40 && s.phase !== 'over'; steps++) {
      expect(note.phaseDurationMs(s)).not.toBeNull(); // every non-over phase is timed
      const r = note.reduce(s, deadline(steps));
      expect(r.state).not.toBe(s); // a timed phase never absorbs its deadline
      s = r.state;
      effects.push(...r.effects);
    }
    expect(s.phase).toBe('over');
    expect(steps).toBe(3 * 4); // target/talk/guess/reveal × 3 rounds
    expect(note.phaseDurationMs(s)).toBeNull();
    expect(note.phaseKey(s)).toBe('over');
    const over = effects.filter((e) => e.type === 'gameOver');
    expect(over).toHaveLength(1);
    expect((over[0] as { scores: Record<string, number> }).scores).toEqual(s.scores);
  });

  it('the over phase absorbs every event (same reference)', () => {
    let s = note.init('s', players, scaleContent);
    for (let i = 0; i < 20 && s.phase !== 'over'; i++) s = note.reduce(s, deadline(i)).state;
    expect(s.phase).toBe('over');
    expect(note.reduce(s, deadline(99)).state).toBe(s);
    expect(note.reduce(s, ready(spotOf(s))).state).toBe(s);
    expect(note.reduce(s, guess('p1', 5)).state).toBe(s);
    expect(note.reduce(s, left('p1x')).state).toBe(s);
  });
});

describe('reverse phase chain (devine-la-question)', () => {
  it('answer -answer-> guess h0 -deadline-> h1 -> h2 -deadline-> reveal; hint tiers re-key the alarm', () => {
    const s0 = dq.init('s', players, reverseContent);
    expect(dq.phaseKey(s0)).toBe('answer:r0');
    expect(dq.phaseDurationMs(s0)).toBe(20_000);

    const s1 = dq.reduce(s0, answer(spotOf(s0), 0)).state;
    expect(dq.phaseKey(s1)).toBe('guess:r0:h0');
    expect(dq.phaseDurationMs(s1)).toBe(20_000);
    expect(s1.chosenAnswer).toBe(0);

    const s2 = dq.reduce(s1, deadline(1)).state;
    expect(dq.phaseKey(s2)).toBe('guess:r0:h1'); // key change re-arms the shell alarm
    const s3 = dq.reduce(s2, deadline(2)).state;
    expect(dq.phaseKey(s3)).toBe('guess:r0:h2');
    const s4 = dq.reduce(s3, deadline(3)).state;
    expect(dq.phaseKey(s4)).toBe('reveal:r0');
    expect(dq.phaseDurationMs(s4)).toBe(8_000);
    expect(s4.voided).toBe(false);
  });

  it('all guessers locked ends the tier ladder early', () => {
    const s0 = dq.init('s', players, reverseContent);
    const s1 = dq.reduce(s0, answer(spotOf(s0), 1)).state;
    const [g1, g2] = guessersOf(s1);
    const s2 = dq.reduce(s1, guess(g1!, 0)).state;
    expect(s2.phase).toBe('guess');
    const s3 = dq.reduce(s2, guess(g2!, 1)).state;
    expect(dq.phaseKey(s3)).toBe('reveal:r0');
  });

  it('answer deadline voids the round: voided reveal, zero gained, round_skipped', () => {
    const s0 = dq.init('s', players, reverseContent);
    const r = dq.reduce(s0, deadline(0));
    expect(r.state.phase).toBe('reveal');
    expect(r.state.voided).toBe(true);
    expect(Object.values(r.state.lastGained)).toEqual(players.map(() => 0));
    expect(r.effects.some((e) => e.type === 'analytics' && e.name === 'round_skipped')).toBe(true);
  });

  it('scoreboard beat lands before over and on the scoreboardEvery cadence', () => {
    // totalRounds caps at 2 with this pack: r0 reveal -> next round (1 % 2 !== 0),
    // r1 reveal -> scoreboard (last round), scoreboard -> over.
    let s = dq.init('s', players, reverseContent);
    const seen: string[] = [];
    const effects: Effect[] = [];
    for (let i = 0; i < 40 && s.phase !== 'over'; i++) {
      seen.push(dq.phaseKey(s));
      const r = dq.reduce(s, deadline(i));
      expect(r.state).not.toBe(s);
      s = r.state;
      effects.push(...r.effects);
    }
    expect(seen).toEqual([
      'answer:r0', 'reveal:r0', // voided by deadline
      'answer:r1', 'reveal:r1',
      'scoreboard:r1',
    ]);
    expect(s.phase).toBe('over');
    expect(dq.phaseDurationMs(s)).toBeNull();
    expect(effects.filter((e) => e.type === 'gameOver')).toHaveLength(1);
  });

  it('mid-game scoreboard cadence with a longer pool (scoreboardEvery = 2)', () => {
    // 4 rounds via a doubled pool: scoreboard after r1, after r3 (last).
    const bigPack = {
      ...reverseContent,
      data: {
        mode: 'reverse-question' as const,
        items: [
          ...reverseContent.data.mode === 'reverse-question' ? reverseContent.data.items : [],
          ...(reverseContent.data.mode === 'reverse-question' ? reverseContent.data.items : []).map((i) => ({ ...i, id: `${i.id}-b` })),
        ],
      },
    };
    const mod = createSpotlightGuess('devine-la-question', { ...DEVINE_LA_QUESTION_CONFIG, totalRounds: 4 });
    let s = mod.init('s', players, bigPack);
    const seen: string[] = [];
    for (let i = 0; i < 60 && s.phase !== 'over'; i++) {
      seen.push(mod.phaseKey(s));
      s = mod.reduce(s, deadline(i)).state;
    }
    expect(seen.filter((k) => k.startsWith('scoreboard'))).toEqual(['scoreboard:r1', 'scoreboard:r3']);
    expect(s.phase).toBe('over');
  });

  it('scoreboard duration matches config and over absorbs everything', () => {
    let s = dq.init('s', players, reverseContent);
    for (let i = 0; i < 40 && s.phase !== 'scoreboard'; i++) s = dq.reduce(s, deadline(i)).state;
    expect(s.phase).toBe('scoreboard');
    expect(dq.phaseDurationMs(s)).toBe(6_000);
    const over = dq.reduce(s, deadline(99)).state;
    expect(over.phase).toBe('over');
    expect(dq.reduce(over, answer(spotOf(over), 0)).state).toBe(over);
    expect(dq.reduce(over, deadline(100)).state).toBe(over);
  });
});

describe('wheel domain rides the per-item kind', () => {
  it('a wheel100 item accepts 0..100 and keeps the same phase machine', () => {
    const s0 = note.init('s', players, wheelContent);
    for (const t of s0.targets) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(100);
    }
    let s: SpotlightGuessState = note.reduce(s0, deadline(0)).state; // target -> talk
    s = note.reduce(s, deadline(1)).state; // talk -> guess
    const [g1] = guessersOf(s);
    expect(note.reduce(s, guess(g1!, 100)).state).not.toBe(s); // 100 in domain
    expect(note.reduce(s, guess(g1!, 101)).state).toBe(s); // out of domain
  });
});
