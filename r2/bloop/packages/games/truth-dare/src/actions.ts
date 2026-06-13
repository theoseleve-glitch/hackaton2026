import { z } from 'zod';

/**
 * DO-boundary validation of client `action.payload` (the protocol passes it
 * as unknown). The reducer re-guards everything — defense in depth.
 */
export const truthDareActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('chooseType'), choice: z.enum(['truth', 'dare']) }),
  z.object({ kind: z.literal('declare'), result: z.enum(['done', 'chickened']) }),
  z.object({ kind: z.literal('pass') }),
  z.object({ kind: z.literal('verdict'), vote: z.enum(['done', 'chickened']) }),
]);
