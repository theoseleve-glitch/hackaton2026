// Heat-check forced-spotlight micro-beat (retention P0-2). The reducer stages a
// SEEDED follower every ~heatMs of live time and forces a free, soft read from
// everyone — banking the live clock exactly like an accusation so no live time
// is lost. THE THREE GUARDS audited here: (a) the flag/note never leaks to a
// non-owner; (b) the soft read never gates the primary early-resolve (a
// spotlight ends ONLY on its own deadline); (c) every reject-invalid returns the
// SAME state reference.
import { describe, expect, it } from 'vitest';
import { replay, type GameEvent } from '@bloop/engine';
import { createRuleHunt, TROUVEZ_LA_REGLE_CONFIG, type RuleHuntAction, type RuleHuntState } from '@bloop/game-rule-hunt';
import {
  ack, content, deadline, FIVE, flagBreak, followersOf, game, left, noteSuspicious,
  openGuess, toLive, toSpotlight,
} from './fixtures.js';

const OUTSIDERS = ['spectator-not-in-roster', '__proto__'] as const;

/** All connected, non-eliminated followers who are NOT the spotlit target. */
function flaggersOf(state: RuleHuntState): string[] {
  const target = state.spotlight!.target;
  return followersOf(state).filter(
    (f) => f !== target && state.connected[f] === true && state.eliminated[f] !== true,
  );
}

describe('entering the spotlight (heat-check cadence)', () => {
  it('a live deadline with bank + quorum stages a spotlight, banking the clock like an accusation', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    expect(game.phaseDurationMs(live)).toBe(24_000); // armed at the heat cadence
    const { state: spot, effects } = game.reduce(live, deadline(25_000)); // 24s elapsed
    expect(spot.phase).toBe('spotlight');
    expect(spot.liveRemainingMs).toBe(180_000 - 24_000); // banked exactly like accuse
    expect(spot.interruptSeq).toBe(1);
    expect(spot.spotlight).not.toBeNull();
    expect(spot.players).toContain(spot.spotlight!.target);
    expect(game.phaseKey(spot)).toBe('spotlight:r0:i1');
    expect(game.phaseDurationMs(spot)).toBe(10_000); // spotlightMs
    expect(effects).toEqual([{ type: 'analytics', name: 'spotlight_opened', props: { round: 0, seq: 0 } }]);
  });

  it('the spotlit target is a connected, non-eliminated FOLLOWER (never a detective)', () => {
    const spot = toSpotlight(toLive(game.init('s', FIVE, content(3)), 1_000));
    const t = spot.spotlight!.target;
    expect(followersOf(spot)).toContain(t);
    expect(spot.detectives).not.toContain(t);
    expect(spot.connected[t]).toBe(true);
    expect(spot.eliminated[t]).not.toBe(true);
  });

  it('a spotlight ALWAYS resumes live with the banked remainder — it never reveals/ends the round', () => {
    const spot = toSpotlight(toLive(game.init('s', FIVE, content(3)), 1_000));
    const bankBefore = spot.liveRemainingMs;
    const { state: resumed, effects } = game.reduce(spot, deadline(spot.segmentStartedAt + 10_000));
    expect(resumed.phase).toBe('live'); // NOT reveal
    expect(resumed.liveRemainingMs).toBe(bankBefore); // spotlight time does not drain the live bank
    expect(resumed.liveSeg).toBe(1);
    expect(resumed.spotlight).toBeNull();
    expect(resumed.spotlightCount).toBe(1); // advances the seeded pick
    expect(effects).toEqual([]);
  });

  it('the final live slice (bank <= heatMs) exhausts to reveal, never a 0ms spotlight', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    // Hand-set a tiny remaining bank: the live segment arms at the bank, and its
    // deadline truly exhausts the clock -> reveal timeUp (no spotlight staged).
    const tiny: RuleHuntState = { ...live, liveRemainingMs: 5_000, segmentStartedAt: 1_000 };
    expect(game.phaseDurationMs(tiny)).toBe(5_000);
    const { state: r } = game.reduce(tiny, deadline(6_000)); // 5s elapsed = full bank
    expect(r.phase).toBe('reveal');
    expect(r.lastOutcome?.kind).toBe('timeUp');
  });

  it('no spotlight is staged when fewer than two followers remain playable (falls through to reveal)', () => {
    // FIVE = 1 detective + 4 followers; eliminate 3 so only ONE playable follower
    // remains — there is no quorum to perform/flag, so live exhausts to reveal.
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const [, f1, f2, f3] = followersOf(live);
    const elim = { ...live.eliminated, [f1!]: true, [f2!]: true, [f3!]: true };
    const s: RuleHuntState = { ...live, eliminated: elim } as RuleHuntState;
    const { state: r } = game.reduce(s, deadline(25_000));
    expect(r.phase).toBe('reveal'); // fewer than two playable followers — no heat beat
    expect(r.lastOutcome?.kind).toBe('timeUp');
  });
});

describe('GUARD (a) — the soft read NEVER leaks to a non-owner', () => {
  it("a follower's flag is echoed to the owner only; everyone else sees just the count", () => {
    const spot = toSpotlight(toLive(game.init('s', FIVE, content(3)), 1_000));
    const flagger = flaggersOf(spot)[0]!;
    const s = game.reduce(spot, flagBreak(flagger, 'flag', spot.segmentStartedAt + 1)).state;

    const ownerView = game.view(s, flagger);
    if (ownerView.phase !== 'spotlight') throw new Error('expected spotlight view');
    expect(ownerView.myFlag).toBe('flag');
    expect(ownerView.flagCount).toBe(1);

    for (const viewer of [...s.players.filter((p) => p !== flagger), ...OUTSIDERS]) {
      const v = game.view(s, viewer);
      if (v.phase !== 'spotlight') throw new Error('expected spotlight view');
      expect(v.myFlag).toBeNull(); // no foreign read value
      expect(v.flagCount).toBe(1); // the aggregate is public
      expect(JSON.stringify(v)).not.toContain('"myFlag":"flag"');
    }
  });

  it("a detective's note is echoed to the owner only; the room sees no value, no per-target ballot", () => {
    const spot = toSpotlight(toLive(game.init('s', FIVE, content(3)), 1_000));
    const det = spot.detectives[0]!;
    const s = game.reduce(spot, noteSuspicious(det, 'suspicious', spot.segmentStartedAt + 1)).state;

    const ownerView = game.view(s, det);
    if (ownerView.phase !== 'spotlight') throw new Error('expected spotlight view');
    expect(ownerView.myNote).toBe('suspicious');
    expect(ownerView.noteCount).toBe(1);

    for (const viewer of [...s.players.filter((p) => p !== det), ...OUTSIDERS]) {
      const v = game.view(s, viewer);
      if (v.phase !== 'spotlight') throw new Error('expected spotlight view');
      expect(v.myNote).toBeNull();
      expect(v.noteCount).toBe(1);
      expect(JSON.stringify(v)).not.toContain('"myNote":"suspicious"');
    }
  });

  it('changing a hidden flag never changes a non-flagger view (non-actor invariance)', () => {
    const build = (flag: 'flag' | 'clean'): RuleHuntState => {
      const spot = toSpotlight(toLive(game.init('s', FIVE, content(3)), 1_000));
      const flagger = flaggersOf(spot)[0]!;
      return game.reduce(spot, flagBreak(flagger, flag, spot.segmentStartedAt + 1)).state;
    };
    const sA = build('flag');
    const sB = build('clean');
    const flagger = flaggersOf(sA)[0]!;
    expect(game.phaseKey(sA)).toBe(game.phaseKey(sB));
    for (const viewer of [...sA.players.filter((p) => p !== flagger), ...OUTSIDERS]) {
      expect(game.view(sA, viewer)).toEqual(game.view(sB, viewer));
    }
    // ...and the owner DOES see their own differing echo
    expect(game.view(sA, flagger)).not.toEqual(game.view(sB, flagger));
  });

  it('the raw flags/notes buffers never serialize into any view', () => {
    const spot = toSpotlight(toLive(game.init('s', FIVE, content(3)), 1_000));
    const flagger = flaggersOf(spot)[0]!;
    const det = spot.detectives[0]!;
    let s = game.reduce(spot, flagBreak(flagger, 'flag', spot.segmentStartedAt + 1)).state;
    s = game.reduce(s, noteSuspicious(det, 'suspicious', spot.segmentStartedAt + 2)).state;
    for (const viewer of [...s.players, ...OUTSIDERS]) {
      const str = JSON.stringify(game.view(s, viewer));
      expect(str).not.toContain('"flags"');
      expect(str).not.toContain('"notes"');
    }
  });
});

describe('GUARD (b) — the soft read NEVER changes the primary early-resolve', () => {
  it('EVERY eligible player flagging does NOT resolve the spotlight (only its deadline does)', () => {
    const spot = toSpotlight(toLive(game.init('s', FIVE, content(3)), 1_000));
    let s = spot;
    // all flaggers flag AND the detective notes — the whole room has "acted"
    for (const f of flaggersOf(spot)) {
      s = game.reduce(s, flagBreak(f, 'flag', spot.segmentStartedAt + 1)).state;
      expect(s.phase).toBe('spotlight'); // still open after each
    }
    for (const d of spot.detectives) {
      s = game.reduce(s, noteSuspicious(d, 'suspicious', spot.segmentStartedAt + 2)).state;
      expect(s.phase).toBe('spotlight');
    }
    expect(s.phase).toBe('spotlight'); // never auto-resolves on a full buffer
    expect(s.spotlight).not.toBeNull();
    // only the deadline ends it -> back to live, never a reveal
    const resumed = game.reduce(s, deadline(spot.segmentStartedAt + 10_000)).state;
    expect(resumed.phase).toBe('live');
  });

  it('the spotlight does NOT touch the briefing ack early-resolve path (allActed unchanged)', () => {
    // The briefing all-acked early-exit is still gated on follower acks only —
    // the heat-check lives entirely inside live and shares no buffer with ackRule.
    let s = game.init('s', FIVE, content(3));
    const followers = followersOf(s);
    for (const f of followers.slice(0, -1)) s = game.reduce(s, ack(f, 1_000)).state;
    expect(s.phase).toBe('briefing');
    const live = game.reduce(s, ack(followers[followers.length - 1]!, 2_000)).state;
    expect(live.phase).toBe('live'); // unchanged: acks alone still open live
  });

  it('a flag during live (no spotlight open) is inert — the live clock is not interrupted', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const f0 = followersOf(live)[0]!;
    expect(game.reduce(live, flagBreak(f0, 'flag', 2_000)).state).toBe(live);
  });
});

describe('GUARD (c) — reject-invalid returns the SAME state reference', () => {
  it('flagBreak: rejects detective, target-self, disconnected, eliminated, re-bet, wrong phase', () => {
    const spot = toSpotlight(toLive(game.init('s', FIVE, content(3)), 1_000));
    const det = spot.detectives[0]!;
    const target = spot.spotlight!.target;
    const flagger = flaggersOf(spot)[0]!;
    const at = spot.segmentStartedAt + 1;
    // detective cannot flagBreak (they have noteSuspicious instead)
    expect(game.reduce(spot, flagBreak(det, 'flag', at)).state).toBe(spot);
    // the spotlit performer cannot flag themselves
    expect(game.reduce(spot, flagBreak(target, 'flag', at)).state).toBe(spot);
    // a non-roster / hostile id is inert
    expect(game.reduce(spot, flagBreak('ghost', 'flag', at)).state).toBe(spot);
    // disconnected follower
    const gone = game.reduce(spot, left(flagger, at)).state;
    expect(game.reduce(gone, flagBreak(flagger, 'flag', at + 1)).state).toBe(gone);
    // re-bet over an existing stake (one read per beat)
    const once = game.reduce(spot, flagBreak(flagger, 'flag', at)).state;
    expect(once).not.toBe(spot);
    expect(game.reduce(once, flagBreak(flagger, 'clean', at + 1)).state).toBe(once);
    // wrong phase: a flag in live is inert (covered above) and in briefing
    const briefing = game.init('s', FIVE, content(3));
    expect(game.reduce(briefing, flagBreak(followersOf(briefing)[0]!, 'flag', 100)).state).toBe(briefing);
  });

  it('flagBreak: an eliminated follower cannot flag', () => {
    const spot = toSpotlight(toLive(game.init('s', FIVE, content(3)), 1_000));
    const flagger = flaggersOf(spot)[0]!;
    const elim: RuleHuntState = { ...spot, eliminated: { ...spot.eliminated, [flagger]: true } } as RuleHuntState;
    expect(game.reduce(elim, flagBreak(flagger, 'flag', elim.segmentStartedAt + 1)).state).toBe(elim);
  });

  it('noteSuspicious: rejects follower, disconnected detective, re-bet, wrong phase', () => {
    const spot = toSpotlight(toLive(game.init('s', FIVE, content(3)), 1_000));
    const det = spot.detectives[0]!;
    const f0 = flaggersOf(spot)[0]!;
    const at = spot.segmentStartedAt + 1;
    // a follower cannot noteSuspicious
    expect(game.reduce(spot, noteSuspicious(f0, 'suspicious', at)).state).toBe(spot);
    // non-roster id
    expect(game.reduce(spot, noteSuspicious('ghost', 'suspicious', at)).state).toBe(spot);
    // disconnected detective
    const gone = game.reduce(spot, left(det, at)).state;
    expect(game.reduce(gone, noteSuspicious(det, 'suspicious', at + 1)).state).toBe(gone);
    // re-note
    const once = game.reduce(spot, noteSuspicious(det, 'suspicious', at)).state;
    expect(once).not.toBe(spot);
    expect(game.reduce(once, noteSuspicious(det, 'clear', at + 1)).state).toBe(once);
    // wrong phase: a note in live is inert
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    expect(game.reduce(live, noteSuspicious(live.detectives[0]!, 'suspicious', 2_000)).state).toBe(live);
  });
});

describe('seeded spotlight pick — same seed yields the same spotlight order', () => {
  it('two independent matches with the same seed name the SAME performer for instance 0', () => {
    const a = toSpotlight(toLive(game.init('seed-X', FIVE, content(3)), 1_000));
    const b = toSpotlight(toLive(game.init('seed-X', FIVE, content(3)), 1_000));
    expect(a.spotlight!.target).toBe(b.spotlight!.target);
  });

  it('the spotlight order across a round is reproducible (replay-stable, no wall clock)', () => {
    const drive = (): string[] => {
      let s = toLive(game.init('seed-Y', FIVE, content(3)), 1_000);
      const targets: string[] = [];
      for (let i = 0; i < 4; i++) {
        const spot = toSpotlight(s);
        targets.push(spot.spotlight!.target);
        s = game.reduce(spot, deadline(spot.segmentStartedAt + 10_000)).state; // resume live
      }
      return targets;
    };
    expect(drive()).toEqual(drive()); // deterministic order
  });

  it('a different seed can produce a different first performer (the pick actually depends on the seed)', () => {
    const seeds = ['s0', 's1', 's2', 's3', 's4', 's5'];
    const firsts = new Set(
      seeds.map((seed) => toSpotlight(toLive(game.init(seed, FIVE, content(3)), 1_000)).spotlight!.target),
    );
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('a full match with heat-check beats replays to a byte-identical state', () => {
    const pack = content(3);
    const s0 = game.init('replay-seed', FIVE, pack);
    const [f0, f1, f2, f3] = followersOf(s0);

    // Build the event log by simulating the real shell: ack into live, then fire
    // each phase's armed deadline on a monotonic clock — and at the FIRST spotlight
    // inject a flag + a note before the spotlight's own deadline resumes live.
    const events: Array<GameEvent<RuleHuntAction>> = [
      ack(f0!, 1_000), ack(f1!, 1_100), ack(f2!, 1_200), ack(f3!, 1_300),
    ];
    let s = s0;
    for (const e of events) s = game.reduce(s, e).state;

    let clock = 2_000;
    let injectedHeatBeat = false;
    for (let i = 0; i < 200 && s.phase !== 'over'; i++) {
      if (s.phase === 'spotlight' && !injectedHeatBeat) {
        const flagger = flaggersOf(s)[0]!;
        const fe = flagBreak(flagger, 'flag', clock + 1);
        const ne = noteSuspicious(s.detectives[0]!, 'suspicious', clock + 2);
        s = game.reduce(s, fe).state;
        s = game.reduce(s, ne).state;
        events.push(fe, ne);
        injectedHeatBeat = true;
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
    expect(injectedHeatBeat).toBe(true); // the heat-check beat really happened

    const replayed = replay(game, 'replay-seed', [...FIVE], pack, events);
    expect(replayed.phase).toBe('over');
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(s));
  });
});
