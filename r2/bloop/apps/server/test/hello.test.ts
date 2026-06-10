import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@bloop/protocol';
import {
  connect, createRoomViaApi, expectError, expectLobby, expectWelcome, join, sendJson, setupRoom,
} from './helpers.js';

describe('hello flow (§3.3): handshake, profanity boundary, lobby, host gating', () => {
  it('hello -> welcome with server-minted ids, then a lobby with the host seat', async () => {
    const code = await createRoomViaApi();
    const sock = await join(code, 'Anna');
    const { playerId, reconnectToken } = await expectWelcome(sock);
    expect(playerId).toMatch(/^[0-9a-f-]{36}$/); // server-minted uuid, never client-supplied
    expect(reconnectToken).toHaveLength(72);
    const lobby = await expectLobby(sock);
    expect(lobby.gameId).toBeNull();
    expect(lobby.players).toEqual([
      { id: playerId, profile: { nickname: 'Anna', avatar: 'a0' }, connected: true, isHost: true },
    ]);
  });

  it('broadcasts the grown lobby to everyone; the second joiner is not host', async () => {
    const code = await createRoomViaApi();
    const a = await join(code, 'Anna');
    const annaId = (await expectWelcome(a)).playerId;
    await expectLobby(a);
    const b = await join(code, 'Bert');
    const bertId = (await expectWelcome(b)).playerId;
    const lobbyA = await expectLobby(a);
    expect(lobbyA).toEqual(await expectLobby(b)); // identical broadcast
    expect(lobbyA.players.map((p) => [p.id, p.isHost])).toEqual([[annaId, true], [bertId, false]]);
  });

  it('pins the protocol: out-of-window -> UPGRADE_REQUIRED + close 4426; one ahead -> accepted', async () => {
    const code = await createRoomViaApi();
    const old = await join(code, 'Old', { protocolVersion: 99 });
    expect(await expectError(old)).toBe('UPGRADE_REQUIRED');
    expect(await old.closed).toBe(4426); // app maps 4426 to its update flow
    const ahead = await join(code, 'Ahead', { protocolVersion: PROTOCOL_VERSION + 1 });
    expect((await expectWelcome(ahead)).playerId).toBeTruthy();
  });

  it('non-JSON input earns BAD_MESSAGE', async () => {
    const sock = await connect(await createRoomViaApi());
    sock.ws.send('not json at all');
    expect(await expectError(sock)).toBe('BAD_MESSAGE');
  });

  it('oversize frames earn BAD_MESSAGE before parsing (review M2)', async () => {
    const sock = await connect(await createRoomViaApi());
    sock.ws.send(`"${'x'.repeat(5000)}"`);
    expect(await expectError(sock)).toBe('BAD_MESSAGE');
  });

  it('action before any game earns BAD_MESSAGE (loop lands in Plan 2c)', async () => {
    const { socks } = await setupRoom(['Eager']);
    sendJson(socks[0]!, { type: 'action', payload: { kind: 'vote' } });
    expect(await expectError(socks[0]!)).toBe('BAD_MESSAGE');
  });

  it('profanity boundary: fully profane rejected, mixed censored before anyone sees it', async () => {
    const code = await createRoomViaApi();
    const bad = await join(code, 'fuck');
    expect(await expectError(bad)).toBe('BAD_MESSAGE');
    const mixed = await join(code, 'fuck yeah');
    await expectWelcome(mixed);
    expect((await expectLobby(mixed)).players[0]!.profile.nickname).toBe('**** yeah');
  });

  it('rejects the 17th player with ROOM_FULL', async () => {
    const { code } = await setupRoom(Array.from({ length: 16 }, (_, i) => `P${i}`));
    const extra = await join(code, 'TooMany');
    expect(await expectError(extra)).toBe('ROOM_FULL');
  });

  it('gates startGame on the host flag (UNKNOWN_GAME until the 2c registry)', async () => {
    const { socks } = await setupRoom(['Host', 'Guest']);
    sendJson(socks[1]!, { type: 'startGame', gameId: 'tracer' });
    expect(await expectError(socks[1]!)).toBe('NOT_HOST');
    sendJson(socks[0]!, { type: 'startGame', gameId: 'tracer' });
    expect(await expectError(socks[0]!)).toBe('UNKNOWN_GAME');
  });
});
