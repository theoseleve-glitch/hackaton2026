import { describe, expect, it } from 'vitest';
import { leakedSecrets } from '@bloop/engine';
import type { NightDayState } from '@bloop/game-night-day';
import {
  allOf,
  CONTENT,
  deadline,
  drive,
  game,
  peek,
  P5,
  P8,
  roleOf,
  toNight,
  vote,
  walkUntil,
  witchAct,
  wolfVote,
} from './helpers.js';

const OUTSIDERS = ['spectator', '__proto__'];

/**
 * Role-assignment audit values: the PAIR string `"<pid>":"<role>"` as it
 * would serialize inside a leaked roles map. Bare role names cannot be
 * audited by substring (the PUBLIC composition legitimately carries them);
 * the pair form catches a leaked map without false positives.
 */
function roleSecrets(state: NightDayState) {
  return state.players.map((p) => ({ value: `"${p}":"${state.roles[p]}"`, owner: p }));
}

function viewersOf(state: NightDayState): string[] {
  return [...state.players, ...OUTSIDERS];
}

describe('role redaction across phases', () => {
  it('the roles map never leaks into any pre-over view', () => {
    const s0 = game.init('s', P5, CONTENT);
    const wolf = roleOf(s0, 'wolf');
    const seer = roleOf(s0, 'seer');
    const witch = roleOf(s0, 'witch');
    const victim = allOf(s0, 'villager')[0]!;
    let s = s0;
    const checkpoints: NightDayState[] = [s];
    const script = [
      deadline(1), // -> nightSeer
      peek(seer, wolf, 2),
      deadline(3), // -> nightWolves
      wolfVote(wolf, victim, 4),
      deadline(5), // -> nightWitch
      witchAct(witch, false, null, 6),
      deadline(7), // -> dawn
      deadline(8), // -> debate
      deadline(9), // -> vote
      vote(seer, wolf, 10),
      deadline(11), // -> lynchReveal
    ];
    for (const e of script) {
      s = game.reduce(s, e).state;
      checkpoints.push(s);
    }
    expect(s.phase).toBe('lynchReveal');
    for (const state of checkpoints) {
      if (state.phase === 'over') continue;
      // the evicted/dead players' roles go public by design (revealRoleOnDeath) — exempt them
      const dead = state.players.filter((p) => state.alive[p] !== true);
      const secrets = roleSecrets(state).filter((sec) => !dead.includes(sec.owner));
      expect(leakedSecrets(game, state, viewersOf(state), secrets)).toEqual([]);
    }
  });

  it('myRole/myRoleCard are owner-only; spectators and __proto__ get nulls everywhere', () => {
    let s = game.init('s', P5, CONTENT);
    for (let i = 0; i < 200 && s.phase !== 'over'; i++) {
      for (const outsider of OUTSIDERS) {
        const v = game.view(s, outsider);
        expect(v.myRole).toBeNull();
        expect(v.myRoleCard).toBeNull();
        expect(v.wolfPack).toBeNull();
        expect(v.seerLog).toBeNull();
        expect(v.iAmAlive).toBe(false);
        expect(JSON.parse(JSON.stringify(v))).toEqual(v);
      }
      const next = game.reduce(s, deadline(1_000 + i)).state;
      if (next === s) break;
      s = next;
    }
    expect(s.phase).toBe('over');
    // over IS the full reveal — but my* stay null for outsiders
    for (const outsider of OUTSIDERS) {
      const v = game.view(s, outsider);
      expect(v.myRole).toBeNull();
      if (v.phase !== 'over') throw new Error('expected over view');
      expect(Object.keys(v.finalRoles).sort()).toEqual([...P5].sort());
      expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    }
  });
});

describe('decoy protocol (structural)', () => {
  it('actor and non-actor night views carry IDENTICAL key sets in every sub-phase', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const wolf = roleOf(s0, 'wolf');
    const villager = allOf(s0, 'villager')[0]!;
    let s = s0;
    for (const step of ['nightSeer', 'nightWolves', 'nightWitch'] as const) {
      expect(s.phase).toBe(step);
      const keysOf = (viewer: string) => Object.keys(game.view(s, viewer)).sort();
      const reference = keysOf(villager);
      for (const viewer of [...P5, ...OUTSIDERS]) {
        expect(keysOf(viewer)).toEqual(reference);
      }
      expect(game.view(s, wolf).phase).toBe('night');
      s = game.reduce(s, deadline(100)).state;
    }
  });

  it('nightActed booleans are uniform — a real action and a decoy ack are indistinguishable', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const seer = roleOf(s0, 'seer');
    const wolf = roleOf(s0, 'wolf');
    const villager = allOf(s0, 'villager')[0]!;
    const real = game.reduce(s0, peek(seer, wolf)).state;
    const decoy = game.reduce(s0, { type: 'action', playerId: seer, action: { kind: 'nightAck' }, at: 0 }).state;
    const vReal = game.view(real, villager);
    const vDecoy = game.view(decoy, villager);
    expect(vReal).toEqual(vDecoy); // the villager cannot tell a peek from a sleep tap
  });
});

describe('wolfPack — the deliberate asymmetric disclosure', () => {
  it('every wolf sees the pack (alive or dead); nobody else ever does', () => {
    const s0 = game.init('eight', P8, CONTENT);
    const wolves = allOf(s0, 'wolf');
    expect(wolves).toHaveLength(2);
    for (const w of wolves) {
      expect(game.view(s0, w).wolfPack?.sort()).toEqual([...wolves].sort());
    }
    for (const p of P8.filter((x) => !wolves.includes(x))) {
      expect(game.view(s0, p).wolfPack).toBeNull();
    }
    // kill a wolf via lynch: the dead wolf keeps the pack, the others still never see it
    const phase = walkUntil(game, toNight(game, s0), (s) => s.phase === 'vote');
    const voters = P8.filter((p) => p !== wolves[0]);
    const s1 = drive(game, phase, voters.map((p, i) => vote(p, wolves[0]!, i + 1)));
    const s2 = game.reduce(s1, { type: 'action', playerId: wolves[0]!, action: { kind: 'vote', target: wolves[1]! }, at: 99 }).state;
    expect(s2.phase).toBe('lynchReveal');
    expect(s2.alive[wolves[0]!]).toBe(false);
    expect(game.view(s2, wolves[0]!).wolfPack?.sort()).toEqual([...wolves].sort());
    for (const p of P8.filter((x) => !wolves.includes(x))) {
      expect(game.view(s2, p).wolfPack).toBeNull();
    }
  });

  it('live wolf votes are wolves-only, wolves-step-only; a dead wolf loses the huddle', () => {
    const s0 = game.init('eight', P8, CONTENT);
    const [w1, w2] = allOf(s0, 'wolf');
    const target = allOf(s0, 'villager')[0]!;
    const wolvesPhase = walkUntil(game, toNight(game, s0), (s) => s.phase === 'nightWolves');
    const s1 = game.reduce(wolvesPhase, wolfVote(w1!, target)).state;
    const vW2 = game.view(s1, w2!);
    if (vW2.phase !== 'night') throw new Error('expected night view');
    expect(vW2.wolfVotes).toEqual({ [w1!]: target });
    for (const p of [...P8.filter((x) => x !== w1 && x !== w2), ...OUTSIDERS]) {
      const v = game.view(s1, p);
      if (v.phase !== 'night') throw new Error('expected night view');
      expect(v.wolfVotes).toBeNull();
    }
    // outside the wolves step even wolves get null
    const witchPhase = game.reduce(s1, deadline(2)).state;
    expect(witchPhase.phase).toBe('nightWitch');
    const vAfter = game.view(witchPhase, w1!);
    if (vAfter.phase !== 'night') throw new Error('expected night view');
    expect(vAfter.wolfVotes).toBeNull();
  });
});

describe('seerLog and witch secrets', () => {
  it('the seer log is hers alone and survives her death', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const seer = roleOf(s0, 'seer');
    const wolf = roleOf(s0, 'wolf');
    const s1 = game.reduce(s0, peek(seer, wolf)).state;
    expect(game.view(s1, seer).seerLog).toEqual([{ round: 0, target: wolf, isWolf: true }]);
    for (const p of [...P5.filter((x) => x !== seer), ...OUTSIDERS]) {
      expect(game.view(s1, p).seerLog).toBeNull();
    }
    // the wolves eat the seer: she keeps her own log as a ghost
    const dawn = drive(game, s1, [deadline(2), wolfVote(wolf, seer, 3), deadline(4), deadline(5)]);
    expect(dawn.phase).toBe('dawn');
    expect(dawn.alive[seer]).toBe(false);
    expect(game.view(dawn, seer).seerLog).toEqual([{ round: 0, target: wolf, isWolf: true }]);
    expect(game.view(dawn, wolf).seerLog).toBeNull();
  });

  it('pendingKill is disclosed ONLY to the living witch, ONLY during her step', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const wolf = roleOf(s0, 'wolf');
    const witch = roleOf(s0, 'witch');
    const victim = allOf(s0, 'villager')[0]!;
    const s1 = drive(game, s0, [deadline(1), wolfVote(wolf, victim, 2)]);
    // during the WOLVES step nobody sees pendingKill (not even the witch)
    const vMid = game.view(s1, witch);
    if (vMid.phase !== 'night') throw new Error('expected night view');
    expect(vMid.pendingKill).toBeNull();
    const s2 = game.reduce(s1, deadline(3)).state;
    expect(s2.phase).toBe('nightWitch');
    const vWitch = game.view(s2, witch);
    if (vWitch.phase !== 'night') throw new Error('expected night view');
    expect(vWitch.pendingKill).toBe(victim);
    expect(vWitch.witchState).toEqual({ healLeft: true, poisonLeft: true });
    for (const p of [...P5.filter((x) => x !== witch), ...OUTSIDERS]) {
      const v = game.view(s2, p);
      if (v.phase !== 'night') throw new Error('expected night view');
      expect(v.pendingKill).toBeNull();
      expect(v.witchState).toBeNull();
    }
  });
});

describe('lynch ballots stay hidden until the reveal', () => {
  it('mid-vote: hasVoted booleans public, targets owner-echo only; the tally appears at lynchReveal', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const wolf = roleOf(s0, 'wolf');
    const seer = roleOf(s0, 'seer');
    const phase = walkUntil(game, s0, (s) => s.phase === 'vote');
    const s1 = game.reduce(phase, vote(seer, wolf)).state;
    const vSeer = game.view(s1, seer);
    if (vSeer.phase !== 'vote') throw new Error('expected vote view');
    expect(vSeer.myVote).toBe(wolf);
    expect(vSeer.hasVoted[seer]).toBe(true);
    for (const p of [...P5.filter((x) => x !== seer), ...OUTSIDERS]) {
      const v = game.view(s1, p);
      if (v.phase !== 'vote') throw new Error('expected vote view');
      expect(v.myVote).toBeNull();
      expect(v.hasVoted[seer]).toBe(true);
    }
  });

  it("non-voters' views are INVARIANT under ballot changes (structural leak check)", () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const wolf = roleOf(s0, 'wolf');
    const seer = roleOf(s0, 'seer');
    const witch = roleOf(s0, 'witch');
    const phase = walkUntil(game, s0, (s) => s.phase === 'vote');
    const a = drive(game, phase, [vote(seer, wolf, 1), vote(witch, wolf, 2)]);
    const b = drive(game, phase, [vote(seer, witch, 1), vote(witch, seer, 2)]);
    expect(game.phaseKey(a)).toBe(game.phaseKey(b));
    for (const p of [...P5.filter((x) => x !== seer && x !== witch), ...OUTSIDERS]) {
      expect(game.view(a, p)).toEqual(game.view(b, p));
    }
  });
});

describe('night-choice invariance (mirror of the platform audit)', () => {
  it('changing the seer peek and the wolf vote leaves every non-actor view identical', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const wolf = roleOf(s0, 'wolf');
    const seer = roleOf(s0, 'seer');
    const [v1, v2] = allOf(s0, 'villager');
    const a = drive(game, s0, [peek(seer, v1!, 1), deadline(2), wolfVote(wolf, v1!, 3)]);
    const b = drive(game, s0, [peek(seer, v2!, 1), deadline(2), wolfVote(wolf, v2!, 3)]);
    expect(game.phaseKey(a)).toBe(game.phaseKey(b));
    expect(game.phaseKey(a)).toBe('night:r0:wolves');
    // the actors DO see their own differing choices
    expect(JSON.stringify(game.view(a, seer))).not.toBe(JSON.stringify(game.view(b, seer)));
    expect(JSON.stringify(game.view(a, wolf))).not.toBe(JSON.stringify(game.view(b, wolf)));
    for (const p of [...P5.filter((x) => x !== seer && x !== wolf), ...OUTSIDERS]) {
      expect(game.view(a, p)).toEqual(game.view(b, p));
    }
  });
});

describe('hostile roster ids', () => {
  it("a '__proto__' roster player plays without corrupting buffers, maps or scores", () => {
    const weird = ['__proto__', 'p2', 'p3', 'p4', 'p5'];
    const s0 = game.init('s', weird, CONTENT);
    expect(s0.roles['__proto__']).toBeDefined();
    expect(s0.alive['__proto__']).toBe(true);
    const s1 = game.reduce(s0, { type: 'action', playerId: '__proto__', action: { kind: 'ackRole' }, at: 1 }).state;
    expect(s1.ackRole['__proto__']).toBe(true);
    const v = game.view(s1, '__proto__');
    expect(v.myRole).toBe(s0.roles['__proto__']);
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    const over = walkUntil(game, s1, (s) => s.phase === 'over');
    expect(typeof over.scores['__proto__']).toBe('number');
  });
});
