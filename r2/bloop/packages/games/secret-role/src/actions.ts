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
  // CC-1 hidden "lean": a discuss-time side-bet on the suspected impostor.
  // Same opaque-id surface as `vote`; the reducer does roster/self/phase checks.
  z.object({ kind: z.literal('lean'), target: z.string().min(1).max(64) }),
]);
