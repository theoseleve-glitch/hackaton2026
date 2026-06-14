import type { RoomDO } from './room/room-do.js';

export interface Env {
  ROOM: DurableObjectNamespace<RoomDO>;
  CONFIG: KVNamespace;
  /** R2 content seam: content packs keyed by pack.id (see room-do.loadContent). */
  CONTENT: R2Bucket;
  ENV: string;
}
