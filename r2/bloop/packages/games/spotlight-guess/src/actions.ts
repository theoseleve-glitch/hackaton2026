import { z } from 'zod';

/**
 * Wire schema for both SPOTLIGHT_GUESS modes — the server validates client
 * `action.payload` with this BEFORE the reducer sees it; the reducer
 * re-validates per-config (scale domain, candidate range, spotlight-only
 * actions) as defense in depth. `int()` already rejects NaN/±Infinity/floats;
 * bounds are the template-wide hard caps (guess covers scale10 1..10,
 * wheel100 0..100 and candidate indexes 0..7; answerIndex caps at 8 options).
 */
export const spotlightGuessActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready') }),
  z.object({ kind: z.literal('openVotes') }),
  z.object({
    kind: z.literal('answer'),
    answerIndex: z.number().int().min(0).max(7),
  }),
  z.object({
    kind: z.literal('guess'),
    value: z.number().int().min(0).max(100),
  }),
  // KEYSTONE (P0-B-lite) — content-free react: no value rides on it.
  z.object({ kind: z.literal('react') }),
]);
