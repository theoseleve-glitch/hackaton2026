import { z } from 'zod';

/**
 * Boundary schema (validated at the DO edge before reduce). Guards SHAPE/SIZE
 * only: a `rank` action carrying an array of 2..8 non-empty player-id strings.
 * SEMANTIC validity — that `order` is a true PERMUTATION of the live roster
 * (every roster id exactly once, no extras, no dupes) — is enforced inside
 * reduce(), which owns the game rules and rejects by returning the SAME state
 * reference.
 */
export const rankingActionSchema = z.object({
  kind: z.literal('rank'),
  order: z.array(z.string().min(1).max(64)).min(2).max(8),
});
