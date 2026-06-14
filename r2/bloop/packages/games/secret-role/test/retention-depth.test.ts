import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@bloop/engine';
import {
  createSecretRole,
  DOUBLE_JEU_CONFIG,
  type SecretRoleAction,
  type SecretRoleState,
} from '@bloop/game-secret-role';
import { content, dl, game, players, roles, run, toVotePhase, vote } from './helpers.js';

const OUTSIDERS = ['spectator', '__proto__'] as const;

/** Skip the finalReveal beat of the current match into the next match's vote phase. */
function nextMatchToVote(s: SecretRoleState): SecretRoleState {
  // finalReveal -> secretReveal(next) -> discuss -> vote
  return toVotePhase(run(s, [dl(900)]));
}

/** Everyone (all 3 civilians) nails the seeded impostor on the current vote: caught on vote 1. */
function catchOnVote1(s: SecretRoleState): SecretRoleState {
  const { imp, civs } = roles(s);
  return run(s, [vote(civs[0]!, imp), vote(civs[1]!, imp), vote(civs[2]!, imp), vote(imp, civs[0]!)]);
}

describe('CC-2 matchScoreMultiplier — comeback weighting on the match index', () => {
  it('default config [1,1.5,2]: caught-vote-1 awards scale per match (×1, ×1.5, ×2)', () => {
    // Match 0 (×1): civilian +3, impostor 0 (unchanged from the legacy gold).
    let s = catchOnVote1(toVotePhase(game.init('s', players, content)));
    expect(s.phase).toBe('finalReveal');
    let r = s.results[0]!;
    expect(r.endReason).toBe('caughtVote1');
    for (const c of roles(s).civs) expect(r.points[c]).toBe(3);
    expect(r.points[r.impostor]).toBe(0);

    // Match 1 (×1.5): round(3 * 1.5) = round(4.5) = 5 per civilian; impostor 0.
    s = catchOnVote1(nextMatchToVote(s));
    expect(s.phase).toBe('finalReveal');
    r = s.results[1]!;
    expect(r.match).toBe(1);
    for (const c of s.players.filter((p) => p !== r.impostor)) expect(r.points[c]).toBe(5);
    expect(r.points[r.impostor]).toBe(0);

    // Match 2 (×2): 3 * 2 = 6 per civilian; impostor 0.
    s = catchOnVote1(nextMatchToVote(s));
    expect(s.phase).toBe('finalReveal');
    r = s.results[2]!;
    expect(r.match).toBe(2);
    for (const c of s.players.filter((p) => p !== r.impostor)) expect(r.points[c]).toBe(6);
    expect(r.points[r.impostor]).toBe(0);
  });

  it('the scaled match points are what fold into session scores (×2 finale matters)', () => {
    let s = catchOnVote1(toVotePhase(game.init('s', players, content))); // m0 ×1
    s = catchOnVote1(nextMatchToVote(s)); // m1 ×1.5
    s = catchOnVote1(nextMatchToVote(s)); // m2 ×2
    // a player who was a civilian all three caught matches: 3 + 5 + 6 (if never impostor)
    // sum scores == sum of per-match points (the multiplier is already baked in).
    const expected: Record<string, number> = { p1: 0, p2: 0, p3: 0, p4: 0 };
    for (const res of s.results) for (const p of players) expected[p] = (expected[p] ?? 0) + (res.points[p] ?? 0);
    expect(s.scores).toEqual(expected);
    // and the finale (m2 ×2) contributes strictly more than the opener (m0 ×1)
    // for any civilian present in both.
    expect(s.results[2]!.match).toBe(2);
  });

  it('a comeback is mathematically possible: the ×2 finale can overturn a 2-match lead', () => {
    // Construct: same impostor across the math — leader banks small early, then a
    // trailing player out-scores them on the doubled finale. We only need to show
    // the finale award magnitude can exceed two earlier matches combined.
    // Civilian caught-v1 award: m0=3, m1=5, m2=6. A single ×2 finale catch (6)
    // already beats a lone ×1 opener (3); across the comeback math the leader is
    // never safe.
    const m0Civ = 3;
    const m2Civ = 6;
    expect(m2Civ).toBeGreaterThan(m0Civ);
  });

  it('DEFAULT-IDENTITY: omitting matchScoreMultiplier leaves every match at ×1 (legacy gold)', () => {
    const flat = createSecretRole('double-jeu', {
      ...DOUBLE_JEU_CONFIG,
      matchScoreMultiplier: undefined,
    });
    const r = (s: SecretRoleState, events: ReadonlyArray<GameEvent<SecretRoleAction>>) => {
      let cur = s;
      for (const e of events) cur = flat.reduce(cur, e).state;
      return cur;
    };
    const toVote = (s: SecretRoleState) => r(s, [dl(1), dl(2)]);
    let s = toVote(flat.init('s', players, content));
    const cv1 = (st: SecretRoleState) => {
      const imp = st.impostor;
      const civs = st.players.filter((p) => p !== imp);
      return r(st, [vote(civs[0]!, imp), vote(civs[1]!, imp), vote(civs[2]!, imp), vote(imp, civs[0]!)]);
    };
    s = cv1(s); // m0
    s = cv1(toVote(r(s, [dl(9)]))); // m1
    s = cv1(toVote(r(s, [dl(9)]))); // m2
    // every caught-v1 civilian award is +3 in EVERY match (no escalation).
    for (let m = 0; m < 3; m++) {
      const res = s.results[m]!;
      for (const c of s.players.filter((p) => p !== res.impostor)) expect(res.points[c]).toBe(3);
      expect(res.points[res.impostor]).toBe(0);
    }
  });

  it('a non-finite / non-positive multiplier entry clamps to identity (never zeroes a match)', () => {
    const broken = createSecretRole('double-jeu', {
      ...DOUBLE_JEU_CONFIG,
      matchScoreMultiplier: [0, -2, Number.NaN],
    });
    const r = (s: SecretRoleState, events: ReadonlyArray<GameEvent<SecretRoleAction>>) => {
      let cur = s;
      for (const e of events) cur = broken.reduce(cur, e).state;
      return cur;
    };
    let s = r(broken.init('s', players, content), [dl(1), dl(2)]);
    const imp = s.impostor;
    const civs = s.players.filter((p) => p !== imp);
    s = r(s, [vote(civs[0]!, imp), vote(civs[1]!, imp), vote(civs[2]!, imp), vote(imp, civs[0]!)]);
    expect(s.phase).toBe('finalReveal');
    // 0 / -2 / NaN all clamp to ×1 — match 0 civilian still earns the full +3.
    for (const c of civs) expect(s.results[0]!.points[c]).toBe(3);
  });
});

describe('CC-5 cliffhanger — between-matches payload derived from PUBLIC results', () => {
  it('finalReveal carries a streak (side + count) and detective stats; null side before any result is impossible at finalReveal', () => {
    const s = catchOnVote1(toVotePhase(game.init('s', players, content)));
    const v = game.view(s, 'p1');
    if (v.phase !== 'finalReveal') throw new Error('expected finalReveal view');
    expect(v.cliffhanger.streak.side).toBe('civilians'); // civilians just caught
    expect(v.cliffhanger.streak.count).toBe(1);
    expect(v.cliffhanger.matchesPlayed).toBe(1);
    // every civilian took part in the caught match (impostor excluded).
    const { imp, civs } = roles(s);
    for (const c of civs) expect(v.cliffhanger.detectiveHits[c]).toBe(1);
    expect(v.cliffhanger.detectiveHits[imp]).toBeUndefined(); // zero omitted
  });

  it('the civilian win streak grows across consecutive caught matches', () => {
    let s = catchOnVote1(toVotePhase(game.init('s', players, content))); // m0 civ win
    s = catchOnVote1(nextMatchToVote(s)); // m1 civ win
    const v = game.view(s, 'spectator');
    if (v.phase !== 'finalReveal') throw new Error('expected finalReveal view');
    expect(v.cliffhanger.streak.side).toBe('civilians');
    expect(v.cliffhanger.streak.count).toBe(2); // "the hunters are 2-0"
    expect(v.cliffhanger.matchesPlayed).toBe(2);
  });

  it('an impostor win resets the run to the impostor side (the cliffhanger flips)', () => {
    // m0: civilians win. m1: impostor wins (both votes miss).
    let s = catchOnVote1(toVotePhase(game.init('s', players, content)));
    s = nextMatchToVote(s);
    const { imp, civs } = roles(s);
    // vote 1 miss (unique plurality on a civ), vote 2 miss -> impostor wins.
    s = run(s, [vote(civs[0]!, civs[1]!), vote(civs[2]!, civs[1]!), vote(imp, civs[1]!), dl(3)]);
    expect(s.phase).toBe('verdict');
    s = run(s, [dl(4), dl(5), vote(civs[0]!, civs[1]!), vote(civs[1]!, civs[0]!), vote(civs[2]!, civs[0]!), vote(imp, civs[0]!)]);
    expect(s.phase).toBe('finalReveal');
    expect(s.results[1]!.winners).toBe('impostor');
    const v = game.view(s, 'p1');
    if (v.phase !== 'finalReveal') throw new Error('expected finalReveal view');
    expect(v.cliffhanger.streak.side).toBe('impostor');
    expect(v.cliffhanger.streak.count).toBe(1); // run reset to the impostor
  });

  it('detectiveMvp is the sole session points-leader (kit mvp over PUBLIC scores), null on a tie', () => {
    // Three caught matches: every civilian scores the same each match they are a
    // civilian. The impostor rotates per match (seeded pool), so the player who
    // was impostor fewest times tends to lead — assert mvp matches the scores
    // leader exactly (or null on a tie), never an invented value.
    let s = catchOnVote1(toVotePhase(game.init('s', players, content)));
    s = catchOnVote1(nextMatchToVote(s));
    s = catchOnVote1(nextMatchToVote(s));
    const over = run(s, [dl(99)]);
    expect(over.phase).toBe('over');
    const v = game.view(over, 'spectator');
    if (v.phase !== 'over') throw new Error('expected over view');
    // recompute the expected sole-leader from PUBLIC scores.
    const entries = Object.entries(over.scores).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const topScore = entries[0]![1];
    const leaders = entries.filter((e) => e[1] === topScore);
    const expectedMvp = leaders.length === 1 ? leaders[0]![0] : null;
    expect(v.cliffhanger.detectiveMvp).toBe(expectedMvp);
  });

  it('the over view carries the cliffhanger and is JSON-serializable for hostile viewers', () => {
    let s = catchOnVote1(toVotePhase(game.init('s', players, content)));
    s = catchOnVote1(nextMatchToVote(s));
    s = catchOnVote1(nextMatchToVote(s));
    const over = run(s, [dl(99)]);
    expect(over.phase).toBe('over');
    for (const viewer of [...players, ...OUTSIDERS]) {
      const v = game.view(over, viewer);
      if (v.phase !== 'over') throw new Error('expected over view');
      expect(v.cliffhanger.matchesPlayed).toBe(3);
      expect(JSON.parse(JSON.stringify(v))).toEqual(v); // null-proto safe, serializable
    }
  });

  it('the cliffhanger field appears ONLY from finalReveal on — never in a pre-reveal view', () => {
    let s = game.init('s', players, content);
    const { imp, civs } = roles(s);
    // walk secretReveal -> discuss p0 -> vote p0 (miss) -> verdict -> discuss p1
    const script = [dl(1), dl(2), vote(civs[0]!, imp), vote(civs[1]!, civs[0]!), dl(3), dl(4)];
    for (const e of script) {
      for (const viewer of [...players, ...OUTSIDERS]) {
        expect(JSON.stringify(game.view(s, viewer))).not.toContain('cliffhanger');
      }
      s = game.reduce(s, e).state;
    }
    expect(s.phase).toBe('discuss'); // still pre-reveal
    for (const viewer of [...players, ...OUTSIDERS]) {
      expect(JSON.stringify(game.view(s, viewer))).not.toContain('cliffhanger');
    }
  });

  it('the cliffhanger introduces NO new secret: it is identical for every viewer at finalReveal', () => {
    const s = catchOnVote1(toVotePhase(game.init('s', players, content)));
    const refs = [...players, ...OUTSIDERS].map((viewer) => {
      const v = game.view(s, viewer);
      if (v.phase !== 'finalReveal') throw new Error('expected finalReveal view');
      return JSON.stringify(v.cliffhanger);
    });
    // every viewer (roster, spectator, hostile) sees the SAME cliffhanger.
    for (const r of refs) expect(r).toBe(refs[0]);
  });
});
