import { createContext, useContext } from 'react';
import type { RoomSession } from './useRoomSession';

export const RoomSessionContext = createContext<RoomSession | null>(null);

export function useRoom(): RoomSession {
  const ctx = useContext(RoomSessionContext);
  if (ctx === null) throw new Error('useRoom outside a room route');
  return ctx;
}
