import { z } from 'zod';

/**
 * The taps-only action schema (zero free text => zero moderation surface):
 *  - confess: a SECRET boolean (MOI = true, PAS MOI = false)
 *  - accuse:  a single accusation at another player (a roster id)
 */
export const whoSaidThatActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('confess'),
    value: z.boolean(),
  }),
  z.object({
    kind: z.literal('accuse'),
    target: z.string().min(1).max(64),
  }),
]);
