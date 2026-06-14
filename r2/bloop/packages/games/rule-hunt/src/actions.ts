import { z } from 'zod';

/**
 * DO-boundary validation for client action payloads. The reducer re-checks
 * everything semantically (phase, eligibility, ranges) and answers invalid
 * events with the SAME state reference; this schema only guarantees shape.
 */
export const ruleHuntActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ackRule') }),
  z.object({ kind: z.literal('accuse'), target: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('tribunalVote'), guilty: z.boolean() }),
  z.object({ kind: z.literal('openGuess') }),
  // candidateCount tops out at 10 by design (templateParamsSchema 6|8|10).
  z.object({ kind: z.literal('pickCandidate'), index: z.number().int().min(0).max(9) }),
  // Heat-check soft reads (free flag / private note) — the reducer re-checks phase + eligibility.
  z.object({ kind: z.literal('flagBreak'), flag: z.enum(['flag', 'clean']) }),
  z.object({ kind: z.literal('noteSuspicious'), note: z.enum(['suspicious', 'clear']) }),
]);
