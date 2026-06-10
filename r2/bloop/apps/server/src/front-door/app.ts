import { Hono } from 'hono';
import { PROTOCOL_VERSION } from '@bloop/protocol';
import type { Env } from '../types.js';
import { generateRoomCode, isBlockedCode } from './room-code.js';

export const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

// Client config (min versions, kill switches, catalog manifest). KV-cached at
// the edge; the ONLY HTTPS fetch the app makes before the WS connect.
app.get('/config', async (c) => {
  const body = await c.env.CONFIG.get('client-config', 'json');
  return c.json(body ?? {}, 200, { 'cache-control': 'public, max-age=60' });
});

app.post('/rooms', async (c) => {
  // Review I3: one idempotent RPC test-and-sets; collisions retry with a fresh code.
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateRoomCode();
    if (isBlockedCode(code)) continue;
    const result = await c.env.ROOM.getByName(code).createRoom({
      code, protocolVersion: PROTOCOL_VERSION, createdAt: Date.now(),
    });
    if (result.created) return c.json({ code, protocolVersion: result.protocolVersion, wsPath: `/rooms/${code}/ws` }, 201);
  }
  return c.json({ error: 'code-space-busy' }, 503);
});
