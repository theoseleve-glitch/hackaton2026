import { describe, expect, it } from 'vitest';
import {
  createPerformJudge,
  DEVINE_L_ACTION_CONFIG,
  DEVINE_L_OBJET_CONFIG,
  DOUBLE_LE_MOUVEMENT_CONFIG,
  MIME_INVERSE_CONFIG,
} from '@bloop/game-perform-judge';
import { act, deadline, fold, makeContent, others, vote, walkToOver } from './fixtures.js';

const guided = createPerformJudge('devine-l-action', DEVINE_L_ACTION_CONFIG);
const credit = createPerformJudge('devine-l-objet', DEVINE_L_OBJET_CONFIG);
const puppet = createPerformJudge('mime-inverse', MIME_INVERSE_CONFIG);
const rateMod = createPerformJudge('double-le-mouvement', DOUBLE_LE_MOUVEMENT_CONFIG);

const P3 = ['p1', 'p2', 'p3'];
const P4 = ['p1', 'p2', 'p3', 'p4'];
const P6 = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

describe('init', () => {
  it('is deterministic: same seed -> same rotation and same deck order', () => {
    const a = guided.init('seed-x', P3, makeContent());
    const b = guided.init('seed-x', P3, makeContent());
    expect(a.rotation).toEqual(b.rotation);
    expect(a.deck.map((i) => i.id)).toEqual(b.deck.map((i) => i.id));
    expect([...a.rotation].sort()).toEqual([...P3].sort());
  });

  it('guided/credit/rate start at ready; puppet (readyMs 0) starts at perform', () => {
    expect(guided.init('s', P3, makeContent()).phase).toBe('ready');
    expect(credit.init('s', P3, makeContent()).phase).toBe('ready');
    expect(rateMod.init('s', P4, makeContent()).phase).toBe('ready');
    const s = puppet.init('s', P3, makeContent());
    expect(s.phase).toBe('perform');
    expect(puppet.phaseKey(s)).toBe('perform:0');
  });

  it('rate offers promptChoices items per turn and a dubber partner; others offer 1 and no partner', () => {
    const r = rateMod.init('s', P4, makeContent());
    expect(r.offer).toHaveLength(2);
    expect(r.chosenIndex).toBeNull();
    expect(r.partner).not.toBeNull();
    expect(r.partner).not.toBe(r.performer);
    const g = guided.init('s', P3, makeContent());
    expect(g.offer).toHaveLength(1);
    expect(g.chosenIndex).toBe(0);
    expect(g.partner).toBeNull();
  });

  it('a degenerate pack smaller than promptChoices is born over', () => {
    const s = rateMod.init('s', P4, makeContent(1));
    expect(s.phase).toBe('over');
    expect(rateMod.phaseDurationMs(s)).toBeNull();
  });
});

describe('phase durations match the binding designs exactly', () => {
  it('guided: 6s ready / 55s act / 12s verdict / 8s reveal', () => {
    let s = guided.init('s', P3, makeContent());
    expect(guided.phaseDurationMs(s)).toBe(6_000);
    s = fold(guided, s, [deadline(0)]);
    expect(guided.phaseDurationMs(s)).toBe(55_000);
    s = fold(guided, s, [act(s.performer, { kind: 'claimDone' }, 1)]);
    expect(guided.phaseDurationMs(s)).toBe(12_000);
    s = fold(guided, s, [deadline(2)]);
    expect(s.phase).toBe('reveal');
    expect(guided.phaseDurationMs(s)).toBe(8_000);
  });

  it('credit: 4s handoff / 45s mime / 12s validate / 8s reveal', () => {
    let s = credit.init('s', P3, makeContent());
    expect(credit.phaseDurationMs(s)).toBe(4_000);
    s = fold(credit, s, [deadline(0)]);
    expect(credit.phaseDurationMs(s)).toBe(45_000);
    const guesser = others(s)[0]!;
    s = fold(credit, s, [act(s.performer, { kind: 'claimFound', guesser }, 1)]);
    expect(s.phase).toBe('judge');
    expect(credit.phaseDurationMs(s)).toBe(12_000);
    s = fold(credit, s, [deadline(2)]);
    expect(credit.phaseDurationMs(s)).toBe(8_000);
  });

  it('puppet: 30s perform / 10s verdict / 8s reveal / 6s scoreboard', () => {
    let s = puppet.init('s', P3, makeContent());
    expect(puppet.phaseDurationMs(s)).toBe(30_000);
    s = fold(puppet, s, [deadline(0)]);
    expect(s.phase).toBe('judge');
    expect(puppet.phaseDurationMs(s)).toBe(10_000);
    s = fold(puppet, s, [deadline(1)]);
    expect(s.phase).toBe('reveal');
    expect(puppet.phaseDurationMs(s)).toBe(8_000);
  });

  it('rate: 8s brief / 30s perform / 12s rate / 8s reveal', () => {
    let s = rateMod.init('s', P4, makeContent());
    expect(rateMod.phaseDurationMs(s)).toBe(8_000);
    s = fold(rateMod, s, [deadline(0)]);
    expect(rateMod.phaseDurationMs(s)).toBe(30_000);
    s = fold(rateMod, s, [deadline(1)]);
    expect(s.phase).toBe('judge');
    expect(rateMod.phaseDurationMs(s)).toBe(12_000);
    s = fold(rateMod, s, [deadline(2)]);
    expect(rateMod.phaseDurationMs(s)).toBe(8_000);
  });
});

describe('phaseKey discipline', () => {
  it('keys are phase:turnSeq, change per turn, and never embed content', () => {
    let s = guided.init('s', P3, makeContent());
    expect(guided.phaseKey(s)).toBe('ready:0');
    s = fold(guided, s, [deadline(0)]);
    expect(guided.phaseKey(s)).toBe('perform:0');
    s = fold(guided, s, [deadline(1), deadline(2)]); // perform timeout -> reveal -> next turn
    expect(guided.phaseKey(s)).toBe('ready:1');
    const { states } = walkToOver(guided, s);
    for (const st of states) {
      expect(guided.phaseKey(st)).toMatch(/^(ready|perform|judge|reveal|scoreboard):\d+$|^over$/);
    }
  });

  it('in-phase progress (a buffered vote) keeps the same key', () => {
    let s = guided.init('s', P3, makeContent());
    s = fold(guided, s, [deadline(0), act(s.performer, { kind: 'claimDone' }, 1)]);
    const key = guided.phaseKey(s);
    const s2 = fold(guided, s, [vote(others(s)[0]!, 'yes', 2)]);
    expect(guided.phaseKey(s2)).toBe(key);
  });
});

describe('deadline-only walks always reach over (a passive room never stalls)', () => {
  for (const [name, module, players] of [
    ['guided', guided, P3],
    ['credit', credit, P3],
    ['puppet', puppet, P3],
    ['rate', rateMod, P4],
  ] as const) {
    it(`${name}: walk from init terminates at over; phaseDurationMs(over) === null`, () => {
      const init = module.init('walk-seed', [...players], makeContent(40));
      const { state, effects, states } = walkToOver(module, init);
      expect(state.phase).toBe('over');
      expect(module.phaseKey(state)).toBe('over');
      expect(module.phaseDurationMs(state)).toBeNull();
      // every timed phase had a positive duration; views stayed serializable
      for (const st of states) {
        if (st.phase !== 'over') expect(module.phaseDurationMs(st)).toBeGreaterThan(0);
        const v = module.view(st, '__proto__');
        expect(JSON.parse(JSON.stringify(v))).toEqual(v);
      }
      const overs = effects.filter((e) => e.type === 'gameOver');
      expect(overs).toHaveLength(1);
    });
  }

  it('guided plays laps × players turns (3 players × 2 laps = 6 turns)', () => {
    const init = guided.init('walk-seed', P3, makeContent(40));
    const { state, effects } = walkToOver(guided, init);
    expect(state.turnSeq).toBe(5); // turnSeq 0..5
    const wraps = effects.filter((e) => e.type === 'analytics' && e.name === 'round_completed');
    expect(wraps).toHaveLength(1); // lap 0 -> 1 wrap announced; the final wrap ends the game
    expect(wraps[0]).toEqual({ type: 'analytics', name: 'round_completed', props: { round: 1 } });
  });

  it('over absorbs every event with the same reference', () => {
    const { state } = walkToOver(guided, guided.init('s', P3, makeContent()));
    expect(guided.reduce(state, deadline(9)).state).toBe(state);
    expect(guided.reduce(state, act('p1', { kind: 'claimDone' }, 9)).state).toBe(state);
    expect(guided.reduce(state, { type: 'playerLeft', playerId: 'p1', at: 9 }).state).toBe(state);
  });
});

describe('puppet scoreboard cadence', () => {
  it('3 players: one final scoreboard right before over', () => {
    const init = puppet.init('s', P3, makeContent());
    const { states } = walkToOver(puppet, init);
    const keys = states.map((s) => puppet.phaseKey(s));
    const boards = keys.filter((k) => k.startsWith('scoreboard:'));
    expect(boards).toEqual(['scoreboard:2']); // after the 3rd turn (turnSeq 2)
    expect(keys[keys.indexOf('scoreboard:2') + 1]).toBe('over');
  });

  it('6 players: a scoreboard every 4 turns plus the final one', () => {
    const init = puppet.init('s', P6, makeContent(20));
    const { states } = walkToOver(puppet, init);
    const boards = states.map((s) => puppet.phaseKey(s)).filter((k) => k.startsWith('scoreboard:'));
    expect(boards).toEqual(['scoreboard:3', 'scoreboard:5']);
  });
});

describe('pool exhaustion', () => {
  it('guided ends early with pool_exhausted when the deck runs dry', () => {
    const init = guided.init('s', P3, makeContent(2)); // 2 items < 6 turns
    const { state, effects } = walkToOver(guided, init);
    expect(state.phase).toBe('over');
    expect(state.turnSeq).toBe(1); // only 2 turns happened
    expect(effects.some((e) => e.type === 'analytics' && e.name === 'pool_exhausted')).toBe(true);
    expect(effects.filter((e) => e.type === 'gameOver')).toHaveLength(1);
  });

  it('rate consumes promptChoices=2 per turn (5 items -> 2 turns)', () => {
    const init = rateMod.init('s', P4, makeContent(5));
    const { state, effects } = walkToOver(rateMod, init);
    expect(state.phase).toBe('over');
    expect(state.turnSeq).toBe(1);
    expect(effects.some((e) => e.type === 'analytics' && e.name === 'pool_exhausted')).toBe(true);
  });
});
