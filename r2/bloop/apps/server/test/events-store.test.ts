import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@bloop/engine';
import { PROTOCOL_VERSION } from '@bloop/protocol';
import { Store } from '../src/room/store.js';

async function fresh(code: string) {
  const stub = env.ROOM.getByName(code);
  await stub.createRoom({ code, protocolVersion: PROTOCOL_VERSION, createdAt: Date.now() });
  return stub;
}

describe('event log (design §5.1–5.2; snapshots deliberately deferred per C1)', () => {
  it('appendEvent/listEvents round-trip GameEvent JSON in seq order', async () => {
    const stub = await fresh('EVTA');
    await runInDurableObject(stub, (_i, state) => {
      const store = new Store(state.storage.sql);
      const e1: GameEvent<unknown> = { type: 'action', playerId: 'p1', action: { kind: 'vote', target: 'p2' }, at: 1_000 };
      const e2: GameEvent<unknown> = { type: 'deadline', at: 2_000 };
      const e3: GameEvent<unknown> = { type: 'playerLeft', playerId: 'p1', at: 3_000 };
      store.appendEvent(e1); store.appendEvent(e2); store.appendEvent(e3);
      expect(store.eventCount()).toBe(3);
      expect(store.listEvents()).toEqual([e1, e2, e3]);
    });
  });

  it('clearEvents wipes the log so the next game replays from zero', async () => {
    const stub = await fresh('EVTB');
    await runInDurableObject(stub, (_i, state) => {
      const store = new Store(state.storage.sql);
      store.appendEvent({ type: 'deadline', at: 1 });
      store.appendEvent({ type: 'deadline', at: 2 });
      store.clearEvents();
      expect(store.eventCount()).toBe(0);
      store.appendEvent({ type: 'deadline', at: 3 });
      expect(store.listEvents()).toEqual([{ type: 'deadline', at: 3 }]);
    });
  });

  it('createRoom persists the extended 2c meta with a null game binding', async () => {
    const stub = await fresh('EVTC');
    const meta = await runInDurableObject(stub, (_i, state) => new Store(state.storage.sql).getMeta());
    expect(meta).toMatchObject({
      code: 'EVTC', status: 'lobby', gameId: null, gameVersion: null, seed: null,
      contentRef: null, roster: null, phaseKey: null, deadlineAt: null,
    });
  });
});
