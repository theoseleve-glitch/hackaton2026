import type { ContentPack, GameModule } from '@bloop/engine';
import { tracer, tracerActionSchema } from '@bloop/game-tracer';
import type { z } from 'zod';
import { TRACER_PACK } from '../content/tracer-pack.js';

// The registry erases per-game generics; type safety is restored per game by
// the zod schema at the boundary and by the module's own typed tests.
export type AnyGameModule = GameModule<any, any, any, any>;

export interface GameEntry {
  module: AnyGameModule;
  /** Validates client `action.payload` — the protocol leaves it z.unknown() on purpose. */
  actionSchema: z.ZodType<any>;
  /** 2c: static built-in pack. R2 seam: becomes an async loader keyed by RoomMeta.contentRef. */
  content: ContentPack<any>;
}

/** A Map, NOT an object literal: gameId is CLIENT-SUPPLIED — `obj['__proto__']` on a literal would return Object.prototype. */
const REGISTRY = new Map<string, GameEntry>([
  ['tracer', { module: tracer, actionSchema: tracerActionSchema, content: TRACER_PACK }],
]);

export function lookupGame(gameId: string): GameEntry | null {
  return REGISTRY.get(gameId) ?? null;
}

/** Every registered entry — drives the generic CI audits (redaction I5; future schema audits). */
export function listGames(): ReadonlyArray<readonly [string, GameEntry]> {
  return [...REGISTRY.entries()];
}
