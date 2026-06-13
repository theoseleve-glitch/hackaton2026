// Mirrors apps/server/test-node/redaction-audit.test.ts against the REAL
// authored packs (content/packs/*.json) run through the SAME adapter that
// INTEGRATION.md §2 adds to scripts/build-packs.mjs, with the SAME audit
// fixtures as INTEGRATION.md §3. If this file is green, the copy-pasted
// registry entries + AUDITS fixtures pass the server audit as-is.
// KEEP the adapter and fixtures here in exact sync with INTEGRATION.md.
import { describe, expect, it } from 'vitest';
import { leakedSecrets, type ContentPack, type GameEvent, type PlayerId } from '@bloop/engine';
import {
  createTruthDare,
  TRUTH_OR_DARE_2_CONFIG,
  TRUTH_OR_DRINK_CONFIG,
  type LText,
  type TdItem,
  type TruthDareAction,
  type TruthDareContent,
} from '@bloop/game-truth-dare';
import tod2Authored from '../../../../content/packs/truth-or-dare-2.json';
import totdAuthored from '../../../../content/packs/truth-or-drink.json';

// ---------------------------------------------------------------------------
// Pack adapter — TS mirror of the build-packs.mjs snippet (INTEGRATION.md §2)
// ---------------------------------------------------------------------------

interface AuthoredTdItem {
  id: string;
  choice: string;
  intensity: string;
  text: LText;
  props?: boolean;
  spicy?: number;
  minAge?: number;
  tags?: string[];
}

const asChoice = (c: string) => (c === 'dare' ? 'dare' as const : 'truth' as const);
const asTier = (t: string) =>
  t === 'spicy' ? 'spicy' as const : t === 'party' ? 'party' as const : 'soft' as const;

/**
 * truth-or-dare-2: strip authoring metadata (spicy, minAge, tags); derive the
 * fun/lover deck from the id prefix. Tier + deck gating happens at init via
 * each config (the lover sibling rides the SAME pack const).
 */
function adaptTod2Items(items: AuthoredTdItem[]): TdItem[] {
  return items.map((i) => ({
    id: i.id,
    choice: asChoice(i.choice),
    intensity: asTier(i.intensity),
    text: i.text,
    deck: i.id.startsWith('lov-') ? 'lover' as const : 'fun' as const,
    ...(i.props === true ? { props: true } : {}),
  }));
}

/**
 * truth-or-drink: truth rows are the questions, dare rows the FORFEIT POOL.
 * The drink config's allowedIntensities (party+spicy) excludes the soft rows
 * (the safe truth-or-forfeit sibling pool) at init — they still ship.
 */
function adaptDrinkItems(items: AuthoredTdItem[]): TdItem[] {
  return items.map((i) => ({
    id: i.id,
    choice: asChoice(i.choice),
    intensity: asTier(i.intensity),
    text: i.text,
  }));
}

const TRUTH_OR_DARE_2_PACK: ContentPack<TruthDareContent> = {
  id: 'truth-or-dare-2-core',
  version: 1,
  data: { items: adaptTod2Items((tod2Authored as { items: AuthoredTdItem[] }).items) },
};

const TRUTH_OR_DRINK_PACK: ContentPack<TruthDareContent> = {
  id: 'truth-or-drink-core',
  version: 1,
  data: { items: adaptDrinkItems((totdAuthored as { items: AuthoredTdItem[] }).items) },
};

// ---------------------------------------------------------------------------
// Audit fixtures — keep in exact sync with INTEGRATION.md §3
// ---------------------------------------------------------------------------

const tdChoose = (playerId: string, choice: 'truth' | 'dare', at: number): GameEvent<TruthDareAction> =>
  ({ type: 'action', playerId, action: { kind: 'chooseType', choice }, at });

const tdDeclare = (playerId: string, at: number): GameEvent<TruthDareAction> =>
  ({ type: 'action', playerId, action: { kind: 'declare', result: 'done' }, at });

const tdVote = (playerId: string, vote: 'done' | 'chickened', at: number): GameEvent<TruthDareAction> =>
  ({ type: 'action', playerId, action: { kind: 'verdict', vote }, at });

/** The next-undrawn text of every deck is a VALUE secret until its draw. */
const tdUndrawnTexts = (state: unknown): ReadonlyArray<{ value: string }> => {
  const s = state as {
    decks: Record<string, string[]>;
    cursors: Record<string, number>;
    itemsById: Record<string, { text?: { fr: string; en: string } }>;
  };
  const out: Array<{ value: string }> = [];
  for (const key of Object.keys(s.decks)) {
    const id = s.decks[key]?.[s.cursors[key] ?? 0];
    const t = id === undefined ? undefined : s.itemsById[id]?.text;
    if (t !== undefined) out.push({ value: t.fr }, { value: t.en });
  }
  return out;
};

interface RedactionAudit {
  players: readonly PlayerId[];
  seed: string;
  events: ReadonlyArray<GameEvent<TruthDareAction>>;
  eventsAlt: ReadonlyArray<GameEvent<TruthDareAction>>;
  actors: readonly PlayerId[];
  secrets(state: unknown): ReadonlyArray<{ value: string; owner?: PlayerId }>;
}

type TdModule = ReturnType<typeof createTruthDare>;

const AUDITS: ReadonlyArray<[string, RedactionAudit, TdModule, ContentPack<TruthDareContent>]> = [
  ['truth-or-dare-2', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    // rotation under 'audit-seed' is [p3, p1, p2]. Park MID-VERDICT of turn 1
    // (turn 1, not 0, keeps the remaining deadline walk within the 25-step
    // audit budget: 23 steps) with ONE of two expected votes buffered.
    events: [
      tdChoose('p3', 'truth', 1_000), tdDeclare('p3', 2_000),
      tdVote('p1', 'done', 3_000), tdVote('p2', 'done', 4_000), // turn 0 resolves
      { type: 'deadline', at: 5_000 }, // score:0 -> choose:1 (active p1)
      tdChoose('p1', 'truth', 6_000), tdDeclare('p1', 7_000),
      tdVote('p2', 'done', 8_000),
    ],
    eventsAlt: [
      tdChoose('p3', 'truth', 1_000), tdDeclare('p3', 2_000),
      tdVote('p1', 'done', 3_000), tdVote('p2', 'done', 4_000),
      { type: 'deadline', at: 5_000 },
      tdChoose('p1', 'truth', 6_000), tdDeclare('p1', 7_000),
      tdVote('p2', 'chickened', 8_000), // ONLY p2's hidden vote differs
    ],
    actors: ['p2'],
    secrets: tdUndrawnTexts,
  }, createTruthDare('truth-or-dare-2', TRUTH_OR_DARE_2_CONFIG), TRUTH_OR_DARE_2_PACK],
  ['truth-or-drink', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    // no choose beat (allowedChoices ['truth']): init lands in prompt:0 with
    // active p3. Park mid-verdict turn 0, one of two expected votes buffered.
    events: [tdDeclare('p3', 1_000), tdVote('p1', 'done', 2_000)],
    eventsAlt: [tdDeclare('p3', 1_000), tdVote('p1', 'chickened', 2_000)],
    actors: ['p1'],
    secrets: tdUndrawnTexts,
  }, createTruthDare('truth-or-drink', TRUTH_OR_DRINK_CONFIG), TRUTH_OR_DRINK_PACK],
];

// ---------------------------------------------------------------------------
// Audit machinery — replicated verbatim from redaction-audit.test.ts
// ---------------------------------------------------------------------------

const OUTSIDERS = ['viewer-not-in-roster', '__proto__'] as const;

function fold(
  module: TdModule,
  audit: RedactionAudit,
  content: ContentPack<TruthDareContent>,
  events: ReadonlyArray<GameEvent<TruthDareAction>>,
) {
  let state = module.init(audit.seed, [...audit.players], content);
  for (const e of events) {
    const next = module.reduce(state, e).state;
    if (next === state) throw new Error(`audit fixture event was rejected by reduce: ${JSON.stringify(e)}`);
    state = next;
  }
  return state;
}

describe('adapter sanity — the authored packs feed a full match', () => {
  it('truth-or-dare-2: fun + lover decks present, authoring metadata stripped', () => {
    const items = TRUTH_OR_DARE_2_PACK.data.items;
    expect(items.length).toBeGreaterThan(0);
    const json = JSON.stringify(items);
    for (const field of ['"spicy":', '"minAge":', '"tags":']) expect(json).not.toContain(field);
    const decks = new Set(items.map((i) => i.deck));
    expect([...decks].sort()).toEqual(['fun', 'lover']);
    // fun config: soft+party fun items only, both choices, enough for 9 turns at 3p
    const s = createTruthDare('truth-or-dare-2', TRUTH_OR_DARE_2_CONFIG)
      .init('s', ['p1', 'p2', 'p3'], TRUTH_OR_DARE_2_PACK);
    expect(s.phase).toBe('choose');
    for (const key of ['truth:soft', 'truth:party', 'dare:soft', 'dare:party']) {
      expect((s.decks[key] ?? []).length).toBeGreaterThanOrEqual(9);
    }
  });

  it('truth-or-drink: party+spicy questions + forfeit pool; soft sibling rows excluded at init', () => {
    const s = createTruthDare('truth-or-drink', TRUTH_OR_DRINK_CONFIG)
      .init('s', ['p1', 'p2', 'p3'], TRUTH_OR_DRINK_PACK);
    expect(s.phase).toBe('prompt'); // choose auto-skipped
    expect(Object.keys(s.decks).sort()).toEqual(['dare:party', 'dare:spicy', 'truth:party', 'truth:spicy']);
    expect((s.decks['truth:spicy'] ?? []).length).toBeGreaterThanOrEqual(6); // 2 laps x 3p
    expect((s.decks['dare:party'] ?? []).length).toBeGreaterThan(0); // the forfeit pool
    expect(Object.keys(s.itemsById).some((id) => id.startsWith('totf-'))).toBe(false); // soft rows filtered
  });
});

describe('redaction audit mirror — INTEGRATION.md fixtures vs the real packs', () => {
  for (const [id, audit, module, content] of AUDITS) {
    describe(id, () => {
      const sA = fold(module, audit, content, audit.events);
      const sB = fold(module, audit, content, audit.eventsAlt);

      it('fixture is live: same phase both scripts, and at least one actor SEES its own differing choice', () => {
        expect(module.phaseKey(sA)).toBe(module.phaseKey(sB));
        const anActorSees = audit.actors.some(
          (a) => JSON.stringify(module.view(sA, a)) !== JSON.stringify(module.view(sB, a)));
        expect(anActorSees).toBe(true);
      });

      it('every view is JSON-serializable for roster, spectator, and hostile viewers', () => {
        for (const viewer of [...audit.players, ...OUTSIDERS]) {
          const view = module.view(sA, viewer);
          expect(JSON.parse(JSON.stringify(view))).toEqual(view);
        }
      });

      it("non-actors' views are INVARIANT under hidden-choice changes (structural leak check)", () => {
        const nonActors = [...audit.players.filter((p) => !audit.actors.includes(p)), ...OUTSIDERS];
        expect(nonActors.length).toBeGreaterThan(0);
        for (const viewer of nonActors) {
          expect(module.view(sA, viewer)).toEqual(module.view(sB, viewer));
        }
      });

      it('declared value secrets never appear in any non-owner view (engine leakedSecrets)', () => {
        const viewers = [...audit.players, ...OUTSIDERS];
        expect(audit.secrets(sA).length).toBeGreaterThan(0); // the fixture must actually audit something
        expect(leakedSecrets(module, sA, viewers, [...audit.secrets(sA)])).toEqual([]);
        expect(leakedSecrets(module, sB, viewers, [...audit.secrets(sB)])).toEqual([]);
      });

      it('every later phase reached by deadlines keeps views serializable; ≤ 25 steps reach untimed', () => {
        let s = sA;
        let steps = 0;
        for (let i = 0; i < 25; i++) {
          const next = module.reduce(s, { type: 'deadline', at: 100_000 + i }).state;
          if (next === s) break; // absorbed (untimed)
          s = next;
          steps += 1;
          for (const viewer of OUTSIDERS) {
            const view = module.view(s, viewer);
            expect(JSON.parse(JSON.stringify(view))).toEqual(view);
          }
        }
        expect(module.phaseDurationMs(s)).toBeNull();
        expect(module.phaseKey(s)).toBe('over');
        expect(steps).toBeLessThanOrEqual(25);
      });
    });
  }
});
