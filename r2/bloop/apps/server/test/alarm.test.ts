import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { ALARM_RETRY_MS, GRACE_MS, ROOM_TTL_MS } from '../src/room/room-do.js';
import { Store } from '../src/room/store.js';
import { expectLobby, expectSilence, expectTracerView, sendJson, startTracer } from './helpers.js';

describe('alarm semantics (design §6 + review C2 + TTL-vs-live-game)', () => {
  it('a duplicate sweep at the same instant cannot double-fire a phase deadline (at-least-once safe)', async () => {
    const { code, socks, views } = await startTracer(['Anna', 'Bert']);
    const stub = env.ROOM.getByName(code);
    const now = views[0]!.deadlineAt! + 1;
    await runInDurableObject(stub, (i) => i.sweep(now));
    await runInDurableObject(stub, (i) => i.sweep(now)); // retry at the same forged instant
    const v = await expectTracerView(socks[0]!);
    await expectTracerView(socks[1]!);
    expect(v.view.phase).toBe('reveal'); // advanced exactly once...
    await expectSilence(socks[0]!); // ...and the retry broadcast nothing
    expect(await runInDurableObject(stub, (_i, state) => new Store(state.storage.sql).eventCount())).toBe(1);
  });

  it('a stale phase timer is a no-op (phaseKey guard)', async () => {
    const { code, socks } = await startTracer(['Anna', 'Bert']);
    const stub = env.ROOM.getByName(code);
    await runInDurableObject(stub, (i) =>
      (i as unknown as { firePhase(key: string, now: number): Promise<void> }).firePhase('vote:99', Date.now()));
    await expectSilence(socks[0]!);
    expect(await runInDurableObject(stub, (_i, state) => new Store(state.storage.sql).eventCount())).toBe(0);
  });

  it('C2: a throwing timer cannot starve the others, and the alarm re-arms with the retry floor', async () => {
    const { code, socks } = await startTracer(['Anna', 'Bert', 'Cara']);
    const stub = env.ROOM.getByName(code);
    socks[2]!.ws.close(1000, 'gone');
    await expectLobby(socks[0]!);
    await expectLobby(socks[1]!);
    const now = Date.now() + GRACE_MS + 1_000; // BOTH the vote deadline and Cara's grace are due
    await runInDurableObject(stub, async (i) => {
      // shadow the prototype method on THIS instance: every phase fire explodes
      (i as unknown as { firePhase: () => Promise<void> }).firePhase = () => Promise.reject(new Error('boom'));
      await i.sweep(now);
    });
    const lobby = await expectLobby(socks[0]!); // the grace timer fired anyway: seat freed
    await expectLobby(socks[1]!);
    expect(lobby.players).toHaveLength(2);
    const alarm = await runInDurableObject(stub, (_i, state) => state.storage.getAlarm());
    expect(alarm).toBe(now + ALARM_RETRY_MS); // the failed past-due deadline is floored, not hot-looped
  });

  it('an actively-played game survives a TTL-boundary sweep: every applied event bumps lastActivityAt', async () => {
    const { code, socks, welcomes } = await startTracer(['Anna', 'Bert']);
    const stub = env.ROOM.getByName(code);
    const longAgo = Date.now() - ROOM_TTL_MS - 60_000;
    // backdate: the room now LOOKS idle past the full 45-min TTL...
    await runInDurableObject(stub, (_i, state) => { new Store(state.storage.sql).patchMeta({ lastActivityAt: longAgo }); });
    // ...but a live ballot bumps lastActivityAt, so the janitor pass spares it
    sendJson(socks[0]!, { type: 'action', payload: { kind: 'vote', target: welcomes[1]!.playerId } });
    for (const s of socks) await expectTracerView(s);
    await runInDurableObject(stub, (i) => i.sweep(Date.now()));
    const meta = await runInDurableObject(stub, (_i, state) => new Store(state.storage.sql).getMeta());
    expect(meta).not.toBeNull();
    expect(meta!.status).toBe('playing'); // the live game was NOT reaped
    // control: with NO fresh event, the same horizon reaps the room
    await runInDurableObject(stub, (_i, state) => { new Store(state.storage.sql).patchMeta({ lastActivityAt: longAgo }); });
    await runInDurableObject(stub, (i) => i.sweep(Date.now()));
    expect(await runInDurableObject(stub, (_i, state) => new Store(state.storage.sql).getMeta())).toBeNull();
    expect(await socks[0]!.closed).toBe(1000);
  });
});
