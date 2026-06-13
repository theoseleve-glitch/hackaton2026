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

// Seed 'audit-seed' with this roster makes p1 the round-0 detective, so the
// followers p2..p5 ack; p2 accuses p3; voters = p2 (accuser), p4, p5. p4 and
// p5 cast HIDDEN ballots, p2 is still expected — the tribunal stays open.
const AUDIT = {
  players: ['p1', 'p2', 'p3', 'p4', 'p5'] as const,
  seed: 'audit-seed',
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

  it('the deadline walk from the fixture state reaches an untimed phase within 25 steps', () => {
    let s = sA;
    let steps = 0;
    for (let i = 0; i < 25; i++) {
      const next = module_.reduce(s as never, { type: 'deadline', at: 100_000 + i }).state;
      if (next === s) break;
      s = next;
      steps += 1;
      for (const viewer of OUTSIDERS) {
        const view = module_.view(s as never, viewer);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
      }
    }
    expect(module_.phaseDurationMs(s as never)).toBeNull();
    expect(steps).toBeLessThanOrEqual(25);
  });
});
