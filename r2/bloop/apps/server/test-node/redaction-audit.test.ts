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
  }],
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
