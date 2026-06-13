import { describe, expect, it } from 'vitest';
import { leakedSecrets, type GameEvent, type PlayerId } from '@bloop/engine';
import { listGames, type GameEntry } from '../src/room/registry.js';

/**
 * Per-game audit FIXTURE (adversarial review I5). The machinery below is
 * fully generic; only this data is per-game — valid actions cannot be
 * synthesized without knowing the game's action shape. The coverage test
 * fails the moment a game is registered without a fixture, so every future
 * registry entry is audited automatically.
 */
interface RedactionAudit {
  players: readonly PlayerId[];
  seed: string;
  /** Drives init -> a representative MID-GAME state in which hidden state exists. */
  events: ReadonlyArray<GameEvent<unknown>>;
  /** The same script with ONLY the actors' hidden choices changed. */
  eventsAlt: ReadonlyArray<GameEvent<unknown>>;
  /** Players whose hidden choices differ across the scripts (their own views MAY differ). */
  actors: readonly PlayerId[];
  /**
   * Value-bearing secrets for engine leakedSecrets (roles, secret words,
   * answer keys). Empty when the game's secrets are structural — tracer's
   * ballots are playerId->playerId and every playerId legitimately appears in
   * views, so substring auditing cannot apply; the invariance check below
   * covers those instead.
   */
  secrets(state: unknown): ReadonlyArray<{ value: string; owner?: PlayerId }>;
}

const vote = (playerId: string, target: string, at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'vote', target }, at });

const ballot = (playerId: string, pick: 'A' | 'B', predict: 'A' | 'B' | null, at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'ballot', pick, ...(predict !== null ? { predict } : {}) }, at });

const igGuess = (playerId: string, value: number, at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'guess', value }, at });

const igPick = (playerId: string, cardIndex: number, at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'pick', cardIndex }, at });

const tdChoose = (playerId: string, choice: 'truth' | 'dare', at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'chooseType', choice }, at });
const tdDeclare = (playerId: string, at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'declare', result: 'done' }, at });
const tdVote = (playerId: string, vote: 'done' | 'chickened', at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'verdict', vote }, at });
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

const sgGuess = (playerId: string, value: number, at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'guess', value }, at });
const sgAnswer = (playerId: string, answerIndex: number, at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'answer', answerIndex }, at });
const sgDeadlines = (n: number): GameEvent<unknown>[] =>
  Array.from({ length: n }, (_, i) => ({ type: 'deadline' as const, at: 1_000 + i }));

const lsWord = (playerId: string, at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'wordSaid' }, at });
const lsJudge = (playerId: string, vote: 'valid' | 'reject', at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'judge', vote }, at });

const rhAck = (playerId: string, at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'ackRule' }, at });
const rhAccuse = (playerId: string, target: string, at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'accuse', target }, at });
const rhVote = (playerId: string, guilty: boolean, at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action: { kind: 'tribunalVote', guilty }, at });

const pjAct = (playerId: string, action: unknown, at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action, at });
const pjVote = (playerId: string, vote: 'yes' | 'no', at: number): GameEvent<unknown> =>
  pjAct(playerId, { kind: 'vote', vote }, at);
const pjDeckSecrets = (state: unknown): Array<{ value: string; owner?: PlayerId }> => {
  const s = state as { deck: Array<{ prompt: { fr: string; en: string } }>; cursor: number };
  const next = s.deck[s.cursor];
  return next === undefined ? [] : [{ value: next.prompt.fr }, { value: next.prompt.en }];
};

const AUDITS: ReadonlyMap<string, RedactionAudit> = new Map([
  ['tracer', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    // mid-vote-phase: two secret ballots in flight, phase NOT yet advanced
    events: [vote('p1', 'p2', 1_000), vote('p2', 'p3', 2_000)],
    eventsAlt: [vote('p1', 'p3', 1_000), vote('p2', 'p1', 2_000)],
    actors: ['p1', 'p2'],
    secrets: () => [],
  }],
  ['pires-potes', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    // mid-vote round 0: two secret ballots buffered, p3 still expected — phase NOT advanced
    events: [vote('p1', 'p2', 1_000), vote('p2', 'p3', 2_000)],
    eventsAlt: [vote('p1', 'p3', 1_000), vote('p2', 'p1', 2_000)],
    actors: ['p1', 'p2'],
    // ballots are structural (playerId -> playerId) — invariance covers them, like tracer's
    secrets: () => [],
  }],
  ['tu-preferes', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    // mid-choose: two atomic {pick, predict} ballots buffered, p3 still expected
    events: [ballot('p1', 'A', 'A', 1_000), ballot('p2', 'B', 'A', 2_000)],
    eventsAlt: [ballot('p1', 'B', 'B', 1_000), ballot('p2', 'A', 'B', 2_000)],
    actors: ['p1', 'p2'],
    // ballots are structural ('A'/'B' legitimately appear in option labels) — invariance covers them
    secrets: () => [],
  }],
  ['gauche-ou-droite', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    // mid-vote: two pick-only ballots buffered, p3 still expected
    events: [ballot('p1', 'A', null, 1_000), ballot('p2', 'B', null, 2_000)],
    eventsAlt: [ballot('p1', 'B', null, 1_000), ballot('p2', 'A', null, 2_000)],
    actors: ['p1', 'p2'],
    secrets: () => [],
  }],
  ['double-jeu', {
    players: ['p1', 'p2', 'p3', 'p4'],  // module minPlayers is 4
    seed: 'audit-seed',
    // Two deadlines skip secretReveal + discuss p0, then two secret accusation
    // ballots are buffered mid-vote m0 p0 — p3/p4 still expected, phase NOT
    // advanced. Both scripts produce identical hasVoted booleans and (at any
    // later deadline) a top TIE, so the resolution path is identical too.
    events: [
      { type: 'deadline', at: 1_000 },
      { type: 'deadline', at: 2_000 },
      vote('p1', 'p2', 3_000),
      vote('p2', 'p3', 4_000),
    ],
    eventsAlt: [
      { type: 'deadline', at: 1_000 },
      { type: 'deadline', at: 2_000 },
      vote('p1', 'p3', 3_000),
      vote('p2', 'p1', 4_000),
    ],
    actors: ['p1', 'p2'],
    // The current match's majority AND impostor words are VALUE secrets: at the
    // mid-vote fixture state NO view carries any word (myItem exists only in
    // secretReveal views), so no owner exemption is declared. The impostor
    // IDENTITY is also secret pre-finalReveal but is structural (a player id —
    // every id legitimately appears in views), so substring auditing cannot
    // apply: it is covered by the non-actor invariance check here plus the
    // package's own field-level tests (test/redaction.test.ts).
    secrets: (state: unknown) => {
      const s = state as {
        match: number;
        items: Array<{ majority: { fr: string; en: string }; impostor: { fr: string; en: string } }>;
      };
      const item = s.items[s.match];
      if (item === undefined) return [];
      return [
        { value: item.majority.fr },
        { value: item.majority.en },
        { value: item.impostor.fr },
        { value: item.impostor.en },
      ];
    },
  }],
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
    secrets: (state: unknown) => {
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
  }],
  ['cinquante-cinquante', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    // mid-pick round 0: two secret card picks buffered, p3 still expected — phase NOT advanced
    events: [igPick('p1', 0, 1_000), igPick('p2', 1, 2_000)],
    eventsAlt: [igPick('p1', 4, 1_000), igPick('p2', 5, 2_000)],
    actors: ['p1', 'p2'],
    // the current item's pre-computed crowd percentages are VALUE secrets until reveal
    secrets: (state: unknown) => {
      const s = state as {
        round: number;
        items: Array<{ completions?: Array<{ crowdYesPct: number }> }>;
      };
      const item = s.items[s.round];
      return (item?.completions ?? []).map((c) => ({ value: String(c.crowdYesPct) }));
    },
  }],
  ['truth-or-dare-2', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    events: [
      tdChoose('p3', 'truth', 1_000), tdDeclare('p3', 2_000),
      tdVote('p1', 'done', 3_000), tdVote('p2', 'done', 4_000),
      { type: 'deadline', at: 5_000 },
      tdChoose('p1', 'truth', 6_000), tdDeclare('p1', 7_000),
      tdVote('p2', 'done', 8_000),
    ],
    eventsAlt: [
      tdChoose('p3', 'truth', 1_000), tdDeclare('p3', 2_000),
      tdVote('p1', 'done', 3_000), tdVote('p2', 'done', 4_000),
      { type: 'deadline', at: 5_000 },
      tdChoose('p1', 'truth', 6_000), tdDeclare('p1', 7_000),
      tdVote('p2', 'chickened', 8_000),
    ],
    actors: ['p2'],
    secrets: tdUndrawnTexts,
  }],
  ['truth-or-drink', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    events: [tdDeclare('p3', 1_000), tdVote('p1', 'done', 2_000)],
    eventsAlt: [tdDeclare('p3', 1_000), tdVote('p1', 'chickened', 2_000)],
    actors: ['p1'],
    secrets: tdUndrawnTexts,
  }],
  ['jeu-de-la-note', {
    players: ['p1', 'p2', 'p3', 'p4'],
    seed: 'audit-seed-note',
    events: [...sgDeadlines(10), sgGuess('p1', 3, 11_000), sgGuess('p3', 5, 12_000)],
    eventsAlt: [...sgDeadlines(10), sgGuess('p1', 4, 11_000), sgGuess('p3', 6, 12_000)],
    actors: ['p1', 'p3'],
    secrets: (state: unknown) => {
      const s = state as { round: number; spotIndex: number; turnOrder: string[]; targets: number[] };
      const t = s.targets[s.round];
      if (t === undefined) return [];
      return [{ value: String(t), owner: s.turnOrder[s.spotIndex] }];
    },
  }],
  ['devine-la-question', {
    players: ['p1', 'p2', 'p3', 'p4'],
    seed: 'audit-seed',
    events: [sgAnswer('p1', 0, 1_000), sgGuess('p2', 1, 2_000), sgGuess('p3', 2, 3_000)],
    eventsAlt: [sgAnswer('p1', 0, 1_000), sgGuess('p2', 4, 2_000), sgGuess('p3', 0, 3_000)],
    actors: ['p2', 'p3'],
    secrets: (state: unknown) => {
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
  }],
  ['jeu-du-theme', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    events: [{ type: 'deadline', at: 500 }, lsWord('p3', 1_000), lsJudge('p1', 'valid', 2_000)],
    eventsAlt: [{ type: 'deadline', at: 500 }, lsWord('p3', 1_000), lsJudge('p1', 'reject', 2_000)],
    actors: ['p1'],
    secrets: (state: unknown) => {
      const s = state as { deck: Array<{ theme: { fr: string; en: string } }>; themeCursor: number };
      return s.deck.slice(s.themeCursor).flatMap((i) => [{ value: i.theme.fr }, { value: i.theme.en }]);
    },
  }],
  ['trouvez-la-regle', {
    players: ['p1', 'p2', 'p3', 'p4', 'p5'],
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
    actors: ['p4', 'p5'],
    secrets: (state: unknown) => {
      const s = state as {
        round: number;
        items: Array<{ rule: { fr: string; en: string }; decoys: Array<{ fr: string; en: string }> }>;
      };
      const current = s.items[s.round];
      const future = s.items.slice(s.round + 1, s.round + 3);
      return [
        ...(current?.decoys ?? []).flatMap((d) => [{ value: d.fr }, { value: d.en }]),
        ...future.flatMap((i) => [{ value: i.rule.fr }, { value: i.rule.en }]),
      ];
    },
  }],
  ['loup-garou', {
    players: ['p1', 'p2', 'p3', 'p4', 'p5'],
    seed: 'audit-seed',
    events: [
      { type: 'playerLeft', playerId: 'p3', at: 500 },
      { type: 'playerLeft', playerId: 'p4', at: 600 },
      { type: 'playerLeft', playerId: 'p5', at: 700 },
      { type: 'deadline', at: 1_000 },
      { type: 'action', playerId: 'p2', action: { kind: 'seerPeek', target: 'p4' }, at: 2_000 },
      { type: 'deadline', at: 3_000 },
      { type: 'action', playerId: 'p1', action: { kind: 'wolfVote', target: 'p3' }, at: 4_000 },
    ],
    eventsAlt: [
      { type: 'playerLeft', playerId: 'p3', at: 500 },
      { type: 'playerLeft', playerId: 'p4', at: 600 },
      { type: 'playerLeft', playerId: 'p5', at: 700 },
      { type: 'deadline', at: 1_000 },
      { type: 'action', playerId: 'p2', action: { kind: 'seerPeek', target: 'p5' }, at: 2_000 },
      { type: 'deadline', at: 3_000 },
      { type: 'action', playerId: 'p1', action: { kind: 'wolfVote', target: 'p4' }, at: 4_000 },
    ],
    actors: ['p1', 'p2'],
    secrets: (state: unknown) => {
      const s = state as { players: string[]; roles: Record<string, string> };
      return s.players.map((p) => ({ value: `"${p}":"${s.roles[p]}"`, owner: p }));
    },
  }],
  ['devine-l-action', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    events: [{ type: 'deadline', at: 1_000 }, pjAct('p3', { kind: 'claimDone' }, 2_000), pjVote('p1', 'yes', 3_000)],
    eventsAlt: [{ type: 'deadline', at: 1_000 }, pjAct('p3', { kind: 'claimDone' }, 2_000), pjVote('p1', 'no', 3_000)],
    actors: ['p1'],
    secrets: pjDeckSecrets,
  }],
  ['devine-l-objet', {
    players: ['p1', 'p2', 'p3', 'p4'],
    seed: 'audit-seed',
    events: [{ type: 'deadline', at: 1_000 }, pjAct('p2', { kind: 'claimFound', guesser: 'p4' }, 2_000), pjVote('p1', 'yes', 3_000)],
    eventsAlt: [{ type: 'deadline', at: 1_000 }, pjAct('p2', { kind: 'claimFound', guesser: 'p4' }, 2_000), pjVote('p1', 'no', 3_000)],
    actors: ['p1'],
    secrets: pjDeckSecrets,
  }],
  ['mime-inverse', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    events: [{ type: 'deadline', at: 1_000 }, pjVote('p1', 'yes', 2_000)],
    eventsAlt: [{ type: 'deadline', at: 1_000 }, pjVote('p1', 'no', 2_000)],
    actors: ['p1'],
    secrets: pjDeckSecrets,
  }],
  ['double-le-mouvement', {
    players: ['p1', 'p2', 'p3', 'p4'],
    seed: 'audit-seed',
    events: [pjAct('p2', { kind: 'pick', index: 0 }, 1_000), { type: 'deadline', at: 2_000 }, pjAct('p1', { kind: 'rate', stars: 2 }, 3_000)],
    eventsAlt: [pjAct('p2', { kind: 'pick', index: 1 }, 1_000), { type: 'deadline', at: 2_000 }, pjAct('p1', { kind: 'rate', stars: 5 }, 3_000)],
    actors: ['p2', 'p1'],
    secrets: (state: unknown) => {
      const s = state as { offer: Array<{ prompt: { fr: string; en: string }; hint?: { fr: string; en: string } }> };
      const out: Array<{ value: string; owner?: PlayerId }> = [];
      for (const o of s.offer) {
        out.push({ value: o.prompt.fr }, { value: o.prompt.en });
        if (o.hint !== undefined) out.push({ value: o.hint.fr }, { value: o.hint.en });
      }
      return [...out, ...pjDeckSecrets(state)];
    },
  }],
]);

/** Viewer classes that must never receive hidden state: a non-roster spectator and a hostile prototype-chain id. */
const OUTSIDERS = ['viewer-not-in-roster', '__proto__'] as const;

function fold(entry: GameEntry, audit: RedactionAudit, events: ReadonlyArray<GameEvent<unknown>>): unknown {
  let state: unknown = entry.module.init(audit.seed, [...audit.players], entry.content);
  for (const e of events) {
    const next = entry.module.reduce(state, e).state;
    // a rejected fixture event (same reference, I4) would make the audit vacuous — fail loud
    if (next === state) throw new Error(`audit fixture event was rejected by reduce: ${JSON.stringify(e)}`);
    state = next;
  }
  return state;
}

describe('redaction audit — every registry entry (review I5)', () => {
  it('every registered game declares an audit fixture', () => {
    expect(listGames().map(([id]) => id).sort()).toEqual([...AUDITS.keys()].sort());
  });

  for (const [id, entry] of listGames()) {
    const audit = AUDITS.get(id);
    if (audit === undefined) continue; // the coverage test above already failed

    describe(id, () => {
      const sA = fold(entry, audit, audit.events);
      const sB = fold(entry, audit, audit.eventsAlt);

      it('fixture is live: same phase both scripts, and at least one actor SEES its own differing choice', () => {
        expect(entry.module.phaseKey(sA)).toBe(entry.module.phaseKey(sB));
        const anActorSees = audit.actors.some(
          (a) => JSON.stringify(entry.module.view(sA, a)) !== JSON.stringify(entry.module.view(sB, a)));
        expect(anActorSees).toBe(true); // guards against a vacuous fixture
      });

      it('every view is JSON-serializable for roster, spectator, and hostile viewers', () => {
        for (const viewer of [...audit.players, ...OUTSIDERS]) {
          const view = entry.module.view(sA, viewer);
          // toEqual (not toStrictEqual): views may carry null-prototype player maps by design
          expect(JSON.parse(JSON.stringify(view))).toEqual(view);
        }
      });

      it("non-actors' views are INVARIANT under hidden-choice changes (structural leak check)", () => {
        const nonActors = [...audit.players.filter((p) => !audit.actors.includes(p)), ...OUTSIDERS];
        expect(nonActors.length).toBeGreaterThan(0);
        for (const viewer of nonActors) {
          expect(entry.module.view(sA, viewer)).toEqual(entry.module.view(sB, viewer));
        }
      });

      it('declared value secrets never appear in any non-owner view (engine leakedSecrets)', () => {
        const viewers = [...audit.players, ...OUTSIDERS];
        expect(leakedSecrets(entry.module, sA, viewers, [...audit.secrets(sA)])).toEqual([]);
        expect(leakedSecrets(entry.module, sB, viewers, [...audit.secrets(sB)])).toEqual([]);
      });

      it('every later phase reached by deadlines keeps views serializable; deadlines stall only in untimed phases', () => {
        let s = sA;
        for (let i = 0; i < 25; i++) {
          const next = entry.module.reduce(s, { type: 'deadline', at: 100_000 + i }).state;
          if (next === s) break; // absorbed (I4)
          s = next;
          for (const viewer of OUTSIDERS) {
            const view = entry.module.view(s, viewer);
            expect(JSON.parse(JSON.stringify(view))).toEqual(view);
          }
        }
        // a module may only ignore a deadline when the phase is untimed — otherwise rooms would stall
        expect(entry.module.phaseDurationMs(s)).toBeNull();
      });
    });
  }
});
