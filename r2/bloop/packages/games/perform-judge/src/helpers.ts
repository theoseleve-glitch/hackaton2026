import type { PlayerId } from '@bloop/engine';
import { connectedPlayers, nextActiveSeat } from '@bloop/kit';
import { REACTIONS, type PerformJudgeItem, type PerformJudgeState, type ReactionCounts } from './state.js';

type S = PerformJudgeState;

export function currentItem(state: S): PerformJudgeItem | null {
  return state.offer[state.chosenIndex ?? 0] ?? null;
}

export function crew(state: S): PlayerId[] {
  return state.partner === null ? [state.performer] : [state.performer, state.partner];
}

/**
 * CC-4 — who may react during perform: every CONNECTED roster player who is NOT
 * on stage (not in the performing crew). The audience. A reaction from anyone
 * else is rejected. SEPARATE from the judge/tap eligibility sets — reactions
 * are a non-scoring cosmetic channel and never feed a resolve.
 */
export function reactors(state: S): PlayerId[] {
  const onStage = crew(state);
  return connectedPlayers(state.players, state.connected).filter((p) => !onStage.includes(p));
}

/** CC-4 — public per-enum reaction counts (aggregate; leaks no ballot). */
export function reactionCounts(state: S): ReactionCounts {
  const counts: ReactionCounts = { fire: 0, laugh: 0, cringe: 0 };
  for (const p of Object.keys(state.reactions)) {
    const r = state.reactions[p];
    if (r !== undefined && REACTIONS.includes(r)) counts[r] += 1;
  }
  return counts;
}

/** puppet: connected non-performers — the early-majority denominator E. */
export function commanders(state: S): PlayerId[] {
  return connectedPlayers(state.players, state.connected).filter((p) => p !== state.performer);
}

export function tapGoal(state: S): number {
  return Math.floor(commanders(state).length / 2) + 1;
}

export function tapCount(state: S): number {
  return commanders(state).filter((p) => state.taps[p] === true).length;
}

/** The phase-appropriate eligible judge set (always connected-filtered). */
export function eligibleJudges(state: S): PlayerId[] {
  const connected = connectedPlayers(state.players, state.connected);
  if (state.config.adjudication === 'stars') {
    const c = crew(state);
    return connected.filter((p) => !c.includes(p));
  }
  if (state.config.adjudication === 'claim-validate') {
    return connected.filter((p) => p !== state.performer && p !== state.claim?.guesser);
  }
  return connected.filter((p) => p !== state.performer);
}

/** Next connected seat after the mover, excluding the mover — null = solo fallback. */
export function pickPartner(
  rotation: readonly PlayerId[],
  moverIndex: number,
  connected: Record<PlayerId, boolean>,
): PlayerId | null {
  const seat = nextActiveSeat(rotation, moverIndex, connected);
  const candidate = rotation[seat.index];
  if (candidate === undefined || seat.index === moverIndex) return null;
  if (candidate === rotation[moverIndex]) return null;
  if (connected[candidate] !== true) return null;
  return candidate;
}
