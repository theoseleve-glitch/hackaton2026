import { describe, expect, it } from 'vitest';
import { leakedSecrets } from '@bloop/engine';
import type { NightDayState } from '@bloop/game-night-day';
import {
  allOf,
  CONTENT,
  deadline,
  drive,
  game,
  nightAck,
  nightRead,
  P5,
  peek,
  roleOf,
  toNight,
  vote,
  walkUntil,
  wolfVote,
} from './helpers.js';

const OUTSIDERS = ['spectator', '__proto__'];

/**
 * CC-1 "Night Read" keystone (P0-2). A living NON-ACTOR secretly marks who they
 * think is a wolf during a night sub-phase; the read locks the seat
 * byte-identically to the nightAck decoy and resolves at `over` for a cosmetic
 * accuracy stat. These guards prove the three keystone invariants:
 *   (a) the read NEVER leaks to a non-owner (strictly-more-hidden than wolfVotes);
 *   (b) it NEVER changes the primary all-acted early-resolve (a read == a nightAck lock);
 *   (c) reject-invalid (wrong phase / ineligible actor / self / dead target /
 *       duplicate) returns the SAME state reference.
 */

/** Drive an init'd P5 to its first night sub-phase (nightSeer). */
function night0(seed = 's'): NightDayState {
  return toNight(game, game.init(seed, P5, CONTENT));
}

/**
 * Drive past night 0 with the wolf eating `victim`, then to night 1's seer step
 * (victim is now dead). Used to exercise dead-reader / dead-target rejections.
 */
function night1AfterDeath(victim: string): NightDayState {
  const s0 = night0();
  const wolf = roleOf(s0, 'wolf');
  const wolves = walkUntil(game, s0, (s) => s.phase === 'nightWolves');
  const killed = game.reduce(wolves, wolfVote(wolf, victim, 1)).state;
  return walkUntil(game, killed, (s) => s.phase === 'nightSeer' && s.round === 1);
}

describe('Night Read — locks the seat exactly like the decoy (no early-resolve change)', () => {
  it('a read locks the seat identically to a nightAck (same nightActed entry)', () => {
    const s0 = night0();
    const villager = allOf(s0, 'villager')[0]!;
    const wolf = roleOf(s0, 'wolf');
    const read = game.reduce(s0, nightRead(villager, wolf)).state;
    const ack = game.reduce(s0, nightAck(villager)).state;
    expect(read.nightActed[villager]).toBe(true);
    expect(ack.nightActed[villager]).toBe(true);
    // identical PUBLIC acted-lock booleans across both paths
    expect(read.nightActed).toEqual(ack.nightActed);
  });

  it('the all-acted exit fires on the SAME tap count whether non-actors read or ack', () => {
    // Reference run: every non-actor nightAcks, the seer peeks last -> exits to wolves.
    const ref = night0();
    const seer = roleOf(ref, 'seer');
    const wolf = roleOf(ref, 'wolf');
    const nonSeer = P5.filter((p) => p !== seer);
    let sAck = ref;
    for (const p of nonSeer) sAck = game.reduce(sAck, nightAck(p)).state;
    expect(sAck.phase).toBe('nightSeer'); // seer still expected
    sAck = game.reduce(sAck, peek(seer, wolf)).state;
    expect(sAck.phase).toBe('nightWolves');

    // Mirror run: the same non-actors READ instead of ack — identical exit point.
    // Each reads a NON-SELF living suspect (the seer is never in nonSeer, so it is
    // always a valid target); the wolf reading himself would self-reject and not lock.
    let sRead = ref;
    for (const p of nonSeer) sRead = game.reduce(sRead, nightRead(p, seer)).state;
    expect(sRead.phase).toBe('nightSeer'); // STILL waiting on the seer — read didn't early-resolve
    sRead = game.reduce(sRead, peek(seer, wolf)).state;
    expect(sRead.phase).toBe('nightWolves');
    expect(game.phaseKey(sRead)).toBe('night:r0:wolves');
  });

  it('a non-actor read does NOT mark the actor acted — the actor still gates the phase', () => {
    const s0 = night0();
    const seer = roleOf(s0, 'seer');
    const wolf = roleOf(s0, 'wolf');
    // every non-seer reads a non-self suspect; the seer has NOT acted -> phase must not advance
    let s = s0;
    for (const p of P5.filter((x) => x !== seer)) {
      const target = p === wolf ? seer : wolf; // avoid a self-read for the wolf
      s = game.reduce(s, nightRead(p, target)).state;
    }
    expect(s.phase).toBe('nightSeer');
    expect(s.nightActed[seer]).toBeUndefined();
  });

  it('the acted booleans are uniform — a read and a decoy ack are indistinguishable to others', () => {
    const s0 = night0();
    const v1 = allOf(s0, 'villager')[0]!;
    const v2 = allOf(s0, 'villager')[1]!;
    const wolf = roleOf(s0, 'wolf');
    const read = game.reduce(s0, nightRead(v1, wolf)).state;
    const ack = game.reduce(s0, nightAck(v1)).state;
    // a DIFFERENT viewer cannot tell a read from a sleep tap
    expect(game.view(read, v2)).toEqual(game.view(ack, v2));
  });
});

describe('Night Read — reject-invalid returns the SAME state reference', () => {
  it('wrong phase: a read outside a night sub-phase is same-reference', () => {
    const s0 = game.init('s', P5, CONTENT); // roleReveal
    const wolf = roleOf(s0, 'wolf');
    const villager = allOf(s0, 'villager')[0]!;
    expect(game.reduce(s0, nightRead(villager, wolf)).state).toBe(s0);
    // debate phase too
    const debate = walkUntil(game, night0(), (s) => s.phase === 'debate');
    expect(game.reduce(debate, nightRead(villager, wolf)).state).toBe(debate);
  });

  it('ineligible: the current sub-phase ACTOR cannot read (acts via their real action)', () => {
    const s0 = night0(); // nightSeer
    const seer = roleOf(s0, 'seer');
    const wolf = roleOf(s0, 'wolf');
    expect(game.reduce(s0, nightRead(seer, wolf)).state).toBe(s0);
    // wolves step: a wolf is the actor and cannot read
    const wolves = game.reduce(s0, deadline(2)).state;
    expect(wolves.phase).toBe('nightWolves');
    const villager = allOf(s0, 'villager')[0]!;
    expect(game.reduce(wolves, nightRead(wolf, villager)).state).toBe(wolves);
  });

  it('self-read, dead target, unknown target are same-reference', () => {
    const s0 = night0();
    const villager = allOf(s0, 'villager')[0]!;
    expect(game.reduce(s0, nightRead(villager, villager)).state).toBe(s0); // self
    expect(game.reduce(s0, nightRead(villager, 'ghost')).state).toBe(s0); // unknown
    // a dead-target read after a death
    const victim = allOf(s0, 'villager')[1]!;
    const night1 = night1AfterDeath(victim);
    expect(night1.alive[victim]).toBe(false);
    const reader = allOf(night1, 'villager').find((p) => p !== victim)!;
    expect(game.reduce(night1, nightRead(reader, victim)).state).toBe(night1); // dead target
  });

  it('duplicate: a second read (or ack) after a read is same-reference (one stake/round)', () => {
    const s0 = night0();
    const villager = allOf(s0, 'villager')[0]!;
    const wolf = roleOf(s0, 'wolf');
    const other = allOf(s0, 'villager')[1]!;
    const s1 = game.reduce(s0, nightRead(villager, wolf)).state;
    expect(game.reduce(s1, nightRead(villager, other)).state).toBe(s1); // re-read rejected
    expect(game.reduce(s1, nightAck(villager)).state).toBe(s1); // already locked
  });

  it('dead reader and ghost reader are same-reference', () => {
    const s0 = night0();
    const victim = allOf(s0, 'villager')[0]!;
    const target = allOf(s0, 'villager')[1]!;
    const night1 = night1AfterDeath(victim);
    expect(night1.alive[victim]).toBe(false);
    expect(game.reduce(night1, nightRead(victim, target)).state).toBe(night1); // dead reader
    expect(game.reduce(night1, nightRead('ghost', target)).state).toBe(night1); // off-roster
  });
});

describe('Night Read — never leaks to a non-owner (full viewer matrix)', () => {
  it('the read is owner-only echo; no other view carries the value (no public count)', () => {
    const s0 = night0();
    const reader = allOf(s0, 'villager')[0]!;
    const wolf = roleOf(s0, 'wolf');
    const s1 = game.reduce(s0, nightRead(reader, wolf)).state;
    const vOwner = game.view(s1, reader);
    if (vOwner.phase !== 'night') throw new Error('expected night view');
    expect(vOwner.myNightRead).toBe(wolf); // owner sees own read
    for (const p of [...P5.filter((x) => x !== reader), ...OUTSIDERS]) {
      const v = game.view(s1, p);
      if (v.phase !== 'night') throw new Error('expected night view');
      expect(v.myNightRead).toBeNull(); // never another player's read
      // no public read-count exists to disclose, so the read channel is empty for a non-owner.
      // the wolf id (the read VALUE) must not appear via the read channel for a non-owner.
      // (the wolf himself legitimately sees his own pack, so exempt him.)
      if (p !== wolf && !OUTSIDERS.includes(p)) {
        expect(JSON.stringify({ myNightRead: v.myNightRead })).not.toContain(wolf);
      }
    }
  });

  it('leakedSecrets: every placed read is invisible to all non-owners across a full match', () => {
    // Build a match where on EACH night every living non-actor reads the wolf.
    const s0 = game.init('leak-seed', P5, CONTENT);
    const wolf = roleOf(s0, 'wolf');
    let s = toNight(game, s0);
    const checkpoints: NightDayState[] = [];
    // Drive several night/day cycles, placing a read for each living non-actor each night step.
    for (let guard = 0; guard < 60 && s.phase !== 'over'; guard++) {
      if (s.phase === 'nightSeer' || s.phase === 'nightWolves' || s.phase === 'nightWitch') {
        // every living non-actor that hasn't yet locked places a read on the wolf
        let progressed = false;
        for (const p of s.players) {
          if (s.alive[p] !== true) continue;
          if (s.nightActed[p] === true) continue;
          const next = game.reduce(s, nightRead(p, wolf)).state;
          if (next !== s) {
            s = next;
            progressed = true;
            checkpoints.push(s);
            if (s.phase !== 'nightSeer' && s.phase !== 'nightWolves' && s.phase !== 'nightWitch') break;
          }
        }
        if (!progressed) s = game.reduce(s, deadline(1_000 + guard)).state; // actor only -> deadline
      } else {
        s = game.reduce(s, deadline(1_000 + guard)).state;
      }
      checkpoints.push(s);
    }
    // The read VALUE (the wolf id) is a per-reader secret. Audit it against every viewer:
    // for every checkpoint, no non-owner view may contain a foreign reader's read of the wolf.
    // We model each reader's read as a secret owned by that reader; the value is the wolf id,
    // but the wolf legitimately appears (pack/seats), so audit the read PAIR string instead.
    for (const state of checkpoints) {
      if (state.phase === 'over') continue;
      const buffer = state.nightReads[state.round] ?? {};
      const secrets = Object.keys(buffer).map((reader) => ({
        // the exact pair as it would serialize inside a leaked reads buffer
        value: `"${reader}":"${buffer[reader as unknown as number] as unknown as string}"`,
        owner: reader,
      }));
      if (secrets.length === 0) continue;
      const viewers = [...state.players, ...OUTSIDERS];
      expect(leakedSecrets(game, state, viewers, secrets)).toEqual([]);
    }
  });

  it('non-owner views are INVARIANT under read changes (structural leak check)', () => {
    const s0 = night0();
    const seer = roleOf(s0, 'seer');
    const wolf = roleOf(s0, 'wolf');
    const [v1, v2] = allOf(s0, 'villager');
    // run A: v1 reads the wolf; run B: v1 reads v2 — a non-owner must not be able to tell.
    const a = game.reduce(s0, nightRead(v1!, wolf)).state;
    const b = game.reduce(s0, nightRead(v1!, v2!)).state;
    expect(game.phaseKey(a)).toBe(game.phaseKey(b));
    // the reader (owner) DOES see their differing read
    expect(JSON.stringify(game.view(a, v1!))).not.toBe(JSON.stringify(game.view(b, v1!)));
    for (const p of [...P5.filter((x) => x !== v1), ...OUTSIDERS]) {
      expect(game.view(a, p)).toEqual(game.view(b, p));
    }
    // ...and the seer (the step actor) is also blind to the read content
    expect(game.view(a, seer)).toEqual(game.view(b, seer));
  });
});

describe('Night Read — view key parity (anti-shoulder-surf invariant preserved)', () => {
  it('actor and non-actor night views carry IDENTICAL key sets, with or without a read', () => {
    const s0 = night0();
    const seer = roleOf(s0, 'seer');
    const villager = allOf(s0, 'villager')[0]!;
    const wolf = roleOf(s0, 'wolf');
    // before any read
    const keysOf = (state: NightDayState, viewer: string) => Object.keys(game.view(state, viewer)).sort();
    const ref0 = keysOf(s0, villager);
    for (const viewer of [...P5, ...OUTSIDERS]) expect(keysOf(s0, viewer)).toEqual(ref0);
    // after a villager reads (a non-actor) and the seer peeks (the actor) — still
    // nightSeer (the witch + remaining seats have not locked) but keys stay uniform.
    const s1 = game.reduce(s0, nightRead(villager, wolf)).state;
    const s2 = game.reduce(s1, peek(seer, wolf)).state;
    expect(s2.phase).toBe('nightSeer'); // not all locked yet — read never early-resolves
    const ref2 = keysOf(s2, allOf(s2, 'villager')[1]!);
    for (const viewer of [...P5, ...OUTSIDERS]) expect(keysOf(s2, viewer)).toEqual(ref2);
    // the actor (seer) and the reader (villager) carry the SAME keys as everyone else
    expect(keysOf(s2, seer)).toEqual(ref2);
    expect(keysOf(s2, villager)).toEqual(ref2);
    // the read field is part of the uniform key set (and there is NO public count key)
    expect(ref2).toContain('myNightRead');
    expect(ref2).not.toContain('nightReadCount');
  });
});

describe('Night Read — resolves cosmetically at over (never perturbs the 0-3 placement scores)', () => {
  it('the over view exposes per-player accuracy; placement scores are unchanged', () => {
    // A controlled village win where the night-1 reads point at the wolf.
    const s0 = game.init('s', P5, CONTENT);
    const wolf = roleOf(s0, 'wolf');
    const victim = allOf(s0, 'villager')[0]!;
    const seer = roleOf(s0, 'seer');
    const witch = roleOf(s0, 'witch');
    const cleanVillager = allOf(s0, 'villager').find((p) => p !== victim)!;
    let s = toNight(game, s0);
    // night 0 seer step: cleanVillager + witch read the wolf (correct); victim reads
    // wrong (the seer). The wolf (a non-actor here) just acks; the seer peeks. All five
    // seats lock -> the sub-phase early-resolves to nightWolves exactly as nightAck would.
    s = drive(game, s, [
      nightRead(cleanVillager, wolf, 1),
      nightRead(witch, wolf, 2),
      nightRead(victim, seer, 3),
      nightAck(wolf, 4),
      peek(seer, wolf, 5),
    ]);
    expect(s.phase).toBe('nightWolves');
    // wolf eats the victim; then the village lynches the wolf -> villageWins
    s = game.reduce(s, wolfVote(wolf, victim, 5)).state;
    s = walkUntil(game, s, (x) => x.phase === 'vote');
    for (const p of P5.filter((x) => x !== wolf && x !== victim)) {
      s = game.reduce(s, vote(p, wolf)).state;
    }
    s = walkUntil(game, s, (x) => x.phase === 'over');
    expect(s.winners).toBe('village');
    expect(s.endReason).toBe('villageWins');

    // placement scores are the EXACT 0-3 scale (wolf 0, dead village +1, living village +2)
    const expectedScores: Record<string, number> = {};
    for (const p of P5) expectedScores[p] = p === wolf ? 0 : p === victim ? 1 : 2;
    expect(s.scores).toEqual(expectedScores);

    const v = game.view(s, cleanVillager);
    if (v.phase !== 'over') throw new Error('expected over view');
    // cosmetic accuracy is a SEPARATE field, derived from the reads, not the scores
    expect(v.nightReadAccuracy[cleanVillager]).toBe(1); // clocked the wolf
    expect(v.nightReadAccuracy[witch]).toBe(1);
    expect(v.nightReadAccuracy[victim]).toBe(0); // read the seer, not a wolf
    expect(v.nightReadAccuracy[wolf]).toBe(0); // never read
    expect(v.nightReadAccuracy[seer]).toBe(0);
    // the cosmetic stat did NOT bleed into placement scores
    expect(v.scores).toEqual(expectedScores);
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });

  it('a player with no reads has zero accuracy; the map covers the full roster', () => {
    const s = walkUntil(game, game.init('s', P5, CONTENT), (x) => x.phase === 'over');
    const v = game.view(s, 'p1');
    if (v.phase !== 'over') throw new Error('expected over view');
    expect(Object.keys(v.nightReadAccuracy).sort()).toEqual([...P5].sort());
    for (const p of P5) expect(v.nightReadAccuracy[p]).toBe(0);
  });
});
