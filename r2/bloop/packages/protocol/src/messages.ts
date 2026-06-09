import { z } from 'zod';

export const PROTOCOL_VERSION = 1;

export const playerProfileSchema = z.object({
  nickname: z.string().min(1).max(20),
  avatar: z.string().max(64),
});
export type PlayerProfile = z.infer<typeof playerProfileSchema>;

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    protocolVersion: z.number().int().positive(),
    profile: playerProfileSchema,
    reconnectToken: z.string().optional(),
  }),
  z.object({ type: z.literal('startGame'), gameId: z.string().min(1) }),
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
    reconnectToken: z.string(),
  }),
  z.object({
    type: z.literal('lobby'),
    players: z.array(roomPlayerSchema),
    gameId: z.string().nullable(),
  }),
  z.object({
    type: z.literal('view'),
    gameId: z.string(),
    view: z.unknown(),
    deadlineAt: z.number().nullable(),
  }),
  z.object({ type: z.literal('error'), code: errorCodeSchema }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
