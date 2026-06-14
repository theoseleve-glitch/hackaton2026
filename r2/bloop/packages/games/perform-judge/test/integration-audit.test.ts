// Mirrors apps/server/test-node/redaction-audit.test.ts against the REAL
// authored packs (content/packs/*.json) run through the SAME adapter that
// INTEGRATION.md §2 adds to scripts/build-packs.mjs, with the SAME audit
// fixtures as INTEGRATION.md §3. If this file is green, the copy-pasted
// registry entries + AUDITS fixtures pass the server audit as-is.
// KEEP the adapter and fixtures here in exact sync with INTEGRATION.md.
import { describe, expect, it } from 'vitest';
import { leakedSecrets, type ContentPack, type GameEvent, type PlayerId } from '@bloop/engine';
import {
  createPerformJudge,
  DEVINE_L_ACTION_CONFIG,
  DEVINE_L_OBJET_CONFIG,
  DOUBLE_LE_MOUVEMENT_CONFIG,
  MIME_INVERSE_CONFIG,
  type LText,
  type PerformJudgeAction,
  type PerformJudgeContent,
  type PerformJudgeItem,
} from '@bloop/game-perform-judge';
import gdaAuthored from '../../../../content/packs/devine-l-action.json';
import objAuthored from '../../../../content/packs/devine-l-objet.json';
import miAuthored from '../../../../content/packs/mime-inverse.json';
import dlmAuthored from '../../../../content/packs/double-le-mouvement.json';

// ---------------------------------------------------------------------------
// Pack adapter — TS mirror of the build-packs.mjs snippet (INTEGRATION.md §2)
// ---------------------------------------------------------------------------

interface AuthoredActionItem {
  id: string; action: LText; channelLabel: LText; channelRule: LText;
  forbiddenWords?: { fr: string[]; en: string[] }; intensity?: string;
}
interface AuthoredObjetItem {
  id: string; object: LText; category: LText; difficulty?: string; spicy?: number;
}
interface AuthoredMimeItem {
  id: string; action: LText; category: LText; forbidden: { fr: string[]; en: string[] }; spicyLevel?: number;
}
interface AuthoredMouvementItem {
  id: string; text: LText; hint?: LText; intensity?: string;
}

/** devine-l-action: soft+party only; channel card pre-paired at authoring. */
function adaptDevineLAction(items: AuthoredActionItem[]): PerformJudgeItem[] {
  return items
    .filter((i) => (i.intensity ?? 'soft') !== 'spicy')
    .map((i) => ({
      id: i.id,
      prompt: i.action,
      constraintLabel: i.channelLabel,
      constraintRule: i.channelRule,
      ...(i.forbiddenWords !== undefined ? { forbidden: i.forbiddenWords } : {}),
    }));
}

/** devine-l-objet: allowedDifficulties easy+medium, spicy 0 only. */
function adaptDevineLObjet(items: AuthoredObjetItem[]): PerformJudgeItem[] {
  return items
    .filter((i) => (i.spicy ?? 0) === 0 && (i.difficulty === 'easy' || i.difficulty === 'medium'))
    .map((i) => ({ id: i.id, prompt: i.object, category: i.category }));
}

/** mime-inverse: spicyLevel 0 only; forbidden words ride with the secret. */
function adaptMimeInverse(items: AuthoredMimeItem[]): PerformJudgeItem[] {
  return items
    .filter((i) => (i.spicyLevel ?? 0) === 0)
    .map((i) => ({ id: i.id, prompt: i.action, category: i.category, forbidden: i.forbidden }));
}

/** double-le-mouvement: safe intensity only; plain-string category is authoring-only. */
function adaptDoubleLeMouvement(items: AuthoredMouvementItem[]): PerformJudgeItem[] {
  return items
    .filter((i) => (i.intensity ?? 'safe') === 'safe')
    .map((i) => ({ id: i.id, prompt: i.text, ...(i.hint !== undefined ? { hint: i.hint } : {}) }));
}

const DEVINE_L_ACTION_PACK: ContentPack<PerformJudgeContent> = {
  id: 'devine-l-action-core',
  version: 1,
  data: { items: adaptDevineLAction((gdaAuthored as { items: AuthoredActionItem[] }).items) },
};
const DEVINE_L_OBJET_PACK: ContentPack<PerformJudgeContent> = {
  id: 'devine-l-objet-core',
  version: 1,
  data: { items: adaptDevineLObjet((objAuthored as { items: AuthoredObjetItem[] }).items) },
};
const MIME_INVERSE_PACK: ContentPack<PerformJudgeContent> = {
  id: 'mime-inverse-core',
  version: 1,
  data: { items: adaptMimeInverse((miAuthored as { items: AuthoredMimeItem[] }).items) },
};
const DOUBLE_LE_MOUVEMENT_PACK: ContentPack<PerformJudgeContent> = {
  id: 'double-le-mouvement-core',
  version: 1,
  data: { items: adaptDoubleLeMouvement((dlmAuthored as unknown as { items: AuthoredMouvementItem[] }).items) },
};

// ---------------------------------------------------------------------------
// Audit fixtures — keep in exact sync with INTEGRATION.md §3
// ---------------------------------------------------------------------------

const pjAct = (playerId: string, action: unknown, at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: action as PerformJudgeAction, at });

const pjVote = (playerId: string, vote: 'yes' | 'no', at: number): GameEvent<unknown> =>
  pjAct(playerId, { kind: 'vote', vote }, at);

/** Undrawn deck prompts are value secrets for EVERY viewer in every phase. */
const nextDeckSecrets = (state: unknown): Array<{ value: string; owner?: PlayerId }> => {
  const s = state as { deck: Array<{ prompt: { fr: string; en: string } }>; cursor: number };
  const next = s.deck[s.cursor];
  return next === undefined ? [] : [{ value: next.prompt.fr }, { value: next.prompt.en }];
};

interface RedactionAudit {
  players: readonly PlayerId[];
  seed: string;
  events: ReadonlyArray<GameEvent<unknown>>;
  eventsAlt: ReadonlyArray<GameEvent<unknown>>;
  actors: readonly PlayerId[];
  secrets(state: unknown): ReadonlyArray<{ value: string; owner?: PlayerId }>;
}

type PJModule = ReturnType<typeof createPerformJudge>;

// seed 'audit-seed' rotations: ['p1','p2','p3'] -> [p3,p2,p1] (performer p3);
// ['p1','p2','p3','p4'] -> [p2,p4,p3,p1] (performer p2, rate dubber p4).
const AUDITS: ReadonlyArray<[string, RedactionAudit, PJModule, ContentPack<PerformJudgeContent>]> = [
  ['devine-l-action', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    // mid-verdict turn 0: performer p3 claimed done, ONE hidden helper ballot in
    // flight (p2 still expected) — phase NOT advanced
    events: [{ type: 'deadline', at: 1_000 }, pjAct('p3', { kind: 'claimDone' }, 2_000), pjVote('p1', 'yes', 3_000)],
    eventsAlt: [{ type: 'deadline', at: 1_000 }, pjAct('p3', { kind: 'claimDone' }, 2_000), pjVote('p1', 'no', 3_000)],
    actors: ['p1'],
    // the CURRENT action is legitimately on every helper phone (others-visibility) —
    // performer-redaction is covered by the module's own leakedSecrets tests;
    // here the value secrets are the UNDRAWN deck prompts (hidden from everyone)
    secrets: nextDeckSecrets,
  }, createPerformJudge('devine-l-action', DEVINE_L_ACTION_CONFIG), DEVINE_L_ACTION_PACK],
  ['devine-l-objet', {
    players: ['p1', 'p2', 'p3', 'p4'],
    seed: 'audit-seed',
    // mid-validate turn 0: performer p2 credited p4; ONE hidden validator ballot
    // in flight (p3 still expected) — the object is public at validate by design
    events: [{ type: 'deadline', at: 1_000 }, pjAct('p2', { kind: 'claimFound', guesser: 'p4' }, 2_000), pjVote('p1', 'yes', 3_000)],
    eventsAlt: [{ type: 'deadline', at: 1_000 }, pjAct('p2', { kind: 'claimFound', guesser: 'p4' }, 2_000), pjVote('p1', 'no', 3_000)],
    actors: ['p1'],
    secrets: nextDeckSecrets,
  }, createPerformJudge('devine-l-objet', DEVINE_L_OBJET_CONFIG), DEVINE_L_OBJET_PACK],
  ['mime-inverse', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    // mid-verdict turn 0 (no ready phase): perform timed out with zero taps, ONE
    // hidden commander ballot in flight (p2 still expected)
    events: [{ type: 'deadline', at: 1_000 }, pjVote('p1', 'yes', 2_000)],
    eventsAlt: [{ type: 'deadline', at: 1_000 }, pjVote('p1', 'no', 2_000)],
    actors: ['p1'],
    secrets: nextDeckSecrets,
  }, createPerformJudge('mime-inverse', MIME_INVERSE_CONFIG), MIME_INVERSE_PACK],
  ['double-le-mouvement', {
    players: ['p1', 'p2', 'p3', 'p4'],
    seed: 'audit-seed',
    // mid-rate turn 0: the mover's SECRET PICK differs across scripts AND one
    // hidden star ballot is in flight (p3 still expected) — no view may carry
    // prompt data or star values during rate
    events: [pjAct('p2', { kind: 'pick', index: 0 }, 1_000), { type: 'deadline', at: 2_000 }, pjAct('p1', { kind: 'rate', stars: 2 }, 3_000)],
    eventsAlt: [pjAct('p2', { kind: 'pick', index: 1 }, 1_000), { type: 'deadline', at: 2_000 }, pjAct('p1', { kind: 'rate', stars: 5 }, 3_000)],
    actors: ['p2', 'p1'],
    // BOTH offered prompts (+ hints) are secrets during rate; so is the next undrawn
    secrets: (state) => {
      const s = state as { offer: Array<{ prompt: { fr: string; en: string }; hint?: { fr: string; en: string } }> };
      const out: Array<{ value: string; owner?: PlayerId }> = [];
      for (const o of s.offer) {
        out.push({ value: o.prompt.fr }, { value: o.prompt.en });
        if (o.hint !== undefined) out.push({ value: o.hint.fr }, { value: o.hint.en });
      }
      return [...out, ...nextDeckSecrets(state)];
    },
  }, createPerformJudge('double-le-mouvement', DOUBLE_LE_MOUVEMENT_CONFIG), DOUBLE_LE_MOUVEMENT_PACK],
  // CC-4 react channel — DECLARE the new hidden value (per-player reaction). Two
  // audience members SWAP their reaction enum across scripts so the PUBLIC
  // per-enum reactionCounts stay byte-identical ({fire:1, cringe:1}) while each
  // reactor's OWNER echo (myReaction) flips. This proves the hidden linkage
  // "who reacted with what" never reaches a non-owner: only the public aggregate
  // is shared. Stays in perform:0 (credit's 45s mime, performer p2 hasn't
  // claimed) so the react buffer is live and unredacted at audit time.
  ['devine-l-objet-react', {
    players: ['p1', 'p2', 'p3', 'p4'],
    seed: 'audit-seed',
    // performer p2; audience reactors p1/p3/p4. p1 + p3 react, swapping enums.
    events: [
      { type: 'deadline', at: 1_000 },
      pjAct('p1', { kind: 'react', reaction: 'fire' }, 2_000),
      pjAct('p3', { kind: 'react', reaction: 'cringe' }, 3_000),
    ],
    eventsAlt: [
      { type: 'deadline', at: 1_000 },
      pjAct('p1', { kind: 'react', reaction: 'cringe' }, 2_000),
      pjAct('p3', { kind: 'react', reaction: 'fire' }, 3_000),
    ],
    actors: ['p1', 'p3'],
    secrets: nextDeckSecrets,
  }, createPerformJudge('devine-l-objet-react', DEVINE_L_OBJET_CONFIG), DEVINE_L_OBJET_PACK],
];

// ---------------------------------------------------------------------------
// Audit machinery — replicated verbatim from redaction-audit.test.ts
// ---------------------------------------------------------------------------

const OUTSIDERS = ['viewer-not-in-roster', '__proto__'] as const;

function fold(
  module: PJModule,
  audit: RedactionAudit,
  content: ContentPack<PerformJudgeContent>,
  events: ReadonlyArray<GameEvent<unknown>>,
) {
  let state = module.init(audit.seed, [...audit.players], content);
  for (const e of events) {
    const next = module.reduce(state, e as GameEvent<PerformJudgeAction>).state;
    if (next === state) throw new Error(`audit fixture event was rejected by reduce: ${JSON.stringify(e)}`);
    state = next;
  }
  return state;
}

describe('adapter sanity — the authored packs feed full matches', () => {
  it('devine-l-action: >= 32 soft/party cards, authoring-only fields stripped', () => {
    const items = DEVINE_L_ACTION_PACK.data.items;
    expect(items.length).toBeGreaterThanOrEqual(32); // 16 players x 2 laps
    const json = JSON.stringify(items);
    for (const field of ['"tags"', '"difficulty"', '"intensity"', '"props"', '"channel"']) {
      expect(json).not.toContain(field);
    }
    expect(items.some((i) => i.forbidden !== undefined)).toBe(true); // taboo channel cards survive
    expect(items.every((i) => i.constraintLabel !== undefined && i.constraintRule !== undefined)).toBe(true);
  });

  it('devine-l-objet: >= 32 easy/medium objects with public categories', () => {
    const items = DEVINE_L_OBJET_PACK.data.items;
    expect(items.length).toBeGreaterThanOrEqual(32);
    expect(items.every((i) => i.category !== undefined)).toBe(true);
    expect(JSON.stringify(items)).not.toContain('"spicy"');
  });

  it('mime-inverse: >= 16 safe actions, each with forbidden words', () => {
    const items = MIME_INVERSE_PACK.data.items;
    expect(items.length).toBeGreaterThanOrEqual(16); // 16 players x 1 lap
    expect(items.every((i) => i.forbidden !== undefined && i.forbidden.fr.length >= 3)).toBe(true);
  });

  it('double-le-mouvement: >= 32 safe prompts (16 players x 1 lap x 2 choices)', () => {
    const items = DOUBLE_LE_MOUVEMENT_PACK.data.items;
    expect(items.length).toBeGreaterThanOrEqual(32);
    expect(JSON.stringify(items)).not.toContain('"category"'); // plain-string authoring field dropped
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

      it('every later phase reached by deadlines keeps views serializable; <= 25 steps reach untimed', () => {
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
