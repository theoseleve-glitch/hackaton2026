import { env, SELF, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { RoomDO } from '../src/room/room-do.js';

describe('scaffold smoke', () => {
  it('GET /health 200s and unknown routes 404', async () => {
    const health = await SELF.fetch('https://bloop.test/health');
    expect(health.status).toBe(200);
    expect(((await health.json()) as { ok: boolean }).ok).toBe(true);
    expect((await SELF.fetch('https://bloop.test/nope')).status).toBe(404);
  });

  it('RoomDO instantiates inside the runtime (SQLite-backed)', async () => {
    await runInDurableObject(env.ROOM.getByName('SMKE'), async (instance) => {
      expect(instance).toBeInstanceOf(RoomDO);
    });
  });
});
