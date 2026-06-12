import { describe, expect, it } from 'vitest';
import type { ContentPack, GameEvent } from '@bloop/engine';
import {
  createTracer,
  DEFAULT_CONFIG,
  PIRES_POTES_CONFIG,
  tracer,
  type TracerAction,
  type TracerContent,
} from '@bloop/game-tracer';

const tenPrompts = Array.from({ length: 10 }, (_, i) => `Prompt ${i}?`);
const content: ContentPack<TracerContent> = {
  id: 'factory-pack', version: 1, data: { prompts: tenPrompts },
};
const players = ['p1', 'p2', 'p3'];
const vote = (playerId: string, target: string, at = 0): GameEvent<TracerAction> =>
  ({ type: 'action', playerId, action: { kind: 'vote', target }, at });

describe('createTracer factory (module id + config injection)', () => {
  it('stamps the given id on the module', () => {
    expect(createTracer('pires-potes').id).toBe('pires-potes');
    expect(createTracer('whatever').id).toBe('whatever');
  });

  it('defaults to DEFAULT_CONFIG when no config is given', () => {
    const m = createTracer('x');
    const s = m.init('seed', players, content);
    expect(s.config).toEqual({ ...DEFAULT_CONFIG, totalRounds: Math.min(DEFAULT_CONFIG.totalRounds, tenPrompts.length) });
  });

  it('merges a PARTIAL config over the defaults', () => {
    const m = createTracer('x', { totalRounds: 5 });
    const s = m.init('seed', players, content);
    expect(s.config).toEqual({ totalRounds: 5, voteMs: DEFAULT_CONFIG.voteMs, revealMs: DEFAULT_CONFIG.revealMs });
  });

  it('the back-compat `tracer` export behaves exactly like createTracer("tracer")', () => {
    const fresh = createTracer('tracer');
    expect(tracer.id).toBe('tracer');
    expect(tracer.minPlayers).toBe(fresh.minPlayers);
    expect(tracer.maxPlayers).toBe(fresh.maxPlayers);
    expect(tracer.init('seed-z', players, content)).toEqual(fresh.init('seed-z', players, content));
  });

  it('init is deterministic per seed and instances never share state', () => {
    const a = createTracer('pires-potes', PIRES_POTES_CONFIG);
    const b = createTracer('pires-potes', PIRES_POTES_CONFIG);
    const sa = a.init('seed-1', players, content);
    const sb = b.init('seed-1', players, content);
    expect(sa).toEqual(sb);
    expect(sa).not.toBe(sb);
    const mutated = a.reduce(sa, vote('p1', 'p2')).state;
    expect(mutated).not.toBe(sa);
    expect(sb.votes).toEqual({}); // sibling instance untouched
  });
});

describe('pires-potes config (design §2.3 — binding params)', () => {
  const pp = createTracer('pires-potes', PIRES_POTES_CONFIG);

  it('plays 7 rounds of 20s vote / 7s reveal', () => {
    const s = pp.init('seed', players, content);
    expect(s.config).toEqual({ totalRounds: 7, voteMs: 20_000, revealMs: 7_000 });
    expect(pp.phaseDurationMs(s)).toBe(20_000);
    const reveal = pp.reduce(s, { type: 'deadline', at: 1 }).state;
    expect(pp.phaseDurationMs(reveal)).toBe(7_000);
  });

  it('caps totalRounds at the shuffled pool size', () => {
    const tiny: ContentPack<TracerContent> = {
      id: 'tiny', version: 1,
      data: { prompts: [{ fr: 'Qui A ?', en: 'Who A?' }, { fr: 'Qui B ?', en: 'Who B?' }] },
    };
    const s = pp.init('seed', players, tiny);
    expect(s.config.totalRounds).toBe(2);
  });

  it('a fully passive room rolls forward to over on deadlines alone (never blocks)', () => {
    let s = pp.init('seed', players, content);
    const keys: string[] = [pp.phaseKey(s)];
    let deadlines = 0;
    while (s.phase !== 'over') {
      expect(pp.phaseDurationMs(s)).not.toBeNull(); // every non-terminal phase is timed
      s = pp.reduce(s, { type: 'deadline', at: deadlines }).state;
      deadlines += 1;
      keys.push(pp.phaseKey(s));
      expect(deadlines).toBeLessThanOrEqual(14);
    }
    expect(deadlines).toBe(14); // 7 rounds × (vote + reveal)
    expect(pp.phaseDurationMs(s)).toBeNull(); // 'over' is untimed (terminal)
    expect(pp.phaseKey(s)).toBe('over');
    expect(new Set(keys).size).toBe(keys.length); // a NEW key for every new deadline
  });

  it('a disconnected (silent) player never blocks: deadline drops the missing vote', () => {
    let s = pp.init('seed', players, content);
    // p3 "left" — tracer keys rounds off the roster only; the leave is an identity no-op
    expect(pp.reduce(s, { type: 'playerLeft', playerId: 'p3', at: 0 }).state).toBe(s);
    s = pp.reduce(s, vote('p1', 'p2', 1)).state;
    s = pp.reduce(s, vote('p2', 'p1', 2)).state;
    expect(s.phase).toBe('vote'); // roster early-resolve still expects p3…
    const { state: revealed } = pp.reduce(s, { type: 'deadline', at: 3 });
    expect(revealed.phase).toBe('reveal'); // …but the deadline never waits for them
    expect(revealed.scores).toEqual({ p1: 1, p2: 1, p3: 0 });
  });

  it('zero votes at the deadline: nobody scores, the round still advances', () => {
    const s0 = pp.init('seed', players, content);
    const { state: s1 } = pp.reduce(s0, { type: 'deadline', at: 0 });
    expect(s1.phase).toBe('reveal');
    expect(s1.scores).toEqual({ p1: 0, p2: 0, p3: 0 });
    const { state: s2 } = pp.reduce(s1, { type: 'deadline', at: 1 });
    expect(s2.phase).toBe('vote');
    expect(s2.round).toBe(1);
  });

  it('exact scoring: every player tied at the max tally gets +1; final ties share the crown', () => {
    let s = pp.init('seed', ['p1', 'p2', 'p3', 'p4'], content);
    // r0: p1,p2 -> p3 ; p3,p4 -> p1 — two-way tie at max 2
    s = pp.reduce(s, vote('p1', 'p3', 1)).state;
    s = pp.reduce(s, vote('p2', 'p3', 2)).state;
    s = pp.reduce(s, vote('p3', 'p1', 3)).state;
    s = pp.reduce(s, vote('p4', 'p1', 4)).state;
    expect(s.phase).toBe('reveal');
    expect(s.scores).toEqual({ p1: 1, p2: 0, p3: 1, p4: 0 });
  });

  it('emits gameOver exactly once, with a CLONED scores map', () => {
    let s = pp.init('seed', players, content);
    let gameOvers = 0;
    let cloned: Record<string, number> | null = null;
    for (let i = 0; s.phase !== 'over'; i++) {
      const { state: next, effects } = pp.reduce(s, { type: 'deadline', at: i });
      for (const e of effects) {
        if (e.type === 'gameOver') {
          gameOvers += 1;
          cloned = e.scores;
        }
      }
      s = next;
    }
    expect(gameOvers).toBe(1);
    if (cloned === null) throw new Error('expected gameOver scores');
    expect(cloned).toEqual(s.scores);
    cloned['p1'] = 999;
    expect(s.scores['p1']).not.toBe(999); // no aliasing of live state
  });
});
