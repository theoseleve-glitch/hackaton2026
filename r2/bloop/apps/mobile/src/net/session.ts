import type { ErrorCode, RoomPlayer, ServerMessage } from '@bloop/protocol';

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'fatal';
export type FatalCode = Extract<ErrorCode, 'UPGRADE_REQUIRED' | 'ROOM_FULL'>;
export interface SessionToast { seq: number; kind: 'error' | 'info'; text: string }

export interface SessionState {
  status: ConnStatus;
  playerId: string | null;
  reconnectToken: string | null;
  players: readonly RoomPlayer[];
  gameId: string | null;
  /** Opaque per-game payload — narrowed at render time by per-game guards (firewall: types only). */
  view: unknown;
  viewGameId: string | null;
  deadlineAt: number | null;
  fatal: FatalCode | null;
  toast: SessionToast | null;
}

export const initialSession: SessionState = {
  status: 'connecting', playerId: null, reconnectToken: null, players: [], gameId: null,
  view: null, viewGameId: null, deadlineAt: null, fatal: null, toast: null,
};

export type SessionEvent =
  | { type: 'socketOpen' }
  | { type: 'socketClosed' }
  | { type: 'message'; message: ServerMessage };

const TOAST_TEXT: Record<Exclude<ErrorCode, FatalCode>, string> = {
  // Also the §7.4 rate-limit warn: the server deliberately reuses BAD_MESSAGE for it.
  BAD_MESSAGE: 'The server said no — check your nickname, or slow down a touch.',
  NOT_HOST: 'Only the host can do that.',
  UNKNOWN_GAME: "That game isn't available right now.",
};

function withToast(s: SessionState, kind: SessionToast['kind'], text: string): SessionState {
  return { ...s, toast: { seq: (s.toast?.seq ?? 0) + 1, kind, text } };
}

/** Pure: the ONLY way session state changes. The hook (Task 5) feeds it socket + parsed-message events. */
export function reduceSession(s: SessionState, e: SessionEvent): SessionState {
  if (s.fatal !== null) return s; // absorbing — a dead session never mutates
  switch (e.type) {
    case 'socketOpen': return { ...s, status: 'open' };
    case 'socketClosed': return { ...s, status: 'reconnecting' };
    case 'message': {
      const m = e.message;
      switch (m.type) {
        case 'welcome': return { ...s, playerId: m.playerId, reconnectToken: m.reconnectToken };
        case 'lobby': return { ...s, players: m.players, gameId: m.gameId };
        case 'view': return { ...s, view: m.view, viewGameId: m.gameId, deadlineAt: m.deadlineAt };
        case 'error':
          if (m.code === 'UPGRADE_REQUIRED' || m.code === 'ROOM_FULL') return { ...s, status: 'fatal', fatal: m.code };
          return withToast(s, 'error', TOAST_TEXT[m.code]);
      }
    }
  }
}
