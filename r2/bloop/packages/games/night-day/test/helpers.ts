import type { ContentPack, GameEvent } from '@bloop/engine';
import {
  createNightDay,
  LOUP_GAROU_CONFIG,
  type NightDayAction,
  type NightDayConfig,
  type NightDayContent,
  type NightDayState,
  type Role,
} from '@bloop/game-night-day';

const L = (s: string) => ({ fr: `${s}-fr`, en: `${s}-en` });

/** Minimal pack mirroring the AUTHORED shape (roleCards + narration slots), plus a v2 card to ignore. */
export const CONTENT: ContentPack<NightDayContent> = {
  id: 'test-pack',
  version: 1,
  data: {
    items: [
      { id: 'rc-wolf', type: 'roleCard', role: 'wolf', name: L('wolfname'), text: L('wolftext') },
      { id: 'rc-villager', type: 'roleCard', role: 'villager', name: L('vilname'), text: L('viltext') },
      { id: 'rc-seer', type: 'roleCard', role: 'seer', name: L('seername'), text: L('seertext') },
      { id: 'rc-witch', type: 'roleCard', role: 'witch', name: L('witchname'), text: L('witchtext') },
      { id: 'n-night-1', type: 'narration', slot: 'night.intro', text: L('nightintro1') },
      { id: 'n-night-2', type: 'narration', slot: 'night.intro', text: L('nightintro2') },
      { id: 'n-death-1', type: 'narration', slot: 'dawn.death', text: L('dawndeath1') },
      { id: 'n-death-2', type: 'narration', slot: 'dawn.death', text: L('dawndeath2') },
      { id: 'n-nodeath-1', type: 'narration', slot: 'dawn.noDeath', text: L('dawnnodeath1') },
      { id: 'n-lw-1', type: 'narration', slot: 'lynch.wolf', text: L('lynchwolf1') },
      { id: 'n-lv-1', type: 'narration', slot: 'lynch.villager', text: L('lynchvillager1') },
      { id: 'n-ln-1', type: 'narration', slot: 'lynch.none', text: L('lynchnone1') },
      { id: 'n-ov-1', type: 'narration', slot: 'over.village', text: L('overvillage1') },
      { id: 'n-ow-1', type: 'narration', slot: 'over.wolves', text: L('overwolves1') },
    ],
  },
};

export const P5 = ['p1', 'p2', 'p3', 'p4', 'p5'];
export const P8 = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

export const game = createNightDay('loup-garou', LOUP_GAROU_CONFIG);

export function mk(config: Partial<NightDayConfig> = {}) {
  return createNightDay('loup-garou', { ...LOUP_GAROU_CONFIG, ...config });
}

export const act = (playerId: string, action: NightDayAction, at = 0): GameEvent<NightDayAction> => ({
  type: 'action',
  playerId,
  action,
  at,
});
export const deadline = (at = 0): GameEvent<NightDayAction> => ({ type: 'deadline', at });
export const left = (playerId: string, at = 0): GameEvent<NightDayAction> => ({
  type: 'playerLeft',
  playerId,
  at,
});
export const rejoin = (playerId: string, at = 0): GameEvent<NightDayAction> => ({
  type: 'playerRejoined',
  playerId,
  at,
});

export const peek = (seer: string, target: string, at = 0) => act(seer, { kind: 'seerPeek', target }, at);
export const wolfVote = (wolf: string, target: string, at = 0) => act(wolf, { kind: 'wolfVote', target }, at);
export const witchAct = (witch: string, heal: boolean, poisonTarget: string | null, at = 0) =>
  act(witch, { kind: 'witchAct', heal, poisonTarget }, at);
export const vote = (voter: string, target: string, at = 0) => act(voter, { kind: 'vote', target }, at);
export const nightAck = (p: string, at = 0) => act(p, { kind: 'nightAck' }, at);

/** White-box role lookup — tests own the state type. */
export function roleOf(state: NightDayState, role: Role): string {
  const found = state.players.find((p) => state.roles[p] === role);
  if (found === undefined) throw new Error(`no ${role} in roster`);
  return found;
}

export function allOf(state: NightDayState, role: Role): string[] {
  return state.players.filter((p) => state.roles[p] === role);
}

type Module = ReturnType<typeof mk>;

/** Apply events in order; throws if any event is REJECTED (same reference) so scripts stay honest. */
export function drive(
  module: Module,
  state: NightDayState,
  events: ReadonlyArray<GameEvent<NightDayAction>>,
): NightDayState {
  let s = state;
  for (const e of events) {
    const next = module.reduce(s, e).state;
    if (next === s) throw new Error(`script event rejected: ${JSON.stringify(e)}`);
    s = next;
  }
  return s;
}

/** Walk deadlines until the predicate matches or the budget runs out. */
export function walkUntil(
  module: Module,
  state: NightDayState,
  pred: (s: NightDayState) => boolean,
  budget = 200,
): NightDayState {
  let s = state;
  let at = 100_000;
  for (let i = 0; i < budget && !pred(s); i++) {
    const next = module.reduce(s, deadline(at++)).state;
    if (next === s) break;
    s = next;
  }
  if (!pred(s)) throw new Error(`walkUntil exhausted at phase ${s.phase}`);
  return s;
}

/** roleReveal -> first night sub-phase via deadline. */
export function toNight(module: Module, state: NightDayState): NightDayState {
  return module.reduce(state, deadline(1)).state;
}
