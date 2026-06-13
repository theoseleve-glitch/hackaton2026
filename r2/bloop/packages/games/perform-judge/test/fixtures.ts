import type { ContentPack, Effect, GameEvent, GameModule } from '@bloop/engine';
import type {
  PerformJudgeAction,
  PerformJudgeContent,
  PerformJudgeItem,
  PerformJudgeState,
  PerformJudgeView,
} from '@bloop/game-perform-judge';

export type PJModule = GameModule<PerformJudgeState, PerformJudgeAction, PerformJudgeView, PerformJudgeContent>;
export type PJEvent = GameEvent<PerformJudgeAction>;

/** Synthetic items with unmistakable secret markers for leak assertions. */
export function makeItems(n: number): PerformJudgeItem[] {
  const items: PerformJudgeItem[] = [];
  for (let i = 0; i < n; i++) {
    items.push({
      // every numbered marker ends with a terminator so item 1 is never a
      // substring of item 11 (the leakedSecrets audit matches substrings)
      id: `item-${i}`,
      prompt: { fr: `secret-prompt-fr-${i}-end`, en: `secret-prompt-en-${i}-end` },
      category: { fr: `categorie-${i}-end`, en: `category-${i}-end` },
      hint: { fr: `astuce-secrete-fr-${i}-end`, en: `secret-hint-en-${i}-end` },
      constraintLabel: { fr: `CONTRAINTE ${i}`, en: `CONSTRAINT ${i}` },
      constraintRule: { fr: `règle publique ${i}`, en: `public rule ${i}` },
      forbidden: {
        fr: [`tabou-fr-${i}-a`, `tabou-fr-${i}-b`, `tabou-fr-${i}-c`],
        en: [`taboo-en-${i}-a`, `taboo-en-${i}-b`, `taboo-en-${i}-c`],
      },
    });
  }
  return items;
}

export function makeContent(n = 16): ContentPack<PerformJudgeContent> {
  return { id: 'test-pack', version: 1, data: { items: makeItems(n) } };
}

export const act = (playerId: string, action: PerformJudgeAction, at = 0): PJEvent =>
  ({ type: 'action', playerId, action, at });

export const vote = (playerId: string, v: 'yes' | 'no', at = 0): PJEvent =>
  act(playerId, { kind: 'vote', vote: v }, at);

export const rate = (playerId: string, stars: number, at = 0): PJEvent =>
  act(playerId, { kind: 'rate', stars }, at);

export const deadline = (at = 0): PJEvent => ({ type: 'deadline', at });

export const left = (playerId: string, at = 0): PJEvent => ({ type: 'playerLeft', playerId, at });

export const rejoined = (playerId: string, at = 0): PJEvent => ({ type: 'playerRejoined', playerId, at });

/** Roster minus the current performer, in roster order. */
export function others(state: PerformJudgeState): string[] {
  return state.players.filter((p) => p !== state.performer);
}

/** Fold a list of events, requiring every one of them to be ACCEPTED. */
export function fold(module: PJModule, state: PerformJudgeState, events: PJEvent[]): PerformJudgeState {
  let s = state;
  for (const e of events) {
    const next = module.reduce(s, e).state;
    if (next === s) throw new Error(`fixture event rejected: ${JSON.stringify(e)}`);
    s = next;
  }
  return s;
}

/** Deadline-only walk until 'over' (or a stall, which callers assert against). */
export function walkToOver(
  module: PJModule,
  state: PerformJudgeState,
  max = 100,
): { state: PerformJudgeState; steps: number; effects: Effect[]; states: PerformJudgeState[] } {
  let s = state;
  const effects: Effect[] = [];
  const states: PerformJudgeState[] = [];
  for (let i = 0; i < max; i++) {
    if (s.phase === 'over') return { state: s, steps: i, effects, states };
    const r = module.reduce(s, { type: 'deadline', at: 1_000_000 + i });
    if (r.state === s) throw new Error(`deadline stalled in timed phase ${module.phaseKey(s)}`);
    s = r.state;
    effects.push(...r.effects);
    states.push(s);
  }
  return { state: s, steps: max, effects, states };
}
