import type { RoomDO } from './room/room-do.js';

export interface Env {
  ROOM: DurableObjectNamespace<RoomDO>;
  CONFIG: KVNamespace;
  ENV: string;
}
