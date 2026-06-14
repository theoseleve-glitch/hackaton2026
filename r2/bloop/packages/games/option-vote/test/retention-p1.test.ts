import { describe, expect, it } from 'vitest';
import type { ContentPack, GameEvent } from '@bloop/engine';
import {
  createOptionVote,
  GAUCHE_DROITE_CONFIG,
  TU_PREFERES_CONFIG,
  type OptionVoteAction,
  type OptionVoteConfig,
  type OptionVoteContent,
  type OptionVoteState,
} from '@bloop/game-option-vote';

const content: ContentPack<OptionVoteContent> = {
  id: 'test-pack', version: 1,
  data: {
    items: [
      { id: 'i1', optionA: { fr: 'A1', en: 'A1' }, optionB: { fr: 'B1', en: 'B1' }, debateStarter: { fr: 'd', en: 'd' } },
      { id: 'i2', optionA: { fr: 'A2', en: 'A2' }, optionB: { fr: 'B2', en: 'B2' }, debateStarter: { fr: 'd', en: 'd' } },
      { id: 'i3', optionA: { fr: 'A3', en: 'A3' }, optionB: { fr: 'B3', en: 'B3' }, debateStarter: { fr: 'd', en: 'd' } },
      { id: 'i4', optionA: { fr: 'A4', en: 'A4' }, optionB: { fr: 'B4', en: 'B4' }, debateStarter: { fr: 'd', en: 'd' } },
    ],
  },
};
const players = ['p1', 'p2', 'p3'];

const tuPreferes = createOptionVote('tu-preferes', TU_PREFERES_CONFIG);
const gauche = createOptionVote('gauche-ou-droite', GAUCHE_DROITE_CONFIG);

function ballot(playerId: string, pick: 'A' | 'B', predict?: 'A' | 'B', at = 0): GameEvent<OptionVoteAction> {
  return { type: 'action', playerId, action: { kind: 'ballot', pick, ...(predict !== undefined ? { predict } : {}) }, at };
}

/** Walk one gauche round to its reveal with the given picks. */
function gaucheRound(s: OptionVoteState, picks: Record<string, 'A' | 'B'>): OptionVoteState {
  let cur = s;
  for (const p of players) cur = gauche.reduce(cur, ballot(p, picks[p]!)).state;
  return cur;
}
/** Advance a gauche reveal -> next choose (reveal deadline + debate deadline). */
function gaucheAdvance(reveal: OptionVoteState): OptionVoteState {
  const debate = gauche.reduce(reveal, { type: 'deadline', at: 1 }).state;
  return gauche.reduce(debate, { type: 'deadline', at: 2 }).state;
}

describe('P1 — tie-relief tiePolicy (opt-in, default off)', () => {
  it('DEFAULT none: a perfect split still scores nobody (existing behaviour preserved)', () => {
    const s0 = tuPreferes.init('s', ['p1', 'p2', 'p3', 'p4'], content);
    const a = tuPreferes.reduce(s0, ballot('p1', 'A', 'A')).state;
    const b = tuPreferes.reduce(a, ballot('p2', 'A', 'A')).state;
    const c = tuPreferes.reduce(b, ballot('p3', 'B', 'A')).state;
    const { state: r } = tuPreferes.reduce(c, ballot('p4', 'B', 'A'));
    expect(r.lastResult?.majority).toBeNull();
    expect(r.scores).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
    expect(r.lastResult?.tieReliefApplied).toBe(false);
    expect(r.config.tiePolicy).toBeUndefined();
  });

  it('all-plus-one: a perfect split consoles EVERY balloter +pointsCorrect', () => {
    const relief: OptionVoteConfig = { ...GAUCHE_DROITE_CONFIG, tiePolicy: 'all-plus-one' };
    const g = createOptionVote('gauche-ou-droite', relief);
    const s0 = g.init('s', ['p1', 'p2', 'p3', 'p4'], content);
    const a = g.reduce(s0, ballot('p1', 'A')).state;
    const b = g.reduce(a, ballot('p2', 'A')).state;
    const c = g.reduce(b, ballot('p3', 'B')).state;
    const { state: r } = g.reduce(c, ballot('p4', 'B'));
    expect(r.lastResult?.majority).toBeNull();
    expect(r.scores).toEqual({ p1: 1, p2: 1, p3: 1, p4: 1 });
    expect(r.lastResult?.tieReliefApplied).toBe(true);
    expect(r.lastResult?.awarded.sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    // minorityCount must NOT move on a consoled tie (no decisive majority).
    expect(r.minorityCount).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });

  it('all-plus-one: only balloters are consoled; a non-voter gets nothing', () => {
    const relief: OptionVoteConfig = { ...GAUCHE_DROITE_CONFIG, tiePolicy: 'all-plus-one' };
    const g = createOptionVote('gauche-ou-droite', relief);
    const s0 = g.init('s', ['p1', 'p2', 'p3', 'p4'], content);
    // p1,p2 -> A ; p3 -> B ; p4 never votes. Deadline ties 2-1? No: 2A vs 1B is a
    // majority. Force a tie with p1->A, p3->B and p4 absent => 1-1 split.
    const a = g.reduce(s0, ballot('p1', 'A')).state;
    const b = g.reduce(a, ballot('p3', 'B')).state;
    const { state: r } = g.reduce(b, { type: 'deadline', at: 0 });
    expect(r.lastResult?.majority).toBeNull();
    expect(r.scores['p1']).toBe(1);
    expect(r.scores['p3']).toBe(1);
    expect(r.scores['p2']).toBe(0); // never balloted
    expect(r.scores['p4']).toBe(0);
    expect(r.lastResult?.tieReliefApplied).toBe(true);
  });

  it('all-plus-one does NOT touch a decided round (majority scores as usual)', () => {
    const relief: OptionVoteConfig = { ...GAUCHE_DROITE_CONFIG, tiePolicy: 'all-plus-one' };
    const g = createOptionVote('gauche-ou-droite', relief);
    const s0 = g.init('s', players, content);
    const r = gaucheRound(s0, { p1: 'A', p2: 'A', p3: 'B' });
    expect(r.lastResult?.majority).toBe('A');
    expect(r.scores).toEqual({ p1: 1, p2: 1, p3: 0 });
    expect(r.lastResult?.tieReliefApplied).toBe(false);
  });
});

describe('P1 — CC-2 streak tag (default identity; tracked + surfaced)', () => {
  it('the streak counter increments on consecutive majority landings and resets on a miss', () => {
    const s0 = gauche.init('s', players, content);
    // r0: p1,p2 majority A; p3 minority.
    const r0 = gaucheRound(s0, { p1: 'A', p2: 'A', p3: 'B' });
    expect(r0.streak).toEqual({ p1: 1, p2: 1, p3: 0 });
    expect(r0.lastResult?.streaks).toEqual([
      { playerId: 'p1', streak: 1, bonus: 0 },
      { playerId: 'p2', streak: 1, bonus: 0 },
    ]);
    const c1 = gaucheAdvance(r0);
    // r1: p1,p3 majority A; p2 now misses -> p2 resets, p1 -> 2.
    const r1 = gaucheRound(c1, { p1: 'A', p2: 'B', p3: 'A' });
    expect(r1.streak).toEqual({ p1: 2, p2: 0, p3: 1 });
    expect(r1.lastResult?.streaks.map((t) => [t.playerId, t.streak])).toEqual([
      ['p1', 2], ['p3', 1],
    ]);
  });

  it('default streakBonus is IDENTITY: scores are pure pointsCorrect with no bonus', () => {
    const s0 = gauche.init('s', players, content);
    let s = gaucheRound(s0, { p1: 'A', p2: 'A', p3: 'B' });
    s = gaucheAdvance(s);
    s = gaucheRound(s, { p1: 'A', p2: 'A', p3: 'B' });
    s = gaucheAdvance(s);
    s = gaucheRound(s, { p1: 'A', p2: 'A', p3: 'B' });
    // p1/p2 landed the majority 3x: +1 each per round, NO streak bonus by default.
    expect(s.streak['p1']).toBe(3);
    expect(s.scores).toEqual({ p1: 3, p2: 3, p3: 0 });
    expect(s.lastResult?.streaks.find((t) => t.playerId === 'p1')?.bonus).toBe(0);
  });

  it('OPT-IN streakBonus pays a small capped bonus and lands the player in awarded', () => {
    // perStreak 1, cap 2: streak 1 => +1, streak 2 => +2, streak 3 => +2 (capped).
    const cfg: OptionVoteConfig = { ...GAUCHE_DROITE_CONFIG, streakBonus: { perStreak: 1, cap: 2 } };
    const g = createOptionVote('gauche-ou-droite', cfg);
    const s0 = g.init('s', players, content);
    let s = gaucheRound(s0, { p1: 'A', p2: 'A', p3: 'B' }); // streak 1 -> +1 each
    expect(s.scores).toEqual({ p1: 2, p2: 2, p3: 0 }); // 1 base + 1 bonus
    expect(s.lastResult?.awarded.sort()).toEqual(['p1', 'p2']);
    s = g.reduce(g.reduce(s, { type: 'deadline', at: 1 }).state, { type: 'deadline', at: 2 }).state;
    s = gaucheRound(s, { p1: 'A', p2: 'A', p3: 'B' }); // streak 2 -> +2 each
    expect(s.scores).toEqual({ p1: 5, p2: 5, p3: 0 }); // (2)+(1 base + 2 bonus)
    expect(s.lastResult?.streaks.find((t) => t.playerId === 'p1')).toEqual({ playerId: 'p1', streak: 2, bonus: 2 });
  });

  it('predict-majority: streak follows the correct PREDICTOR, not the picker', () => {
    const s0 = tuPreferes.init('s', players, content);
    // r0: A wins 2-1. p1,p3 predict A (correct) -> streak; p2 predicts B (miss).
    const a = tuPreferes.reduce(s0, ballot('p1', 'A', 'A')).state;
    const b = tuPreferes.reduce(a, ballot('p2', 'A', 'B')).state;
    const { state: r } = tuPreferes.reduce(b, ballot('p3', 'B', 'A'));
    expect(r.lastResult?.majority).toBe('A');
    expect(r.streak).toEqual({ p1: 1, p2: 0, p3: 1 });
  });

  it('a non-balloter (absent) keeps their streak — a disconnect is not a miss', () => {
    const s0 = gauche.init('s', players, content);
    const r0 = gaucheRound(s0, { p1: 'A', p2: 'A', p3: 'B' }); // p1 streak 1
    let s = gaucheAdvance(r0);
    // r1: p1 leaves before voting; p2,p3 ballot, p1 absent.
    s = gauche.reduce(s, { type: 'playerLeft', playerId: 'p1', at: 0 }).state;
    s = gauche.reduce(s, ballot('p2', 'A')).state;
    const { state: r1 } = gauche.reduce(s, ballot('p3', 'A')); // both A -> majority A, p1 absent
    expect(r1.phase).toBe('reveal');
    expect(r1.streak['p1']).toBe(1); // untouched — never balloted this round
    expect(r1.streak['p2']).toBe(2);
  });

  it('streak is PUBLIC in every in-match phase view (same class as scores)', () => {
    const s0 = gauche.init('s', players, content);
    const reveal = gaucheRound(s0, { p1: 'A', p2: 'A', p3: 'B' });
    const vReveal = gauche.view(reveal, 'spectator');
    if (vReveal.phase !== 'reveal') throw new Error('expected reveal');
    expect(vReveal.streak).toEqual({ p1: 1, p2: 1, p3: 0 });
    const debate = gauche.reduce(reveal, { type: 'deadline', at: 1 }).state;
    const vDebate = gauche.view(debate, 'spectator');
    if (vDebate.phase !== 'debate') throw new Error('expected debate');
    expect(vDebate.streak).toEqual({ p1: 1, p2: 1, p3: 0 });
    const choose1 = gauche.reduce(debate, { type: 'deadline', at: 2 }).state;
    const vChoose = gauche.view(choose1, 'spectator');
    if (vChoose.phase !== 'choose') throw new Error('expected choose');
    expect(vChoose.streak).toEqual({ p1: 1, p2: 1, p3: 0 }); // persists across rounds
  });
});

describe('P1 — CC-5 cliffhanger over payload (derived from public scores)', () => {
  it('exposes a leaderboard, topGap, closeFinish and mvp at over', () => {
    // 2 rounds: p1,p2 land both; p3 never -> p1=p2=2, p3=0. Tie for first => no mvp,
    // gap 0 => closeFinish true.
    const two = createOptionVote('gauche-ou-droite', { ...GAUCHE_DROITE_CONFIG, totalRounds: 2 });
    const s0 = two.init('s', players, content);
    let s = s0;
    for (let i = 0; i < 2; i++) {
      for (const p of players) s = two.reduce(s, ballot(p, p === 'p3' ? 'B' : 'A')).state;
      if (s.phase !== 'over') {
        s = two.reduce(s, { type: 'deadline', at: 10 + i }).state; // reveal -> debate
        if (s.phase === 'debate') s = two.reduce(s, { type: 'deadline', at: 20 + i }).state; // -> choose/over
      }
    }
    expect(s.phase).toBe('over');
    const v = two.view(s, 'spectator');
    if (v.phase !== 'over') throw new Error('expected over');
    expect(v.scores).toEqual({ p1: 2, p2: 2, p3: 0 });
    expect(v.cliffhanger.topGap).toBe(0);
    expect(v.cliffhanger.closeFinish).toBe(true);
    expect(v.cliffhanger.mvp).toBeNull(); // contested crown
    expect(v.cliffhanger.leaderboard.map((e) => [e.playerId, e.score, e.rank])).toEqual([
      ['p1', 2, 1], ['p2', 2, 1], ['p3', 0, 3],
    ]);
  });

  it('a runaway lead reports a clear mvp and closeFinish false', () => {
    // p1 wins every majority alone-ish: p1,p2 land r0 (gap small)... build a clear gap.
    const three = createOptionVote('tu-preferes', { ...TU_PREFERES_CONFIG, totalRounds: 3 });
    const s0 = three.init('s', players, content);
    let s = s0;
    for (let i = 0; i < 3; i++) {
      // A wins 2-1 each round; only p1 predicts A correctly (p2,p3 predict B).
      s = three.reduce(s, ballot('p1', 'A', 'A')).state;
      s = three.reduce(s, ballot('p2', 'A', 'B')).state;
      s = three.reduce(s, ballot('p3', 'B', 'B')).state;
      if (s.phase === 'reveal') s = three.reduce(s, { type: 'deadline', at: 10 + i }).state;
    }
    expect(s.phase).toBe('over');
    const v = three.view(s, 'spectator');
    if (v.phase !== 'over') throw new Error('expected over');
    expect(v.scores['p1']).toBe(3);
    expect(v.cliffhanger.mvp).toBe('p1');
    expect(v.cliffhanger.topGap).toBe(3);
    expect(v.cliffhanger.closeFinish).toBe(false);
  });

  it('the cliffhanger is a pure derivation — it carries no new secret (serializable, viewer-agnostic)', () => {
    let s = gauche.init('s', players, content);
    for (let i = 0; i < 40 && s.phase !== 'over'; i++) {
      const next = gauche.reduce(s, { type: 'deadline', at: 1_000 + i }).state;
      if (next === s) break;
      s = next;
    }
    expect(s.phase).toBe('over');
    const a = gauche.view(s, 'p1');
    const b = gauche.view(s, '__proto__');
    if (a.phase !== 'over' || b.phase !== 'over') throw new Error('expected over');
    // over view is identical for every viewer (no per-viewer secret).
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a.cliffhanger))).toEqual(a.cliffhanger);
  });
});
