import { z } from 'zod';

/**
 * DO-boundary validation for LAST_STANDING actions (the reducer re-guards —
 * tracer defense in depth). No free text anywhere: the word is SHOUTED in the
 * room, never typed — zero moderation surface by construction.
 */
export const lastStandingActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('wordSaid') }),
  z.object({ kind: z.literal('giveUp') }),
  z.object({ kind: z.literal('judge'), vote: z.enum(['valid', 'reject']) }),
]);
