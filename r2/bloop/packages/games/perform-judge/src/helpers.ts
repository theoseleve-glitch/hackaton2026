import type { PlayerId } from '@bloop/engine';
import { connectedPlayers, nextActiveSeat } from '@bloop/kit';
import type { PerformJudgeItem, PerformJudgeState } from './state.js';

type S = PerformJudgeState;

export function currentItem(state: S): PerformJudgeItem | null {
  return state.offer[state.chosenIndex ?? 0] ?? null;
}

export function crew(state: S): PlayerId[] {
  return state.partner === null ? [state.performer] : [state.performer, state.partner];
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
