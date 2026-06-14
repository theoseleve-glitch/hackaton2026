import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@bloop/engine';
import { createSecretRole, DOUBLE_JEU_CONFIG, type SecretRoleAction } from '@bloop/game-secret-role';
import {
  content,
  dl,
  game,
  lean,
  players,
  ready,
  roles,
  run,
  toVotePhase,
  vote,
} from './helpers.js';

const OUTSIDERS = ['spectator', '__proto__'] as const;

/** Deadline-skip secretReveal: lands in discuss p0 of match 0 (leans are open). */
function toDiscuss(seed = 's') {
  return run(game.init(seed, players, content), [dl(1)]);
}

describe('lean side-bet (CC-1) — the live debate spine', () => {
  describe('GUARD A — a lean NEVER leaks to a non-owner', () => {
    it('owner sees their OWN lean echoed; every other viewer sees only the aggregate count', () => {
      const s0 = toDiscuss();
      // p1 secretly leans on p3; p2 secretly leans on p4.
      const s1 = run(s0, [lean('p1', 'p3'), lean('p2', 'p4')]);
      expect(s1.phase).toBe('discuss');

      const v1 = game.view(s1, 'p1');
      if (v1.phase !== 'discuss') throw new Error('expected discuss view');
      expect(v1.myLean).toBe('p3'); // owner echo
      expect(v1.leanCount).toBe(2); // public aggregate

      const v2 = game.view(s1, 'p2');
      if (v2.phase !== 'discuss') throw new Error('expected discuss view');
      expect(v2.myLean).toBe('p4');
      expect(v2.leanCount).toBe(2);

      // p3 placed no lean: own echo is null, only the count is visible.
      const v3 = game.view(s1, 'p3');
      if (v3.phase !== 'discuss') throw new Error('expected discuss view');
      expect(v3.myLean).toBeNull();
      expect(v3.leanCount).toBe(2);

      // No non-owner view may carry ANOTHER player's suspect, nor the raw buffer.
      for (const viewer of ['p3', 'p4', ...OUTSIDERS]) {
        const json = JSON.stringify(game.view(s1, viewer));
        expect(json).not.toContain('"leans"');
      }
      // p3's view must not contain p1's suspect (p3) framed as p1's choice, and
      // p4 (a suspect) must never see that p2 fingered them.
      const v4 = game.view(s1, 'p4');
      if (v4.phase !== 'discuss') throw new Error('expected discuss view');
      expect(v4.myLean).toBeNull();
    });

    it('no view ever serializes the raw lean buffer; a spectator gets only the count', () => {
      const s0 = toDiscuss();
      const s1 = run(s0, [lean('p1', 'p2'), lean('p2', 'p1')]);
      for (const viewer of [...players, ...OUTSIDERS]) {
        expect(JSON.stringify(game.view(s1, viewer))).not.toContain('"leans"');
      }
      // A spectator's discuss view exposes no per-player lean map, only the count.
      const spec = game.view(s1, 'spectator');
      if (spec.phase !== 'discuss') throw new Error('expected discuss view');
      expect(spec.myLean).toBeNull();
      expect(spec.leanCount).toBe(2);
    });

    it('non-owner views are INVARIANT under a change of hidden lean targets', () => {
      const base = toDiscuss('audit-seed');
      const sA = run(base, [lean('p1', 'p2'), lean('p2', 'p3')]);
      const sB = run(base, [lean('p1', 'p4'), lean('p2', 'p4')]);
      expect(game.phaseKey(sA)).toBe(game.phaseKey(sB));
      // p3, p4 and outsiders cannot tell the two hidden-lean worlds apart.
      for (const viewer of ['p3', 'p4', ...OUTSIDERS]) {
        expect(game.view(sA, viewer)).toEqual(game.view(sB, viewer));
      }
      // …but the owner DOES see its own differing choice.
      expect(JSON.stringify(game.view(sA, 'p1'))).not.toBe(JSON.stringify(game.view(sB, 'p1')));
    });

    it('the lean never surfaces in any LATER phase (vote/verdict/finalReveal carry no lean buffer)', () => {
      const s0 = toDiscuss();
      const { imp, civs } = roles(s0);
      // Everyone leans, then the match plays out to finalReveal.
      let s = run(s0, [lean(civs[0]!, imp), lean(civs[1]!, imp), lean(imp, civs[0]!)]);
      s = run(s, [dl(2), vote(civs[0]!, imp), vote(civs[1]!, imp), vote(civs[2]!, imp), vote(imp, civs[0]!)]);
      expect(s.phase).toBe('finalReveal');
      for (const viewer of [...players, ...OUTSIDERS]) {
        const json = JSON.stringify(game.view(s, viewer));
        expect(json).not.toContain('"leans"');
        expect(json).not.toContain('myLean'); // the field exists only on the discuss view
      }
    });
  });

  describe('GUARD B — a lean NEVER changes the primary early-resolve (all-ready)', () => {
    it('all four players leaning does NOT advance discuss — only all-ready does', () => {
      const s0 = toDiscuss();
      // Everybody places a lean — the phase must NOT resolve (leans ≠ ready).
      const sAllLeaned = run(s0, [lean('p1', 'p2'), lean('p2', 'p3'), lean('p3', 'p4'), lean('p4', 'p1')]);
      expect(sAllLeaned.phase).toBe('discuss');
      expect(game.phaseKey(sAllLeaned)).toBe('discuss:m0:p0');
      // ready is still empty — leans never wrote into the primary buffer.
      expect(sAllLeaned.ready).toEqual({});
      // Now all-ready (independent of leans) DOES advance to vote.
      const sVote = run(sAllLeaned, [ready('p1'), ready('p2'), ready('p3'), ready('p4')]);
      expect(game.phaseKey(sVote)).toBe('vote:m0:p0');
    });

    it('a partial-ready room that has fully leaned still waits for the last ready', () => {
      const s0 = toDiscuss();
      // 3 of 4 ready, 4 of 4 leaned — must stay in discuss (the lean is not an ack).
      const s1 = run(s0, [
        lean('p1', 'p2'), lean('p2', 'p1'), lean('p3', 'p4'), lean('p4', 'p3'),
        ready('p1'), ready('p2'), ready('p3'),
      ]);
      expect(s1.phase).toBe('discuss');
      const s2 = game.reduce(s1, ready('p4')).state;
      expect(game.phaseKey(s2)).toBe('vote:m0:p0');
    });

    it('a leave that completes the READY set still resolves, regardless of leans', () => {
      const s0 = toDiscuss();
      const { imp, civs } = roles(s0);
      const gone = civs[0]!;
      const rest = [imp, ...civs.filter((c) => c !== gone)];
      // everyone has leaned; the three non-gone are ready; the gone player leaving
      // completes the ready set exactly as in the legacy presence test.
      const leaned = run(s0, players.map((p) => lean(p, p === imp ? civs[0]! : imp)));
      const s1 = run(leaned, rest.map((p) => ready(p)));
      expect(s1.phase).toBe('discuss'); // gone still expected
      const s2 = game.reduce(s1, { type: 'playerLeft', playerId: gone, at: 9 }).state;
      expect(game.phaseKey(s2)).toBe('vote:m0:p0');
    });
  });

  describe('GUARD C — reject-invalid returns the SAME state reference', () => {
    it('a self-lean is a same-reference no-op', () => {
      const s0 = toDiscuss();
      expect(game.reduce(s0, lean('p1', 'p1')).state).toBe(s0);
    });

    it('a non-roster lean target is a same-reference no-op', () => {
      const s0 = toDiscuss();
      expect(game.reduce(s0, lean('p1', 'ghost')).state).toBe(s0);
    });

    it('a non-roster actor leaning is a same-reference no-op', () => {
      const s0 = toDiscuss();
      expect(game.reduce(s0, lean('ghost', 'p2')).state).toBe(s0);
    });

    it('a re-lean over this period stake is a same-reference no-op (one stake per period)', () => {
      const s0 = toDiscuss();
      const s1 = game.reduce(s0, lean('p1', 'p2')).state;
      expect(s1).not.toBe(s0);
      expect(s1.leans['p1']).toBe('p2');
      // re-lean rejected — stake preserved, same reference returned
      expect(game.reduce(s1, lean('p1', 'p3')).state).toBe(s1);
      expect(s1.leans['p1']).toBe('p2');
    });

    it('a lean OUTSIDE discuss is a same-reference no-op (secretReveal / vote / verdict / finalReveal / over)', () => {
      const sReveal = game.init('s', players, content);
      expect(sReveal.phase).toBe('secretReveal');
      expect(game.reduce(sReveal, lean('p1', 'p2')).state).toBe(sReveal);

      const sVote = toVotePhase(game.init('s', players, content));
      expect(sVote.phase).toBe('vote');
      expect(game.reduce(sVote, lean('p1', 'p2')).state).toBe(sVote);

      const sVerdict = run(toVotePhase(game.init('s', players, content)), [dl(3)]); // all-abstain miss
      expect(sVerdict.phase).toBe('verdict');
      expect(game.reduce(sVerdict, lean('p1', 'p2')).state).toBe(sVerdict);

      const { imp, civs } = roles(sVote);
      const sFinal = run(sVote, [vote(civs[0]!, imp), vote(civs[1]!, imp), vote(civs[2]!, imp), vote(imp, civs[0]!)]);
      expect(sFinal.phase).toBe('finalReveal');
      expect(game.reduce(sFinal, lean('p1', 'p2')).state).toBe(sFinal);
    });
  });

  describe('resolution — the accuracy bonus pays only correct leans, only at finalReveal', () => {
    it('a lean that named the impostor earns leanBonusCorrect; wrong/absent leans earn nothing', () => {
      const s0 = toDiscuss();
      const { imp, civs } = roles(s0);
      // civs[0] leans CORRECTLY on the impostor; civs[1] leans WRONG (on a civ);
      // civs[2] never leans; the impostor leans on a civilian (can't earn it).
      let s = run(s0, [
        lean(civs[0]!, imp),
        lean(civs[1]!, civs[2]!),
        lean(imp, civs[0]!),
      ]);
      // play the match out: caught on vote 1 (clean, independent of leans).
      s = run(s, [dl(2), vote(civs[0]!, imp), vote(civs[1]!, imp), vote(civs[2]!, imp), vote(imp, civs[0]!)]);
      expect(s.phase).toBe('finalReveal');
      const pts = s.results[0]!.points;
      // Base caught-vote-1 award is +3 per civilian, +0 impostor.
      expect(pts[civs[0]!]).toBe(3 + 1); // +1 correct-lean bonus
      expect(pts[civs[1]!]).toBe(3); // wrong lean — no bonus
      expect(pts[civs[2]!]).toBe(3); // no lean — no bonus
      expect(pts[imp]).toBe(0); // impostor cannot self-lean correctly
      // The bonus is folded into session scores too.
      expect(s.scores[civs[0]!]).toBe(4);
    });

    it('the lean carried by the LAST discuss period is the one that resolves (re-lean across periods)', () => {
      const s0 = toDiscuss();
      const { imp, civs } = roles(s0);
      // discuss p0: civs[0] leans WRONG.
      let s = run(s0, [lean(civs[0]!, civs[1]!)]);
      // miss vote 1 (unique plurality on a civilian) -> verdict -> discuss p1.
      s = run(s, [dl(2), vote(civs[0]!, civs[1]!), vote(civs[2]!, civs[1]!), vote(imp, civs[1]!), dl(3)]);
      expect(s.phase).toBe('verdict');
      s = game.reduce(s, dl(4)).state; // -> discuss p1
      expect(s.phase).toBe('discuss');
      expect(s.period).toBe(1);
      // the p0 lean buffer was cleared on discuss entry — fresh stake this period.
      expect(s.leans).toEqual({});
      // discuss p1: civs[0] now leans CORRECTLY.
      s = run(s, [lean(civs[0]!, imp)]);
      // vote 2 misses -> impostor wins; leans still resolve against the true impostor.
      s = run(s, [dl(5), vote(civs[0]!, civs[1]!), vote(civs[1]!, civs[0]!), vote(civs[2]!, civs[0]!), vote(imp, civs[0]!)]);
      expect(s.phase).toBe('finalReveal');
      expect(s.results[0]!.endReason).toBe('impostorWins');
      // civs[0]'s vote-1 correct ballot? No — they voted a civilian both rounds.
      // Their ONLY points here are the +1 corrected lean from period 1.
      expect(s.results[0]!.points[civs[0]!]).toBe(1);
    });

    it('with leanBonusCorrect:0 the side-bet is INERT — a correct lean earns nothing (default-identity)', () => {
      const inertGame = createSecretRole('double-jeu', {
        ...DOUBLE_JEU_CONFIG,
        scoring: { ...DOUBLE_JEU_CONFIG.scoring, leanBonusCorrect: 0 },
      });
      const r = (s: ReturnType<typeof inertGame.init>, events: ReadonlyArray<GameEvent<SecretRoleAction>>) => {
        let cur = s;
        for (const e of events) cur = inertGame.reduce(cur, e).state;
        return cur;
      };
      let s = r(inertGame.init('s', players, content), [dl(1)]); // discuss p0
      const imp = s.impostor;
      const civs = s.players.filter((p) => p !== imp);
      // every civilian leans CORRECTLY on the impostor…
      s = r(s, civs.map((c) => lean(c, imp)));
      // …caught on vote 1.
      s = r(s, [dl(2), vote(civs[0]!, imp), vote(civs[1]!, imp), vote(civs[2]!, imp), vote(imp, civs[0]!)]);
      expect(s.phase).toBe('finalReveal');
      // No bonus: every civilian sits at the base +3, exactly as without the kit.
      for (const c of civs) expect(s.results[0]!.points[c]).toBe(3);
      expect(s.results[0]!.points[imp]).toBe(0);
    });
  });
});
