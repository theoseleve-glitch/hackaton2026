import { describe, expect, it } from 'vitest';
import {
  act,
  allOf,
  CONTENT,
  deadline,
  drive,
  game,
  mk,
  nightAck,
  P5,
  P8,
  peek,
  roleOf,
  toNight,
  vote,
  walkUntil,
  witchAct,
  wolfVote,
} from './helpers.js';

describe('roleReveal', () => {
  it('accepts each ack once; duplicates and ghosts are same-reference no-ops', () => {
    const s0 = game.init('s', P5, CONTENT);
    const s1 = game.reduce(s0, act('p1', { kind: 'ackRole' })).state;
    expect(s1.ackRole['p1']).toBe(true);
    expect(game.reduce(s1, act('p1', { kind: 'ackRole' })).state).toBe(s1);
    expect(game.reduce(s1, act('ghost', { kind: 'ackRole' })).state).toBe(s1);
  });

  it('all alive∧connected acks start night 0 at the seer step', () => {
    const s0 = game.init('s', P5, CONTENT);
    let s = s0;
    for (const p of P5) s = game.reduce(s, act(p, { kind: 'ackRole' })).state;
    expect(s.phase).toBe('nightSeer');
    expect(game.phaseKey(s)).toBe('night:r0:seer');
    expect(game.phaseDurationMs(s)).toBe(25_000);
  });

  it('the deadline proceeds with unacked players anyway', () => {
    const s0 = game.init('s', P5, CONTENT);
    const s1 = game.reduce(s0, deadline(1)).state;
    expect(s1.phase).toBe('nightSeer');
  });
});

describe('night decoy protocol', () => {
  it('any alive player may nightAck once; duplicates, dead and ghosts are same-reference', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const villager = allOf(s0, 'villager')[0]!;
    const s1 = game.reduce(s0, nightAck(villager)).state;
    expect(s1.nightActed[villager]).toBe(true);
    expect(game.reduce(s1, nightAck(villager)).state).toBe(s1);
    expect(game.reduce(s1, nightAck('ghost')).state).toBe(s1);
  });

  it('the sub-phase ends when every alive∧connected player acted', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const seer = roleOf(s0, 'seer');
    const others = P5.filter((p) => p !== seer);
    let s = s0;
    for (const p of others) s = game.reduce(s, nightAck(p)).state;
    expect(s.phase).toBe('nightSeer'); // the seer is still expected
    s = game.reduce(s, peek(seer, others[0]!)).state;
    expect(s.phase).toBe('nightWolves');
    expect(game.phaseKey(s)).toBe('night:r0:wolves');
  });
});

describe('nightSeer', () => {
  it('the seer peek logs round/target/isWolf; only the seer may peek', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const seer = roleOf(s0, 'seer');
    const wolf = roleOf(s0, 'wolf');
    const villager = allOf(s0, 'villager')[0]!;
    const s1 = game.reduce(s0, peek(seer, wolf)).state;
    expect(s1.seerLog).toEqual([{ round: 0, target: wolf, isWolf: true }]);
    expect(game.reduce(s0, peek(villager, wolf)).state).toBe(s0);
  });

  it('self-peek, dead/unknown targets and re-peeks are same-reference', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const seer = roleOf(s0, 'seer');
    const wolf = roleOf(s0, 'wolf');
    expect(game.reduce(s0, peek(seer, seer)).state).toBe(s0);
    expect(game.reduce(s0, peek(seer, 'ghost')).state).toBe(s0);
    const s1 = game.reduce(s0, peek(seer, wolf)).state;
    expect(game.reduce(s1, peek(seer, wolf)).state).toBe(s1); // first action locks
    expect(game.reduce(s1, nightAck(seer)).state).toBe(s1);
  });

  it('a peek action outside nightSeer is same-reference', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const seer = roleOf(s0, 'seer');
    const wolves = game.reduce(s0, deadline(2)).state;
    expect(wolves.phase).toBe('nightWolves');
    expect(game.reduce(wolves, peek(seer, roleOf(wolves, 'wolf'))).state).toBe(wolves);
  });
});

describe('nightWolves', () => {
  function toWolves(players = P5, seed = 's') {
    const s0 = toNight(game, game.init(seed, players, CONTENT));
    return game.reduce(s0, deadline(2)).state;
  }

  it('only living wolves vote, never for a wolf; first vote locks', () => {
    const s0 = toWolves();
    const wolf = roleOf(s0, 'wolf');
    const villager = allOf(s0, 'villager')[0]!;
    expect(game.reduce(s0, wolfVote(villager, wolf)).state).toBe(s0);
    const s1 = game.reduce(s0, wolfVote(wolf, villager)).state;
    expect(s1.wolfVotes[wolf]).toBe(villager);
    expect(game.reduce(s1, wolfVote(wolf, allOf(s0, 'villager')[1]!)).state).toBe(s1);
  });

  it('a wolf targeting another wolf is same-reference (8p, two wolves)', () => {
    const s0 = toWolves(P8, 'eight');
    const [w1, w2] = allOf(s0, 'wolf');
    expect(game.reduce(s0, wolfVote(w1!, w2!)).state).toBe(s0);
  });

  it('plurality picks the victim (12p, three wolves: 2 votes beat 1)', () => {
    const players = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);
    const s0 = toWolves(players, 'twelve');
    const [w1, w2, w3] = allOf(s0, 'wolf');
    const [t1, t2] = allOf(s0, 'villager');
    const s1 = drive(game, s0, [wolfVote(w1!, t2!, 1), wolfVote(w2!, t1!, 2), wolfVote(w3!, t1!, 3)]);
    const s2 = game.reduce(s1, deadline(4)).state;
    expect(s2.phase).toBe('nightWitch');
    expect(s2.pendingKill).toBe(t1);
  });

  it('a tie resolves to the earliest first-vote among tied — deterministic, no rng (8p)', () => {
    const s0 = toWolves(P8, 'eight');
    const [w1, w2] = allOf(s0, 'wolf');
    const [t1, t2] = allOf(s0, 'villager');
    const s1 = drive(game, s0, [wolfVote(w1!, t2!, 1), wolfVote(w2!, t1!, 2)]);
    const s2 = game.reduce(s1, deadline(3)).state;
    expect(s2.pendingKill).toBe(t2); // t2 was voted first
  });

  it('zero wolf votes at the deadline means no victim tonight', () => {
    const s0 = toWolves();
    const s1 = game.reduce(s0, deadline(3)).state;
    expect(s1.phase).toBe('nightWitch');
    expect(s1.pendingKill).toBeNull();
  });
});

describe('nightWitch', () => {
  /** Drive to nightWitch with the wolf's kill buffered on `target`. */
  function toWitch(target?: string) {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const wolf = roleOf(s0, 'wolf');
    const victim = target ?? allOf(s0, 'villager')[0]!;
    const s1 = game.reduce(s0, deadline(2)).state;
    const s2 = game.reduce(s1, wolfVote(wolf, victim)).state;
    const s3 = game.reduce(s2, deadline(3)).state;
    expect(s3.phase).toBe('nightWitch');
    expect(s3.pendingKill).toBe(victim);
    return s3;
  }

  it('heal cancels the kill and consumes the single-use potion', () => {
    const s0 = toWitch();
    const witch = roleOf(s0, 'witch');
    const victim = s0.pendingKill!;
    const s1 = game.reduce(s0, witchAct(witch, true, null)).state;
    expect(s1.witchState).toEqual({ healLeft: false, poisonLeft: true });
    const dawn = game.reduce(s1, deadline(4)).state;
    expect(dawn.phase).toBe('dawn');
    expect(dawn.lastDawn).toEqual({ died: [], revealedRoles: {} });
    expect(dawn.alive[victim]).toBe(true);
    // next night: heal is spent — a second heal attempt is same-reference
    const witch2 = walkUntil(game, dawn, (s) => s.phase === 'nightWitch');
    expect(game.reduce(witch2, witchAct(witch, true, null)).state).toBe(witch2);
  });

  it('poison kills any living player; both potions can fire the same night', () => {
    const s0 = toWitch();
    const witch = roleOf(s0, 'witch');
    const victim = s0.pendingKill!;
    const poisoned = allOf(s0, 'villager').find((p) => p !== victim)!;
    const s1 = game.reduce(s0, witchAct(witch, true, poisoned)).state;
    expect(s1.witchState).toEqual({ healLeft: false, poisonLeft: false });
    const dawn = game.reduce(s1, deadline(4)).state;
    expect(dawn.lastDawn?.died).toEqual([poisoned]);
    expect(dawn.alive[victim]).toBe(true);
    expect(dawn.alive[poisoned]).toBe(false);
    expect(dawn.lastDawn?.revealedRoles).toEqual({ [poisoned]: 'villager' });
  });

  it('rejects (same reference) heal with no kill, dead/unknown poison targets, and non-witch actors', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const witch = roleOf(s0, 'witch');
    const wolf = roleOf(s0, 'wolf');
    const noKill = drive(game, s0, [deadline(2), deadline(3)]);
    expect(noKill.phase).toBe('nightWitch');
    expect(noKill.pendingKill).toBeNull();
    expect(game.reduce(noKill, witchAct(witch, true, null)).state).toBe(noKill);
    expect(game.reduce(noKill, witchAct(witch, false, 'ghost')).state).toBe(noKill);
    expect(game.reduce(noKill, witchAct(wolf, false, null)).state).toBe(noKill);
  });

  it('witchSelfHeal=false makes saving herself inert; true allows it', () => {
    const strict = mk({ witchSelfHeal: false });
    const s0 = toNight(strict, strict.init('s', P5, CONTENT));
    const witch = roleOf(s0, 'witch');
    const wolf = roleOf(s0, 'wolf');
    const s1 = drive(strict, s0, [deadline(2), wolfVote(wolf, witch), deadline(3)]);
    expect(s1.pendingKill).toBe(witch);
    expect(strict.reduce(s1, witchAct(witch, true, null)).state).toBe(s1);
    // permissive default config: the same self-heal is accepted
    const p0 = toNight(game, game.init('s', P5, CONTENT));
    const p1 = drive(game, p0, [deadline(2), wolfVote(wolf, witch), deadline(3)]);
    const p2 = game.reduce(p1, witchAct(witch, true, null)).state;
    expect(p2.pendingHealed).toBe(true);
  });

  it('a pass (no heal, no poison) is a valid lock that spends nothing', () => {
    const s0 = toWitch();
    const witch = roleOf(s0, 'witch');
    const s1 = game.reduce(s0, witchAct(witch, false, null)).state;
    expect(s1.nightActed[witch]).toBe(true);
    expect(s1.witchState).toEqual({ healLeft: true, poisonLeft: true });
    expect(game.reduce(s1, witchAct(witch, false, null)).state).toBe(s1);
  });
});

describe('dawn, skip rule, debate, vote, lynch', () => {
  it('dawn publishes deaths with roles iff revealRoleOnDeath, then the deadline opens the debate', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const wolf = roleOf(s0, 'wolf');
    const victim = allOf(s0, 'villager')[0]!;
    const dawn = drive(game, s0, [deadline(2), wolfVote(wolf, victim), deadline(3), deadline(4)]);
    expect(dawn.phase).toBe('dawn');
    expect(game.phaseKey(dawn)).toBe('dawn:r0');
    expect(dawn.lastDawn).toEqual({ died: [victim], revealedRoles: { [victim]: 'villager' } });
    const debate = game.reduce(dawn, deadline(5)).state;
    expect(debate.phase).toBe('debate');
    expect(game.phaseDurationMs(debate)).toBe(90_000);
  });

  it('revealRoleOnDeath=false hides roles at dawn and at the lynch', () => {
    const hidden = mk({ revealRoleOnDeath: false });
    const s0 = toNight(hidden, hidden.init('s', P5, CONTENT));
    const wolf = roleOf(s0, 'wolf');
    const victim = allOf(s0, 'villager')[0]!;
    const dawn = drive(hidden, s0, [deadline(2), wolfVote(wolf, victim), deadline(3), deadline(4)]);
    expect(dawn.lastDawn?.revealedRoles).toBeNull();
    const lynch = walkUntil(hidden, dawn, (s) => s.phase === 'lynchReveal');
    expect(lynch.lastLynch?.revealedRole).toBeNull();
  });

  it('skip rule: a dead seer skips her sub-phase when revealRoleOnDeath=true', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const wolf = roleOf(s0, 'wolf');
    const seer = roleOf(s0, 'seer');
    const lynch = drive(game, s0, [deadline(2), wolfVote(wolf, seer), deadline(3), deadline(4), deadline(5), deadline(6), deadline(7)]);
    expect(lynch.phase).toBe('lynchReveal');
    const night1 = game.reduce(lynch, deadline(8)).state;
    expect(game.phaseKey(night1)).toBe('night:r1:wolves'); // seer step skipped
  });

  it('skip rule: with revealRoleOnDeath=false the dead seer still runs decoy-only', () => {
    const hidden = mk({ revealRoleOnDeath: false });
    const s0 = toNight(hidden, hidden.init('s', P5, CONTENT));
    const wolf = roleOf(s0, 'wolf');
    const seer = roleOf(s0, 'seer');
    const lynch = drive(hidden, s0, [deadline(2), wolfVote(wolf, seer), deadline(3), deadline(4), deadline(5), deadline(6), deadline(7)]);
    const night1 = hidden.reduce(lynch, deadline(8)).state;
    expect(hidden.phaseKey(night1)).toBe('night:r1:seer'); // absence must not leak which role died
    expect(hidden.reduce(night1, peek(seer, wolf)).state).toBe(night1); // ...but the dead seer cannot act
  });

  it('debate: readyToVote toggles end it early; the deadline ends it too', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const debate = walkUntil(game, s0, (s) => s.phase === 'debate');
    const dup = game.reduce(debate, act('p1', { kind: 'readyToVote' })).state;
    expect(game.reduce(dup, act('p1', { kind: 'readyToVote' })).state).toBe(dup);
    let s = dup;
    for (const p of P5.slice(1)) s = game.reduce(s, act(p, { kind: 'readyToVote' })).state;
    expect(s.phase).toBe('vote');
    expect(s.votes).toEqual({});
  });

  it('vote: dead voters, dead targets, self-votes and re-votes are same-reference', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const wolf = roleOf(s0, 'wolf');
    const victim = allOf(s0, 'villager')[0]!;
    const phase = drive(game, s0, [deadline(2), wolfVote(wolf, victim), deadline(3), deadline(4), deadline(5), deadline(6)]);
    expect(phase.phase).toBe('vote');
    expect(game.reduce(phase, vote(victim, wolf)).state).toBe(phase); // dead voter
    expect(game.reduce(phase, vote(wolf, victim)).state).toBe(phase); // dead target
    expect(game.reduce(phase, vote(wolf, wolf)).state).toBe(phase); // self
    const s1 = game.reduce(phase, vote(wolf, roleOf(phase, 'seer'))).state;
    expect(game.reduce(s1, vote(wolf, roleOf(phase, 'witch'))).state).toBe(s1); // first vote locks
  });

  it('a unique plurality evicts and reveals; the abstainers are listed', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const wolf = roleOf(s0, 'wolf');
    const seer = roleOf(s0, 'seer');
    const witch = roleOf(s0, 'witch');
    const phase = walkUntil(game, s0, (s) => s.phase === 'vote');
    const s1 = drive(game, phase, [vote(seer, wolf, 1), vote(witch, wolf, 2)]);
    const s2 = game.reduce(s1, deadline(3)).state;
    expect(s2.phase).toBe('lynchReveal');
    expect(s2.lastLynch?.evicted).toBe(wolf);
    expect(s2.lastLynch?.revealedRole).toBe('wolf');
    expect(s2.lastLynch?.tally).toEqual({ [wolf]: 2 });
    expect(s2.lastLynch?.abstained.sort()).toEqual(
      P5.filter((p) => p !== seer && p !== witch).sort(),
    );
    expect(s2.alive[wolf]).toBe(false);
  });

  it('a tie at the top means no lynch — deterministic, no revote', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const wolf = roleOf(s0, 'wolf');
    const seer = roleOf(s0, 'seer');
    const witch = roleOf(s0, 'witch');
    const phase = walkUntil(game, s0, (s) => s.phase === 'vote');
    const s1 = drive(game, phase, [vote(seer, wolf, 1), vote(witch, seer, 2)]);
    const s2 = game.reduce(s1, deadline(3)).state;
    expect(s2.lastLynch?.evicted).toBeNull();
    expect(P5.every((p) => s2.alive[p] === true)).toBe(true);
  });

  it('all alive voters voting resolves without waiting for the deadline', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const wolf = roleOf(s0, 'wolf');
    const phase = walkUntil(game, s0, (s) => s.phase === 'vote');
    let s = phase;
    for (const p of P5) {
      const target = p === wolf ? roleOf(s0, 'seer') : wolf;
      s = game.reduce(s, vote(p, target)).state;
    }
    expect(s.phase).toBe('lynchReveal');
    expect(s.lastLynch?.evicted).toBe(wolf);
  });

  it('the lynchReveal deadline emits round_completed and starts the next night at round+1', () => {
    const s0 = toNight(game, game.init('s', P5, CONTENT));
    const lynch = walkUntil(game, s0, (s) => s.phase === 'lynchReveal');
    const { state: night1, effects } = game.reduce(lynch, deadline(50));
    expect(effects).toContainEqual({ type: 'analytics', name: 'round_completed', props: { round: 0 } });
    expect(night1.round).toBe(1);
    expect(game.phaseKey(night1)).toBe('night:r1:seer');
  });
});

describe('deadline liveness', () => {
  it('a fully passive room rolls to over on deadlines alone (maxRounds floor)', () => {
    let s = game.init('s', P5, CONTENT);
    let steps = 0;
    for (; steps < 200 && s.phase !== 'over'; steps++) {
      const next = game.reduce(s, deadline(1_000 + steps)).state;
      if (next === s) break;
      s = next;
    }
    expect(s.phase).toBe('over');
    expect(s.endReason).toBe('maxRounds');
    expect(game.phaseDurationMs(s)).toBeNull();
    expect(game.phaseKey(s)).toBe('over');
  });

  it('every timed phase has a duration; over is the only untimed phase reached', () => {
    let s = game.init('s', P5, CONTENT);
    for (let i = 0; i < 200 && s.phase !== 'over'; i++) {
      expect(game.phaseDurationMs(s)).toBeGreaterThan(0);
      const next = game.reduce(s, deadline(2_000 + i)).state;
      expect(next).not.toBe(s); // a timed phase must never absorb its deadline
      s = next;
    }
    expect(s.phase).toBe('over');
  });

  it('over absorbs every event with the same reference', () => {
    const s = walkUntil(game, game.init('s', P5, CONTENT), (x) => x.phase === 'over');
    expect(game.reduce(s, deadline(9_999)).state).toBe(s);
    expect(game.reduce(s, vote('p1', 'p2')).state).toBe(s);
    expect(game.reduce(s, nightAck('p1')).state).toBe(s);
    expect(game.reduce(s, { type: 'playerLeft', playerId: 'p1', at: 1 }).state).toBe(s);
  });
});
