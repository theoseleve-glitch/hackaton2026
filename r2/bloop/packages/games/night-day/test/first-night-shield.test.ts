import { describe, expect, it } from 'vitest';
import { leakedSecrets } from '@bloop/engine';
import type { NightDayState } from '@bloop/game-night-day';
import {
  allOf,
  CONTENT,
  deadline,
  drive,
  game,
  mk,
  P5,
  P8,
  roleOf,
  toNight,
  walkUntil,
  witchAct,
  wolfVote,
} from './helpers.js';

const OUTSIDERS = ['spectator', '__proto__'];

/**
 * P1-1 first-night shield (A/B, opt-in — DEFAULT FALSE). On round 0 a wolf kill
 * is converted to a public "mark" instead of a death: nobody can be a ghost from
 * the literal first dawn. The mark names only a SURVIVOR (no role leak) and the
 * shielded player dies normally if struck again on a later night. Poison and
 * lynch are NEVER shielded. These guards prove:
 *   (a) default-off is byte-identical to the shipped loop (no `marked`, normal kill);
 *   (b) on, round-0 kill → mark-not-death, publicly reported, no role leak;
 *   (c) the mark does NOT shield round 1+ kills, and never shields poison;
 *   (d) win-balance: marked ≠ dead, so winCheck is unaffected on night 1.
 */

const shielded = mk({ firstNightShield: true });

/** Drive a shielded P5 to its first nightWolves with `module`. */
function toWolves(module = shielded, players = P5, seed = 's'): NightDayState {
  const s0 = toNight(module, module.init(seed, players, CONTENT));
  return module.reduce(s0, deadline(2)).state;
}

describe('first-night shield OFF (default) — byte-identical to the shipped loop', () => {
  it('round-0 wolf kill still kills; no marked field is ever set', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT)); // default config: shield off
    const wolf = roleOf(s0, 'wolf');
    const victim = allOf(s0, 'villager')[0]!;
    const dawn = drive(game, s0, [deadline(2), wolfVote(wolf, victim), deadline(3), deadline(4)]);
    expect(dawn.phase).toBe('dawn');
    expect(dawn.alive[victim]).toBe(false); // dies as before
    expect(dawn.lastDawn?.died).toEqual([victim]);
    expect(dawn.lastDawn?.marked).toBeNull();
    expect(dawn.marked).toBeNull();
  });
});

describe('first-night shield ON — round-0 kill becomes a public mark', () => {
  it('the struck player SURVIVES the first dawn and is publicly marked', () => {
    const s0 = toWolves();
    const wolf = roleOf(s0, 'wolf');
    const victim = allOf(s0, 'villager')[0]!;
    const dawn = drive(shielded, s0, [wolfVote(wolf, victim), deadline(3), deadline(4)]);
    expect(dawn.phase).toBe('dawn');
    expect(dawn.round).toBe(0);
    expect(dawn.alive[victim]).toBe(true); // NOT dead — shielded
    expect(dawn.lastDawn?.died).toEqual([]);
    expect(dawn.lastDawn?.revealedRoles).toEqual({}); // nobody died => no role revealed
    expect(dawn.lastDawn?.marked).toBe(victim); // public "attacked but survived"
    expect(dawn.marked).toBe(victim);
  });

  it('the mark names only a survivor — it leaks no role (the marked player is a villager here, but the wolf is never named)', () => {
    const s0 = toWolves();
    const wolf = roleOf(s0, 'wolf');
    const victim = allOf(s0, 'villager')[0]!;
    const dawn = drive(shielded, s0, [wolfVote(wolf, victim), deadline(3), deadline(4)]);
    // the marked player's role is NOT in the public report (mark != death)
    expect(dawn.lastDawn?.revealedRoles).toEqual({});
    // and the marked player is still alive in every viewer's seats
    for (const viewer of [...P5, ...OUTSIDERS]) {
      const v = shielded.view(dawn, viewer);
      const seat = v.seats.find((x) => x.id === victim)!;
      expect(seat.alive).toBe(true);
    }
  });

  it('declared role secrets still never leak with the shield on (full match)', () => {
    const s0 = shielded.init('shield-seed', P5, CONTENT);
    let s = toNight(shielded, s0);
    const checkpoints: NightDayState[] = [];
    for (let i = 0; i < 60 && s.phase !== 'over'; i++) {
      const next = shielded.reduce(s, deadline(1_000 + i)).state;
      if (next === s) break;
      s = next;
      checkpoints.push(s);
    }
    const roleSecrets = (state: NightDayState) => {
      const dead = state.players.filter((p) => state.alive[p] !== true);
      return state.players
        .filter((p) => !dead.includes(p))
        .map((p) => ({ value: `"${p}":"${state.roles[p]}"`, owner: p }));
    };
    for (const state of checkpoints) {
      if (state.phase === 'over') continue;
      expect(leakedSecrets(shielded, state, [...state.players, ...OUTSIDERS], roleSecrets(state))).toEqual([]);
    }
  });
});

describe('first-night shield ON — the shield is round-0 ONLY', () => {
  it('a kill on round 1 is a normal death (the shield is spent after night 0)', () => {
    const s0 = toWolves();
    const wolf = roleOf(s0, 'wolf');
    const victim = allOf(s0, 'villager')[0]!;
    // night 0: strike victim -> marked, not dead.
    let s = drive(shielded, s0, [wolfVote(wolf, victim), deadline(3), deadline(4)]);
    expect(s.alive[victim]).toBe(true);
    // walk to night 1's wolves step, strike a DIFFERENT living villager -> real death.
    s = walkUntil(shielded, s, (x) => x.phase === 'nightWolves' && x.round === 1);
    const victim2 = allOf(s, 'villager').find((p) => p !== victim)!;
    const dawn1 = walkUntil(shielded, shielded.reduce(s, wolfVote(wolf, victim2, 50)).state, (x) => x.phase === 'dawn');
    expect(dawn1.round).toBe(1);
    expect(dawn1.alive[victim2]).toBe(false); // killed normally on round 1
    expect(dawn1.lastDawn?.died).toEqual([victim2]);
    expect(dawn1.lastDawn?.marked).toBeNull(); // no marking after round 0
  });

  it('the marked player dies if the wolves strike them AGAIN on a later night', () => {
    const s0 = toWolves();
    const wolf = roleOf(s0, 'wolf');
    const victim = allOf(s0, 'villager')[0]!;
    let s = drive(shielded, s0, [wolfVote(wolf, victim), deadline(3), deadline(4)]);
    expect(s.marked).toBe(victim);
    s = walkUntil(shielded, s, (x) => x.phase === 'nightWolves' && x.round === 1);
    const dawn1 = walkUntil(shielded, shielded.reduce(s, wolfVote(wolf, victim, 60)).state, (x) => x.phase === 'dawn');
    expect(dawn1.alive[victim]).toBe(false); // re-targeted -> dies
    expect(dawn1.lastDawn?.died).toEqual([victim]);
  });
});

describe('first-night shield ON — poison and win-balance are unaffected', () => {
  it('witch poison still kills on round 0 (only the wolf kill is shielded)', () => {
    const s0 = toWolves();
    const wolf = roleOf(s0, 'wolf');
    const witch = roleOf(s0, 'witch');
    const victim = allOf(s0, 'villager')[0]!;
    const poisoned = allOf(s0, 'villager').find((p) => p !== victim)!;
    const witchPhase = walkUntil(shielded, shielded.reduce(s0, wolfVote(wolf, victim, 3)).state, (x) => x.phase === 'nightWitch');
    expect(witchPhase.pendingKill).toBe(victim);
    const dawn = walkUntil(shielded, shielded.reduce(witchPhase, witchAct(witch, false, poisoned, 4)).state, (x) => x.phase === 'dawn');
    // wolf-struck villager is shielded (alive + marked); the POISONED one still dies.
    expect(dawn.alive[victim]).toBe(true);
    expect(dawn.lastDawn?.marked).toBe(victim);
    expect(dawn.alive[poisoned]).toBe(false);
    expect(dawn.lastDawn?.died).toEqual([poisoned]);
  });

  it('marked != dead: the night-0 win-check is unchanged (no premature village/wolf swing)', () => {
    // 8p, two wolves: a round-0 strike that would normally remove a villager
    // leaves the alive-count untouched, so winCheck cannot end early on night 0.
    const s0 = toWolves(shielded, P8, 'eight');
    const [w1] = allOf(s0, 'wolf');
    const victim = allOf(s0, 'villager')[0]!;
    const dawn = walkUntil(shielded, shielded.reduce(s0, wolfVote(w1!, victim, 3)).state, (x) => x.phase === 'dawn');
    expect(dawn.alive[victim]).toBe(true);
    // every one of the 8 seats is still alive at the first dawn
    expect(P8.every((p) => dawn.alive[p] === true)).toBe(true);
    const after = shielded.reduce(dawn, deadline(99)).state;
    expect(after.phase).toBe('debate'); // game continues — no early over
  });
});
