import { describe, expect, it } from 'vitest';
import { normalizeServerUrl, roomsUrl, wsUrl } from '../src/config';
import { parseServerMessage } from '../src/net/parse';

describe('server url config (emulator → host = 10.0.2.2)', () => {
  it('defaults, strips trailing slashes, derives ws:// and uppercases the code', () => {
    expect(normalizeServerUrl(undefined)).toBe('http://10.0.2.2:8787');
    expect(normalizeServerUrl('http://192.168.1.20:8787/')).toBe('http://192.168.1.20:8787');
    expect(roomsUrl('http://10.0.2.2:8787')).toBe('http://10.0.2.2:8787/rooms');
    expect(wsUrl('http://10.0.2.2:8787', 'abQ7')).toBe('ws://10.0.2.2:8787/rooms/ABQ7/ws');
    expect(wsUrl('https://bloop.example.com', 'ZZZZ')).toBe('wss://bloop.example.com/rooms/ZZZZ/ws');
  });
});

describe('parseServerMessage (zod-parse EVERY inbound frame)', () => {
  it('parses welcome', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'welcome', playerId: 'p1', reconnectToken: 't1' })))
      .toEqual({ type: 'welcome', playerId: 'p1', reconnectToken: 't1' });
  });

  it('parses lobby', () => {
    const lobby = { type: 'lobby', players: [{ id: 'p1', profile: { nickname: 'Anna', avatar: 'emoji:fox' }, connected: true, isHost: true }], gameId: null };
    expect(parseServerMessage(JSON.stringify(lobby))).toEqual(lobby);
  });

  it('parses view, preserving the opaque per-game payload', () => {
    const view = { type: 'view', gameId: 'tracer', view: { phase: 'over', scores: { p1: 2 } }, deadlineAt: null };
    expect(parseServerMessage(JSON.stringify(view))).toEqual(view);
  });

  it('parses all five error codes', () => {
    for (const code of ['UPGRADE_REQUIRED', 'ROOM_FULL', 'BAD_MESSAGE', 'NOT_HOST', 'UNKNOWN_GAME']) {
      expect(parseServerMessage(JSON.stringify({ type: 'error', code }))).toEqual({ type: 'error', code });
    }
  });

  it('rejects junk: non-string, non-JSON, unknown type, missing fields, oversized', () => {
    expect(parseServerMessage(7 as unknown as string)).toBeNull();
    expect(parseServerMessage('{nope')).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'hack' }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'welcome', playerId: 'p1' }))).toBeNull();
    expect(parseServerMessage(`"${'x'.repeat(70_000)}"`)).toBeNull();
  });
});
