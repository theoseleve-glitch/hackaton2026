import { describe, expect, it } from 'vitest';
import { createTruthDare, truthDareActionSchema, TRUTH_OR_DARE_2_CONFIG } from '@bloop/game-truth-dare';
import type { TruthDareAction } from '@bloop/game-truth-dare';
import {
  choose,
  deadline,
  declare,
  DRINK_PACK,
  drink,
  fold,
  pass,
  PLAYERS,
  TOD_PACK,
  tod,
  vote,
} from './helpers';

describe('action rejection — SAME-REFERENCE no-ops', () => {
  it('chooseType: non-active, non-roster, hostile and malformed actors are all ignored', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const nonActive = PLAYERS.find((p) => p !== s0.activePlayer)!;
    expect(tod.reduce(s0, choose(nonActive, 'truth')).state).toBe(s0);
    expect(tod.reduce(s0, choose('ghost', 'truth')).state).toBe(s0);
    expect(tod.reduce(s0, choose('__proto__', 'dare')).state).toBe(s0);
    expect(tod.reduce(s0, choose(s0.activePlayer, 'nope' as never)).state).toBe(s0);
  });

  it('chooseType outside the allowed choices is ignored (drink never has a choose beat)', () => {
    const s0 = drink.init('s', PLAYERS, DRINK_PACK);
    expect(s0.phase).toBe('prompt');
    expect(drink.reduce(s0, choose(s0.activePlayer, 'truth')).state).toBe(s0);
    expect(drink.reduce(s0, choose(s0.activePlayer, 'dare')).state).toBe(s0);
  });

  it('declare: wrong phase, wrong actor and malformed result are ignored', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    expect(tod.reduce(s0, declare(s0.activePlayer, 'done')).state).toBe(s0); // still in choose
    const s1 = fold(tod, s0, [choose(s0.activePlayer, 'truth')]);
    const nonActive = PLAYERS.find((p) => p !== s1.activePlayer)!;
    expect(tod.reduce(s1, declare(nonActive, 'done')).state).toBe(s1);
    expect(tod.reduce(s1, declare(s1.activePlayer, 'maybe' as never)).state).toBe(s1);
  });

  it('pass: non-active and exhausted pass economy are ignored', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const s1 = fold(tod, s0, [choose(s0.activePlayer, 'dare')]);
    const nonActive = PLAYERS.find((p) => p !== s1.activePlayer)!;
    expect(tod.reduce(s1, pass(nonActive)).state).toBe(s1);

    const noPasses = createTruthDare('truth-or-dare-2', { ...TRUTH_OR_DARE_2_CONFIG, passesPerPlayer: 0 });
    const n0 = noPasses.init('s', PLAYERS, TOD_PACK);
    const n1 = fold(noPasses, n0, [choose(n0.activePlayer, 'dare')]);
    expect(noPasses.reduce(n1, pass(n1.activePlayer)).state).toBe(n1);
  });

  it('verdict: the active player, duplicates, disconnected voters and bad votes are ignored', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const [v1, v2] = PLAYERS.filter((p) => p !== active);
    const s1 = fold(tod, s0, [choose(active, 'truth'), declare(active, 'done')]);
    expect(s1.phase).toBe('verdict');
    expect(tod.reduce(s1, vote(active, 'done')).state).toBe(s1);
    expect(tod.reduce(s1, vote(v1!, 'meh' as never)).state).toBe(s1);
    expect(tod.reduce(s1, vote('ghost', 'done')).state).toBe(s1);
    const s2 = fold(tod, s1, [vote(v1!, 'done')]);
    expect(tod.reduce(s2, vote(v1!, 'chickened')).state).toBe(s2); // first vote locked
    const s3 = fold(tod, s2, [{ type: 'playerLeft', playerId: v2!, at: 5 }]);
    // v2's leave completed the expected set -> the verdict resolved; votes after resolve are ignored
    expect(s3.phase).toBe('score');
    expect(tod.reduce(s3, vote(v2!, 'done')).state).toBe(s3);
  });

  it('verdict votes before the verdict phase are ignored', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const nonActive = PLAYERS.find((p) => p !== s0.activePlayer)!;
    expect(tod.reduce(s0, vote(nonActive, 'done')).state).toBe(s0);
    const s1 = fold(tod, s0, [choose(s0.activePlayer, 'truth')]);
    expect(tod.reduce(s1, vote(nonActive, 'done')).state).toBe(s1);
  });

  it('score is a pure reveal: every action is ignored', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const s1 = fold(tod, s0, [choose(s0.activePlayer, 'truth'), declare(s0.activePlayer, 'chickened')]);
    expect(s1.phase).toBe('score');
    for (const p of PLAYERS) {
      expect(tod.reduce(s1, choose(p, 'truth')).state).toBe(s1);
      expect(tod.reduce(s1, declare(p, 'done')).state).toBe(s1);
      expect(tod.reduce(s1, pass(p)).state).toBe(s1);
      expect(tod.reduce(s1, vote(p, 'done')).state).toBe(s1);
    }
  });

  it('an accepted vote that does not complete the set returns a NEW reference with no effects', () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const v1 = PLAYERS.find((p) => p !== active)!;
    const s1 = fold(tod, s0, [choose(active, 'truth'), declare(active, 'done')]);
    const r = tod.reduce(s1, vote(v1, 'done'));
    expect(r.state).not.toBe(s1);
    expect(r.effects).toEqual([]);
  });
});

describe('escape semantics per escapeMode', () => {
  it("pass mode: a pass consumes the economy and skips the verdict ('passed', +3)", () => {
    const s0 = tod.init('s', PLAYERS, TOD_PACK);
    const active = s0.activePlayer;
    const s1 = fold(tod, s0, [choose(active, 'dare'), pass(active)]);
    expect(s1.phase).toBe('score');
    expect(s1.lastResult?.verdict).toBe('passed');
    expect(s1.lastResult?.pointsAwarded).toBe(3);
    expect(s1.lastResult?.forfeitText).toBeNull();
    expect(s1.passesLeft[active]).toBe(1);
  });

  it('forfeit-draw mode: the escape is unlimited and ignores the pass economy', () => {
    let s = drink.init('s', PLAYERS, DRINK_PACK);
    const firstEscaper = s.activePlayer;
    let escapes = 0;
    // every active player escapes for the whole game — never rejected
    while (s.phase !== 'over') {
      if (s.phase === 'prompt') {
        const r = drink.reduce(s, pass(s.activePlayer, escapes));
        expect(r.state).not.toBe(s);
        s = r.state;
        escapes += 1;
        expect(s.lastResult?.verdict).toBe('passed');
        expect(s.lastResult?.pointsAwarded).toBe(3);
      } else {
        s = drink.reduce(s, deadline(1_000 + escapes)).state;
      }
    }
    expect(escapes).toBe(6); // 3 players x 2 laps, the escape never ran out
    expect(s.scores[firstEscaper]).toBe(6); // 2 escapes x 3 pts
  });

  it('forfeit-draw pulls a card from the dare deck and marks it used', () => {
    const s0 = drink.init('s', PLAYERS, DRINK_PACK);
    const s1 = fold(drink, s0, [pass(s0.activePlayer)]);
    expect(s1.lastResult?.forfeitText).not.toBeNull();
    const forfeitId = s1.usedPromptIds[s1.usedPromptIds.length - 1]!;
    expect(forfeitId.startsWith('f-')).toBe(true);
    expect(s1.usedPromptIds).toContain(forfeitId);
  });
});

describe('zod action schema (DO boundary)', () => {
  it('accepts every legal action shape', () => {
    const legal: TruthDareAction[] = [
      { kind: 'chooseType', choice: 'truth' },
      { kind: 'chooseType', choice: 'dare' },
      { kind: 'declare', result: 'done' },
      { kind: 'declare', result: 'chickened' },
      { kind: 'pass' },
      { kind: 'verdict', vote: 'done' },
      { kind: 'verdict', vote: 'chickened' },
    ];
    for (const a of legal) expect(truthDareActionSchema.safeParse(a).success).toBe(true);
  });

  it('rejects malformed payloads', () => {
    const bad: unknown[] = [
      null,
      42,
      'pass',
      {},
      { kind: 'chooseType' },
      { kind: 'chooseType', choice: 'spicy' },
      { kind: 'declare', result: 'passed' },
      { kind: 'verdict', vote: 'yes' },
      { kind: 'nuke' },
    ];
    for (const a of bad) expect(truthDareActionSchema.safeParse(a).success).toBe(false);
  });
});
