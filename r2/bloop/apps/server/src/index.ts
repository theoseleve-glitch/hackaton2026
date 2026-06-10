import { app } from './front-door/app.js';
import { normalizeRoomCode } from './front-door/room-code.js';
import type { Env } from './types.js';

export { RoomDO } from './room/room-do.js';

const WS_PATH = /^\/rooms\/([A-Za-z0-9]{4})\/ws$/;

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const m = WS_PATH.exec(url.pathname);
    if (m !== null) {
      // Review I2: codes are case-insensitive on input; normalize BEFORE
      // idFromName — idFromName('abcd') !== idFromName('ABCD') would split one
      // room across two DOs for QR/deep-link/manual-entry joins.
      const code = normalizeRoomCode(m[1]!);
      if (code === null) return new Response('no such room', { status: 404 });
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('expected websocket upgrade', { status: 426 });
      }
      return env.ROOM.getByName(code).fetch(req); // the DO does ctx.acceptWebSocket
    }
    return app.fetch(req, env, ctx);
  },
} satisfies ExportedHandler<Env>;
