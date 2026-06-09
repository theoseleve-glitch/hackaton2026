import { z } from 'zod';

export const tracerActionSchema = z.object({
  kind: z.literal('vote'),
  target: z.string().min(1),
});
