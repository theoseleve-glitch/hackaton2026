import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { BUCKET_CAP, CLOSE_AFTER_VIOLATIONS, type RateLimiter } from '../src/room/ratelimit.js';
import { expectError, expectLobby, expectSilence, sendJson, setupRoom } from './helpers.js';

/**
 * Deterministically drain every live connection's bucket (and optionally
 * pre-load extra violations) INSIDE the DO: the drain happens at a far-future
 * instant, so the skew clamp in TokenBucket.take() zeroes real-clock refill
 * for the rest of the test — no timing flake.
 */
async function drainBuckets(code: string, extraViolations = 0): Promise<void> {
  await runInDurableObject(env.ROOM.getByName(code), (inst, state) => {
    const reach = inst as unknown as { limiterFor(cid: string): RateLimiter };
    const future = Date.now() + 3_600_000;
    for (const ws of state.getWebSockets()) {
      const { cid } = ws.deserializeAttachment() as { cid: string };
      const lim = reach.limiterFor(cid);
      for (let i = 0; i < BUCKET_CAP; i++) lim.check(future); // exhaust the burst (all 'ok' or already partly spent)
      for (let i = 0; i < extraViolations; i++) lim.check(future); // pre-load violations
    }
  });
}

describe('token-bucket rate limit at the boundary (design §7.4, FIRST in webSocketMessage)', () => {
  it('a drained bucket answers exactly one BAD_MESSAGE, then drops silently BEFORE size/zod/routing', async () => {
    const { code, socks } = await setupRoom(['Anna', 'Bert']);
    await drainBuckets(code);
    sendJson(socks[0]!, { type: 'leave' }); // a VALID message — routing would close 1000 'bye'
    expect(await expectError(socks[0]!)).toBe('BAD_MESSAGE'); // warn: rate limit won, leave never ran
    socks[0]!.ws.send('x'.repeat(5_000)); // oversized junk: size cap AND zod would both answer BAD_MESSAGE
    await expectSilence(socks[0]!); // dropped before either ran
    expect(socks[1]!.drain()).toEqual([]); // no lobby churn: Anna never actually left
  });

  it('sustained abuse closes the socket with 1008', async () => {
    const { code, socks } = await setupRoom(['Solo']);
    await drainBuckets(code, CLOSE_AFTER_VIOLATIONS - 1); // the next message is violation #N
    sendJson(socks[0]!, { type: 'leave' });
    expect(await socks[0]!.closed).toBe(1008);
  });

  it('normal burst traffic is untouched: 10 rapid messages all reach zod, the boundary still routes', async () => {
    const { socks } = await setupRoom(['Anna']);
    for (let i = 0; i < 10; i++) sendJson(socks[0]!, 'junk'); // 10 < BUCKET_CAP: every one reaches zod
    for (let i = 0; i < 10; i++) expect(await expectError(socks[0]!)).toBe('BAD_MESSAGE');
    sendJson(socks[0]!, { type: 'leave' }); // and the connection still works
    expect(await socks[0]!.closed).toBe(1000);
  });

  it('webSocketClose evicts the connection limiter (no unbounded Map growth)', async () => {
    const { code, socks } = await setupRoom(['Anna', 'Bert']);
    socks[1]!.ws.close(1000, 'gone');
    await expectLobby(socks[0]!); // Bert greyed out => webSocketClose fully ran
    const size = await runInDurableObject(env.ROOM.getByName(code), (inst) =>
      (inst as unknown as { limiters: Map<string, unknown> }).limiters.size);
    expect(size).toBe(1); // Bert evicted; Anna remains
  });
});
