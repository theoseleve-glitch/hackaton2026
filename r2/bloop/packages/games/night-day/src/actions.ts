import { z } from 'zod';

/**
 * Validated at the DO boundary before reduce(). Zero free-text surface:
 * loup-garou is taps only (peeks, votes, potions) — no moderation path.
 * Targets are opaque player ids; the reducer does roster/alive/role checks.
 * `nightAck` is the decoy no-op every non-actor submits during night
 * sub-phases (identical screens + identical tap counts, design §2.17).
 * `nightRead` is the CC-1 Night Read variant: same one-tap seat lock as
 * `nightAck`, but carries the non-actor's private wolf-hunch target (an opaque
 * player id — the reducer does the alive/self/non-actor checks). `nightAck`
 * remains the valid "I have no read" path so no one is forced to guess.
 */
export const nightDayActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ackRole') }),
  z.object({ kind: z.literal('nightAck') }),
  z.object({ kind: z.literal('nightRead'), target: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('seerPeek'), target: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('wolfVote'), target: z.string().min(1).max(64) }),
  z.object({
    kind: z.literal('witchAct'),
    heal: z.boolean(),
    poisonTarget: z.string().min(1).max(64).nullable(),
  }),
  z.object({ kind: z.literal('readyToVote') }),
  z.object({ kind: z.literal('vote'), target: z.string().min(1).max(64) }),
]);
