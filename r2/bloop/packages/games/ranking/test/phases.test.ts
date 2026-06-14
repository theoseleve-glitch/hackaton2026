import { describe, expect, it } from 'vitest';
import { content, deadline, game, players, rank } from './fixtures.js';

describe('phase chain and timing', () => {
  it('rank -> reveal -> next rank, with per-phase durations and phaseKeys', () => {
    const s0 = game.init('seed', players, content);
    expect(s0.phase).toBe('rank');
    expect(game.phaseKey(s0)).toBe('rank:r0');
    expect(game.phaseDurationMs(s0)).toBe(40_000);

    const s1 = game.reduce(s0, deadline()).state;
    expect(s1.phase).toBe('reveal');
    expect(game.phaseKey(s1)).toBe('reveal:r0');
    expect(game.phaseDurationMs(s1)).toBe(12_000);

    const s2 = game.reduce(s1, deadline(1)).state;
    expect(s2.phase).toBe('rank');
    expect(s2.round).toBe(1);
    expect(game.phaseKey(s2)).toBe('rank:r1');
    // Hidden buffer + lastResult reset for the new round.
    expect(s2.ballots).toEqual({});
    expect(s2.lastResult).toBeNull();
  });

  it('walks all the way to over on deadlines alone, then absorbs every event', () => {
    let s = game.init('seed', players, content);
    let gameOverScores: Record<string, number> | null = null;
    for (let i = 0; i < 50 && s.phase !== 'over'; i += 1) {
      const r = game.reduce(s, deadline(i));
      s = r.state;
      const go = r.effects.find((e) => e.type === 'gameOver');
      if (go && go.type === 'gameOver') gameOverScores = go.scores;
    }
    expect(s.phase).toBe('over');
    expect(game.phaseKey(s)).toBe('over');
    expect(game.phaseDurationMs(s)).toBeNull();

    // gameOver clones the scores (a distinct object from state.scores).
    expect(gameOverScores).not.toBeNull();
    expect(gameOverScores).not.toBe(s.scores);
    expect(gameOverScores).toEqual(s.scores);

    // over absorbs every event (same reference).
    expect(game.reduce(s, deadline(99)).state).toBe(s);
    expect(game.reduce(s, rank('p1', ['p1', 'p2', 'p3'])).state).toBe(s);
    expect(game.reduce(s, { type: 'playerLeft', playerId: 'p1', at: 1 }).state).toBe(s);
  });

  it('init caps totalRounds at the prompt pool size', () => {
    const tiny = { id: 't', version: 1, data: { prompts: [content.data.prompts[0]!] } };
    const s = game.init('seed', players, tiny);
    expect(s.config.totalRounds).toBe(1);
  });

  it('min/max player bounds are 3..8', () => {
    expect(game.minPlayers).toBe(3);
    expect(game.maxPlayers).toBe(8);
  });
});
