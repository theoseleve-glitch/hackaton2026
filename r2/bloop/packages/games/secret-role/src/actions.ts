import { z } from 'zod';

/**
 * Validated at the DO boundary before reduce(). Zero free-text surface:
 * double-jeu v1 is taps-and-votes only (impostorGuessEnabled:false), so there
 * is no moderation path. `target` is an opaque player id; the reducer does the
 * roster/self checks.
 */
export const secretRoleActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ack') }),
  z.object({ kind: z.literal('ready') }),
  z.object({ kind: z.literal('vote'), target: z.string().min(1).max(64) }),
]);
