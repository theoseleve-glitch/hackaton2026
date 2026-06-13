import { z } from 'zod';

/**
 * Boundary schema for client action payloads (the DO validates before the
 * reducer; the reducer re-guards every field anyway). Enum-only — zero
 * free-text moderation surface.
 */
export const performJudgeActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready') }),
  z.object({ kind: z.literal('pick'), index: z.number().int().min(0).max(2) }),
  z.object({ kind: z.literal('claimDone') }),
  z.object({ kind: z.literal('giveUp') }),
  z.object({ kind: z.literal('pass') }),
  z.object({ kind: z.literal('claimFound'), guesser: z.string().min(1).max(128) }),
  z.object({ kind: z.literal('done') }),
  z.object({ kind: z.literal('tap') }),
  z.object({ kind: z.literal('vote'), vote: z.enum(['yes', 'no']) }),
  z.object({ kind: z.literal('rate'), stars: z.number().int().min(1).max(5) }),
]);
