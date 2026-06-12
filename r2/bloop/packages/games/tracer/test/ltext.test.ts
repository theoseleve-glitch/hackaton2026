import { describe, expect, it } from 'vitest';
import type { ContentPack, GameEvent } from '@bloop/engine';
import {
  createTracer,
  PIRES_POTES_CONFIG,
  tracer,
  type LText,
  type TracerAction,
  type TracerContent,
  type TracerPrompt,
} from '@bloop/game-tracer';

const cards: LText[] = [
  { fr: 'Qui oublierait l’anniversaire de sa propre mère ?', en: 'Who would forget their own mom’s birthday?' },
  { fr: 'Qui vendrait LA photo dossier du groupe ?', en: 'Who would sell the group’s most embarrassing photo?' },
  { fr: 'Qui accuserait le GPS ?', en: 'Who would blame the GPS?' },
];
const content: ContentPack<TracerContent> = { id: 'pp-pack', version: 1, data: { prompts: cards } };
const players = ['p1', 'p2', 'p3'];
const pp = createTracer('pires-potes', PIRES_POTES_CONFIG);
const vote = (playerId: string, target: string, at = 0): GameEvent<TracerAction> =>
  ({ type: 'action', playerId, action: { kind: 'vote', target }, at });
const byEn = (a: TracerPrompt, b: TracerPrompt): number =>
  (typeof a === 'string' ? a : a.en).localeCompare(typeof b === 'string' ? b : b.en);

describe('bilingual LText prompts (pires-potes)', () => {
  it('view() passes the LText prompt through AS-IS in vote and reveal phases', () => {
    const s0 = pp.init('seed', players, content);
    const v0 = pp.view(s0, 'p1');
    if (v0.phase !== 'vote') throw new Error('expected vote view');
    expect(v0.prompt).toBe(s0.prompts[0]); // same reference — no copy, no locale pick server-side
    expect(cards).toContainEqual(v0.prompt);

    const s1 = pp.reduce(s0, { type: 'deadline', at: 1 }).state;
    const v1 = pp.view(s1, 'p1');
    if (v1.phase !== 'reveal') throw new Error('expected reveal view');
    expect(v1.prompt).toBe(s1.prompts[0]);
  });

  it('shuffles LText prompts deterministically by seed (no card mangling)', () => {
    const a = pp.init('seed-1', players, content);
    const b = pp.init('seed-1', players, content);
    expect(a.prompts).toEqual(b.prompts);
    expect([...a.prompts].sort(byEn)).toEqual([...cards].sort(byEn));
  });

  it('supports mixed string | LText pools (back-compat packs still work)', () => {
    const mixed: ContentPack<TracerContent> = {
      id: 'mixed', version: 1,
      data: { prompts: ['Plain string card?', { fr: 'Carte FR', en: 'EN card' }] },
    };
    let s = pp.init('seed', players, mixed);
    const seen: TracerPrompt[] = [];
    while (s.phase !== 'over') {
      const v = pp.view(s, 'p1');
      if (v.phase === 'vote') seen.push(v.prompt);
      s = pp.reduce(s, { type: 'deadline', at: seen.length }).state;
    }
    expect(seen).toHaveLength(2);
    expect(seen).toContainEqual('Plain string card?');
    expect(seen).toContainEqual({ fr: 'Carte FR', en: 'EN card' });
  });

  it('every view is JSON-serializable for roster, spectator, and "__proto__" viewers, in every phase', () => {
    let s = pp.init('seed', players, content);
    const viewers = [...players, 'spectator-x', '__proto__'];
    for (let i = 0; i < 30 && s.phase !== 'over'; i++) {
      for (const viewer of viewers) {
        const view = pp.view(s, viewer);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
      }
      s = pp.reduce(s, { type: 'deadline', at: i }).state;
    }
    expect(s.phase).toBe('over');
    for (const viewer of viewers) {
      const view = pp.view(s, viewer);
      expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    }
  });

  it('phaseKey never embeds card text in either language (keys are loggable)', () => {
    let s = pp.init('seed', players, content);
    const keys: string[] = [pp.phaseKey(s)];
    while (s.phase !== 'over') {
      s = pp.reduce(s, { type: 'deadline', at: keys.length }).state;
      keys.push(pp.phaseKey(s));
    }
    for (const key of keys) {
      expect(key).toMatch(/^[a-z]+(:\d+)?$/);
      for (const c of cards) {
        expect(key).not.toContain(c.fr);
        expect(key).not.toContain(c.en);
      }
    }
  });

  it('the legacy `tracer` instance accepts an LText pack too (shared machinery)', () => {
    const s = tracer.init('seed', players, content);
    const v = tracer.view(s, 'spectator');
    if (v.phase !== 'vote') throw new Error('expected vote view');
    expect(cards).toContainEqual(v.prompt);
    expect(v.myVote).toBeNull();
  });
});

describe('pires-potes redaction-audit rehearsal (server fixture shape)', () => {
  // Two scripts differing ONLY in the actors' hidden votes — mid-vote, p3 still expected.
  const events = [vote('p1', 'p2', 1_000), vote('p2', 'p3', 2_000)];
  const eventsAlt = [vote('p1', 'p3', 1_000), vote('p2', 'p1', 2_000)];
  const fold = (script: GameEvent<TracerAction>[]) => {
    let s = pp.init('audit-seed', players, content);
    for (const e of script) {
      const next = pp.reduce(s, e).state;
      if (next === s) throw new Error('fixture event rejected');
      s = next;
    }
    return s;
  };
  const sA = fold(events);
  const sB = fold(eventsAlt);

  it('fixture is live: same phaseKey both scripts; an actor SEES its own differing vote', () => {
    expect(pp.phaseKey(sA)).toBe(pp.phaseKey(sB));
    expect(JSON.stringify(pp.view(sA, 'p1'))).not.toBe(JSON.stringify(pp.view(sB, 'p1')));
  });

  it("non-actors' views are INVARIANT under hidden-vote changes (incl. spectator + __proto__)", () => {
    for (const viewer of ['p3', 'viewer-not-in-roster', '__proto__']) {
      expect(pp.view(sA, viewer)).toEqual(pp.view(sB, viewer));
    }
  });

  it('never serializes the raw votes map pre-reveal', () => {
    for (const viewer of [...players, 'viewer-not-in-roster', '__proto__']) {
      const json = JSON.stringify(pp.view(sA, viewer));
      expect(json).not.toContain('"votes"');
      if (viewer !== 'p1') expect(json).not.toContain('"myVote":"p2"');
      if (viewer !== 'p2') expect(json).not.toContain('"myVote":"p3"');
    }
  });

  it('≤ 25 deadline steps from the fixture state reach the untimed terminal phase', () => {
    let s = sA;
    let steps = 0;
    for (; steps < 25; steps++) {
      const next = pp.reduce(s, { type: 'deadline', at: 100_000 + steps }).state;
      if (next === s) break;
      s = next;
    }
    expect(pp.phaseDurationMs(s)).toBeNull();
    expect(pp.phaseKey(s)).toBe('over');
    expect(steps).toBeLessThan(25);
  });
});
