import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leakedSecrets, type ContentPack, type GameEvent } from '@bloop/engine';
import type { SecretRoleAction, SecretRoleContent, SecretRoleState } from '@bloop/game-secret-role';
import { game } from './helpers.js';

/**
 * Pre-validates the EXACT redaction-audit fixture shipped in INTEGRATION.md §3
 * against the REAL authored pack (content/packs/double-jeu.json) mapped through
 * the build-packs.mjs adapter. The audit's leakedSecrets check is substring
 * containment on serialized views, so a collision between the seeded current
 * item's words and any public view string (the theme, ids, chrome) would fail
 * the server suite — catch it here, in the package that owns the fixture.
 */

interface AuthoredItem {
  id: string;
  theme: { fr: string; en: string };
  majority: { fr: string; en: string };
  impostor: { fr: string; en: string };
  spicyLevel?: number;
}

// Same mapping as scripts/build-packs.mjs (spicy-0 + theme-leak lint).
function loadRealPack(): ContentPack<SecretRoleContent> {
  const raw = JSON.parse(
    readFileSync(new URL('../../../../content/packs/double-jeu.json', import.meta.url), 'utf8'),
  ) as { gameId: string; version?: number; items: AuthoredItem[] };
  const themeLeaks = (i: AuthoredItem): boolean =>
    [i.majority.fr, i.majority.en, i.impostor.fr, i.impostor.en]
      .some((w) => i.theme.fr.includes(w) || i.theme.en.includes(w));
  const items = raw.items
    .filter((i) => (i.spicyLevel ?? 0) === 0 && !themeLeaks(i))
    .map((i) => ({ id: i.id, theme: i.theme, majority: i.majority, impostor: i.impostor }));
  return { id: `${raw.gameId}-core`, version: raw.version ?? 1, data: { items } };
}

const vote = (playerId: string, target: string, at: number): GameEvent<SecretRoleAction> =>
  ({ type: 'action', playerId, action: { kind: 'vote', target }, at });
const lean = (playerId: string, target: string, at: number): GameEvent<SecretRoleAction> =>
  ({ type: 'action', playerId, action: { kind: 'lean', target }, at });
const dl = (at: number): GameEvent<SecretRoleAction> => ({ type: 'deadline', at });

// INTEGRATION.md §3, verbatim.
const PLAYERS = ['p1', 'p2', 'p3', 'p4'];
const SEED = 'audit-seed';
const EVENTS: ReadonlyArray<GameEvent<SecretRoleAction>> = [dl(1_000), dl(2_000), vote('p1', 'p2', 3_000), vote('p2', 'p3', 4_000)];
const EVENTS_ALT: ReadonlyArray<GameEvent<SecretRoleAction>> = [dl(1_000), dl(2_000), vote('p1', 'p3', 3_000), vote('p2', 'p1', 4_000)];
const ACTORS = ['p1', 'p2'];
const OUTSIDERS = ['viewer-not-in-roster', '__proto__'];

function fixtureSecrets(s: SecretRoleState): Array<{ value: string }> {
  const item = s.items[s.match];
  if (item === undefined) return [];
  return [
    { value: item.majority.fr },
    { value: item.majority.en },
    { value: item.impostor.fr },
    { value: item.impostor.en },
  ];
}

function fold(content: ContentPack<SecretRoleContent>, events: ReadonlyArray<GameEvent<SecretRoleAction>>): SecretRoleState {
  let state = game.init(SEED, [...PLAYERS], content);
  for (const e of events) {
    const next = game.reduce(state, e).state;
    if (next === state) throw new Error(`audit fixture event was rejected by reduce: ${JSON.stringify(e)}`);
    state = next;
  }
  return state;
}

describe('redaction-audit fixture (INTEGRATION.md §3) against the real authored pack', () => {
  const content = loadRealPack();
  const sA = fold(content, EVENTS);
  const sB = fold(content, EVENTS_ALT);

  it('the real pack survives the adapter with enough items for a full session', () => {
    expect(content.data.items.length).toBeGreaterThanOrEqual(3);
  });

  it('fixture is live: same phaseKey both scripts, an actor sees its own differing choice', () => {
    expect(game.phaseKey(sA)).toBe('vote:m0:p0');
    expect(game.phaseKey(sB)).toBe('vote:m0:p0');
    const anActorSees = ACTORS.some(
      (a) => JSON.stringify(game.view(sA, a)) !== JSON.stringify(game.view(sB, a)));
    expect(anActorSees).toBe(true);
  });

  it("non-actors' views are invariant under hidden-choice changes", () => {
    for (const viewer of ['p3', 'p4', ...OUTSIDERS]) {
      expect(game.view(sA, viewer)).toEqual(game.view(sB, viewer));
    }
  });

  it('declared value secrets never appear in any non-owner view (real words, real theme)', () => {
    const viewers = [...PLAYERS, ...OUTSIDERS];
    expect(leakedSecrets(game, sA, viewers, fixtureSecrets(sA))).toEqual([]);
    expect(leakedSecrets(game, sB, viewers, fixtureSecrets(sB))).toEqual([]);
  });

  it('every view is JSON-serializable for roster, spectator, and hostile viewers', () => {
    for (const viewer of [...PLAYERS, ...OUTSIDERS]) {
      const view = game.view(sA, viewer);
      expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    }
  });

  it('reaches an untimed phase within the audit walk budget (25 deadlines)', () => {
    let s = sA;
    let steps = 0;
    for (let i = 0; i < 25; i++) {
      const next = game.reduce(s, dl(100_000 + i)).state;
      if (next === s) break;
      s = next;
      steps += 1;
      for (const viewer of OUTSIDERS) {
        const view = game.view(s, viewer);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
      }
    }
    expect(game.phaseDurationMs(s)).toBeNull();
    expect(game.phaseKey(s)).toBe('over');
    expect(steps).toBe(19); // 4 beats finish match 0, +1 into m1, then 7 x 2 matches
  });
});

/**
 * REDACTION-AUDIT EXTENSION — the CC-1 "lean" hidden side-bet.
 *
 * DECLARED HIDDEN VALUE: `state.leans` — a bettor->suspected-impostor map written
 * during `discuss`. It joins `votes`, `pendingPoints`, the per-match words and the
 * `impostor` id on the hidden-value ledger. Its redaction contract (proved below):
 *   - OWNER-ONLY echo: a viewer sees their OWN lean (`myLean`) and the public
 *     aggregate `leanCount`; NEVER another player's suspect.
 *   - The raw buffer (`"leans"`) NEVER serializes in any view.
 *   - Non-owner views are INVARIANT under a change of hidden lean targets — so a
 *     lean can never be inverted to out the impostor mid-match.
 * Run against the REAL authored pack (same adapter as above) so a value collision
 * with public chrome would be caught here, in the package that owns the fixture.
 */
describe('redaction-audit fixture — CC-1 lean side-bet (declared hidden value)', () => {
  const content = loadRealPack();
  // Fold to discuss p0 (one deadline past secretReveal), then place DIFFERING
  // hidden leans in two parallel worlds; only the owners may tell them apart.
  const toDiscuss = (events: ReadonlyArray<GameEvent<SecretRoleAction>>): SecretRoleState => {
    let state = game.init(SEED, [...PLAYERS], content);
    for (const e of [dl(1_000) as GameEvent<SecretRoleAction>, ...events]) {
      const next = game.reduce(state, e).state;
      if (next === state) throw new Error(`lean audit event rejected: ${JSON.stringify(e)}`);
      state = next;
    }
    return state;
  };

  const LEANS = [lean('p1', 'p2', 2_000), lean('p2', 'p3', 3_000)];
  const LEANS_ALT = [lean('p1', 'p4', 2_000), lean('p2', 'p4', 3_000)];
  const sLean = toDiscuss(LEANS);
  const sLeanAlt = toDiscuss(LEANS_ALT);

  it('the fixture is live in discuss p0 with leans placed (both worlds)', () => {
    expect(game.phaseKey(sLean)).toBe('discuss:m0:p0');
    expect(game.phaseKey(sLeanAlt)).toBe('discuss:m0:p0');
    const own = game.view(sLean, 'p1');
    if (own.phase !== 'discuss') throw new Error('expected discuss view');
    expect(own.myLean).toBe('p2'); // owner echo present
    expect(own.leanCount).toBe(2); // public aggregate present
  });

  it("non-owners' views are invariant under hidden-lean changes; only owners differ", () => {
    for (const viewer of ['p3', 'p4', ...OUTSIDERS]) {
      expect(game.view(sLean, viewer)).toEqual(game.view(sLeanAlt, viewer));
    }
    const anOwnerSees = ['p1', 'p2'].some(
      (a) => JSON.stringify(game.view(sLean, a)) !== JSON.stringify(game.view(sLeanAlt, a)));
    expect(anOwnerSees).toBe(true);
  });

  it('the raw lean buffer never serializes in any view (owner, non-owner, hostile)', () => {
    for (const viewer of [...PLAYERS, ...OUTSIDERS]) {
      expect(JSON.stringify(game.view(sLean, viewer))).not.toContain('"leans"');
    }
  });

  it('the declared lean value reaches ONLY its owner — leakedSecrets finds no non-owner exposure', () => {
    // Distinctive non-id leans are impossible (targets must be roster ids that
    // appear publicly), so we assert owner-binding directly: each bettor's view
    // carries its own suspect; no OTHER roster/outsider view carries it as a lean.
    const viewers = [...PLAYERS, ...OUTSIDERS];
    // p1 secretly suspects p2. Every NON-p1 viewer's discuss view must report
    // myLean === their own (or null), never "p2 as p1's pick".
    for (const viewer of viewers) {
      const v = game.view(sLean, viewer);
      if (v.phase !== 'discuss') throw new Error('expected discuss view');
      if (viewer === 'p1') expect(v.myLean).toBe('p2');
      else if (viewer === 'p2') expect(v.myLean).toBe('p3');
      else expect(v.myLean).toBeNull();
    }
    // Belt-and-braces against the engine's substring auditor on the buffer key.
    expect(leakedSecrets(game, sLean, viewers, [{ value: '"leans":' }])).toEqual([]);
  });
});
