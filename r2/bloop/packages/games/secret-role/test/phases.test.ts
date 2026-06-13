import { describe, expect, it } from 'vitest';
import { createSecretRole, DOUBLE_JEU_CONFIG } from '@bloop/game-secret-role';
import { ack, content, dl, game, pack, players, ready, roles, run, toVotePhase, vote } from './helpers.js';

describe('init determinism and pool capping', () => {
  it('same seed -> same item order and same seeded impostor', () => {
    const a = game.init('seed-1', players, content);
    const b = game.init('seed-1', players, content);
    expect(a.items.map((i) => i.id)).toEqual(b.items.map((i) => i.id));
    expect(a.impostor).toBe(b.impostor);
    expect(players).toContain(a.impostor);
  });

  it('caps totalMatches at the pack pool size', () => {
    const s = game.init('s', players, pack(2)); // 2 items < matchesPerSession 3
    expect(s.totalMatches).toBe(2);
    const full = game.init('s', players, content); // 4 items >= 3
    expect(full.totalMatches).toBe(3);
  });

  it('an empty pack degenerates straight to over (untimed, absorbing)', () => {
    const s = game.init('s', players, pack(0));
    expect(s.phase).toBe('over');
    expect(game.phaseDurationMs(s)).toBeNull();
    expect(game.reduce(s, dl(1)).state).toBe(s);
    expect(JSON.parse(JSON.stringify(game.view(s, 'spectator')))).toEqual(game.view(s, 'spectator'));
  });

  it('starts every player connected with zero scores', () => {
    const s = game.init('s', players, content);
    expect(s.phase).toBe('secretReveal');
    for (const p of players) {
      expect(s.connected[p]).toBe(true);
      expect(s.scores[p]).toBe(0);
    }
  });
});

describe('phase chain — keys and durations (design §2.6 verbatim)', () => {
  it('walks secretReveal -> discuss p0 -> vote p0 -> verdict -> discuss p1 -> vote p1 -> finalReveal on deadlines', () => {
    let s = game.init('s', players, content);
    const expected: Array<[string, number]> = [
      ['secretReveal:m0', 12_000],
      ['discuss:m0:p0', 120_000],
      ['vote:m0:p0', 25_000],
      ['verdict:m0:p0', 8_000],
      ['discuss:m0:p1', 90_000],
      ['vote:m0:p1', 25_000],
      ['finalReveal:m0', 12_000],
    ];
    for (const [key, ms] of expected) {
      expect(game.phaseKey(s)).toBe(key);
      expect(game.phaseDurationMs(s)).toBe(ms);
      s = game.reduce(s, dl(0)).state;
    }
    expect(game.phaseKey(s)).toBe('secretReveal:m1'); // fresh match, fresh key
  });

  it('all-ack ends secretReveal early; a partial ack set does not', () => {
    const s0 = game.init('s', players, content);
    const s3 = run(s0, [ack('p1'), ack('p2'), ack('p3')]);
    expect(s3.phase).toBe('secretReveal');
    const s4 = game.reduce(s3, ack('p4')).state;
    expect(game.phaseKey(s4)).toBe('discuss:m0:p0');
  });

  it('all-ready ends a discussion early; duplicate ready is a same-reference no-op', () => {
    const s0 = run(game.init('s', players, content), [dl(1)]);
    expect(s0.phase).toBe('discuss');
    const s1 = run(s0, [ready('p1'), ready('p2'), ready('p3')]);
    expect(s1.phase).toBe('discuss');
    expect(game.reduce(s1, ready('p1')).state).toBe(s1);
    const s2 = game.reduce(s1, ready('p4')).state;
    expect(game.phaseKey(s2)).toBe('vote:m0:p0');
  });

  it('verdict is display-only: every action is inert (same reference)', () => {
    const verdict = run(toVotePhase(game.init('s', players, content)), [dl(3)]); // all-abstain vote 1 = miss
    expect(verdict.phase).toBe('verdict');
    expect(game.reduce(verdict, ack('p1')).state).toBe(verdict);
    expect(game.reduce(verdict, ready('p1')).state).toBe(verdict);
    expect(game.reduce(verdict, vote('p1', 'p2')).state).toBe(verdict);
  });

  it('rejects (same reference) actions in the wrong phase and non-roster actors', () => {
    const s0 = game.init('s', players, content);
    expect(game.reduce(s0, ready('p1')).state).toBe(s0);
    expect(game.reduce(s0, vote('p1', 'p2')).state).toBe(s0);
    expect(game.reduce(s0, ack('ghost')).state).toBe(s0);
    const discuss = run(s0, [dl(1)]);
    expect(game.reduce(discuss, ack('p1')).state).toBe(discuss);
    expect(game.reduce(discuss, vote('p1', 'p2')).state).toBe(discuss);
    const inVote = game.reduce(discuss, dl(2)).state;
    expect(game.reduce(inVote, ack('p1')).state).toBe(inVote);
    expect(game.reduce(inVote, ready('p1')).state).toBe(inVote);
  });

  it('duplicate ack is a same-reference no-op', () => {
    const s0 = game.init('s', players, content);
    const s1 = game.reduce(s0, ack('p1')).state;
    expect(game.reduce(s1, ack('p1')).state).toBe(s1);
  });

  it('a deadline-only walk from init reaches over in 21 steps and never stalls in a timed phase', () => {
    let s = game.init('s', players, content);
    let steps = 0;
    while (s.phase !== 'over' && steps < 25) {
      const next = game.reduce(s, dl(1_000 + steps)).state;
      expect(next).not.toBe(s); // every timed phase must consume its deadline
      s = next;
      steps += 1;
    }
    expect(s.phase).toBe('over');
    expect(steps).toBe(21); // 3 matches x 7 deadline beats
    expect(game.phaseDurationMs(s)).toBeNull();
    expect(game.phaseKey(s)).toBe('over');
  });

  it('over absorbs every event (same reference)', () => {
    let s = game.init('s', players, content);
    for (let i = 0; i < 25 && s.phase !== 'over'; i++) s = game.reduce(s, dl(i)).state;
    expect(s.phase).toBe('over');
    expect(game.reduce(s, dl(99)).state).toBe(s);
    expect(game.reduce(s, ack('p1')).state).toBe(s);
    expect(game.reduce(s, vote('p1', 'p2')).state).toBe(s);
    expect(game.reduce(s, { type: 'playerLeft', playerId: 'p1', at: 99 }).state).toBe(s);
  });

  it('a new match resets period, acks, votes and records, and re-seeds the impostor from the pool', () => {
    let s = game.init('s', players, content);
    for (let i = 0; i < 7; i++) s = game.reduce(s, dl(i)).state; // finalReveal m0 -> secretReveal m1
    expect(s.match).toBe(1);
    expect(s.phase).toBe('secretReveal');
    expect(s.period).toBe(0);
    expect(s.acked).toEqual({});
    expect(s.votes).toEqual({});
    expect(s.voteRecords).toEqual([]);
    expect(players).toContain(s.impostor);
    expect(s.results).toHaveLength(1); // m0 result kept
  });

  it('mid-vote progress does NOT change the phaseKey (running deadline kept)', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const key = game.phaseKey(s0);
    const s1 = game.reduce(s0, vote('p1', 'p2')).state;
    expect(game.phaseKey(s1)).toBe(key);
  });

  it('one-match config ends after a single match', () => {
    const one = createSecretRole('double-jeu', { ...DOUBLE_JEU_CONFIG, matchesPerSession: 1 });
    let s = one.init('s', players, content);
    expect(s.totalMatches).toBe(1);
    for (let i = 0; i < 7; i++) s = one.reduce(s, dl(i)).state;
    expect(s.phase).toBe('over');
  });

  it('vote 1 catching the impostor skips verdict and discussion 2 entirely', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const { imp, civs } = roles(s0);
    const s1 = run(s0, [vote(civs[0]!, imp), vote(civs[1]!, imp), vote(civs[2]!, imp), vote(imp, civs[0]!)]);
    expect(game.phaseKey(s1)).toBe('finalReveal:m0');
  });
});
