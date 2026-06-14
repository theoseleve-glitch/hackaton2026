import { z } from 'zod';

export const optionVoteActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ballot'),
    pick: z.enum(['A', 'B']),
    predict: z.enum(['A', 'B']).optional(),
  }),
  // CC-1 KEYSTONE — hidden majority-prediction side-bet, placed during choose.
  z.object({
    kind: z.literal('predict'),
    option: z.enum(['A', 'B']),
  }),
  z.object({ kind: z.literal('skip') }),
]);
