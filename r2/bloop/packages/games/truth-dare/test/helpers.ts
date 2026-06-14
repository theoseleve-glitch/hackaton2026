import type { ContentPack, Effect, GameEvent, GameModule } from '@bloop/engine';
import {
  createTruthDare,
  TRUTH_OR_DARE_2_CONFIG,
  TRUTH_OR_DRINK_CONFIG,
  type Choice,
  type LText,
  type TdItem,
  type TruthDareAction,
  type TruthDareContent,
  type TruthDareState,
  type TruthDareView,
  type Verdict,
} from '@bloop/game-truth-dare';

export type TdModule = GameModule<TruthDareState, TruthDareAction, TruthDareView, TruthDareContent>;

export const lt = (s: string): LText => ({ fr: `${s} (fr)`, en: `${s} (en)` });

/** fun deck: 12 per (choice, soft|party); lover deck: 6 per (choice, party|spicy). */
export function mkTodItems(): TdItem[] {
  const items: TdItem[] = [];
  for (const choice of ['truth', 'dare'] as const) {
    for (const tier of ['soft', 'party'] as const) {
      for (let i = 0; i < 12; i++) {
        const id = `fun-${choice}-${tier}-${i}`;
        items.push({ id, choice, intensity: tier, text: lt(id), deck: 'fun' });
      }
    }
    for (const tier of ['party', 'spicy'] as const) {
      for (let i = 0; i < 6; i++) {
        const id = `lov-${choice}-${tier}-${i}`;
        items.push({ id, choice, intensity: tier, text: lt(id), deck: 'lover' });
      }
    }
  }
  return items;
}

/** truth rows = questions (10 per party|spicy); dare rows = forfeit pool (6 per tier); one soft row to be filtered. */
export function mkDrinkItems(): TdItem[] {
  const items: TdItem[] = [];
  for (const tier of ['party', 'spicy'] as const) {
    for (let i = 0; i < 10; i++) {
      const id = `q-${tier}-${i}`;
      items.push({ id, choice: 'truth', intensity: tier, text: lt(id) });
    }
    for (let i = 0; i < 6; i++) {
      const id = `f-${tier}-${i}`;
      items.push({ id, choice: 'dare', intensity: tier, text: lt(id) });
    }
  }
  items.push({ id: 'q-soft-0', choice: 'truth', intensity: 'soft', text: lt('q-soft-0') });
  return items;
}

export function pack(items: TdItem[], id = 'test-pack'): ContentPack<TruthDareContent> {
  return { id, version: 1, data: { items } };
}

export const TOD_PACK = pack(mkTodItems(), 'tod-test');
export const DRINK_PACK = pack(mkDrinkItems(), 'drink-test');

export const PLAYERS = ['p1', 'p2', 'p3'];

export const tod = createTruthDare('truth-or-dare-2', TRUTH_OR_DARE_2_CONFIG);
export const drink = createTruthDare('truth-or-drink', TRUTH_OR_DRINK_CONFIG);

// --- event builders ---
type Ev = GameEvent<TruthDareAction>;
export const choose = (playerId: string, choice: Choice, at = 0): Ev =>
  ({ type: 'action', playerId, action: { kind: 'chooseType', choice }, at });
export const declare = (playerId: string, result: Verdict, at = 0): Ev =>
  ({ type: 'action', playerId, action: { kind: 'declare', result }, at });
export const pass = (playerId: string, at = 0): Ev =>
  ({ type: 'action', playerId, action: { kind: 'pass' }, at });
export const vote = (playerId: string, v: Verdict, at = 0): Ev =>
  ({ type: 'action', playerId, action: { kind: 'verdict', vote: v }, at });
export const predict = (playerId: string, bet: Verdict, at = 0): Ev =>
  ({ type: 'action', playerId, action: { kind: 'predict', bet }, at });
export const deadline = (at = 0): Ev => ({ type: 'deadline', at });
export const left = (playerId: string, at = 0): Ev => ({ type: 'playerLeft', playerId, at });
export const rejoin = (playerId: string, at = 0): Ev => ({ type: 'playerRejoined', playerId, at });

export const othersOf = (s: TruthDareState): string[] => s.players.filter((p) => p !== s.activePlayer);

/** Fold a script, asserting every event is ACCEPTED (new reference). */
export function fold(module: TdModule, state: TruthDareState, events: Ev[]): TruthDareState {
  let s = state;
  for (const e of events) {
    const next = module.reduce(s, e).state;
    if (next === s) throw new Error(`event was rejected: ${JSON.stringify(e)}`);
    s = next;
  }
  return s;
}

/** Walk deadlines until 'over' (or maxSteps), collecting phaseKeys and effects. */
export function walkToOver(
  module: TdModule,
  state: TruthDareState,
  maxSteps = 100,
): { state: TruthDareState; steps: number; keys: string[]; effects: Effect[] } {
  let s = state;
  const keys: string[] = [module.phaseKey(s)];
  const effects: Effect[] = [];
  let steps = 0;
  while (s.phase !== 'over' && steps < maxSteps) {
    const r = module.reduce(s, deadline(1_000 + steps));
    if (r.state === s) break; // absorbed — only legal when untimed
    s = r.state;
    keys.push(module.phaseKey(s));
    effects.push(...r.effects);
    steps += 1;
  }
  return { state: s, steps, keys, effects };
}

export const analyticsNames = (effects: Effect[]): string[] =>
  effects.filter((e): e is Extract<Effect, { type: 'analytics' }> => e.type === 'analytics').map((e) => e.name);
