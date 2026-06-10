import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types.js';
import { Store } from './store.js';

export class RoomDO extends DurableObject<Env> {
  private readonly store: Store;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new Store(ctx.storage.sql);
    this.store.migrate(); // sync + idempotent; 2c seam: AlarmQueue.load(...) joins here
  }

  /**
   * Review I3: the ONE idempotent create RPC — test-and-set-and-init. The
   * getMeta -> setMeta pair is synchronous SQL inside one event of a
   * single-threaded DO, hence atomic; racing front doors serialize here.
   */
  async createRoom(input: { code: string; protocolVersion: number; createdAt: number }): Promise<{ created: boolean; protocolVersion: number }> {
    this.store.migrate(); // C3: tolerate a wiped-tables ghost state
    const meta = this.store.getMeta();
    if (meta !== null) return { created: false, protocolVersion: meta.protocolVersion };
    // C3: idFromName(code) is immortal — a freed code reuses THIS object, which
    // may still hold hibernating sockets from a previous party. Evict them.
    this.closeAllSockets(1011, 'stale-room');
    this.store.setMeta({ code: input.code, protocolVersion: input.protocolVersion, status: 'lobby', createdAt: input.createdAt, lastActivityAt: input.createdAt });
    return { created: true, protocolVersion: input.protocolVersion };
  }

  private closeAllSockets(code: number, reason: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.close(code, reason); } catch { /* already closed */ }
    }
  }
}
