import { serverMessageSchema, type ServerMessage } from '@bloop/protocol';

/** Every inbound frame crosses this boundary: string → JSON → zod. Junk is dropped, never thrown. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string' || raw.length > 64_000) return null;
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return null; }
  const parsed = serverMessageSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
