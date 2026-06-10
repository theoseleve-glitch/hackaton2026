import { DurableObject } from 'cloudflare:workers';
import { clientMessageSchema, type ClientMessage, type ErrorCode, type RoomPlayer, type ServerMessage } from '@bloop/protocol';
import type { Env } from '../types.js';
import { acceptsProtocol } from './protocol-window.js';
import { sanitizeNickname } from './profanity.js';
import { Store } from './store.js';
import { hashToken, newReconnectToken } from './tokens.js';

export const MAX_PLAYERS = 16;
/** UTF-16 code units, not bytes — deliberate cheap cap (review M2); true bytes <= 3x. */
export const MAX_MSG_CHARS = 4096;

/** Hibernation attachment: IDs ONLY (real limit 16 KiB — review I1). Profiles/host/grace live in SQLite roster, so attachment and roster cannot drift. */
interface Attachment { cid: string; playerId?: string; state: 'pending' | 'joined' }

type HelloMessage = Extract<ClientMessage, { type: 'hello' }>;

function safeJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return null; }
}

export class RoomDO extends DurableObject<Env> {
  private readonly store: Store;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new Store(ctx.storage.sql);
    this.store.migrate(); // sync + idempotent; 2c seam: AlarmQueue.load(...) joins here
  }

  /**
   * Review I3: the ONE idempotent create RPC — test-and-set-and-init. The
   * getMeta -> setMeta pair is synchronous SQL inside one event of a
   * single-threaded DO, hence atomic; racing front doors serialize here.
   */
  async createRoom(input: { code: string; protocolVersion: number; createdAt: number }): Promise<{ created: boolean; protocolVersion: number }> {
    this.store.migrate(); // C3: tolerate a wiped-tables ghost state
    const meta = this.store.getMeta();
    if (meta !== null) return { created: false, protocolVersion: meta.protocolVersion };
    // C3: idFromName(code) is immortal — a freed code reuses THIS object, which
    // may still hold hibernating sockets from a previous party. Evict them.
    this.closeAllSockets(1011, 'stale-room');
    this.store.setMeta({ code: input.code, protocolVersion: input.protocolVersion, status: 'lobby', createdAt: input.createdAt, lastActivityAt: input.createdAt });
    return { created: true, protocolVersion: input.protocolVersion };
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('expected websocket', { status: 426 });
    if (this.store.getMeta() === null) return new Response('no such room', { status: 404 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]); // HIBERNATABLE — never .accept() (spec §7)
    pair[1].serializeAttachment({ cid: crypto.randomUUID(), state: 'pending' } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /** The single input boundary (§3.3): size cap -> zod -> route. Token-bucket rate limit: Plan 2c. */
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment;
    if (typeof raw !== 'string' || raw.length > MAX_MSG_CHARS) return this.sendError(ws, 'BAD_MESSAGE');
    const parsed = clientMessageSchema.safeParse(safeJson(raw));
    if (!parsed.success) return this.sendError(ws, 'BAD_MESSAGE');
    const msg = parsed.data;
    switch (msg.type) {
      case 'hello': return this.onHello(ws, att, msg);
      case 'startGame': return this.onStartGame(ws, att);
      case 'action': return this.sendError(ws, 'BAD_MESSAGE'); // no game loop until Plan 2c
      case 'leave': ws.close(1000, 'bye'); return; // full leave semantics: Task 6
    }
  }

  private async onHello(ws: WebSocket, att: Attachment, msg: HelloMessage): Promise<void> {
    const meta = this.store.getMeta();
    if (meta === null) { ws.close(1011, 'no-room'); return; } // destroyed under an open socket
    // (a) version handshake against the version PINNED at creation
    if (!acceptsProtocol(msg.protocolVersion, meta.protocolVersion)) {
      this.sendError(ws, 'UPGRADE_REQUIRED');
      ws.close(4426, 'UPGRADE_REQUIRED');
      return;
    }
    // (b) profanity at THE input boundary — before any other client sees the name
    const nickname = sanitizeNickname(msg.profile.nickname);
    if (nickname === null) return this.sendError(ws, 'BAD_MESSAGE');
    const now = Date.now();
    // fresh join: lobby only (roster freezes at startGame in Plan 2c)
    if (this.store.rosterSize() >= MAX_PLAYERS) return this.sendError(ws, 'ROOM_FULL');
    const playerId = crypto.randomUUID(); // server-minted, never client-supplied
    const reconnectToken = newReconnectToken(); // lives only on the device
    this.store.addPlayer({
      playerId, profile: { nickname, avatar: msg.profile.avatar },
      isHost: this.store.rosterSize() === 0, // first joiner is host (§3.5)
      connected: true, reconnectTokenHash: await hashToken(reconnectToken),
      joinedAt: now, graceUntil: null,
    });
    ws.serializeAttachment({ cid: att.cid, playerId, state: 'joined' } satisfies Attachment);
    this.store.patchMeta({ lastActivityAt: now });
    this.send(ws, { type: 'welcome', playerId, reconnectToken });
    this.broadcastLobby();
  }

  private onStartGame(ws: WebSocket, att: Attachment): void {
    const seat = att.playerId === undefined ? null : this.store.getSeat(att.playerId);
    if (seat === null) return this.sendError(ws, 'BAD_MESSAGE'); // hello first
    if (!seat.isHost) return this.sendError(ws, 'NOT_HOST');
    this.sendError(ws, 'UNKNOWN_GAME'); // 2c seam: registry lookup + module init replace this
  }

  // ---- outbound ----

  private broadcastLobby(): void {
    const players: RoomPlayer[] = this.store.listSeats().map((s) => ({
      id: s.playerId, profile: s.profile, connected: s.connected, isHost: s.isHost,
    }));
    const lobby: ServerMessage = { type: 'lobby', players, gameId: null };
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws.deserializeAttachment() as Attachment).state === 'joined') this.send(ws, lobby);
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try { ws.send(JSON.stringify(msg)); } catch { /* gone; close handler cleans up */ }
  }

  private sendError(ws: WebSocket, code: ErrorCode): void {
    this.send(ws, { type: 'error', code });
  }

  private closeAllSockets(code: number, reason: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.close(code, reason); } catch { /* already closed */ }
    }
  }
}
