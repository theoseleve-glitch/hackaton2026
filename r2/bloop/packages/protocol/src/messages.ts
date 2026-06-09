import { z } from 'zod';

export const PROTOCOL_VERSION = 1;

export const playerProfileSchema = z.object({
  nickname: z.string().min(1).max(20),
  avatar: z.string().max(64),
});
export type PlayerProfile = z.infer<typeof playerProfileSchema>;

// Host-gated messages beyond startGame (kick, pick-game-without-starting) are a
// deliberate deferral to Plan 2 — adding union variants is additive, not breaking.
export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    protocolVersion: z.number().int().positive(),
    profile: playerProfileSchema,
    reconnectToken: z.string().max(128).optional(),
  }),
  z.object({ type: z.literal('startGame'), gameId: z.string().min(1).max(64) }),
  // payload is intentionally unknown at this boundary: each game validates it
  // with its own zod schema server-side; size/rate limits live at the DO
  // message boundary, not in this schema.
  z.object({ type: z.literal('action'), payload: z.unknown() }),
  z.object({ type: z.literal('leave') }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const errorCodeSchema = z.enum([
  'UPGRADE_REQUIRED',
  'ROOM_FULL',
  'BAD_MESSAGE',
  'NOT_HOST',
  'UNKNOWN_GAME',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const roomPlayerSchema = z.object({
  id: z.string(),
  profile: playerProfileSchema,
  connected: z.boolean(),
  isHost: z.boolean(),
});
export type RoomPlayer = z.infer<typeof roomPlayerSchema>;

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('welcome'),
    playerId: z.string(),
    reconnectToken: z.string().max(128),
  }),
  z.object({
    type: z.literal('lobby'),
    players: z.array(roomPlayerSchema),
    gameId: z.string().max(64).nullable(),
  }),
  z.object({
    type: z.literal('view'),
    gameId: z.string().max(64),
    // view is the per-player redacted projection computed by the game module;
    // its game-specific shape is typed end-to-end via the game packages.
    view: z.unknown(),
    deadlineAt: z.number().nullable(),
  }),
  z.object({ type: z.literal('error'), code: errorCodeSchema }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
