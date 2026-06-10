import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { GRACE_MS } from '../src/room/room-do.js';
import { Store } from '../src/room/store.js';
import { expectError, expectLobby, expectTracerView, expectWelcome, join, sendJson, startTracer } from './helpers.js';

describe('room lifecycle while a game runs (design §3.5 + §4 roster events)', () => {
  it('grace expiry mid-game: EDF fires the due vote deadline THEN frees the seat; tracer no-ops playerLeft (nothing extra logged)', async () => {
    const { code, socks, welcomes } = await startTracer(['Anna', 'Bert', 'Cara']);
    const stub = env.ROOM.getByName(code);
    socks[2]!.ws.close(1000, 'phone died');
    await expectLobby(socks[0]!);
    await expectLobby(socks[1]!);
    await runInDurableObject(stub, (i) => i.sweep(Date.now() + GRACE_MS + 1_000));
    // EDF order: the vote:0 deadline (T+30s) fires before Cara's grace (T+90s)
    // — survivors see the reveal views first, then the shrunken lobby.
    const reveal = await expectTracerView(socks[0]!);
    await expectTracerView(socks[1]!);
    expect(reveal.view.phase).toBe('reveal');
    const lobby = await expectLobby(socks[0]!);
    await expectLobby(socks[1]!);
    expect(lobby.players.map((p) => p.id)).toEqual([welcomes[0]!.playerId, welcomes[1]!.playerId]);
    expect(lobby.gameId).toBe('tracer'); // the game survives the departure
    // exactly ONE logged event: the deadline. playerLeft was offered to the module and rejected by reference (I4).
    expect(await runInDurableObject(stub, (_i, state) => new Store(state.storage.sql).eventCount())).toBe(1);
  });

  it('leave mid-game frees the seat immediately and the survivors keep playing', async () => {
    const { socks, welcomes } = await startTracer(['Anna', 'Bert', 'Cara']);
    sendJson(socks[2]!, { type: 'leave' });
    expect(await socks[2]!.closed).toBe(1000);
    const lobby = await expectLobby(socks[0]!);
    await expectLobby(socks[1]!);
    expect(lobby.players).toHaveLength(2);
    sendJson(socks[0]!, { type: 'action', payload: { kind: 'vote', target: welcomes[1]!.playerId } });
    const v = await expectTracerView(socks[0]!);
    await expectTracerView(socks[1]!);
    if (v.view.phase !== 'vote') throw new Error('expected vote phase');
    expect(v.view.myVote).toBe(welcomes[1]!.playerId);
  });

  it('reclaim mid-game resyncs the phone: welcome, lobby, then a personal view with the RUNNING deadline and the preserved ballot', async () => {
    const { code, socks, welcomes, views } = await startTracer(['Anna', 'Bert']);
    sendJson(socks[1]!, { type: 'action', payload: { kind: 'vote', target: welcomes[0]!.playerId } });
    for (const s of socks) await expectTracerView(s);
    socks[1]!.ws.close(1000, 'elevator');
    await expectLobby(socks[0]!); // greyed
    const back = await join(code, 'Bert', { reconnectToken: welcomes[1]!.reconnectToken });
    expect((await expectWelcome(back)).playerId).toBe(welcomes[1]!.playerId);
    await expectLobby(back);
    await expectLobby(socks[0]!);
    const resync = await expectTracerView(back); // unconditional resync (tracer no-ops playerRejoined — I4 skips the broadcast)
    if (resync.view.phase !== 'vote') throw new Error('expected vote phase');
    expect(resync.view.myVote).toBe(welcomes[0]!.playerId); // the ballot survived the drop
    expect(resync.deadlineAt).toBe(views[0]!.deadlineAt); // running deadline, NOT reset
  });

  it('mid-game, an unknown reconnect token cannot enter: fresh joins are closed while playing', async () => {
    const { code } = await startTracer(['Anna', 'Bert']);
    const stranger = await join(code, 'Stranger', { reconnectToken: 'beef'.repeat(18) });
    expect(await expectError(stranger)).toBe('ROOM_FULL');
  });
});
