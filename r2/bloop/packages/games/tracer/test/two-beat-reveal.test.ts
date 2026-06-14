import { describe, expect, it } from 'vitest';
import type { ContentPack, GameEvent } from '@bloop/engine';
import {
  createTracer,
  PIRES_POTES_CONFIG,
  tracer,
  type TracerAction,
  type TracerContent,
  type TracerState,
} from '@bloop/game-tracer';

/**
 * Keystone: two-beat reveal + deferred scoring (CC-3, retention brief P0-1/P0-2).
 *
 * The reveal is split into a SUSPENSE beat (scores frozen at the pre-round value,
 * nothing awarded yet) then a VERDICT beat (the deferred `+1` lands so the score
 * visibly CLIMBS, and the room-designated player(s) are named on the slam). This
 * file proves the keystone behaviour AND the architecture invariants the brief
 * marks as green-gates:
 *
 *   GUARD (a) the new reveal fields (revealStep / delta / designated) NEVER leak
 *            a ballot and are byte-identical for every viewer (no per-viewer
 *            secret was added — they are aggregate-derived from PUBLIC data).
 *   GUARD (b) the keystone does NOT change the primary early-resolve (allActed
 *            over the vote) condition.
 *   GUARD (c) reject-invalid (wrong phase / duplicate verdict step) returns the
 *            SAME state reference.
 *   AUDIT    the two-beat reveal introduces NO new hidden state value — the only
 *            secret is still `votes`; the verdict names the DESIGNATED target,
 *            never who voted.
 */

const content: ContentPack<TracerContent> = {
  id: 't', version: 1,
  data: { prompts: ['P1?', 'P2?', 'P3?'] },
};
const players = ['p1', 'p2', 'p3'];
const pp = createTracer('pires-potes', PIRES_POTES_CONFIG);
const vote = (playerId: string, target: string, at = 0): GameEvent<TracerAction> =>
  ({ type: 'action', playerId, action: { kind: 'vote', target }, at });

/** Drive a fresh game to the reveal SUSPENSE beat via early-resolve. p3 is the room pick. */
function toSuspense(mod = tracer): TracerState {
  let s = mod.init('s', players, content);
  s = mod.reduce(s, vote('p1', 'p3', 0)).state;
  s = mod.reduce(s, vote('p2', 'p3', 1)).state;
  s = mod.reduce(s, vote('p3', 'p1', 2)).state; // all voted -> reveal:suspense
  return s;
}

describe('two-beat reveal — suspense then verdict', () => {
  it('early-resolve lands on the SUSPENSE beat with scoring DEFERRED', () => {
    const s = toSuspense();
    expect(s.phase).toBe('reveal');
    expect(s.revealStep).toBe('suspense');
    expect(s.scores).toEqual({ p1: 0, p2: 0, p3: 0 }); // frozen — nothing has climbed
  });

  it('the verdict beat commits the deferred +1 (the score CLIMBS here)', () => {
    const suspense = toSuspense();
    const verdict = tracer.reduce(suspense, { type: 'deadline', at: 3 }).state;
    expect(verdict.phase).toBe('reveal');
    expect(verdict.revealStep).toBe('verdict');
    expect(verdict.scores).toEqual({ p1: 0, p2: 0, p3: 1 }); // p3 got the card
  });

  it('emits round_revealed at the VERDICT beat, not at suspense', () => {
    const sv = toSuspense();
    // reaching suspense via early-resolve emits no analytics
    const suspenseStep = tracer.reduce(
      tracer.reduce(tracer.reduce(tracer.init('s', players, content), vote('p1', 'p3', 0)).state, vote('p2', 'p3', 1)).state,
      vote('p3', 'p1', 2),
    );
    expect(suspenseStep.effects).toEqual([]);
    // the verdict deadline carries round_revealed
    const { effects } = tracer.reduce(sv, { type: 'deadline', at: 3 });
    expect(effects).toContainEqual({ type: 'analytics', name: 'round_revealed', props: { round: 0 } });
  });

  it('view: suspense holds (empty delta, frozen scores); verdict slams (delta + climbed scores + named target)', () => {
    const suspense = toSuspense();
    const sv = tracer.view(suspense, 'p1');
    if (sv.phase !== 'reveal') throw new Error('expected reveal view');
    expect(sv.revealStep).toBe('suspense');
    expect(sv.delta).toEqual({}); // nothing awarded yet — client holds
    expect(sv.designated).toEqual(['p3']); // already known (aggregate), even at suspense
    expect(sv.scores).toEqual({ p1: 0, p2: 0, p3: 0 });

    const verdict = tracer.reduce(suspense, { type: 'deadline', at: 3 }).state;
    const vv = tracer.view(verdict, 'p1');
    if (vv.phase !== 'reveal') throw new Error('expected reveal view');
    expect(vv.revealStep).toBe('verdict');
    expect(vv.delta).toEqual({ p3: 1 }); // honest climb, via kit scoreDelta
    expect(vv.designated).toEqual(['p3']); // the room pointed at p3
    expect(vv.scores).toEqual({ p1: 0, p2: 0, p3: 1 });
  });

  it('a verdict tie names BOTH co-designated players and climbs both', () => {
    const two = createTracer('t2');
    let s = two.init('s', ['p1', 'p2'], content);
    s = two.reduce(s, vote('p1', 'p2', 0)).state;
    s = two.reduce(s, vote('p2', 'p1', 1)).state; // 1-1 tie at max
    expect(s.revealStep).toBe('suspense');
    const verdict = two.reduce(s, { type: 'deadline', at: 2 }).state;
    const vv = two.view(verdict, 'spectator');
    if (vv.phase !== 'reveal') throw new Error('expected reveal view');
    expect(vv.designated).toEqual(['p1', 'p2']);
    expect(vv.delta).toEqual({ p1: 1, p2: 1 });
  });

  it('a zero-vote round names NOBODY and awards nothing at verdict', () => {
    const s0 = tracer.init('s', players, content);
    const suspense = tracer.reduce(s0, { type: 'deadline', at: 0 }).state;
    expect(suspense.revealStep).toBe('suspense');
    const verdict = tracer.reduce(suspense, { type: 'deadline', at: 1 }).state;
    const vv = tracer.view(verdict, 'p1');
    if (vv.phase !== 'reveal') throw new Error('expected reveal view');
    expect(vv.designated).toEqual([]);
    expect(vv.delta).toEqual({});
    expect(vv.scores).toEqual({ p1: 0, p2: 0, p3: 0 });
  });
});

describe('GUARD (a) — the new reveal fields never leak a ballot, identical for every viewer', () => {
  // The room points its verdict at p3 (2-1 split).
  const scriptA = [vote('p1', 'p3', 0), vote('p2', 'p3', 1), vote('p3', 'p1', 2)];
  const fold = (script: GameEvent<TracerAction>[]): TracerState => {
    let s = tracer.init('audit-seed', players, content);
    for (const e of script) s = tracer.reduce(s, e).state;
    return s;
  };

  it('the new reveal fields contain NO secret: byte-identical across all viewers (suspense + verdict)', () => {
    const suspense = fold(scriptA);
    const verdict = tracer.reduce(suspense, { type: 'deadline', at: 3 }).state;
    for (const state of [suspense, verdict]) {
      const viewers = [...players, 'spectator-x', '__proto__'];
      const ref = tracer.view(state, viewers[0]);
      if (ref.phase !== 'reveal') throw new Error('expected reveal view');
      for (const viewer of viewers.slice(1)) {
        const v = tracer.view(state, viewer);
        if (v.phase !== 'reveal') throw new Error('expected reveal view');
        // revealStep / delta / designated / tally / scores are aggregate — same for all.
        expect(v.revealStep).toEqual(ref.revealStep);
        expect(v.delta).toEqual(ref.delta);
        expect(v.designated).toEqual(ref.designated);
        expect(v.tally).toEqual(ref.tally);
        expect(v.scores).toEqual(ref.scores);
      }
    }
  });

  it('no reveal-phase view (either beat) ever serialises the raw votes map', () => {
    const suspense = fold(scriptA);
    const verdict = tracer.reduce(suspense, { type: 'deadline', at: 3 }).state;
    for (const state of [suspense, verdict]) {
      for (const viewer of [...players, 'spectator-x', '__proto__']) {
        const json = JSON.stringify(tracer.view(state, viewer));
        expect(json).not.toContain('"votes"');
        expect(json).not.toContain('"myVote"'); // reveal view has no per-viewer ballot echo
      }
    }
  });

  it('designated names the ROOM TARGET (who was pointed at), never a voter', () => {
    // p1->p2, p2->p1, p3->p1 : tally p1:2, p2:1 -> designated p1 (the most-pointed-at).
    let s = tracer.init('s', players, content);
    s = tracer.reduce(s, vote('p1', 'p2', 0)).state;
    s = tracer.reduce(s, vote('p2', 'p1', 1)).state;
    s = tracer.reduce(s, vote('p3', 'p1', 2)).state;
    const verdict = tracer.reduce(s, { type: 'deadline', at: 3 }).state;
    const vv = tracer.view(verdict, 'p3');
    if (vv.phase !== 'reveal') throw new Error('expected reveal view');
    expect(vv.designated).toEqual(['p1']); // p1 was pointed at most — NOT "who voted p1"
  });
});

describe('GUARD (a, audit) — non-owner invariance of reveal under hidden-vote changes', () => {
  // Two ballots that reach the SAME aggregate verdict (both point the room at p3
  // with the same 2-1 split) but differ in WHO cast which ballot. Every viewer's
  // reveal view must be invariant, because the reveal exposes only the aggregate.
  const aggA = [vote('p1', 'p3', 0), vote('p2', 'p3', 1), vote('p3', 'p1', 2)];
  const aggB = [vote('p2', 'p3', 0), vote('p1', 'p3', 1), vote('p3', 'p1', 2)];
  const fold = (script: GameEvent<TracerAction>[]): TracerState => {
    let s = tracer.init('audit-seed', players, content);
    for (const e of script) {
      const next = tracer.reduce(s, e).state;
      if (next === s) throw new Error('audit fixture event rejected');
      s = next;
    }
    return s;
  };

  it('AUDIT: the only hidden value is `votes`; revealStep/delta/designated are PUBLIC (declared non-secret)', () => {
    const suspenseA = fold(aggA);
    const suspenseB = fold(aggB);
    const verdictA = tracer.reduce(suspenseA, { type: 'deadline', at: 3 }).state;
    const verdictB = tracer.reduce(suspenseB, { type: 'deadline', at: 3 }).state;
    // Same aggregate -> every viewer's reveal view is invariant on BOTH beats.
    for (const [sA, sB] of [[suspenseA, suspenseB], [verdictA, verdictB]] as const) {
      for (const viewer of [...players, 'viewer-not-in-roster', '__proto__']) {
        expect(tracer.view(sA, viewer)).toEqual(tracer.view(sB, viewer));
      }
    }
  });
});

describe('GUARD (b) — keystone does NOT change the primary early-resolve (allActed) condition', () => {
  it('reveal still triggers ONLY when every roster player has voted', () => {
    let s = tracer.init('s', players, content);
    s = tracer.reduce(s, vote('p1', 'p2', 0)).state;
    expect(s.phase).toBe('vote'); // 1/3 voted
    s = tracer.reduce(s, vote('p2', 'p3', 1)).state;
    expect(s.phase).toBe('vote'); // 2/3 voted — still no reveal
    s = tracer.reduce(s, vote('p3', 'p1', 2)).state;
    expect(s.phase).toBe('reveal'); // 3/3 -> the SAME early-resolve, now to suspense
    expect(s.revealStep).toBe('suspense');
  });

  it('a re-vote (last tap wins) does not early-resolve until ALL have voted, then enters suspense', () => {
    let s = tracer.init('s', players, content);
    s = tracer.reduce(s, vote('p1', 'p2', 0)).state;
    s = tracer.reduce(s, vote('p1', 'p3', 1)).state; // p1 changes their vote
    expect(s.phase).toBe('vote');
    expect(s.votes).toEqual({ p1: 'p3' });
    s = tracer.reduce(s, vote('p2', 'p1', 2)).state;
    s = tracer.reduce(s, vote('p3', 'p1', 3)).state; // now all voted
    expect(s.phase).toBe('reveal');
    expect(s.revealStep).toBe('suspense');
  });
});

describe('GUARD (c) — reject-invalid returns the SAME state reference', () => {
  it('an action during the SUSPENSE beat is rejected by reference (no leak, no mutation)', () => {
    const suspense = toSuspense();
    expect(suspense.revealStep).toBe('suspense');
    const r = tracer.reduce(suspense, vote('p1', 'p2', 9));
    expect(r.state).toBe(suspense); // SAME reference
    expect(r.effects).toEqual([]);
  });

  it('an action during the VERDICT beat is rejected by reference', () => {
    const verdict = tracer.reduce(toSuspense(), { type: 'deadline', at: 3 }).state;
    expect(verdict.revealStep).toBe('verdict');
    const r = tracer.reduce(verdict, vote('p2', 'p1', 9));
    expect(r.state).toBe(verdict);
    expect(r.effects).toEqual([]);
  });

  it('a roster/presence event during either reveal beat is a by-reference no-op', () => {
    const suspense = toSuspense();
    expect(tracer.reduce(suspense, { type: 'playerLeft', playerId: 'p1', at: 5 }).state).toBe(suspense);
    const verdict = tracer.reduce(suspense, { type: 'deadline', at: 3 }).state;
    expect(tracer.reduce(verdict, { type: 'playerRejoined', playerId: 'p1', at: 6 }).state).toBe(verdict);
  });
});

describe('determinism — the extra deadline hop is clock-free and replay-stable', () => {
  it('phaseDurationMs splits revealMs exactly (suspense + verdict === revealMs), no wall clock', () => {
    const suspense = toSuspense(pp);
    expect(pp.phaseDurationMs(suspense)).toBe(1_500);
    const verdict = pp.reduce(suspense, { type: 'deadline', at: 3 }).state;
    expect(pp.phaseDurationMs(verdict)).toBe(4_500);
    expect(1_500 + 4_500).toBe(PIRES_POTES_CONFIG.revealMs);
  });

  it('verdict is reached by a deadline hop alone and is fully deterministic across two runs', () => {
    const run = (): TracerState => {
      const verdict = tracer.reduce(toSuspense(), { type: 'deadline', at: 3 }).state;
      return verdict;
    };
    expect(run()).toEqual(run());
  });

  it('gameOver still clones scores after the deferred-scoring path (no aliasing)', () => {
    let s = toSuspense();
    let cloned: Record<string, number> | null = null;
    for (let i = 0; s.phase !== 'over'; i++) {
      const { state: next, effects } = tracer.reduce(s, { type: 'deadline', at: 1_000 + i });
      for (const e of effects) if (e.type === 'gameOver') cloned = e.scores;
      s = next;
    }
    if (cloned === null) throw new Error('expected gameOver scores');
    expect(cloned).toEqual(s.scores);
    cloned['p3'] = 999;
    expect(s.scores['p3']).not.toBe(999);
  });
});
