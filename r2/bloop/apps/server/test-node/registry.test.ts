import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@bloop/game-tracer';
import { TRACER_PACK } from '../src/content/tracer-pack.js';
import { lookupGame } from '../src/room/registry.js';

describe('game registry + static content (design §4.1)', () => {
  it('resolves tracer with module, action schema, and content pack', () => {
    const entry = lookupGame('tracer');
    expect(entry).not.toBeNull();
    expect(entry!.module.id).toBe('tracer');
    expect(entry!.module.version).toBe(1);
    expect(entry!.content).toBe(TRACER_PACK);
  });

  it('the action schema accepts a vote and rejects junk shapes', () => {
    const schema = lookupGame('tracer')!.actionSchema;
    expect(schema.safeParse({ kind: 'vote', target: 'p1' }).success).toBe(true);
    for (const bad of [{ kind: 'vote' }, { kind: 'nuke', target: 'p1' }, 'vote', null, { kind: 'vote', target: '' }]) {
      expect(schema.safeParse(bad).success).toBe(false);
    }
  });

  it('misses unknown ids AND hostile prototype-chain ids (gameId is client-supplied)', () => {
    for (const id of ['nopes', '__proto__', 'constructor', 'toString']) expect(lookupGame(id)).toBeNull();
  });

  it('ships enough non-empty prompts for a full game', () => {
    expect(TRACER_PACK.data.prompts.length).toBeGreaterThanOrEqual(DEFAULT_CONFIG.totalRounds);
    for (const p of TRACER_PACK.data.prompts) expect(p.trim().length).toBeGreaterThan(0);
  });
});
