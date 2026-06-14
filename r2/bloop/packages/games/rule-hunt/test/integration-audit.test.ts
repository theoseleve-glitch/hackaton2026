// Mirrors apps/server/test-node/redaction-audit.test.ts against the REAL
// authored pack (content/packs/trouvez-la-regle.json) run through the SAME
// adapter that INTEGRATION.md §2 adds to scripts/build-packs.mjs, with the
// SAME audit fixture as INTEGRATION.md §3. If this file is green, the
// copy-pasted registry entry + AUDITS fixture pass the server audit as-is.
// KEEP the adapter and fixture here in exact sync with INTEGRATION.md.
import { describe, expect, it } from 'vitest';
import { leakedSecrets, type ContentPack, type GameEvent } from '@bloop/engine';
import {
  createRuleHunt,
  TROUVEZ_LA_REGLE_CONFIG,
  type LText,
  type RuleHuntContent,
  type RuleItem,
} from '@bloop/game-rule-hunt';
import authored from '../../../../content/packs/trouvez-la-regle.json';

// ---------------------------------------------------------------------------
// Pack adapter — TS mirror of the build-packs.mjs snippet (INTEGRATION.md §2)
// ---------------------------------------------------------------------------

interface AuthoredRuleItem {
  id: string;
  category: string;
  difficulty: string;
  spicy?: number;
  rule: LText;
  decoys: LText[];
}

/** Core pack = spicy 0 only; authoring-only fields are stripped. */
function adaptRuleItems(items: AuthoredRuleItem[]): RuleItem[] {
  return items
    .filter((i) => (i.spicy ?? 0) === 0)
    .map((i) => ({
      id: i.id,
      category: i.category === 'verbal' ? 'verbal' as const : i.category === 'social' ? 'social' as const : 'gesture' as const,
      difficulty: i.difficulty === 'medium' ? 'medium' as const : i.difficulty === 'hard' ? 'hard' as const : 'easy' as const,
      rule: i.rule,
      decoys: i.decoys,
    }));
}

const TROUVEZ_LA_REGLE_PACK: ContentPack<RuleHuntContent> = {
  id: 'trouvez-la-regle-core',
  version: 1,
  data: { items: adaptRuleItems((authored as { items: AuthoredRuleItem[] }).items) },
};

// ---------------------------------------------------------------------------
// Audit fixture — exact copy of INTEGRATION.md §3
// ---------------------------------------------------------------------------

const rhAck = (playerId: string, at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'ackRule' }, at });
const rhAccuse = (playerId: string, target: string, at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'accuse', target }, at });
const rhVote = (playerId: string, guilty: boolean, at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'tribunalVote', guilty }, at });

// Seed 'audit-1' with this roster makes p1 the sole round-0 detective against
// the REAL authored pack (the item shuffle consumes the rng before the player
// shuffle, so the detective seat is pack-sensitive; 'audit-1' is pinned to keep
// p1 the detective so the hardcoded follower events below stay valid). The
// followers p2..p5 ack; p2 accuses p3; voters = p2 (accuser), p4, p5. p4 and
// p5 cast HIDDEN ballots, p2 is still expected — the tribunal stays open.
const AUDIT = {
  players: ['p1', 'p2', 'p3', 'p4', 'p5'] as const,
  seed: 'audit-1',
  events: [
    rhAck('p2', 1_000), rhAck('p3', 1_100), rhAck('p4', 1_200), rhAck('p5', 1_300),
    rhAccuse('p2', 'p3', 5_000),
    rhVote('p4', true, 6_000), rhVote('p5', false, 7_000),
  ],
  eventsAlt: [
    rhAck('p2', 1_000), rhAck('p3', 1_100), rhAck('p4', 1_200), rhAck('p5', 1_300),
    rhAccuse('p2', 'p3', 5_000),
    rhVote('p4', false, 6_000), rhVote('p5', true, 7_000),
  ],
  actors: ['p4', 'p5'] as const,
  // The CURRENT rule legitimately appears in every follower's view (myRule),
  // so it cannot be a single-owner value secret; this package's redaction
  // suite covers it field-level. Value-auditable here: the current item's
  // decoys (hidden from EVERYONE until the guess grid opens) and the
  // future rounds' rules.
  secrets: (state: unknown) => {
    const s = state as { round: number; items: Array<{ rule: LText; decoys: LText[] }> };
    const current = s.items[s.round];
    const future = s.items.slice(s.round + 1, s.round + 3);
    return [
      ...(current?.decoys ?? []).flatMap((d) => [{ value: d.fr }, { value: d.en }]),
      ...future.flatMap((i) => [{ value: i.rule.fr }, { value: i.rule.en }]),
    ];
  },
};

const OUTSIDERS = ['viewer-not-in-roster', '__proto__'] as const;
const module_ = createRuleHunt('trouvez-la-regle', TROUVEZ_LA_REGLE_CONFIG);

function fold(events: ReadonlyArray<GameEvent<unknown>>): unknown {
  let state: unknown = module_.init(AUDIT.seed, [...AUDIT.players], TROUVEZ_LA_REGLE_PACK);
  for (const e of events) {
    const next = module_.reduce(state as never, e as never).state;
    if (next === state) throw new Error(`audit fixture event was rejected by reduce: ${JSON.stringify(e)}`);
    state = next;
  }
  return state;
}

// ---------------------------------------------------------------------------
// Heat-check (spotlight) audit — declares the NEW hidden values: a follower's
// free flagBreak read and a detective's private noteSuspicious bookmark. Both
// are owner-only-echo / aggregate-count side-bets; neither value may reach a
// non-owner, and neither can be inverted to recover the spotlit performance.
// ---------------------------------------------------------------------------

const rhFlag = (playerId: string, flag: 'flag' | 'clean', at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'flagBreak', flag }, at });
const rhNote = (playerId: string, note: 'suspicious' | 'clear', at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'noteSuspicious', note }, at });

/** Drive the audit roster to live, fire one heat deadline -> spotlight. */
function foldToSpotlight(): { state: unknown; target: string; flagger: string; det: string } {
  const ackEvents: GameEvent<unknown>[] = [
    rhAck('p2', 1_000), rhAck('p3', 1_100), rhAck('p4', 1_200), rhAck('p5', 1_300),
  ];
  let s: unknown = module_.init(AUDIT.seed, [...AUDIT.players], TROUVEZ_LA_REGLE_PACK);
  for (const e of [...ackEvents]) s = module_.reduce(s as never, e as never).state;
  // p1 is the seeded round-0 detective; p2..p5 are followers.
  const live = s as { phase: string; detectives: string[]; segmentStartedAt: number };
  if (live.phase !== 'live') throw new Error(`expected live, got ${live.phase}`);
  const dur = module_.phaseDurationMs(s as never)!;
  s = module_.reduce(s as never, { type: 'deadline', at: live.segmentStartedAt + dur }).state;
  const spot = s as { phase: string; detectives: string[]; spotlight: { target: string } | null };
  if (spot.phase !== 'spotlight' || spot.spotlight === null) {
    throw new Error(`expected spotlight, got ${spot.phase}`);
  }
  const target = spot.spotlight.target;
  const det = spot.detectives[0]!;
  const flagger = (['p2', 'p3', 'p4', 'p5'] as const).find((p) => p !== target)!;
  return { state: s, target, flagger, det };
}

/** Same spotlight, two opposite hidden flag/note pairs — for non-owner invariance. */
function spotlightPair(): { sA: unknown; sB: unknown; target: string; flagger: string; det: string } {
  const open = foldToSpotlight();
  const at = (open.state as { segmentStartedAt: number }).segmentStartedAt;
  const apply = (flag: 'flag' | 'clean', note: 'suspicious' | 'clear'): unknown => {
    let s = open.state;
    s = module_.reduce(s as never, rhFlag(open.flagger, flag, at + 1) as never).state;
    s = module_.reduce(s as never, rhNote(open.det, note, at + 2) as never).state;
    return s;
  };
  return {
    sA: apply('flag', 'suspicious'),
    sB: apply('clean', 'clear'),
    target: open.target,
    flagger: open.flagger,
    det: open.det,
  };
}

describe('INTEGRATION.md fixtures pass the server redaction audit against the real pack', () => {
  it('the adapted core pack is non-degenerate (>= totalRounds items, full decoy sets)', () => {
    expect(TROUVEZ_LA_REGLE_PACK.data.items.length).toBeGreaterThanOrEqual(TROUVEZ_LA_REGLE_CONFIG.totalRounds);
    for (const item of TROUVEZ_LA_REGLE_PACK.data.items) {
      expect(item.decoys).toHaveLength(TROUVEZ_LA_REGLE_CONFIG.candidateCount - 1);
      expect(item.rule.fr.length).toBeGreaterThan(0);
      expect(item.rule.en.length).toBeGreaterThan(0);
    }
  });

  const sA = fold(AUDIT.events);
  const sB = fold(AUDIT.eventsAlt);

  it('fixture is live: same phaseKey both scripts, and an actor sees its own differing ballot', () => {
    expect(module_.phaseKey(sA as never)).toBe('tribunal:r0:i1');
    expect(module_.phaseKey(sB as never)).toBe(module_.phaseKey(sA as never));
    const anActorSees = AUDIT.actors.some(
      (a) => JSON.stringify(module_.view(sA as never, a)) !== JSON.stringify(module_.view(sB as never, a)));
    expect(anActorSees).toBe(true);
  });

  it('every view is JSON-serializable for roster, spectator and hostile viewers', () => {
    for (const viewer of [...AUDIT.players, ...OUTSIDERS]) {
      const view = module_.view(sA as never, viewer);
      expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    }
  });

  it("non-actors' views are INVARIANT under hidden-ballot changes", () => {
    const nonActors = [...AUDIT.players.filter((p) => !(AUDIT.actors as readonly string[]).includes(p)), ...OUTSIDERS];
    for (const viewer of nonActors) {
      expect(module_.view(sA as never, viewer)).toEqual(module_.view(sB as never, viewer));
    }
  });

  it('declared value secrets never appear in any view (engine leakedSecrets)', () => {
    const viewers = [...AUDIT.players, ...OUTSIDERS];
    expect(leakedSecrets(module_, sA as never, viewers, [...AUDIT.secrets(sA)])).toEqual([]);
    expect(leakedSecrets(module_, sB as never, viewers, [...AUDIT.secrets(sB)])).toEqual([]);
  });

  it('the deadline walk from the fixture state reaches an untimed phase', () => {
    // Advance a monotonic clock by each phase's armed duration — the way the real
    // shell arms deadlines — so the heat-check `live -> spotlight -> live` slices
    // actually drain the banked clock (a fixed-tiny `at` would stall in spotlight).
    let s = sA;
    let clock = 100_000;
    let steps = 0;
    for (let i = 0; i < 200; i++) {
      const dur = module_.phaseDurationMs(s as never);
      if (dur === null) break;
      clock += Math.max(1, dur);
      const next = module_.reduce(s as never, { type: 'deadline', at: clock }).state;
      if (next === s) break;
      s = next;
      steps += 1;
      for (const viewer of OUTSIDERS) {
        const view = module_.view(s as never, viewer);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
      }
    }
    expect(module_.phaseDurationMs(s as never)).toBeNull();
    expect(steps).toBeGreaterThan(0);
  });
});

describe('heat-check hidden values pass the same redaction audit (new spotlight surface)', () => {
  const { sA, sB, target, flagger, det } = spotlightPair();

  it('fixture is live: a spotlight with a buffered flag (follower) and note (detective)', () => {
    expect(module_.phaseKey(sA as never)).toBe('spotlight:r0:i1');
    expect(module_.phaseKey(sB as never)).toBe(module_.phaseKey(sA as never));
    // both actors see their OWN differing soft read
    expect(JSON.stringify(module_.view(sA as never, flagger)))
      .not.toBe(JSON.stringify(module_.view(sB as never, flagger)));
    expect(JSON.stringify(module_.view(sA as never, det)))
      .not.toBe(JSON.stringify(module_.view(sB as never, det)));
  });

  it("non-actors' views are INVARIANT under hidden flag/note changes (incl. the spotlit performer)", () => {
    // The spotlit target and every non-bettor — including spectators — must not be
    // able to tell `flag/suspicious` from `clean/clear`: the reads are owner-only.
    const nonActors = [target, ...AUDIT.players.filter((p) => p !== flagger && p !== det && p !== target), ...OUTSIDERS];
    for (const viewer of nonActors) {
      expect(module_.view(sA as never, viewer)).toEqual(module_.view(sB as never, viewer));
    }
  });

  it('the raw flag/note buffers and their values never serialize into any view', () => {
    for (const state of [sA, sB]) {
      for (const viewer of [...AUDIT.players, ...OUTSIDERS]) {
        const str = JSON.stringify(module_.view(state as never, viewer));
        expect(str).not.toContain('"flags"');
        expect(str).not.toContain('"notes"');
        // a non-owner viewer must never see a foreign read value
        if (viewer !== flagger) expect(str).not.toContain('"myFlag":"flag"');
        if (viewer !== det) expect(str).not.toContain('"myNote":"suspicious"');
      }
    }
  });

  it('declared value secrets (current decoys + future rules) still never appear at a spotlight', () => {
    const viewers = [...AUDIT.players, ...OUTSIDERS];
    expect(leakedSecrets(module_, sA as never, viewers, [...AUDIT.secrets(sA)])).toEqual([]);
    expect(leakedSecrets(module_, sB as never, viewers, [...AUDIT.secrets(sB)])).toEqual([]);
  });

  it('the spotlight target and the aggregate counts ARE public (the heat read is legible)', () => {
    const v = module_.view(sA as never, OUTSIDERS[0]);
    if (v.phase !== 'spotlight') throw new Error('expected spotlight view');
    expect(v.target).toBe(target);
    expect(v.flagCount).toBe(1); // one follower flagged
    expect(v.noteCount).toBe(1); // one detective noted
    expect(v.myFlag).toBeNull(); // ...but the outsider sees no value
    expect(v.myNote).toBeNull();
  });

  it('on resume the suspicion meter banks the AGGREGATE only — a per-target total, no ballot', () => {
    // Resume the spotlight: the hidden flag+note collapse to +heat on the target,
    // the raw buffers are dropped, and the meter is public to everyone.
    const open = foldToSpotlight();
    const at = (open.state as { segmentStartedAt: number }).segmentStartedAt;
    let s = open.state;
    s = module_.reduce(s as never, rhFlag(open.flagger, 'flag', at + 1) as never).state;
    s = module_.reduce(s as never, rhNote(open.det, 'suspicious', at + 2) as never).state;
    s = module_.reduce(s as never, { type: 'deadline', at: at + 10_000 } as never).state;
    const resumed = s as { phase: string; heat: Record<string, number>; spotlight: unknown };
    expect(resumed.phase).toBe('live');
    expect(resumed.spotlight).toBeNull();
    expect(resumed.heat[open.target]).toBe(2); // 1 flag + 1 note, AGGREGATE
    for (const viewer of [...AUDIT.players, ...OUTSIDERS]) {
      const v = module_.view(s as never, viewer);
      expect(v.heat[open.target]).toBe(2); // public meter
      const str = JSON.stringify(v);
      expect(str).not.toContain('"flags"');
      expect(str).not.toContain('"notes"');
    }
  });
});
