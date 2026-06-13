import { describe, expect, it } from 'vitest';
import {
  createTruthDare,
  TRUTH_OR_DARE_2_CONFIG,
  TRUTH_OR_DARE_LOVER_CONFIG,
  TRUTH_OR_DRINK_CONFIG,
} from '@bloop/game-truth-dare';
import {
  analyticsNames,
  choose,
  deadline,
  declare,
  DRINK_PACK,
  drink,
  fold,
  lt,
  pack,
  PLAYERS,
  TOD_PACK,
  tod,
  vote,
  walkToOver,
} from './helpers';

describe('init determinism', () => {
  it('same seed -> identical rotation, decks and first prompt; different seed differs', () => {
    const a = tod.init('seed-1', PLAYERS, TOD_PACK);
    const b = tod.init('seed-1', PLAYERS, TOD_PACK);
    expect(a.rotation).toEqual(b.rotation);
    expect(a.decks).toEqual(b.decks);
    expect(a.activePlayer).toBe(b.activePlayer);
    const c = tod.init('seed-2', PLAYERS, TOD_PACK);
    expect(JSON.stringify(a.decks)).not.toBe(JSON.stringify(c.decks));
  });

  it('tod init: choose:0, active = rotation[0], zeroed scores, full passes', () => {
    const s = tod.init('s', PLAYERS, TOD_PACK);
    expect(s.phase).toBe('choose');
    expect(tod.phaseKey(s)).toBe('choose:0');
    expect(tod.phaseDurationMs(s)).toBe(15_000);
    expect(s.activePlayer).toBe(s.rotation[0]);
    expect([...s.rotation].sort()).toEqual([...PLAYERS].sort());
    for (const p of PLAYERS) {
      expect(s.scores[p]).toBe(0);
      expect(s.passesLeft[p]).toBe(2);
      expect(s.connected[p]).toBe(true);
    }
  });

  it('lover sibling is config-only: lover-deck items only, party+spicy tiers, 3 passes', () => {
    const lover = createTruthDare('truth-or-dare-2', TRUTH_OR_DARE_LOVER_CONFIG);
    const s = lover.init('s', PLAYERS, TOD_PACK);
    const ids = Object.values(s.decks).flat();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id.startsWith('lov-')).toBe(true);
    expect(Object.keys(s.decks).sort()).toEqual(['dare:party', 'dare:spicy', 'truth:party', 'truth:spicy']);
    for (const p of PLAYERS) expect(s.passesLeft[p]).toBe(3);
  });

  it('fun mainline filters out lover items and spicy tier entirely', () => {
    const s = tod.init('s', PLAYERS, TOD_PACK);
    const ids = Object.values(s.decks).flat();
    for (const id of ids) expect(id.startsWith('fun-')).toBe(true);
    expect(Object.keys(s.decks).sort()).toEqual(['dare:party', 'dare:soft', 'truth:party', 'truth:soft']);
  });

  it('drink init auto-skips choose: lands directly in prompt:0 with a truth question', () => {
    const s = drink.init('s', PLAYERS, DRINK_PACK);
    expect(s.phase).toBe('prompt');
    expect(drink.phaseKey(s)).toBe('prompt:0');
    expect(drink.phaseDurationMs(s)).toBe(35_000);
    expect(s.choice).toBe('truth');
    expect(s.prompt?.choice).toBe('truth');
    // highest allowed tier first (spicy before party)
    expect(s.prompt?.intensity).toBe('spicy');
  });
});

describe('phase machine (action-driven happy path, truth-or-dare-2)', () => {
  it('choose -> prompt -> verdict -> score -> next choose with per-phase keys/durations', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const voters = PLAYERS.filter((p) => p !== active);

    const s1 = fold(tod, s0, [choose(active, 'dare')]);
    expect(s1.phase).toBe('prompt');
    expect(tod.phaseKey(s1)).toBe('prompt:0');
    expect(tod.phaseDurationMs(s1)).toBe(45_000);
    expect(s1.prompt?.choice).toBe('dare');
    // fun deck plays its highest allowed tier (party) first
    expect(s1.prompt?.intensity).toBe('party');

    const s2 = fold(tod, s1, [declare(active, 'done')]);
    expect(s2.phase).toBe('verdict');
    expect(tod.phaseKey(s2)).toBe('verdict:0');
    expect(tod.phaseDurationMs(s2)).toBe(20_000);

    const s3 = fold(tod, s2, [vote(voters[0]!, 'done'), vote(voters[1]!, 'done')]);
    expect(s3.phase).toBe('score');
    expect(tod.phaseKey(s3)).toBe('score:0');
    expect(tod.phaseDurationMs(s3)).toBe(6_000);
    expect(s3.lastResult?.verdict).toBe('done');
    expect(s3.lastResult?.pointsAwarded).toBe(15); // dare: 10 + 5

    const s4 = fold(tod, s3, [deadline(1)]);
    expect(s4.phase).toBe('choose');
    expect(tod.phaseKey(s4)).toBe('choose:1');
    expect(s4.activePlayer).toBe(s4.rotation[1]);
    expect(s4.prompt).toBeNull();
    expect(s4.choice).toBeNull();
  });

  it('a verdict vote mid-phase keeps the running deadline (phaseKey unchanged)', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const voters = PLAYERS.filter((p) => p !== active);
    const s1 = fold(tod, s0, [choose(active, 'truth'), declare(active, 'done')]);
    const s2 = fold(tod, s1, [vote(voters[0]!, 'done')]);
    expect(s2.phase).toBe('verdict');
    expect(tod.phaseKey(s2)).toBe(tod.phaseKey(s1));
  });
});

describe('deadline walks — a passive room always reaches over', () => {
  it('tod: 27 deadlines (9 turns x 3) reach over; terminal key is the bare "over"', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const { state, steps, keys } = walkToOver(tod, s0);
    expect(state.phase).toBe('over');
    expect(steps).toBe(27);
    expect(keys[keys.length - 1]).toBe('over');
    expect(tod.phaseDurationMs(state)).toBeNull();
    // phaseKey never repeats across the whole walk (shell idempotency key)
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('tod walk: choose deadlines auto-pick deterministically (same seed, same picks)', () => {
    const a = walkToOver(tod, tod.init('s', PLAYERS, TOD_PACK));
    const b = walkToOver(tod, tod.init('s', PLAYERS, TOD_PACK));
    expect(analyticsNames(a.effects)).toEqual(analyticsNames(b.effects));
    expect(a.state.usedPromptIds).toEqual(b.state.usedPromptIds);
  });

  it('tod walk: round_completed fires on non-final lap wraps only (the ad boundary)', () => {
    const { effects } = walkToOver(tod, tod.init('s', PLAYERS, TOD_PACK));
    const names = analyticsNames(effects);
    // 3 laps: wraps into lap 1 and lap 2 emit the ad cue; the final wrap emits gameOver instead
    expect(names.filter((n) => n === 'round_completed')).toHaveLength(2);
    expect(effects.filter((e) => e.type === 'gameOver')).toHaveLength(1);
  });

  it('drink: 12 deadlines (6 turns x 2 — no choose beat) reach over', () => {
    const s0 = drink.init('s', PLAYERS, DRINK_PACK);
    const { state, steps, keys } = walkToOver(drink, s0);
    expect(state.phase).toBe('over');
    expect(steps).toBe(12);
    expect(keys[0]).toBe('prompt:0');
    expect(keys[keys.length - 1]).toBe('over');
    expect(drink.phaseDurationMs(state)).toBeNull();
  });

  it('prompt timeout scores as chickened and spends no pass', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const s1 = fold(tod, s0, [choose(active, 'dare'), deadline(1)]);
    expect(s1.phase).toBe('score');
    expect(s1.lastResult?.verdict).toBe('chickened');
    expect(s1.lastResult?.pointsAwarded).toBe(0);
    expect(s1.passesLeft[active]).toBe(2);
  });

  it('over is terminal: absorbs deadlines and actions with the SAME reference', () => {
    const over = walkToOver(tod, tod.init('s', PLAYERS, TOD_PACK)).state;
    expect(tod.reduce(over, deadline(99)).state).toBe(over);
    expect(tod.reduce(over, choose(PLAYERS[0]!, 'truth')).state).toBe(over);
    expect(tod.reduce(over, { type: 'playerLeft', playerId: PLAYERS[0]!, at: 1 }).state).toBe(over);
  });
});

describe('pool exhaustion (graceful degrade)', () => {
  const tinyConfig = { ...TRUTH_OR_DRINK_CONFIG, allowedIntensities: ['party' as const] };
  const tiny = createTruthDare('truth-or-drink', tinyConfig);

  it('drained decks end the game early with pool_exhausted + gameOver', () => {
    // exactly 2 truth questions: turn 0 (init draw) + turn 1, exhausted on turn 2 entry
    const p = pack([
      { id: 'q1', choice: 'truth', intensity: 'party', text: lt('q1') },
      { id: 'q2', choice: 'truth', intensity: 'party', text: lt('q2') },
    ]);
    const s0 = tiny.init('s', PLAYERS, p);
    expect(s0.phase).toBe('prompt');
    const { state, effects } = walkToOver(tiny, s0);
    expect(state.phase).toBe('over');
    expect(analyticsNames(effects)).toContain('pool_exhausted');
    expect(effects.filter((e) => e.type === 'gameOver')).toHaveLength(1);
  });

  it('tier fall-down: the highest allowed tier drains into the lower one before ending', () => {
    const cfg = { ...TRUTH_OR_DRINK_CONFIG, allowedIntensities: ['soft' as const, 'party' as const] };
    const m = createTruthDare('truth-or-drink', cfg);
    const p = pack([
      { id: 'q-party', choice: 'truth', intensity: 'party', text: lt('q-party') },
      { id: 'q-soft', choice: 'truth', intensity: 'soft', text: lt('q-soft') },
    ]);
    const s0 = m.init('s', PLAYERS, p);
    expect(s0.prompt?.id).toBe('q-party'); // highest allowed first
    const s1 = fold(m, s0, [deadline(1), deadline(2)]); // chickened -> score -> next turn
    expect(s1.phase).toBe('prompt');
    expect(s1.prompt?.id).toBe('q-soft'); // fell down a tier instead of ending
  });

  it('a single-choice config over an empty pack lands directly on over at init', () => {
    const s = tiny.init('s', PLAYERS, pack([]));
    expect(s.phase).toBe('over');
    expect(tiny.phaseKey(s)).toBe('over');
    expect(tiny.phaseDurationMs(s)).toBeNull();
  });

  it('no prompt ever repeats within a game', () => {
    const { state } = walkToOver(tod, tod.init('s', PLAYERS, TOD_PACK));
    expect(new Set(state.usedPromptIds).size).toBe(state.usedPromptIds.length);
  });
});

describe('config exactness (binding designs)', () => {
  it('truth-or-dare-2 fun params match wave2 §2.7', () => {
    expect(TRUTH_OR_DARE_2_CONFIG).toMatchObject({
      totalRounds: 3, passesPerPlayer: 2, allowedIntensities: ['soft', 'party'],
      verdictThreshold: 0.5, donePoints: 10, passPoints: 3, chickenedPoints: 0, dareBonus: 5,
      chooseMs: 15_000, promptMs: 45_000, verdictMs: 20_000, scoreMs: 6_000,
      allowedChoices: ['truth', 'dare'], escapeMode: 'pass', deck: 'fun',
    });
  });

  it('truth-or-drink params match wave2 §2.8', () => {
    expect(TRUTH_OR_DRINK_CONFIG).toMatchObject({
      totalRounds: 2, allowedChoices: ['truth'], escapeMode: 'forfeit-draw',
      allowedIntensities: ['party', 'spicy'], promptMs: 35_000, verdictMs: 15_000, scoreMs: 7_000,
      donePoints: 10, passPoints: 3, chickenedPoints: 0, dareBonus: 0, verdictThreshold: 0.5,
      deck: null,
    });
    expect(TRUTH_OR_DRINK_CONFIG.labels.escape).toEqual({ fr: 'Je bois 🍺', en: 'I drink 🍺' });
    expect(TRUTH_OR_DRINK_CONFIG.labels.forfeitStamp).toEqual({ fr: 'SANTÉ !', en: 'CHEERS!' });
  });
});
