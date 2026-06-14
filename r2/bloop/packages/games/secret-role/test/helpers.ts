import type { ContentPack, GameEvent } from '@bloop/engine';
import type { SecretRoleAction, SecretRoleContent, SecretRoleItem, SecretRoleState } from '@bloop/game-secret-role';
import { createSecretRole, DOUBLE_JEU_CONFIG } from '@bloop/game-secret-role';

/** Distinctive non-overlapping strings: no word is a substring of any theme or other word. */
export function item(n: number): SecretRoleItem {
  return {
    id: `it${n}`,
    theme: { fr: `THEME-FR-${n}`, en: `THEME-EN-${n}` },
    majority: { fr: `MAJ-FR-${n}`, en: `MAJ-EN-${n}` },
    impostor: { fr: `IMP-FR-${n}`, en: `IMP-EN-${n}` },
  };
}

export function pack(count: number): ContentPack<SecretRoleContent> {
  return { id: 'test-pack', version: 1, data: { items: Array.from({ length: count }, (_, i) => item(i + 1)) } };
}

export const content = pack(4);
export const players = ['p1', 'p2', 'p3', 'p4'];
export const game = createSecretRole('double-jeu', DOUBLE_JEU_CONFIG);

export const ack = (playerId: string, at = 0): GameEvent<SecretRoleAction> =>
  ({ type: 'action', playerId, action: { kind: 'ack' }, at });
export const ready = (playerId: string, at = 0): GameEvent<SecretRoleAction> =>
  ({ type: 'action', playerId, action: { kind: 'ready' }, at });
export const vote = (playerId: string, target: string, at = 0): GameEvent<SecretRoleAction> =>
  ({ type: 'action', playerId, action: { kind: 'vote', target }, at });
export const lean = (playerId: string, target: string, at = 0): GameEvent<SecretRoleAction> =>
  ({ type: 'action', playerId, action: { kind: 'lean', target }, at });
export const dl = (at = 0): GameEvent<SecretRoleAction> => ({ type: 'deadline', at });
export const leftEv = (playerId: string, at = 0): GameEvent<SecretRoleAction> => ({ type: 'playerLeft', playerId, at });
export const rejoinEv = (playerId: string, at = 0): GameEvent<SecretRoleAction> => ({ type: 'playerRejoined', playerId, at });

export function run(s0: SecretRoleState, events: ReadonlyArray<GameEvent<SecretRoleAction>>): SecretRoleState {
  let s = s0;
  for (const e of events) s = game.reduce(s, e).state;
  return s;
}

/** Deadline-skip secretReveal + discuss: lands in vote p0 of the current match. */
export function toVotePhase(s0: SecretRoleState): SecretRoleState {
  return run(s0, [dl(1), dl(2)]);
}

/** Roster split for the CURRENT match: [impostor, civilians in roster order]. */
export function roles(s: SecretRoleState): { imp: string; civs: string[] } {
  return { imp: s.impostor, civs: s.players.filter((p) => p !== s.impostor) };
}
