import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { TracerState } from '@bloop/game-tracer';
import type { RoomDO } from '../src/room/room-do.js';
import { Store } from '../src/room/store.js';
import { expectSilence, expectTracerView, sendJson, startTracer } from './helpers.js';

/** Simulate eviction: drop the in-memory runtime cache — the next touch MUST rebuild from storage alone. (Test-only reach into a private field.) */
const evict = (i: RoomDO) => { (i as unknown as { game: unknown }).game = null; };
/** Test-only reach into the private (now async, R2-loading) rehydrate(). */
const rehydrated = (i: RoomDO) => (i as unknown as { rehydrate(): Promise<{ state: TracerState } | null> }).rehydrate();

describe('rehydration chaos (design §5.2 + review C1)', () => {
  it('ballots cast before eviction shape the round after it (replay-from-zero equivalence)', async () => {
    const { code, socks, welcomes } = await startTracer(['Anna', 'Bert', 'Cara']);
    const stub = env.ROOM.getByName(code);
    const [pa, pb] = welcomes.map((w) => w.playerId);
    sendJson(socks[0]!, { type: 'action', payload: { kind: 'vote', target: pb } });
    for (const s of socks) await expectTracerView(s);
    sendJson(socks[1]!, { type: 'action', payload: { kind: 'vote', target: pa } });
    for (const s of socks) await expectTracerView(s);
    await runInDurableObject(stub, evict);
    sendJson(socks[2]!, { type: 'action', payload: { kind: 'vote', target: pb } }); // completes the round POST-eviction
    const reveal = await expectTracerView(socks[0]!);
    for (const s of [socks[1]!, socks[2]!]) await expectTracerView(s);
    if (reveal.view.phase !== 'reveal') throw new Error(`expected reveal, got ${reveal.view.phase}`);
    expect(reveal.view.tally[pb!]).toBe(2); // both PRE-eviction ballots were rebuilt from the log
    expect(reveal.view.tally[pa!]).toBe(1);
    // two-beat reveal: the early-resolve lands on the suspense beat (score deferred);
    // the +1 lands at the verdict beat, proving the rebuilt-from-log ballots scored correctly.
    expect(reveal.view.revealStep).toBe('suspense');
    expect(reveal.view.scores[pb!]).toBe(0);
    await runInDurableObject(stub, (inst) => inst.sweep(reveal.deadlineAt! + 1));
    const verdict = await expectTracerView(socks[0]!);
    for (const s of [socks[1]!, socks[2]!]) await expectTracerView(s);
    if (verdict.view.phase !== 'reveal') throw new Error('expected verdict reveal');
    expect(verdict.view.revealStep).toBe('verdict');
    expect(verdict.view.scores[pb!]).toBe(1);
  });

  it('rehydrated player-keyed maps are null-prototype (C1: state is rebuilt by game code, never JSON.parse)', async () => {
    const { code, socks, welcomes } = await startTracer(['Anna', 'Bert']);
    sendJson(socks[0]!, { type: 'action', payload: { kind: 'vote', target: welcomes[1]!.playerId } });
    for (const s of socks) await expectTracerView(s);
    await runInDurableObject(env.ROOM.getByName(code), async (i) => {
      evict(i);
      const rt = await rehydrated(i);
      expect(rt).not.toBeNull();
      expect(Object.getPrototypeOf(rt!.state.votes)).toBeNull();
      expect(Object.getPrototypeOf(rt!.state.scores)).toBeNull();
      expect('constructor' in rt!.state.votes).toBe(false); // no inherited keys to poison reads
    });
  });

  it('hostile __proto__ targets bounce off the rehydrated state (silent reject, no pollution)', async () => {
    const { code, socks } = await startTracer(['Anna', 'Bert']);
    const stub = env.ROOM.getByName(code);
    await runInDurableObject(stub, evict);
    sendJson(socks[0]!, { type: 'action', payload: { kind: 'vote', target: '__proto__' } }); // passes zod (any string); the module rejects non-roster targets by reference
    await expectSilence(socks[0]!);
    expect(socks[1]!.drain()).toEqual([]);
    await runInDurableObject(stub, async (i) => {
      const rt = await rehydrated(i);
      expect((rt!.state.votes as Record<string, unknown>)['__proto__']).toBeUndefined();
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined(); // global prototype untouched
    });
    expect(await runInDurableObject(stub, (_i, state) => new Store(state.storage.sql).eventCount())).toBe(0);
  });

  it('the running countdown survives eviction + alarm loss: re-armed to the SAME absolute deadlineAt', async () => {
    const { code, views } = await startTracer(['Anna', 'Bert']);
    const stub = env.ROOM.getByName(code);
    await runInDurableObject(stub, async (i, state) => {
      evict(i);
      await state.storage.deleteAlarm(); // a deploy restart drops in-memory timers
      await i.sweep(Date.now()); // wake path: nothing due — re-arm from persisted truth
    });
    expect(await runInDurableObject(stub, (_i, state) => state.storage.getAlarm())).toBe(views[0]!.deadlineAt);
  });
});
