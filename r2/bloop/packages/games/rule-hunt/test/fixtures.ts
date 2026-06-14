import type { ContentPack, GameEvent } from '@bloop/engine';
import {
  createRuleHunt,
  TROUVEZ_LA_REGLE_CONFIG,
  type RuleHuntAction,
  type RuleHuntContent,
  type RuleHuntState,
  type RuleItem,
} from '@bloop/game-rule-hunt';

export const FIVE = ['p1', 'p2', 'p3', 'p4', 'p5'];
export const EIGHT = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

export const game = createRuleHunt('trouvez-la-regle', TROUVEZ_LA_REGLE_CONFIG);

/** One authored-shaped item with distinctive secret strings (no substring collisions). */
export function ruleItem(i: number): RuleItem {
  return {
    id: `r${i}`,
    category: 'gesture',
    difficulty: 'easy',
    rule: { fr: `REGLE-SECRETE-FR-${i}`, en: `SECRET-RULE-EN-${i}` },
    decoys: Array.from({ length: 7 }, (_, k) => ({ fr: `LEURRE-FR-${i}-${k}`, en: `DECOY-EN-${i}-${k}` })),
  };
}

export function content(n: number): ContentPack<RuleHuntContent> {
  return { id: 'test-rules', version: 1, data: { items: Array.from({ length: n }, (_, i) => ruleItem(i)) } };
}

export const ack = (playerId: string, at = 0): GameEvent<RuleHuntAction> =>
  ({ type: 'action', playerId, action: { kind: 'ackRule' }, at });
export const accuse = (playerId: string, target: string, at = 0): GameEvent<RuleHuntAction> =>
  ({ type: 'action', playerId, action: { kind: 'accuse', target }, at });
export const tribunalVote = (playerId: string, guilty: boolean, at = 0): GameEvent<RuleHuntAction> =>
  ({ type: 'action', playerId, action: { kind: 'tribunalVote', guilty }, at });
export const openGuess = (playerId: string, at = 0): GameEvent<RuleHuntAction> =>
  ({ type: 'action', playerId, action: { kind: 'openGuess' }, at });
export const pickCandidate = (playerId: string, index: number, at = 0): GameEvent<RuleHuntAction> =>
  ({ type: 'action', playerId, action: { kind: 'pickCandidate', index }, at });
export const deadline = (at: number): GameEvent<RuleHuntAction> => ({ type: 'deadline', at });
export const left = (playerId: string, at = 0): GameEvent<RuleHuntAction> =>
  ({ type: 'playerLeft', playerId, at });
export const rejoined = (playerId: string, at = 0): GameEvent<RuleHuntAction> =>
  ({ type: 'playerRejoined', playerId, at });

export function followersOf(state: RuleHuntState): string[] {
  return state.players.filter((p) => !state.detectives.includes(p));
}

/** Fold events, throwing if any is REJECTED (same-reference) — keeps scenarios honest. */
export function fold(state: RuleHuntState, events: ReadonlyArray<GameEvent<RuleHuntAction>>): RuleHuntState {
  for (const e of events) {
    const next = game.reduce(state, e).state;
    if (next === state) throw new Error(`fixture event rejected by reduce: ${JSON.stringify(e)}`);
    state = next;
  }
  return state;
}

/** All connected followers ack at `at` -> live (segmentStartedAt = at). */
export function toLive(state: RuleHuntState, at = 1_000): RuleHuntState {
  const next = fold(
    state,
    followersOf(state).filter((f) => state.connected[f] === true).map((f) => ack(f, at)),
  );
  if (next.phase !== 'live') throw new Error(`expected live, got ${next.phase}`);
  return next;
}

/** Any grid index that is NOT the true rule. */
export function wrongIndex(state: RuleHuntState, offset = 1): number {
  return (state.trueCandidateIndex + offset) % state.candidateTexts.length;
}

/** First detective + roster-ordered followers of the current round. */
export function cast(state: RuleHuntState): { detective: string; followers: string[] } {
  return { detective: state.detectives[0]!, followers: followersOf(state) };
}

/**
 * live -> tribunal: followers[0] accuses followers[1] at `at`.
 * Eligible voters = connected, non-eliminated followers minus the accused.
 */
export function toTribunal(state: RuleHuntState, at = 5_000): RuleHuntState {
  const [accuser, accused] = followersOf(state);
  const next = fold(state, [accuse(accuser!, accused!, at)]);
  if (next.phase !== 'tribunal') throw new Error(`expected tribunal, got ${next.phase}`);
  return next;
}

/**
 * Walk the deadline machine the way the real shell does: advance a monotonic
 * clock by each phase's armed `phaseDurationMs` and fire one deadline per step.
 * Returns the final state plus the ordered phaseKeys visited (the starting key
 * first). This handles the heat-check `live -> spotlight -> live` hops without
 * any test having to count them: a passive room drains its banked live clock in
 * `heatMs` slices, staging a spotlight on each slice, until reveal.
 */
export function walkDeadlines(
  state: RuleHuntState,
  opts: { startAt?: number; maxSteps?: number; until?: (s: RuleHuntState) => boolean } = {},
): { state: RuleHuntState; keys: string[]; clock: number } {
  const { startAt = 0, maxSteps = 200, until = (s) => s.phase === 'over' } = opts;
  let s = state;
  let clock = startAt;
  const keys: string[] = [game.phaseKey(s)];
  for (let i = 0; i < maxSteps && !until(s); i++) {
    const dur = game.phaseDurationMs(s);
    if (dur === null) break; // untimed phase (over): nothing left to fire
    clock += Math.max(1, dur);
    const next = game.reduce(s, deadline(clock)).state;
    if (next === s) break; // defensive: a phase that ignores its deadline
    s = next;
    keys.push(game.phaseKey(s));
  }
  return { state: s, keys, clock };
}

/** Drain a `live` state to its terminal reveal, stepping through every forced spotlight. */
export function liveToReveal(state: RuleHuntState, startAt?: number): RuleHuntState {
  if (state.phase !== 'live') throw new Error(`expected live, got ${state.phase}`);
  const { state: out } = walkDeadlines(state, {
    startAt: startAt ?? state.segmentStartedAt,
    until: (s) => s.phase === 'reveal' || s.phase === 'over',
  });
  return out;
}

/** Heat-check actions: a follower's free soft read; a detective's private bookmark. */
export const flagBreak = (playerId: string, flag: 'flag' | 'clean', at = 0): GameEvent<RuleHuntAction> =>
  ({ type: 'action', playerId, action: { kind: 'flagBreak', flag }, at });
export const noteSuspicious = (
  playerId: string, note: 'suspicious' | 'clear', at = 0,
): GameEvent<RuleHuntAction> =>
  ({ type: 'action', playerId, action: { kind: 'noteSuspicious', note }, at });

/**
 * live -> spotlight: fire the first heat-check by exhausting one `heatMs` slice
 * of the live clock. The named (seeded) performer is `state.spotlight.target`.
 */
export function toSpotlight(state: RuleHuntState): RuleHuntState {
  if (state.phase !== 'live') throw new Error(`expected live, got ${state.phase}`);
  const at = state.segmentStartedAt + game.phaseDurationMs(state)!;
  const next = game.reduce(state, deadline(at)).state;
  if (next.phase !== 'spotlight') throw new Error(`expected spotlight, got ${next.phase}`);
  return next;
}
