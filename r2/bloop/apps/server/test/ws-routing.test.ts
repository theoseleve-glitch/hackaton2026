import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createRoomViaApi, expectLobby, expectWelcome, join } from './helpers.js';

describe('WS routing (review I2: case-insensitive codes, one DO per code)', () => {
  it('routes a lowercase deep-link code to the SAME room as the uppercase code', async () => {
    const code = await createRoomViaApi();
    const lower = await join(code.toLowerCase(), 'Lower');
    await expectWelcome(lower);
    await expectLobby(lower);
    const upper = await join(code, 'Upper');
    await expectWelcome(upper);
    expect((await expectLobby(upper)).players).toHaveLength(2); // one room — not two DOs
  });

  it('404s never-created rooms and impossible codes', async () => {
    const ws = { headers: { Upgrade: 'websocket' } };
    expect((await SELF.fetch('https://bloop.test/rooms/ZZZZ/ws', ws)).status).toBe(404); // valid shape, no room
    expect((await SELF.fetch('https://bloop.test/rooms/AIL0/ws', ws)).status).toBe(404); // I/L/0 not in alphabet
    expect((await SELF.fetch('https://bloop.test/rooms/ABCDE/ws', ws)).status).toBe(404); // wrong length
  });

  it('426s a plain GET on the ws path', async () => {
    const code = await createRoomViaApi();
    expect((await SELF.fetch(`https://bloop.test/rooms/${code}/ws`)).status).toBe(426);
  });
});
