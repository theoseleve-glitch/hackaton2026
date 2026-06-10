import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { GRACE_MS } from '../src/room/room-do.js';
import { expectLobby, expectWelcome, join, sendJson, setupRoom } from './helpers.js';

describe('disconnect grace + reconnect + host migration (§3.5)', () => {
  it('a dropped socket greys the seat (kept, not freed) and arms the grace alarm', async () => {
    const { code, socks, welcomes } = await setupRoom(['Anna', 'Bert']);
    const before = Date.now();
    socks[1]!.ws.close(1000, 'phone died');
    const lobby = await expectLobby(socks[0]!);
    expect(lobby.players).toHaveLength(2); // seat NOT freed
    expect(lobby.players.find((p) => p.id === welcomes[1]!.playerId)!.connected).toBe(false);
    const alarm = await runInDurableObject(env.ROOM.getByName(code), (_i, state) => state.storage.getAlarm());
    expect(alarm).not.toBeNull();
    expect(alarm!).toBeGreaterThanOrEqual(before + GRACE_MS);
    expect(alarm!).toBeLessThanOrEqual(Date.now() + GRACE_MS);
  });

  it('hello + reconnectToken inside grace reclaims the same seat and clears its deadline', async () => {
    const { code, socks, welcomes } = await setupRoom(['Anna', 'Bert']);
    socks[1]!.ws.close(1000, 'tunnel');
    await expectLobby(socks[0]!); // greyed
    const b2 = await join(code, 'Bert', { reconnectToken: welcomes[1]!.reconnectToken });
    const welcome2 = await expectWelcome(b2);
    expect(welcome2.playerId).toBe(welcomes[1]!.playerId); // same seat
    expect(welcome2.reconnectToken).toBe(welcomes[1]!.reconnectToken); // stable token (design §9.3 default)
    expect((await expectLobby(socks[0]!)).players.find((p) => p.id === welcome2.playerId)!.connected).toBe(true);
    const alarm = await runInDurableObject(env.ROOM.getByName(code), (_i, state) => state.storage.getAlarm());
    // the moot grace deadline is gone (Task 7 re-introduces a much later TTL horizon)
    expect(alarm === null || alarm > Date.now() + GRACE_MS).toBe(true);
  });

  it('grace expiry frees the seat, migrates host to the longest-joined survivor, kills the token', async () => {
    const { code, socks, welcomes } = await setupRoom(['Anna', 'Bert', 'Cara']);
    socks[0]!.ws.close(1000, 'host vanished'); // the HOST disconnects
    await expectLobby(socks[1]!);
    await expectLobby(socks[2]!);
    await runInDurableObject(env.ROOM.getByName(code), async (i) => { await i.sweep(Date.now() + GRACE_MS + 1_000); });
    const lobby = await expectLobby(socks[1]!);
    expect(lobby.players.map((p) => [p.id, p.isHost])).toEqual([
      [welcomes[1]!.playerId, true], // longest-joined survivor becomes host
      [welcomes[2]!.playerId, false],
    ]);
    const back = await join(code, 'Anna', { reconnectToken: welcomes[0]!.reconnectToken });
    expect((await expectWelcome(back)).playerId).not.toBe(welcomes[0]!.playerId); // expired token -> fresh join
  });

  it('leave frees the seat immediately and migrates host', async () => {
    const { socks, welcomes } = await setupRoom(['Anna', 'Bert']);
    sendJson(socks[0]!, { type: 'leave' });
    expect(await socks[0]!.closed).toBe(1000);
    const lobby = await expectLobby(socks[1]!);
    expect(lobby.players.map((p) => [p.id, p.isHost])).toEqual([[welcomes[1]!.playerId, true]]);
  });

  it('a reconnect over a still-open socket supersedes it (old socket closed 4001)', async () => {
    const { code, socks, welcomes } = await setupRoom(['Anna', 'Bert']);
    const b2 = await join(code, 'Bert', { reconnectToken: welcomes[1]!.reconnectToken });
    expect((await expectWelcome(b2)).playerId).toBe(welcomes[1]!.playerId);
    expect(await socks[1]!.closed).toBe(4001);
  });
});
