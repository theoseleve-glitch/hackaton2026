import type { ContentPack, GameEvent } from '@bloop/engine';
import type {
  CrowdTargetItem,
  InputGuessAction,
  InputGuessContent,
  InputGuessState,
  NumberQuestionItem,
} from '@bloop/game-input-guess';

/** n closest-number items: answers 100, 200, … with distinctive secret strings. */
export function numberContent(n: number): ContentPack<InputGuessContent> {
  const items: NumberQuestionItem[] = [];
  for (let i = 1; i <= n; i++) {
    items.push({
      id: `q${i}`,
      question: { fr: `Question FR ${i} ?`, en: `Question EN ${i}?` },
      answer: i * 100,
      unit: { fr: 'unités', en: 'units' },
      format: 'plain',
      scale: 'linear',
      funFact: { fr: `FUNFACT-SECRET-FR-${i}`, en: `FUNFACT-SECRET-EN-${i}` },
    });
  }
  return { id: 'test-numbers', version: 1, data: { items } };
}

/** One authored-shaped crowd item (sample cc-honestly-001 percentages, target 80). */
export function crowdItem(id: string, targetYesPct = 80, pcts: readonly number[] = [84, 71, 62, 55, 47, 38]): CrowdTargetItem {
  return {
    id,
    targetYesPct,
    askKind: 'didYou',
    stem: { fr: `Amorce FR ${id}…`, en: `Stem EN ${id}…` },
    completions: pcts.map((crowdYesPct, i) => ({
      id: 'abcdef'[i] ?? `x${i}`,
      text: { fr: `…carte FR ${id}-${'abcdef'[i]}`, en: `…card EN ${id}-${'abcdef'[i]}` },
      crowdYesPct,
    })),
  };
}

export function crowdContent(n: number): ContentPack<InputGuessContent> {
  const items: CrowdTargetItem[] = [];
  for (let i = 1; i <= n; i++) items.push(crowdItem(`cc${i}`));
  return { id: 'test-crowd', version: 1, data: { items } };
}

export function guess(playerId: string, value: number, at = 0): GameEvent<InputGuessAction> {
  return { type: 'action', playerId, action: { kind: 'guess', value }, at };
}

export function pick(playerId: string, cardIndex: number, at = 0): GameEvent<InputGuessAction> {
  return { type: 'action', playerId, action: { kind: 'pick', cardIndex }, at };
}

export function numberItemOf(state: InputGuessState, round: number): NumberQuestionItem {
  const item = state.items[round];
  if (item === undefined || !('answer' in item)) throw new Error(`round ${round} is not a number item`);
  return item;
}

export function crowdItemOf(state: InputGuessState, round: number): CrowdTargetItem {
  const item = state.items[round];
  if (item === undefined || !('completions' in item)) throw new Error(`round ${round} is not a crowd item`);
  return item;
}

/** Display-order card index of an authored completion id in the given round. */
export function cardIndexOf(state: InputGuessState, round: number, completionId: string): number {
  const idx = crowdItemOf(state, round).completions.findIndex((c) => c.id === completionId);
  if (idx < 0) throw new Error(`completion ${completionId} not in round ${round}`);
  return idx;
}
