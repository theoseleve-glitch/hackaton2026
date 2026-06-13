// Mirrors apps/server/test-node/redaction-audit.test.ts against the REAL
// authored pack (content/packs/jeu-du-theme.json) run through the SAME adapter
// that INTEGRATION.md §2 adds to scripts/build-packs.mjs, with the SAME audit
// fixture as INTEGRATION.md §3. If this file is green, the copy-pasted
// registry entry + AUDITS fixture pass the server audit as-is.
// KEEP the adapter and fixture here in exact sync with INTEGRATION.md.
import { describe, expect, it } from 'vitest';
import { leakedSecrets, type ContentPack, type GameEvent, type PlayerId } from '@bloop/engine';
import {
  createLastStanding,
  JEU_DU_THEME_CONFIG,
  type LastStandingAction,
  type LastStandingContent,
  type LastStandingItem,
  type LText,
} from '@bloop/game-last-standing';
import jdtAuthored from '../../../../content/packs/jeu-du-theme.json';

// ---------------------------------------------------------------------------
// Pack adapter — TS mirror of the build-packs.mjs snippet (INTEGRATION.md §2)
// ---------------------------------------------------------------------------

interface AuthoredJdtItem {
  id: string;
  theme: LText;
  letters: { fr: string[]; en: string[] };
  difficulty: number;
  spicy?: number;
  tags?: string[];
  exampleWords?: { fr: string[]; en: string[] };
}

/**
 * Authoring-only fields are stripped: exampleWords would PRIME ANSWERS (design
 * risk #9 — it must never reach a client), tags are curation-only. The
 * per-locale letter lists merge into ONE shared list (fr∩en when >= 3 letters,
 * else the fr list): the room shouts a single letter, so it must be identical
 * on every phone regardless of device locale.
 */
function adaptJdtItems(items: AuthoredJdtItem[]): LastStandingItem[] {
  return items
    .filter((i) => (i.spicy ?? 0) === 0)
    .map((i) => {
      const shared = i.letters.fr.filter((l) => i.letters.en.includes(l));
      return {
        id: i.id,
        theme: i.theme,
        letters: shared.length >= 3 ? shared : i.letters.fr,
        difficulty: (i.difficulty === 2 ? 2 : i.difficulty === 3 ? 3 : 1) as 1 | 2 | 3,
      };
    });
}

const JEU_DU_THEME_PACK: ContentPack<LastStandingContent> = {
  id: 'jeu-du-theme-core',
  version: 1,
  data: { items: adaptJdtItems((jdtAuthored as { items: AuthoredJdtItem[] }).items) },
};

// ---------------------------------------------------------------------------
// Audit fixture — keep in exact sync with INTEGRATION.md §3
// ---------------------------------------------------------------------------

const lsDeadline = (at: number): GameEvent<LastStandingAction> => ({ type: 'deadline', at });

const lsWord = (playerId: string, at: number): GameEvent<LastStandingAction> =>
  ({ type: 'action', playerId, action: { kind: 'wordSaid' }, at });

const lsJudge = (playerId: string, vote: 'valid' | 'reject', at: number): GameEvent<LastStandingAction> =>
  ({ type: 'action', playerId, action: { kind: 'judge', vote }, at });

interface RedactionAudit {
  players: readonly PlayerId[];
  seed: string;
  events: ReadonlyArray<GameEvent<LastStandingAction>>;
  eventsAlt: ReadonlyArray<GameEvent<LastStandingAction>>;
  actors: readonly PlayerId[];
  secrets(state: unknown): ReadonlyArray<{ value: string; owner?: PlayerId }>;
}

// Under seed 'audit-seed' the seeded rotation of [p1,p2,p3] is [p3,p1,p2]:
// p3 opens the first say turn; p1 and p2 are the jury.
const AUDIT: RedactionAudit = {
  players: ['p1', 'p2', 'p3'],
  seed: 'audit-seed',
  // mid-judge turn 1: ONE ballot in flight (p1), p2 still expected — phase NOT advanced.
  events: [lsDeadline(500), lsWord('p3', 1_000), lsJudge('p1', 'valid', 2_000)],
  eventsAlt: [lsDeadline(500), lsWord('p3', 1_000), lsJudge('p1', 'reject', 2_000)],
  actors: ['p1'],
  // undrawn theme texts are the game's only VALUE secrets (votes are
  // structural 'valid'/'reject' strings — the invariance check covers them)
  secrets: (state) => {
    const s = state as { deck: Array<{ theme: { fr: string; en: string } }>; themeCursor: number };
    return s.deck.slice(s.themeCursor).flatMap((i) => [{ value: i.theme.fr }, { value: i.theme.en }]);
  },
};

// ---------------------------------------------------------------------------
// Audit machinery — replicated verbatim from redaction-audit.test.ts
// ---------------------------------------------------------------------------

const OUTSIDERS = ['viewer-not-in-roster', '__proto__'] as const;

const module_ = createLastStanding('jeu-du-theme', JEU_DU_THEME_CONFIG);

function fold(events: ReadonlyArray<GameEvent<LastStandingAction>>) {
  let state = module_.init(AUDIT.seed, [...AUDIT.players], JEU_DU_THEME_PACK);
  for (const e of events) {
    const next = module_.reduce(state, e).state;
    if (next === state) throw new Error(`audit fixture event was rejected by reduce: ${JSON.stringify(e)}`);
    state = next;
  }
  return state;
}

describe('adapter sanity — the authored pack feeds a full match', () => {
  it('>= totalRounds items, authoring-only fields stripped, letters merged and playable', () => {
    const items = JEU_DU_THEME_PACK.data.items;
    expect(items.length).toBeGreaterThanOrEqual(JEU_DU_THEME_CONFIG.totalRounds);
    const json = JSON.stringify(items);
    for (const field of ['"exampleWords"', '"tags"', '"spicy"']) {
      expect(json).not.toContain(field); // exampleWords would prime answers — design risk #9
    }
    for (const item of items) {
      expect(item.letters.length).toBeGreaterThan(0);
      for (const l of item.letters) expect(l).toMatch(/^[A-Z]$/);
      expect([1, 2, 3]).toContain(item.difficulty);
      expect(item.theme.fr.length).toBeGreaterThan(0);
      expect(item.theme.en.length).toBeGreaterThan(0);
    }
    const s = module_.init('s', ['p1', 'p2', 'p3'], JEU_DU_THEME_PACK);
    expect(s.config.totalRounds).toBe(JEU_DU_THEME_CONFIG.totalRounds); // the pool never caps a real match
  });

  it('ascending curve: the real deck is bucketed 1 <= 2 <= 3', () => {
    const s = module_.init('s', ['p1', 'p2', 'p3'], JEU_DU_THEME_PACK);
    const diffs = s.deck.map((i) => i.difficulty);
    expect([...diffs].sort((a, b) => a - b)).toEqual(diffs);
  });
});

describe('redaction audit mirror — INTEGRATION.md fixture vs the real pack', () => {
  const sA = fold(AUDIT.events);
  const sB = fold(AUDIT.eventsAlt);

  it('fixture is live: same phase both scripts, and at least one actor SEES its own differing choice', () => {
    expect(module_.phaseKey(sA)).toBe(module_.phaseKey(sB));
    expect(module_.phaseKey(sA)).toBe('judge:t1');
    const anActorSees = AUDIT.actors.some(
      (a) => JSON.stringify(module_.view(sA, a)) !== JSON.stringify(module_.view(sB, a)));
    expect(anActorSees).toBe(true);
  });

  it('every view is JSON-serializable for roster, spectator, and hostile viewers', () => {
    for (const viewer of [...AUDIT.players, ...OUTSIDERS]) {
      const view = module_.view(sA, viewer);
      expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    }
  });

  it("non-actors' views are INVARIANT under hidden-choice changes (structural leak check)", () => {
    const nonActors = [...AUDIT.players.filter((p) => !AUDIT.actors.includes(p)), ...OUTSIDERS];
    expect(nonActors.length).toBeGreaterThan(0);
    for (const viewer of nonActors) {
      expect(module_.view(sA, viewer)).toEqual(module_.view(sB, viewer));
    }
  });

  it('declared value secrets never appear in any non-owner view (engine leakedSecrets)', () => {
    const viewers = [...AUDIT.players, ...OUTSIDERS];
    expect(AUDIT.secrets(sA).length).toBeGreaterThan(0); // the fixture must actually audit something
    expect(leakedSecrets(module_, sA, viewers, [...AUDIT.secrets(sA)])).toEqual([]);
    expect(leakedSecrets(module_, sB, viewers, [...AUDIT.secrets(sB)])).toEqual([]);
  });

  it('every later phase reached by deadlines keeps views serializable; deadlines stall only in untimed phases', () => {
    let s = sA;
    for (let i = 0; i < 25; i++) {
      const next = module_.reduce(s, { type: 'deadline', at: 100_000 + i }).state;
      if (next === s) break;
      s = next;
      for (const viewer of OUTSIDERS) {
        const view = module_.view(s, viewer);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
      }
    }
    expect(module_.phaseDurationMs(s)).toBeNull(); // <= 25 deadline steps reach 'over'
  });
});
