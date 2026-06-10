import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@bloop/protocol';

describe('front door', () => {
  it('POST /rooms creates a room: 201 with code, pinned protocolVersion, wsPath', async () => {
    const res = await SELF.fetch('https://bloop.test/rooms', { method: 'POST' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { code: string; protocolVersion: number; wsPath: string };
    expect(body.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    expect(body.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(body.wsPath).toBe(`/rooms/${body.code}/ws`);
  });

  it('createRoom is a test-and-set (I3): the second claim returns created:false', async () => {
    const stub = env.ROOM.getByName('TEST');
    const first = await stub.createRoom({ code: 'TEST', protocolVersion: PROTOCOL_VERSION, createdAt: Date.now() });
    expect(first).toEqual({ created: true, protocolVersion: PROTOCOL_VERSION });
    const second = await stub.createRoom({ code: 'TEST', protocolVersion: PROTOCOL_VERSION, createdAt: Date.now() });
    expect(second).toEqual({ created: false, protocolVersion: PROTOCOL_VERSION });
  });

  it('GET /config returns {} with edge caching when KV is empty', async () => {
    const res = await SELF.fetch('https://bloop.test/config');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
  });

  it('GET /config returns the KV document once present', async () => {
    await env.CONFIG.put('client-config', JSON.stringify({ minAppVersion: '1.0.0', killSwitches: [] }));
    const res = await SELF.fetch('https://bloop.test/config');
    expect(await res.json()).toEqual({ minAppVersion: '1.0.0', killSwitches: [] });
  });
});
