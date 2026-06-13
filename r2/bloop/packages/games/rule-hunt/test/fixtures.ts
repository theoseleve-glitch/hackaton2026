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
