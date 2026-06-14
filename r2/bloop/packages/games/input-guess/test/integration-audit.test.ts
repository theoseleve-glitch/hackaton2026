// Mirrors apps/server/test-node/redaction-audit.test.ts against the REAL
// authored packs (content/packs/*.json) run through the SAME adapter that
// INTEGRATION.md §2 adds to scripts/build-packs.mjs, with the SAME audit
// fixtures as INTEGRATION.md §3. If this file is green, the copy-pasted
// registry entries + AUDITS fixtures pass the server audit as-is.
// KEEP the adapter and fixtures here in exact sync with INTEGRATION.md.
import { describe, expect, it } from 'vitest';
import { leakedSecrets, type ContentPack, type GameEvent, type PlayerId } from '@bloop/engine';
import {
  CINQUANTE_CINQUANTE_CONFIG,
  createInputGuess,
  QUIZZ_CULTURE_GE_CONFIG,
  type CrowdTargetItem,
  type InputGuessAction,
  type InputGuessContent,
  type LText,
  type NumberQuestionItem,
} from '@bloop/game-input-guess';
import ccAuthored from '../../../../content/packs/cinquante-cinquante.json';
import quizzAuthored from '../../../../content/packs/quizz-culture-ge.json';

// ---------------------------------------------------------------------------
// Pack adapter — TS mirror of the build-packs.mjs snippet (INTEGRATION.md §2)
// ---------------------------------------------------------------------------

interface AuthoredQuizzItem {
  id: string;
  question: LText;
  answer: number;
  unit: LText | null;
  format?: string;
  scale?: string;
  funFact: LText;
  spicy?: number;
}

interface AuthoredCrowdItem {
  id: string;
  targetYesPct: number;
  askKind: string;
  stem: LText;
  completions: Array<{ id: string; text: LText; crowdYesPct: number; spicy?: number }>;
  tone?: string;
}

/** Authoring-only fields (tags, difficulty, verifiedAt, source) are stripped. */
function adaptQuizzItems(items: AuthoredQuizzItem[]): NumberQuestionItem[] {
  return items
    .filter((i) => (i.spicy ?? 0) === 0)
    .map((i) => ({
      id: i.id,
      question: i.question,
      answer: i.answer,
      unit: i.unit ?? null,
      format: i.format === 'year' ? 'year' as const : 'plain' as const,
      scale: i.scale === 'log' ? 'log' as const : 'linear' as const,
      funFact: i.funFact,
    }));
}

/** Core pack = classic tone with every completion spicy 0 (cards stay a full hand of 6). */
function adaptCrowdItems(items: AuthoredCrowdItem[]): CrowdTargetItem[] {
  return items
    .filter((i) => (i.tone ?? 'classic') === 'classic' && i.completions.every((c) => (c.spicy ?? 0) === 0))
    .map((i) => ({
      id: i.id,
      targetYesPct: i.targetYesPct,
      askKind: i.askKind === 'agree' ? 'agree' as const : i.askKind === 'wouldYou' ? 'wouldYou' as const : 'didYou' as const,
      stem: i.stem,
      completions: i.completions.map((c) => ({ id: c.id, text: c.text, crowdYesPct: c.crowdYesPct })),
    }));
}

const QUIZZ_CULTURE_GE_PACK: ContentPack<InputGuessContent> = {
  id: 'quizz-culture-ge-core',
  version: 1,
  data: { items: adaptQuizzItems((quizzAuthored as { items: AuthoredQuizzItem[] }).items) },
};

const CINQUANTE_CINQUANTE_PACK: ContentPack<InputGuessContent> = {
  id: 'cinquante-cinquante-core',
  version: 1,
  data: { items: adaptCrowdItems((ccAuthored as { items: AuthoredCrowdItem[] }).items) },
};

// ---------------------------------------------------------------------------
// Audit fixtures — keep in exact sync with INTEGRATION.md §3
// ---------------------------------------------------------------------------

const igGuess = (playerId: string, value: number, at: number): GameEvent<InputGuessAction> =>
  ({ type: 'action', playerId, action: { kind: 'guess', value }, at });

const igPick = (playerId: string, cardIndex: number, at: number): GameEvent<InputGuessAction> =>
  ({ type: 'action', playerId, action: { kind: 'pick', cardIndex }, at });

interface RedactionAudit {
  players: readonly PlayerId[];
  seed: string;
  events: ReadonlyArray<GameEvent<InputGuessAction>>;
  eventsAlt: ReadonlyArray<GameEvent<InputGuessAction>>;
  actors: readonly PlayerId[];
  secrets(state: unknown): ReadonlyArray<{ value: string; owner?: PlayerId }>;
}

const AUDITS: ReadonlyArray<[string, RedactionAudit, ReturnType<typeof createInputGuess>, ContentPack<InputGuessContent>]> = [
  ['quizz-culture-ge', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    // mid-guess round 0: two secret guesses buffered, p3 still expected — phase NOT advanced.
    // Guess values are chosen so no digit string collides with the round-0 answer
    // (the owner echo would otherwise false-positive the substring audit).
    events: [igGuess('p1', 23, 1_000), igGuess('p2', 47, 2_000)],
    eventsAlt: [igGuess('p1', 56, 1_000), igGuess('p2', 89, 2_000)],
    actors: ['p1', 'p2'],
    // the current item's verified answer + funFact are VALUE secrets until reveal
    secrets: (state) => {
      const s = state as {
        round: number;
        items: Array<{ answer?: number; funFact?: { fr: string; en: string } }>;
      };
      const item = s.items[s.round];
      if (item?.answer === undefined || item.funFact === undefined) return [];
      return [
        { value: String(item.answer) },
        { value: item.funFact.fr },
        { value: item.funFact.en },
      ];
    },
  }, createInputGuess('quizz-culture-ge', QUIZZ_CULTURE_GE_CONFIG), QUIZZ_CULTURE_GE_PACK],
  ['cinquante-cinquante', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    // mid-pick round 0: two secret card picks buffered, p3 still expected — phase NOT advanced
    events: [igPick('p1', 0, 1_000), igPick('p2', 1, 2_000)],
    eventsAlt: [igPick('p1', 4, 1_000), igPick('p2', 5, 2_000)],
    actors: ['p1', 'p2'],
    // the current item's pre-computed crowd percentages are VALUE secrets until reveal
    secrets: (state) => {
      const s = state as {
        round: number;
        items: Array<{ completions?: Array<{ crowdYesPct: number }> }>;
      };
      const item = s.items[s.round];
      return (item?.completions ?? []).map((c) => ({ value: String(c.crowdYesPct) }));
    },
  }, createInputGuess('cinquante-cinquante', CINQUANTE_CINQUANTE_CONFIG), CINQUANTE_CINQUANTE_PACK],
];

// ---------------------------------------------------------------------------
// Audit machinery — replicated verbatim from redaction-audit.test.ts
// ---------------------------------------------------------------------------

const OUTSIDERS = ['viewer-not-in-roster', '__proto__'] as const;

type IGModule = ReturnType<typeof createInputGuess>;

function fold(
  module: IGModule,
  audit: RedactionAudit,
  content: ContentPack<InputGuessContent>,
  events: ReadonlyArray<GameEvent<InputGuessAction>>,
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
  it('quizz-culture-ge: ≥ 8 number items, authoring-only fields stripped', () => {
    const items = QUIZZ_CULTURE_GE_PACK.data.items;
    expect(items.length).toBeGreaterThanOrEqual(QUIZZ_CULTURE_GE_CONFIG.totalRounds);
    const json = JSON.stringify(items);
    for (const field of ['"tags"', '"difficulty"', '"verifiedAt"', '"source"', '"spicy"']) {
      expect(json).not.toContain(field);
    }
    const s = createInputGuess('quizz-culture-ge', QUIZZ_CULTURE_GE_CONFIG)
      .init('s', ['p1', 'p2'], QUIZZ_CULTURE_GE_PACK);
    expect(s.config.totalRounds).toBe(QUIZZ_CULTURE_GE_CONFIG.totalRounds); // pool never caps a real match
  });

  it('cinquante-cinquante: ≥ 7 classic items, each a full 6-card hand', () => {
    const items = CINQUANTE_CINQUANTE_PACK.data.items;
    expect(items.length).toBeGreaterThanOrEqual(CINQUANTE_CINQUANTE_CONFIG.totalRounds);
    for (const item of items) {
      if (!('completions' in item)) throw new Error('expected crowd item');
      expect(item.completions.length).toBe(CINQUANTE_CINQUANTE_CONFIG.cardsPerRound);
    }
    expect(JSON.stringify(items)).not.toContain('"tone"');
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

      // KEYSTONE — live submission ticker. The ticker is a NEW PUBLIC surface
      // (submitOrder in state; submittedCount + lockOrder in the guess view) but
      // it is NOT a new secret: it carries only identity + count, both already
      // implied by the public `hasSubmitted` map. Declared here so the audit
      // explicitly covers it. The actors submit p1 then p2 in BOTH scripts, so
      // the lock order is identical regardless of the hidden values — proving
      // the ticker reflects who/order, never the answer/pick value.
      it('live ticker exposes identity + count only — never a hidden value', () => {
        for (const viewer of [...audit.players, ...OUTSIDERS]) {
          const view = module.view(sA, viewer);
          if (view.phase !== 'guess') throw new Error('audit fixture must stall mid-guess');
          // count = number of locked players (the two actors), order = their ids.
          expect(view.submittedCount).toBe(audit.actors.length);
          expect(view.lockOrder).toEqual([...audit.actors]);
          // the lock order is value-invariant: same A vs B despite different hidden choices.
          const viewB = module.view(sB, viewer);
          if (viewB.phase !== 'guess') throw new Error('audit fixture must stall mid-guess');
          expect(view.lockOrder).toEqual(viewB.lockOrder);
          expect(view.submittedCount).toBe(viewB.submittedCount);
        }
        // and the declared value-secrets still never leak THROUGH the new fields.
        expect(leakedSecrets(module, sA, [...audit.players, ...OUTSIDERS], [...audit.secrets(sA)])).toEqual([]);
      });

      it('every later phase reached by deadlines keeps views serializable; deadlines stall only in untimed phases', () => {
        let s = sA;
        for (let i = 0; i < 25; i++) {
          const next = module.reduce(s, { type: 'deadline', at: 100_000 + i }).state;
          if (next === s) break;
          s = next;
          for (const viewer of OUTSIDERS) {
            const view = module.view(s, viewer);
            expect(JSON.parse(JSON.stringify(view))).toEqual(view);
          }
        }
        expect(module.phaseDurationMs(s)).toBeNull();
      });
    });
  }
});
