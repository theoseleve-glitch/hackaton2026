import { z } from 'zod';

export const optionVoteActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ballot'),
    pick: z.enum(['A', 'B']),
    predict: z.enum(['A', 'B']).optional(),
  }),
  z.object({ kind: z.literal('skip') }),
]);
