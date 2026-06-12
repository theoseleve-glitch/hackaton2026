import { z } from 'zod';

/**
 * Wire schema for both INPUT_GUESS modes — the server validates client
 * `action.payload` with this BEFORE the reducer sees it; the reducer
 * re-validates per-config (digit clamp, card range) as defense in depth.
 * `int()` already rejects NaN/±Infinity/floats; bounds are the template-wide
 * hard caps (9 digits for guesses, 16 cards for picks).
 */
export const inputGuessActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('guess'),
    value: z.number().int().min(0).max(999_999_999),
  }),
  z.object({
    kind: z.literal('pick'),
    cardIndex: z.number().int().min(0).max(15),
  }),
]);
