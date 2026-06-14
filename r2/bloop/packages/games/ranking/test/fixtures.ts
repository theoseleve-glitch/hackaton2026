import type { ContentPack, GameEvent } from '@bloop/engine';
import {
  createRanking,
  LE_CLASSEMENT_CONFIG,
  type RankingAction,
  type RankingConfig,
  type RankingContent,
  type RankingState,
} from '@bloop/game-ranking';

export const content: ContentPack<RankingContent> = {
  id: 'test-pack',
  version: 1,
  data: {
    prompts: [
      { id: 'q1', text: { fr: 'p1', en: 'p1' }, most: { fr: 'm1', en: 'm1' }, least: { fr: 'l1', en: 'l1' }, spicy: 0 },
      { id: 'q2', text: { fr: 'p2', en: 'p2' }, most: { fr: 'm2', en: 'm2' }, least: { fr: 'l2', en: 'l2' }, spicy: 0 },
      { id: 'q3', text: { fr: 'p3', en: 'p3' }, most: { fr: 'm3', en: 'm3' }, least: { fr: 'l3', en: 'l3' }, spicy: 0 },
      { id: 'q4', text: { fr: 'p4', en: 'p4' }, most: { fr: 'm4', en: 'm4' }, least: { fr: 'l4', en: 'l4' }, spicy: 0 },
      { id: 'q5', text: { fr: 'p5', en: 'p5' }, most: { fr: 'm5', en: 'm5' }, least: { fr: 'l5', en: 'l5' }, spicy: 0 },
      { id: 'q6', text: { fr: 'p6', en: 'p6' }, most: { fr: 'm6', en: 'm6' }, least: { fr: 'l6', en: 'l6' }, spicy: 0 },
    ],
  },
};

export const players = ['p1', 'p2', 'p3'];

/** A test config with a small pool and a streak bonus, for exercising scoring. */
export const TEST_CONFIG: RankingConfig = {
  ...LE_CLASSEMENT_CONFIG,
  totalRounds: 3,
};

export const game = createRanking('le-classement', TEST_CONFIG);

export function rank(playerId: string, order: string[], at = 0): GameEvent<RankingAction> {
  return { type: 'action', playerId, action: { kind: 'rank', order }, at };
}

export const deadline = (at = 0): GameEvent<RankingAction> => ({ type: 'deadline', at });

/** Drive a 3-player room from rank(round 0) to reveal with three given ballots. */
export function toReveal(
  state: RankingState,
  ballots: Record<string, string[]>,
  g = game,
): RankingState {
  let s = state;
  for (const [pid, order] of Object.entries(ballots)) {
    s = g.reduce(s, rank(pid, order)).state;
  }
  return s;
}
