import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@bloop/protocol';
import { ROOM_TTL_MS, UNBORN_TTL_MS } from '../src/room/room-do.js';
import { expectWelcome, join, setupRoom } from './helpers.js';

describe('TTL janitor + room destruction (§5.4, review C3)', () => {
  it('a created-but-never-joined room arms the unborn alarm and frees its code (closes the I3 leak)', async () => {
    const stub = env.ROOM.getByName('UNBN');
    const createdAt = Date.now();
    await stub.createRoom({ code: 'UNBN', protocolVersion: PROTOCOL_VERSION, createdAt });
    expect(await runInDurableObject(stub, (_i, state) => state.storage.getAlarm())).toBe(createdAt + UNBORN_TTL_MS);
    await runInDurableObject(stub, async (i) => { await i.sweep(createdAt + UNBORN_TTL_MS + 1_000); });
    expect((await stub.createRoom({ code: 'UNBN', protocolVersion: PROTOCOL_VERSION, createdAt: Date.now() })).created).toBe(true);
  });

  it('after a join, the alarm horizon converges to lastActivity + ROOM_TTL_MS', async () => {
    const { code } = await setupRoom(['Anna']);
    const stub = env.ROOM.getByName(code);
    await runInDurableObject(stub, async (i) => { await i.alarm(); }); // sweep (nothing due) + re-arm
    const alarm = await runInDurableObject(stub, (_i, state) => state.storage.getAlarm());
    const now = Date.now();
    expect(alarm).not.toBeNull();
    expect(alarm!).toBeGreaterThan(now + ROOM_TTL_MS - 60_000);
    expect(alarm!).toBeLessThanOrEqual(now + ROOM_TTL_MS);
  });

  it('idle TTL destroy: sockets closed, alarm gone, code reusable (C3 order)', async () => {
    const { code, socks } = await setupRoom(['Idle']);
    const stub = env.ROOM.getByName(code);
    await runInDurableObject(stub, async (i) => { await i.sweep(Date.now() + ROOM_TTL_MS + 1_000); });
    expect(await socks[0]!.closed).toBe(1000); // hibernating stragglers closed
    expect(await runInDurableObject(stub, (_i, state) => state.storage.getAlarm())).toBeNull(); // no dangling wake-up
    expect((await stub.createRoom({ code, protocolVersion: PROTOCOL_VERSION, createdAt: Date.now() })).created).toBe(true);
  });

  it('createRoom on a stale code closes ghost sockets before claiming (C3)', async () => {
    const stub = env.ROOM.getByName('GHST');
    await stub.createRoom({ code: 'GHST', protocolVersion: PROTOCOL_VERSION, createdAt: Date.now() });
    const ghost = await join('GHST', 'Ghost');
    await expectWelcome(ghost);
    // simulate a crashed wipe that deleted storage WITHOUT closing sockets
    await runInDurableObject(stub, async (_i, state) => { await state.storage.deleteAll(); });
    expect((await stub.createRoom({ code: 'GHST', protocolVersion: PROTOCOL_VERSION, createdAt: Date.now() })).created).toBe(true);
    expect(await ghost.closed).toBe(1011); // previous party's socket evicted
  });
});
