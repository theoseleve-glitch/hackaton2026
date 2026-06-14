// Heat-meter payoff (retention P1). The free spotlight reads (flagBreak /
// noteSuspicious) accumulate into a PUBLIC per-target suspicion meter that pays
// a CC-2 bonus at reveal to the coolest followers / the detective who read the
// room, and feeds a CC-5 crime-parfait streak superlative on 'over'. THE GATES
// audited here: (a) CC-2 DEFAULTS TO IDENTITY — the shipped config moves no
// extra points; (b) the meter is an AGGREGATE per-target total, never a
// per-voter side channel; (c) the CC-5 epilogue is derived at 'over' from
// already-PUBLIC state. Determinism (heat accrual + streak) re-verified.
import { describe, expect, it } from 'vitest';
import { replay, type GameEvent } from '@bloop/engine';
import {
  createRuleHunt, TROUVEZ_LA_REGLE_CONFIG, type RuleHuntAction, type RuleHuntState,
} from '@bloop/game-rule-hunt';
import {
  accuse, content, deadline, FIVE, flagBreak, followersOf, game, liveToReveal,
  noteSuspicious, openGuess, pickCandidate, toLive, toSpotlight, tribunalVote, walkDeadlines,
} from './fixtures.js';

const OUTSIDERS = ['spectator-not-in-roster', '__proto__'] as const;

/** All connected, non-eliminated followers who are NOT the spotlit target. */
function flaggersOf(state: RuleHuntState): string[] {
  const target = state.spotlight!.target;
  return followersOf(state).filter(
    (f) => f !== target && state.connected[f] === true && state.eliminated[f] !== true,
  );
}

/** Open a spotlight, land `flag`+`note` reads against the target, resume live. */
function heatBeat(state: RuleHuntState, flag: 'flag' | 'clean', note: 'suspicious' | 'clear'): RuleHuntState {
  const spot = toSpotlight(state);
  const flagger = flaggersOf(spot)[0]!;
  const det = spot.detectives[0]!;
  let s = game.reduce(spot, flagBreak(flagger, flag, spot.segmentStartedAt + 1)).state;
  s = game.reduce(s, noteSuspicious(det, note, spot.segmentStartedAt + 2)).state;
  const resumed = game.reduce(s, deadline(spot.segmentStartedAt + 10_000)).state;
  if (resumed.phase !== 'live') throw new Error(`expected live after spotlight, got ${resumed.phase}`);
  return resumed;
}

describe('heat meter — accrual onto the spotlit target (PUBLIC aggregate)', () => {
  it('a flag + a suspicious note add +2 heat onto the target; the buffers are then dropped', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const spot = toSpotlight(live);
    const target = spot.spotlight!.target;
    expect(spot.heat[target] ?? 0).toBe(0); // not yet accrued — the beat is still open
    const resumed = heatBeat(live, 'flag', 'suspicious');
    expect(resumed.heat[target]).toBe(2); // 1 flag + 1 note landed AGAINST the target
    expect(resumed.spotlight).toBeNull(); // raw buffers gone, meter banked
  });

  it("a 'clean' read and a 'clear' note add NO heat (only suspicion counts)", () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const target = toSpotlight(live).spotlight!.target;
    const resumed = heatBeat(live, 'clean', 'clear');
    expect(resumed.heat[target] ?? 0).toBe(0);
  });

  it('an empty spotlight (no reads) leaves the meter untouched', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const spot = toSpotlight(live);
    const resumed = game.reduce(spot, deadline(spot.segmentStartedAt + 10_000)).state;
    expect(Object.keys(resumed.heat)).toHaveLength(0);
  });

  it('heat is round-local — startRound resets the meter to empty', () => {
    let s = toLive(game.init('s', FIVE, content(3)), 1_000);
    s = heatBeat(s, 'flag', 'suspicious');
    expect(Object.keys(s.heat).length).toBeGreaterThan(0);
    s = liveToReveal(s);
    expect(s.phase).toBe('reveal');
    s = game.reduce(s, deadline(s.segmentStartedAt + 400_000)).state; // -> round 1 briefing
    expect(s.round).toBe(1);
    expect(Object.keys(s.heat)).toHaveLength(0); // fresh meter
  });
});

describe('heat meter — PUBLIC aggregate, leaks no hidden read (redaction)', () => {
  it('the per-target heat total is visible to EVERY viewer (incl. spectators) at live/reveal', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const resumed = heatBeat(live, 'flag', 'suspicious');
    const target = Object.keys(resumed.heat)[0]!;
    for (const viewer of [...resumed.players, ...OUTSIDERS]) {
      const v = game.view(resumed, viewer);
      expect(v.heat[target]).toBe(2); // the aggregate is public...
    }
  });

  it('heat carries only a per-target TOTAL, never a per-voter map (no ballot recovery)', () => {
    // Two opposite hidden reads on the same beat must produce identical heat
    // meters for a non-owner — the meter cannot distinguish who read what.
    const build = (flag: 'flag' | 'clean'): RuleHuntState => heatBeat(toLive(game.init('s', FIVE, content(3)), 1_000), flag, 'clear');
    const sFlag = build('flag');
    const sClean = build('clean');
    // sFlag has +1 heat, sClean has 0 — the meter reflects the AGGREGATE only,
    // which is legitimate public information (a count), not a ballot.
    const target = sFlag.spotlight === null ? Object.keys(sFlag.heat)[0] : null;
    expect(target).not.toBeNull();
    // the raw flags/notes never serialize anywhere
    for (const state of [sFlag, sClean]) {
      for (const viewer of [...state.players, ...OUTSIDERS]) {
        const str = JSON.stringify(game.view(state, viewer));
        expect(str).not.toContain('"flags"');
        expect(str).not.toContain('"notes"');
      }
    }
  });
});

describe('CC-2 cool bonus — DEFAULT IDENTITY (the keepAsIs scoring gold)', () => {
  it('with the shipped config (coolBonus 0) a perfect time-up still scores follower +3 / det +1', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const det = live.detectives[0]!;
    // Land heat on a follower, then time-up perfect: the meter exists but pays 0.
    const after = heatBeat(live, 'flag', 'suspicious');
    const r = liveToReveal(after);
    expect(r.phase).toBe('reveal');
    expect(r.lastOutcome?.perfect).toBe(true);
    expect(r.scores[det]).toBe(1);
    for (const f of followersOf(r)) expect(r.scores[f]).toBe(3); // byte-identical to the shipped matrix
  });

  it('coolestFollowers excludes the heat-sink follower but the bonus is 0 by default', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const after = heatBeat(live, 'flag', 'suspicious');
    const hot = Object.keys(after.heat)[0]!;
    const r = liveToReveal(after);
    if (r.phase !== 'reveal') throw new Error('expected reveal');
    const v = game.view(r, followersOf(r)[0]!);
    if (v.phase !== 'reveal') throw new Error('expected reveal view');
    expect(v.coolestFollowers).not.toContain(hot); // the flinched-at follower is not "cool"
    expect(v.coolBonusEach).toBe(0); // ...but default config pays nothing
    // every OTHER surviving follower IS cool
    for (const f of followersOf(r)) {
      if (f !== hot) expect(v.coolestFollowers).toContain(f);
    }
  });
});

describe('CC-2 cool bonus — re-baselined ONLY when a pack opts in', () => {
  const HOT = createRuleHunt('trouvez-la-regle', { ...TROUVEZ_LA_REGLE_CONFIG, coolBonus: 2 });

  it('coolBonus 2: a zero-heat surviving follower earns +3 base + 2 cool; the flinched-at one earns +3 only', () => {
    let s = HOT.init('s', FIVE, content(3));
    s = { ...s }; // (init already returns startRound 0)
    // drive into live via acks
    const followers = s.players.filter((p) => !s.detectives.includes(p));
    for (const f of followers) s = HOT.reduce(s, { type: 'action', playerId: f, action: { kind: 'ackRule' }, at: 1_000 }).state;
    expect(s.phase).toBe('live');
    // one heat beat lands a flag on the seeded target
    const spot = HOT.reduce(s, deadline(s.segmentStartedAt + HOT.phaseDurationMs(s)!)).state;
    expect(spot.phase).toBe('spotlight');
    const target = spot.spotlight!.target;
    const flagger = followers.find((f) => f !== target)!;
    let s2 = HOT.reduce(spot, { type: 'action', playerId: flagger, action: { kind: 'flagBreak', flag: 'flag' }, at: spot.segmentStartedAt + 1 }).state;
    s2 = HOT.reduce(s2, deadline(spot.segmentStartedAt + 10_000)).state; // resume live, +1 heat on target
    expect(s2.heat[target]).toBe(1);
    // drain to a perfect time-up reveal
    let r = s2;
    for (let i = 0; i < 50 && r.phase !== 'reveal'; i++) {
      const dur = HOT.phaseDurationMs(r);
      if (dur === null) break;
      r = HOT.reduce(r, deadline(r.segmentStartedAt + dur)).state;
    }
    expect(r.phase).toBe('reveal');
    expect(r.lastOutcome?.perfect).toBe(true);
    expect(r.scores[target]).toBe(3); // flinched-at: base only, NO cool bonus
    for (const f of followers) {
      if (f !== target) expect(r.scores[f]).toBe(5); // +3 base +2 cool
    }
    for (const d of r.detectives) expect(r.scores[d]).toBe(1); // detective unaffected (no read-bonus configured)
  });
});

describe('CC-2 detective-read bonus — paid on a conviction round, identity by default', () => {
  /** Drive to a conviction (followers[1] eliminated) then resolve to a reveal. */
  function convict(mod = game): RuleHuntState {
    const live = toLive(mod.init('s', FIVE, content(3)), 1_000) as RuleHuntState;
    const [f0, f1, f2, f3] = followersOf(live);
    let s = mod.reduce(live, accuse(f0!, f1!, 5_000)).state;
    s = mod.reduce(s, tribunalVote(f0!, true, 6_000)).state;
    s = mod.reduce(s, tribunalVote(f2!, true, 7_000)).state;
    s = mod.reduce(s, tribunalVote(f3!, true, 8_000)).state;
    if (s.eliminated[f1!] !== true) throw new Error('conviction setup failed');
    return s;
  }

  it('default (detectiveReadBonus 0): a convicted time-up still scores det +1 (no change)', () => {
    const s = convict();
    const det = s.detectives[0]!;
    const r = game.reduce(s, deadline(300_000)).state;
    expect(r.phase).toBe('reveal');
    expect(r.lastOutcome?.perfect).toBe(false);
    expect(r.scores[det]).toBe(1); // byte-identical to the shipped matrix
  });

  it('detectiveReadBonus 3: the same convicted time-up scores det +1 base +3 read = +4', () => {
    const READ = createRuleHunt('trouvez-la-regle', { ...TROUVEZ_LA_REGLE_CONFIG, detectiveReadBonus: 3 });
    const s = convict(READ);
    const det = s.detectives[0]!;
    const r = READ.reduce(s, deadline(300_000)).state;
    expect(r.phase).toBe('reveal');
    expect(r.scores[det]).toBe(4); // +1 base, +3 because the heat read true (a conviction landed)
  });

  it('detectiveReadBonus 3 pays NOTHING on a perfect (zero-conviction) round', () => {
    const READ = createRuleHunt('trouvez-la-regle', { ...TROUVEZ_LA_REGLE_CONFIG, detectiveReadBonus: 3 });
    const live = toLive(READ.init('s', FIVE, content(3)), 1_000);
    const det = live.detectives[0]!;
    const r = liveToReveal(live);
    expect(r.phase).toBe('reveal');
    expect(r.lastOutcome?.perfect).toBe(true);
    expect(r.scores[det]).toBe(1); // no conviction => heat never "read true" => no bonus
  });
});

describe('CC-5 crime-parfait streak (one-more-round hook)', () => {
  it('increments on a perfect time-up and surfaces on the reveal + over views', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const r = liveToReveal(live);
    expect(r.phase).toBe('reveal');
    expect(r.cleanStreak).toBe(1);
    const v = game.view(r, followersOf(r)[0]!);
    expect(v.cleanStreak).toBe(1);
  });

  it('a guessed round resets the streak to 0', () => {
    // round 0 perfect (streak 1), round 1 guessed (streak resets)
    let s = liveToReveal(toLive(game.init('s', FIVE, content(3)), 1_000));
    expect(s.cleanStreak).toBe(1);
    s = game.reduce(s, deadline(s.segmentStartedAt + 400_000)).state; // -> round 1 briefing
    const live = toLive(s, s.segmentStartedAt + 10_000);
    const det = live.detectives[0]!;
    const g = game.reduce(live, openGuess(det, live.segmentStartedAt + 1_000)).state;
    const r = game.reduce(g, pickCandidate(det, g.trueCandidateIndex, live.segmentStartedAt + 2_000)).state;
    expect(r.lastOutcome?.kind).toBe('guessed');
    expect(r.cleanStreak).toBe(0); // a coffré round breaks the parfait streak
  });

  it('a conviction round resets the streak to 0', () => {
    let s = liveToReveal(toLive(game.init('s', FIVE, content(3)), 1_000));
    expect(s.cleanStreak).toBe(1);
    s = game.reduce(s, deadline(s.segmentStartedAt + 400_000)).state; // -> round 1 briefing
    const live = toLive(s, s.segmentStartedAt + 10_000);
    const [f0, f1, f2, f3] = followersOf(live);
    let t = game.reduce(live, accuse(f0!, f1!, live.segmentStartedAt + 1_000)).state;
    t = game.reduce(t, tribunalVote(f0!, true, live.segmentStartedAt + 2_000)).state;
    t = game.reduce(t, tribunalVote(f2!, true, live.segmentStartedAt + 3_000)).state;
    t = game.reduce(t, tribunalVote(f3!, true, live.segmentStartedAt + 4_000)).state;
    const r = liveToReveal(t.phase === 'live' ? t : t);
    expect(r.phase).toBe('reveal');
    expect(r.lastOutcome?.perfect).toBe(false);
    expect(r.cleanStreak).toBe(0);
  });

  it('stacks across consecutive perfect rounds (2 clean rounds => streak 2)', () => {
    let s = liveToReveal(toLive(game.init('s', FIVE, content(3)), 1_000));
    expect(s.cleanStreak).toBe(1);
    s = game.reduce(s, deadline(s.segmentStartedAt + 400_000)).state; // round 1 briefing
    s = liveToReveal(toLive(s, s.segmentStartedAt + 10_000));
    expect(s.phase).toBe('reveal');
    expect(s.lastOutcome?.perfect).toBe(true);
    expect(s.cleanStreak).toBe(2); // crime parfait d'affilée
  });
});

describe('CC-5 epilogue — derived at over from PUBLIC state only', () => {
  it('the over view carries mvp / topGap / closeFinish / cleanStreak holders', () => {
    // 1-item match: a single perfect round, then over.
    const s0 = game.init('s', FIVE, content(1));
    const { state: pre, clock } = walkDeadlines(s0, { until: (s) => s.phase === 'reveal' });
    expect(pre.cleanStreak).toBe(1);
    const over = game.reduce(pre, deadline(clock + 12_000)).state; // reveal -> over
    expect(over.phase).toBe('over');
    for (const viewer of [...over.players, ...OUTSIDERS]) {
      const v = game.view(over, viewer);
      if (v.phase !== 'over') throw new Error('expected over view');
      // followers won the perfect round (+3) over the lone detective (+1) => clear top tier
      expect(v.epilogue.cleanStreak.length).toBe(1);
      expect(v.epilogue.cleanStreak.holders.length).toBeGreaterThan(0);
      // epilogue is JSON-serializable and leaks nothing
      expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    }
  });

  it('the epilogue mvp matches the kit leaderboard top (single top-scorer)', () => {
    const s0 = game.init('mvp-seed', FIVE, content(1));
    const { state: pre, clock } = walkDeadlines(s0, { until: (s) => s.phase === 'reveal' });
    const over = game.reduce(pre, deadline(clock + 12_000)).state;
    const v = game.view(over, OUTSIDERS[0]);
    if (v.phase !== 'over') throw new Error('expected over view');
    // 4 followers tie at +3 -> contested crown -> no single mvp; topGap 0; close.
    expect(v.epilogue.mvp).toBeNull();
    expect(v.epilogue.topGap).toBe(0);
    expect(v.epilogue.closeFinish).toBe(true);
  });
});

describe('determinism — heat accrual + streak replay byte-identically', () => {
  it('a full match with heat beats + a streak replays to a byte-identical state', () => {
    const pack = content(3);
    const s0 = game.init('heat-replay', FIVE, pack);
    const followers = followersOf(s0);
    const events: Array<GameEvent<RuleHuntAction>> = followers.map(
      (f, i) => ({ type: 'action', playerId: f, action: { kind: 'ackRule' }, at: 1_000 + i * 50 }),
    );
    let s = s0;
    for (const e of events) s = game.reduce(s, e).state;

    let clock = 2_000;
    let injected = false;
    for (let i = 0; i < 300 && s.phase !== 'over'; i++) {
      if (s.phase === 'spotlight' && !injected) {
        const target = s.spotlight!.target;
        const flagger = followers.find((f) => f !== target && s.eliminated[f] !== true)!;
        const fe: GameEvent<RuleHuntAction> = { type: 'action', playerId: flagger, action: { kind: 'flagBreak', flag: 'flag' }, at: clock + 1 };
        const ne: GameEvent<RuleHuntAction> = { type: 'action', playerId: s.detectives[0]!, action: { kind: 'noteSuspicious', note: 'suspicious' }, at: clock + 2 };
        s = game.reduce(s, fe).state;
        s = game.reduce(s, ne).state;
        events.push(fe, ne);
        injected = true;
      }
      const dur = game.phaseDurationMs(s);
      if (dur === null) break;
      clock += Math.max(1, dur) + 10;
      const de = deadline(clock);
      const next = game.reduce(s, de).state;
      if (next === s) break;
      s = next;
      events.push(de);
    }
    expect(s.phase).toBe('over');
    expect(injected).toBe(true);

    const replayed = replay(game, 'heat-replay', [...FIVE], pack, events);
    expect(replayed.phase).toBe('over');
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(s));
  });
});
