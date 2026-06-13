import type { PlayerId } from '@bloop/engine';
import { emptyPlayerMap } from '@bloop/kit';
import type { EndReason, NightDayState, NightStep, Role, Winners } from './state.js';

export function zeroScores(players: readonly PlayerId[]): Record<PlayerId, number> {
  const m = emptyPlayerMap<number>();
  for (const p of players) m[p] = 0;
  return m;
}

export function alivePlayers(state: NightDayState): PlayerId[] {
  return state.players.filter((p) => state.alive[p] === true);
}

/** The resolution set of every gated phase — a disconnected player can never stall past the deadline. */
export function aliveConnected(state: NightDayState): PlayerId[] {
  return state.players.filter((p) => state.alive[p] === true && state.connected[p] === true);
}

export function livingWolves(state: NightDayState): PlayerId[] {
  return state.players.filter((p) => state.roles[p] === 'wolf' && state.alive[p] === true);
}

export function holder(state: NightDayState, role: Role): PlayerId | null {
  return state.players.find((p) => state.roles[p] === role) ?? null;
}

/**
 * SKIP RULE (design §2.17): a sub-phase whose role is dead/disabled is
 * skipped when revealRoleOnDeath=true (the death is already public); when
 * false it still runs full-length decoy-only so its absence cannot reveal
 * which role died.
 */
export function stepMode(state: NightDayState, step: NightStep): 'run' | 'decoy' | 'skip' {
  let enabled: boolean;
  let actorAlive: boolean;
  if (step === 'wolves') {
    enabled = true;
    actorAlive = livingWolves(state).length > 0;
  } else if (step === 'seer') {
    enabled = state.config.seerEnabled;
    const s = holder(state, 'seer');
    actorAlive = s !== null && state.alive[s] === true;
  } else {
    enabled = state.config.witchEnabled;
    const w = holder(state, 'witch');
    actorAlive = w !== null && state.alive[w] === true;
  }
  if (enabled && actorAlive) return 'run';
  return state.config.revealRoleOnDeath ? 'skip' : 'decoy';
}

/** Pure ordered win-check (runs at dawn and lynchReveal deadlines). */
export function winCheck(
  state: NightDayState,
  roundIfContinue: number,
): { winners: Winners; endReason: EndReason } | null {
  const wolves = livingWolves(state).length;
  const nonWolves = alivePlayers(state).length - wolves;
  if (wolves === 0) return { winners: 'village', endReason: 'villageWins' };
  if (wolves >= nonWolves) return { winners: 'wolves', endReason: 'wolvesWin' };
  if (aliveConnected(state).length < 3) {
    // Rule 2 already caught wolves >= nonWolves, so the side with more alive is the village.
    return { winners: nonWolves >= wolves ? 'village' : 'wolves', endReason: 'roomCollapsed' };
  }
  if (roundIfContinue >= state.config.maxRounds) {
    return { winners: wolves >= nonWolves ? 'wolves' : 'village', endReason: 'maxRounds' };
  }
  return null;
}
