import { describe, expect, it } from 'vitest';
import type { MatchEpilogue, NightDayState } from '@bloop/game-night-day';
import {
  allOf,
  CONTENT,
  deadline,
  drive,
  game,
  nightAck,
  nightRead,
  P5,
  P8,
  peek,
  roleOf,
  toNight,
  vote,
  walkUntil,
  wolfVote,
} from './helpers.js';

/**
 * CC-5 match epilogue (P1-2). Derived PURELY at `over` from already-public
 * over-state (finalRoles, alive, the diedRound tracking map, and the Night Read
 * accuracy already tracked). NO new in-match secret, never folded into the 0-3
 * placement scores. These guards prove:
 *   (a) townMvp / bestSeers come from the read-accuracy leaders (sole => MVP);
 *   (b) cleanestWolf is the longest-undetected wolf (null on a tie / no wolves);
 *   (c) survivedTo is the last live round per player (survivor => final round);
 *   (d) it is surfaced ONLY at over and never perturbs placement scores;
 *   (e) it is fully deterministic + JSON-serializable.
 */

function overView(s: NightDayState): { epilogue: MatchEpilogue; scores: Record<string, number> } {
  const v = game.view(s, 'p1');
  if (v.phase !== 'over') throw new Error('expected over view');
  return { epilogue: v.epilogue, scores: v.scores };
}

describe('epilogue — town MVP / best seers from read accuracy', () => {
  it('the sole most-accurate reader is the town MVP; ties list bestSeers but crown nobody', () => {
    // Controlled village win: night-0 reads point at the wolf (correct), one wrong.
    const s0 = game.init('s', P5, CONTENT);
    const wolf = roleOf(s0, 'wolf');
    const victim = allOf(s0, 'villager')[0]!;
    const seer = roleOf(s0, 'seer');
    const witch = roleOf(s0, 'witch');
    const cleanVillager = allOf(s0, 'villager').find((p) => p !== victim)!;
    let s = toNight(game, s0);
    // cleanVillager + witch read the wolf (correct = 1 each); victim reads wrong (0).
    s = drive(game, s, [
      nightRead(cleanVillager, wolf, 1),
      nightRead(witch, wolf, 2),
      nightRead(victim, seer, 3),
      nightAck(wolf, 4),
      peek(seer, wolf, 5),
    ]);
    expect(s.phase).toBe('nightWolves');
    s = game.reduce(s, wolfVote(wolf, victim, 5)).state;
    s = walkUntil(game, s, (x) => x.phase === 'vote');
    for (const p of P5.filter((x) => x !== wolf && x !== victim)) {
      s = game.reduce(s, vote(p, wolf)).state;
    }
    s = walkUntil(game, s, (x) => x.phase === 'over');
    expect(s.winners).toBe('village');

    const { epilogue, scores } = overView(s);
    // cleanVillager and witch both have accuracy 1 — a TIE => no single MVP,
    // but both are listed as bestSeers at value 1.
    expect(epilogue.bestReadAccuracy).toBe(1);
    expect(epilogue.bestSeers.sort()).toEqual([cleanVillager, witch].sort());
    expect(epilogue.townMvp).toBeNull(); // contested crown

    // cosmetic: placement scores are the exact 0-3 scale, untouched by the epilogue.
    const expectedScores: Record<string, number> = {};
    for (const p of P5) expectedScores[p] = p === wolf ? 0 : p === victim ? 1 : 2;
    expect(scores).toEqual(expectedScores);
  });

  it('a single clear leader IS crowned town MVP', () => {
    const s0 = game.init('s', P5, CONTENT);
    const wolf = roleOf(s0, 'wolf');
    const victim = allOf(s0, 'villager')[0]!;
    const seer = roleOf(s0, 'seer');
    const witch = roleOf(s0, 'witch');
    const cleanVillager = allOf(s0, 'villager').find((p) => p !== victim)!;
    let s = toNight(game, s0);
    // ONLY cleanVillager reads the wolf (1); the rest ack or read wrong.
    s = drive(game, s, [
      nightRead(cleanVillager, wolf, 1),
      nightRead(witch, seer, 2), // wrong
      nightAck(victim, 3),
      nightAck(wolf, 4),
      peek(seer, wolf, 5),
    ]);
    s = game.reduce(s, wolfVote(wolf, victim, 5)).state;
    s = walkUntil(game, s, (x) => x.phase === 'vote');
    for (const p of P5.filter((x) => x !== wolf && x !== victim)) {
      s = game.reduce(s, vote(p, wolf)).state;
    }
    s = walkUntil(game, s, (x) => x.phase === 'over');
    const { epilogue } = overView(s);
    expect(epilogue.bestReadAccuracy).toBe(1);
    expect(epilogue.bestSeers).toEqual([cleanVillager]);
    expect(epilogue.townMvp).toBe(cleanVillager);
  });

  it('nobody reads a wolf => no MVP, no bestSeers, accuracy 0', () => {
    const s = walkUntil(game, game.init('s', P5, CONTENT), (x) => x.phase === 'over');
    const { epilogue } = overView(s);
    expect(epilogue.bestReadAccuracy).toBe(0);
    expect(epilogue.bestSeers).toEqual([]);
    expect(epilogue.townMvp).toBeNull();
  });
});

describe('epilogue — cleanestWolf (longest undetected)', () => {
  it('the sole surviving wolf in a wolves-win is the cleanest wolf', () => {
    // Reuse the wolvesWin parity scenario: the single wolf survives to the end.
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const wolf = roleOf(s0, 'wolf');
    const prey = P5.filter((p) => p !== wolf);
    let s: NightDayState = s0;
    for (let night = 0; night < 3; night++) {
      const wolves = walkUntil(game, s, (x) => x.phase === 'nightWolves');
      s = game.reduce(wolves, wolfVote(wolf, prey[night]!, night * 10 + 1)).state;
      s = walkUntil(game, s, (x) => x.phase === 'dawn');
      if (night < 2) s = game.reduce(s, deadline(night * 10 + 2)).state;
    }
    s = game.reduce(s, deadline(99)).state;
    expect(s.phase).toBe('over');
    expect(s.winners).toBe('wolves');
    const { epilogue } = overView(s);
    expect(epilogue.cleanestWolf).toBe(wolf); // never caught
    // the surviving wolf lasted to the final round; the eaten villagers report their death round
    expect(epilogue.survivedTo[wolf]).toBe(s.round);
    expect(epilogue.survivedTo[prey[0]!]).toBe(0); // eaten night 0
  });

  it('cleanestWolf is null when there are two wolves tied on survival (8p both alive at over)', () => {
    // 8p, two wolves: drive to a wolves-win where both wolves survive to the same round.
    const s0 = game.init('eight', P8, CONTENT);
    const wolves = allOf(s0, 'wolf');
    expect(wolves).toHaveLength(2);
    const prey = P8.filter((p) => !wolves.includes(p));
    let s: NightDayState = toNight(game, s0);
    // Eat villagers each night with hung juries until parity (2 wolves vs 2 others or fewer).
    for (let night = 0; night < 4 && s.phase !== 'over'; night++) {
      const w = walkUntil(game, s, (x) => x.phase === 'nightWolves' || x.phase === 'over');
      if (w.phase === 'over') {
        s = w;
        break;
      }
      const livingPrey = prey.find((p) => w.alive[p] === true);
      if (livingPrey === undefined) break;
      s = game.reduce(w, wolfVote(wolves[0]!, livingPrey, night * 10 + 1)).state;
      const dawn = walkUntil(game, s, (x) => x.phase === 'dawn' || x.phase === 'over');
      s = dawn.phase === 'over' ? dawn : game.reduce(dawn, deadline(night * 10 + 2)).state;
    }
    s = walkUntil(game, s, (x) => x.phase === 'over');
    expect(s.winners).toBe('wolves');
    // both wolves survived to the same final round => no single cleanest wolf.
    if (s.alive[wolves[0]!] === true && s.alive[wolves[1]!] === true) {
      const { epilogue } = overView(s);
      expect(epilogue.survivedTo[wolves[0]!]).toBe(epilogue.survivedTo[wolves[1]!]);
      expect(epilogue.cleanestWolf).toBeNull();
    }
  });
});

describe('epilogue — survivedTo + determinism + serialization', () => {
  it('survivedTo covers the full roster; a survivor reports the final round', () => {
    const s = walkUntil(game, game.init('s', P5, CONTENT), (x) => x.phase === 'over');
    const { epilogue } = overView(s);
    expect(Object.keys(epilogue.survivedTo).sort()).toEqual([...P5].sort());
    for (const p of P5) {
      if (s.alive[p] === true) expect(epilogue.survivedTo[p]).toBe(s.round);
    }
  });

  it('is surfaced ONLY at over (no pre-over view carries an epilogue key)', () => {
    let s = game.init('s', P5, CONTENT);
    for (let i = 0; i < 200 && s.phase !== 'over'; i++) {
      const v = game.view(s, 'p1');
      expect(Object.keys(v)).not.toContain('epilogue');
      const next = game.reduce(s, deadline(i)).state;
      if (next === s) break;
      s = next;
    }
    const over = game.view(s, 'p1');
    expect(Object.keys(over)).toContain('epilogue');
  });

  it('is deterministic and JSON-serializable across viewers', () => {
    const s = walkUntil(game, game.init('det', P5, CONTENT), (x) => x.phase === 'over');
    const a = overView(s).epilogue;
    const b = overView(s).epilogue;
    expect(a).toEqual(b); // pure derivation, same input => same output
    for (const viewer of ['p1', 'spectator', '__proto__']) {
      const v = game.view(s, viewer);
      if (v.phase !== 'over') throw new Error('expected over view');
      expect(JSON.parse(JSON.stringify(v.epilogue))).toEqual(v.epilogue);
      // the epilogue is identical for every viewer (public-derived, no per-viewer secret)
      expect(v.epilogue).toEqual(a);
    }
  });
});
