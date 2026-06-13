import { describe, expect, it } from 'vitest';
import { createSecretRole, DOUBLE_JEU_CONFIG, type SecretRoleState } from '@bloop/game-secret-role';
import { content, dl, game, leftEv, players, roles, run, toVotePhase, vote } from './helpers.js';

describe('exact scoring (design §2.6 — params.scoring verbatim)', () => {
  it('caught on vote 1: every civilian +1 ballot +2 team bonus; impostor 0', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const { imp, civs } = roles(s0);
    const s1 = run(s0, [vote(civs[0]!, imp), vote(civs[1]!, imp), vote(civs[2]!, imp), vote(imp, civs[0]!)]);
    expect(s1.phase).toBe('finalReveal');
    const result = s1.results[0]!;
    expect(result.endReason).toBe('caughtVote1');
    expect(result.winners).toBe('civilians');
    expect(result.caughtOnVote).toBe(0);
    expect(result.impostor).toBe(imp);
    for (const c of civs) expect(result.points[c]).toBe(3);
    expect(result.points[imp]).toBe(0);
    expect(s1.scores).toEqual(result.points); // first match: scores == match points
  });

  it('a civilian whose ballot missed gets only the team bonus on a vote-1 catch', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const { imp, civs } = roles(s0);
    // civs[2] votes a fellow civilian; the other two civs catch the impostor (2 vs 1 vs 1 = unique plurality)
    const s1 = run(s0, [vote(civs[0]!, imp), vote(civs[1]!, imp), vote(civs[2]!, civs[0]!), vote(imp, civs[1]!)]);
    expect(s1.phase).toBe('finalReveal');
    const pts = s1.results[0]!.points;
    expect(pts[civs[0]!]).toBe(3); // +1 +2
    expect(pts[civs[1]!]).toBe(3);
    expect(pts[civs[2]!]).toBe(2); // bonus only
    expect(pts[imp]).toBe(0);
  });

  it('caught on vote 2: impostor keeps the +2 vote-1 bank; civilians +1 per correct ballot +1 bonus', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const { imp, civs } = roles(s0);
    // vote 1: pile on civs[2] (3 votes) — wrong unique target, miss; civs[2] alone voted the impostor
    let s = run(s0, [vote(civs[0]!, civs[2]!), vote(civs[1]!, civs[2]!), vote(civs[2]!, imp), vote(imp, civs[2]!)]);
    expect(s.phase).toBe('verdict');
    expect(s.voteRecords[0]!.topAccused).toBe(civs[2]!); // publicly cleared
    expect(s.voteRecords[0]!.caught).toBe(false);
    expect(s.scores).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 }); // nothing leaks into scores pre-reveal
    // verdict -> discuss p1 -> vote p1: everyone nails the impostor
    s = run(s, [dl(1), dl(2), vote(civs[0]!, imp), vote(civs[1]!, imp), vote(civs[2]!, imp), vote(imp, civs[0]!)]);
    expect(s.phase).toBe('finalReveal');
    const result = s.results[0]!;
    expect(result.endReason).toBe('caughtVote2');
    expect(result.caughtOnVote).toBe(1);
    expect(result.winners).toBe('civilians');
    expect(result.points[civs[0]!]).toBe(2); // 0 + (1+1)
    expect(result.points[civs[1]!]).toBe(2);
    expect(result.points[civs[2]!]).toBe(3); // 1 + (1+1)
    expect(result.points[imp]).toBe(2); // survived vote 1 — kept even though caught
  });

  it('impostor wins: +2 vote-1 bank +3 win bonus = 5; civilians keep earned ballot points only', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const { imp, civs } = roles(s0);
    // vote 1: civs[0] correctly accuses; the rest pile on civs[1] (2 votes) — miss
    let s = run(s0, [vote(civs[0]!, imp), vote(civs[1]!, civs[0]!), vote(civs[2]!, civs[1]!), vote(imp, civs[1]!)]);
    expect(s.phase).toBe('verdict');
    // vote 2: nobody finds the impostor (unique plurality on civs[0])
    s = run(s, [dl(1), dl(2), vote(civs[0]!, civs[1]!), vote(civs[1]!, civs[0]!), vote(civs[2]!, civs[0]!), vote(imp, civs[0]!)]);
    expect(s.phase).toBe('finalReveal');
    const result = s.results[0]!;
    expect(result.endReason).toBe('impostorWins');
    expect(result.winners).toBe('impostor');
    expect(result.caughtOnVote).toBeNull();
    expect(result.points[imp]).toBe(5);
    expect(result.points[civs[0]!]).toBe(1); // vote-1 correct ballot survives the loss
    expect(result.points[civs[1]!]).toBe(0);
    expect(result.points[civs[2]!]).toBe(0);
  });

  it('a tie on vote 2 also hands the impostor the win (ties favor the impostor)', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const { imp, civs } = roles(s0);
    let s = run(s0, [dl(1)]); // vote 1 all-abstain -> miss -> verdict
    expect(s.phase).toBe('verdict');
    s = run(s, [dl(2), dl(3), vote(civs[0]!, imp), vote(civs[1]!, civs[0]!), dl(4)]); // 1-1 top tie
    expect(s.phase).toBe('finalReveal');
    expect(s.results[0]!.endReason).toBe('impostorWins');
    expect(s.results[0]!.points[imp]).toBe(5);
    expect(s.results[0]!.points[civs[0]!]).toBe(1); // their ballot was right even in the tie
  });

  it('impostor disconnect ends the match immediately: civilians +1 consolation, impostor 0', () => {
    const s0 = run(game.init('s', players, content), [dl(1)]); // discuss p0
    const { imp, civs } = roles(s0);
    const { state: s1 } = game.reduce(s0, leftEv(imp, 2));
    expect(s1.phase).toBe('finalReveal');
    const result = s1.results[0]!;
    expect(result.endReason).toBe('impostorLeft');
    expect(result.winners).toBe('civilians');
    expect(result.caughtOnVote).toBeNull();
    for (const c of civs) expect(result.points[c]).toBe(1);
    expect(result.points[imp]).toBe(0);
  });

  it('impostor disconnect after banking vote 1 still zeroes the impostor', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const { imp, civs } = roles(s0);
    let s = run(s0, [vote(civs[0]!, imp), dl(1)]); // miss (1 vote, but unique plurality IS the impostor!)
    // careful: a single ballot on the impostor IS a unique plurality -> caught. Use a wrong target instead.
    expect(s.phase).toBe('finalReveal');
    expect(s.results[0]!.endReason).toBe('caughtVote1');
    // now the real scenario: miss vote 1, then the impostor leaves during discuss p1
    const t0 = toVotePhase(game.init('s2', players, content));
    const r = roles(t0);
    let t = run(t0, [vote(r.civs[0]!, r.civs[1]!), dl(1)]); // unique plurality on a civilian -> miss
    expect(t.phase).toBe('verdict');
    t = run(t, [dl(2)]); // discuss p1
    t = game.reduce(t, leftEv(r.imp, 3)).state;
    expect(t.phase).toBe('finalReveal');
    expect(t.results[0]!.endReason).toBe('impostorLeft');
    expect(t.results[0]!.points[r.imp]).toBe(0); // the +2 bank is wiped
    expect(t.results[0]!.points[r.civs[0]!]).toBe(1); // consolation (their vote-1 ballot was wrong)
    expect(t.results[0]!.points[r.civs[1]!]).toBe(1);
  });

  it('scores accumulate across matches and the final standings sum every match result', () => {
    let s = game.init('s', players, content);
    for (let i = 0; i < 25 && s.phase !== 'over'; i++) s = game.reduce(s, dl(i)).state;
    expect(s.phase).toBe('over');
    expect(s.results).toHaveLength(3);
    const expected: Record<string, number> = { p1: 0, p2: 0, p3: 0, p4: 0 };
    for (const r of s.results) for (const p of players) expected[p] = (expected[p] ?? 0) + (r.points[p] ?? 0);
    expect(s.scores).toEqual(expected);
  });

  it('emits gameOver exactly once, with a CLONED scores map', () => {
    const one = createSecretRole('double-jeu', { ...DOUBLE_JEU_CONFIG, matchesPerSession: 1 });
    let s: SecretRoleState = one.init('s', players, content);
    for (let i = 0; i < 6; i++) {
      const r = one.reduce(s, dl(i));
      expect(r.effects.find((e) => e.type === 'gameOver')).toBeUndefined();
      s = r.state;
    }
    expect(s.phase).toBe('finalReveal');
    const { state: over, effects } = one.reduce(s, dl(7));
    expect(over.phase).toBe('over');
    const fx = effects.find((e) => e.type === 'gameOver');
    if (fx === undefined || fx.type !== 'gameOver') throw new Error('expected gameOver effect');
    expect(fx.scores).toEqual(over.scores);
    expect(fx.scores).not.toBe(over.scores);
  });

  it('deadline-resolved votes with zero ballots award nothing to civilians', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const { imp, civs } = roles(s0);
    let s = run(s0, [dl(1), dl(2), dl(3), dl(4)]); // abstain both votes -> impostor wins
    expect(s.phase).toBe('finalReveal');
    for (const c of civs) expect(s.results[0]!.points[c]).toBe(0);
    expect(s.results[0]!.points[imp]).toBe(5);
  });
});
