// Mirrors apps/server/test-node/redaction-audit.test.ts against the REAL
// authored packs (content/packs/*.json) run through the SAME adapter that
// INTEGRATION.md §2 adds to scripts/build-packs.mjs, with the SAME audit
// fixtures as INTEGRATION.md §3. If this file is green, the copy-pasted
// registry entries + AUDITS fixtures pass the server audit as-is.
// KEEP the adapter and fixtures here in exact sync with INTEGRATION.md.
import { describe, expect, it } from 'vitest';
import { leakedSecrets, type ContentPack, type GameEvent, type PlayerId } from '@bloop/engine';
import {
  createSpotlightGuess,
  DEVINE_LA_QUESTION_CONFIG,
  JEU_DE_LA_NOTE_CONFIG,
  type LText,
  type ReverseItem,
  type ScaleItem,
  type SpotlightGuessAction,
  type SpotlightGuessContent,
} from '@bloop/game-spotlight-guess';
import dqAuthored from '../../../../content/packs/devine-la-question.json';
import noteAuthored from '../../../../content/packs/jeu-de-la-note.json';

// ---------------------------------------------------------------------------
// Pack adapter — TS mirror of the build-packs.mjs snippet (INTEGRATION.md §2)
// ---------------------------------------------------------------------------

interface AuthoredNoteItem {
  id: string;
  kind: string;
  prompt: LText;
  low: LText;
  high: LText;
  intensity?: string;
}

interface AuthoredDqItem {
  id: string;
  question: LText;
  answers: LText[];
  decoys: LText[];
  hints: LText[];
  spicy?: number;
}

/** Authoring-only fields (tags, intensity) are stripped; classic intensity only. */
function adaptNoteItems(items: AuthoredNoteItem[]): ScaleItem[] {
  return items
    .filter((i) => (i.intensity ?? 'classic') === 'classic')
    .map((i) => ({
      id: i.id,
      kind: i.kind === 'wheel100' ? 'wheel100' as const : 'scale10' as const,
      prompt: i.prompt,
      low: i.low,
      high: i.high,
    }));
}

/** Authoring-only fields (tags, spicy) are stripped; spicy 0 only. */
function adaptDqItems(items: AuthoredDqItem[]): ReverseItem[] {
  return items
    .filter((i) => (i.spicy ?? 0) === 0)
    .map((i) => ({
      id: i.id,
      question: i.question,
      answers: i.answers,
      decoys: i.decoys,
      hints: i.hints,
    }));
}

const JEU_DE_LA_NOTE_PACK: ContentPack<SpotlightGuessContent> = {
  id: 'jeu-de-la-note-core',
  version: 1,
  data: { mode: 'scale', items: adaptNoteItems((noteAuthored as { items: AuthoredNoteItem[] }).items) },
};

const DEVINE_LA_QUESTION_PACK: ContentPack<SpotlightGuessContent> = {
  id: 'devine-la-question-core',
  version: 1,
  data: { mode: 'reverse-question', items: adaptDqItems((dqAuthored as { items: AuthoredDqItem[] }).items) },
};

// ---------------------------------------------------------------------------
// Audit fixtures — keep in exact sync with INTEGRATION.md §3
// ---------------------------------------------------------------------------

const sgGuess = (playerId: string, value: number, at: number): GameEvent<SpotlightGuessAction> =>
  ({ type: 'action', playerId, action: { kind: 'guess', value }, at });

const sgAnswer = (playerId: string, answerIndex: number, at: number): GameEvent<SpotlightGuessAction> =>
  ({ type: 'action', playerId, action: { kind: 'answer', answerIndex }, at });

const sgDeadlines = (n: number): GameEvent<SpotlightGuessAction>[] =>
  Array.from({ length: n }, (_, i) => ({ type: 'deadline' as const, at: 1_000 + i }));

interface RedactionAudit {
  players: readonly PlayerId[];
  seed: string;
  events: ReadonlyArray<GameEvent<SpotlightGuessAction>>;
  eventsAlt: ReadonlyArray<GameEvent<SpotlightGuessAction>>;
  actors: readonly PlayerId[];
  secrets(state: unknown): ReadonlyArray<{ value: string; owner?: PlayerId }>;
}

type SGModule = ReturnType<typeof createSpotlightGuess>;

const AUDITS: ReadonlyArray<[string, RedactionAudit, SGModule, ContentPack<SpotlightGuessContent>]> = [
  ['jeu-de-la-note', {
    players: ['p1', 'p2', 'p3', 'p4'],
    // 'audit-seed' lands a target of 10 ("scale10" makes 0/1/10 substring-uncheckable)
    // at every reachable fixture round; this seed lands target 9 on a digit-9-free
    // round-2 item, so the stringified secret IS auditable. Round 2 keeps the
    // remaining deadline walk at 22 steps (≤ 25): 10 deadlines cross rounds 0-1
    // and the r2 target/talk beats, then two guesses buffer mid-guess (p4 still
    // expected — phase NOT advanced). Round-2 spotlight under this seed: p2.
    seed: 'audit-seed-note',
    events: [...sgDeadlines(10), sgGuess('p1', 3, 11_000), sgGuess('p3', 5, 12_000)],
    eventsAlt: [...sgDeadlines(10), sgGuess('p1', 4, 11_000), sgGuess('p3', 6, 12_000)],
    actors: ['p1', 'p3'],
    // the current round's secret target is a VALUE secret owned by the spotlight
    // (guess values above are chosen so no digit collides with it)
    secrets: (state) => {
      const s = state as { round: number; spotIndex: number; turnOrder: string[]; targets: number[] };
      const t = s.targets[s.round];
      if (t === undefined) return [];
      return [{ value: String(t), owner: s.turnOrder[s.spotIndex] }];
    },
  }, createSpotlightGuess('jeu-de-la-note', JEU_DE_LA_NOTE_CONFIG), JEU_DE_LA_NOTE_PACK],
  ['devine-la-question', {
    players: ['p1', 'p2', 'p3', 'p4'],
    seed: 'audit-seed',
    // mid-guess r0 h0: the spotlight (turnOrder[0] = p1 under this seed) answered,
    // two guessers locked, p4 still expected — phase NOT advanced. Both scripts
    // share the spotlight's answer; only the hidden candidate locks differ.
    events: [sgAnswer('p1', 0, 1_000), sgGuess('p2', 1, 2_000), sgGuess('p3', 2, 3_000)],
    eventsAlt: [sgAnswer('p1', 0, 1_000), sgGuess('p2', 4, 2_000), sgGuess('p3', 0, 3_000)],
    actors: ['p2', 'p3'],
    // VALUE secrets at this state: the current round's still-hidden hints and every
    // FUTURE round's real question text (realIndex itself is structural — covered
    // by the invariance check; candidate indexes are single digits, uncheckable)
    secrets: (state) => {
      const s = state as {
        round: number;
        hintTier: number;
        reverseRounds: Array<{
          realIndex: number;
          candidates: Array<{ fr: string; en: string }>;
          hints: Array<{ fr: string; en: string }>;
        }>;
      };
      const out: Array<{ value: string }> = [];
      const cur = s.reverseRounds[s.round];
      for (const h of (cur?.hints ?? []).slice(s.hintTier)) out.push({ value: h.fr }, { value: h.en });
      for (let r = s.round + 1; r < s.reverseRounds.length; r++) {
        const rr = s.reverseRounds[r]!;
        const q = rr.candidates[rr.realIndex];
        if (q !== undefined) out.push({ value: q.fr }, { value: q.en });
      }
      return out;
    },
  }, createSpotlightGuess('devine-la-question', DEVINE_LA_QUESTION_CONFIG), DEVINE_LA_QUESTION_PACK],
];

// ---------------------------------------------------------------------------
// Audit machinery — replicated verbatim from redaction-audit.test.ts
// ---------------------------------------------------------------------------

const OUTSIDERS = ['viewer-not-in-roster', '__proto__'] as const;

function fold(
  module: SGModule,
  audit: RedactionAudit,
  content: ContentPack<SpotlightGuessContent>,
  events: ReadonlyArray<GameEvent<SpotlightGuessAction>>,
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
  it('jeu-de-la-note: ≥ 8 items, authoring-only fields stripped, per-item kind preserved', () => {
    if (JEU_DE_LA_NOTE_PACK.data.mode !== 'scale') throw new Error('expected scale pack');
    const items = JEU_DE_LA_NOTE_PACK.data.items;
    expect(items.length).toBeGreaterThanOrEqual(JEU_DE_LA_NOTE_CONFIG.totalRounds);
    const json = JSON.stringify(items);
    for (const field of ['"tags"', '"intensity"', '"generatedAt"']) {
      expect(json).not.toContain(field);
    }
    for (const i of items) expect(i.kind === 'scale10' || i.kind === 'wheel100').toBe(true);
    const s = createSpotlightGuess('jeu-de-la-note', JEU_DE_LA_NOTE_CONFIG)
      .init('s', ['p1', 'p2', 'p3'], JEU_DE_LA_NOTE_PACK);
    expect(s.config.totalRounds).toBe(JEU_DE_LA_NOTE_CONFIG.totalRounds); // pool never caps a real match
  });

  it('devine-la-question: ≥ 6 spicy-0 items, each with 4 decoys and hintTiers-1 hints', () => {
    if (DEVINE_LA_QUESTION_PACK.data.mode !== 'reverse-question') throw new Error('expected reverse pack');
    const items = DEVINE_LA_QUESTION_PACK.data.items;
    expect(items.length).toBeGreaterThanOrEqual(DEVINE_LA_QUESTION_CONFIG.totalRounds);
    for (const i of items) {
      expect(i.decoys.length).toBeGreaterThanOrEqual(DEVINE_LA_QUESTION_CONFIG.decoyCount);
      expect(i.hints.length).toBeGreaterThanOrEqual(DEVINE_LA_QUESTION_CONFIG.hintTiers - 1);
      expect(i.answers.length).toBeGreaterThanOrEqual(2);
    }
    expect(JSON.stringify(items)).not.toContain('"spicy"');
    const s = createSpotlightGuess('devine-la-question', DEVINE_LA_QUESTION_CONFIG)
      .init('s', ['p1', 'p2', 'p3'], DEVINE_LA_QUESTION_PACK);
    expect(s.config.totalRounds).toBe(DEVINE_LA_QUESTION_CONFIG.totalRounds);
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
