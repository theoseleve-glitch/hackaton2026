import { DurableObject } from 'cloudflare:workers';
import { clientMessageSchema, type ClientMessage, type ErrorCode, type RoomPlayer, type ServerMessage } from '@bloop/protocol';
import type { Env } from '../types.js';
import { acceptsProtocol } from './protocol-window.js';
import { sanitizeNickname } from './profanity.js';
import { pickNextHost } from './host.js';
import { Store, type Seat } from './store.js';
import { hashToken, newReconnectToken } from './tokens.js';

export const MAX_PLAYERS = 16;
/** UTF-16 code units, not bytes — deliberate cheap cap (review M2); true bytes <= 3x. */
export const MAX_MSG_CHARS = 4096;
/** Disconnect grace (§3.5): inside the spec's 60–120s band. */
export const GRACE_MS = 90_000;
/** §5.4: idle rooms are janitored after 45 min; codes become reusable. */
export const ROOM_TTL_MS = 45 * 60_000;
/** Created-but-never-joined rooms free their code fast (replaces the design's reserved-code sweep — I3 removed the 'reserved' state). */
export const UNBORN_TTL_MS = 120_000;

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
    this.store.setMeta({
      code: input.code, protocolVersion: input.protocolVersion, status: 'lobby',
      createdAt: input.createdAt, lastActivityAt: input.createdAt,
      gameId: null, gameVersion: null, seed: null, contentRef: null, roster: null,
      phaseKey: null, deadlineAt: null,
    });
    await this.armAlarm(); // unborn-TTL horizon from birth — no alarm-less zombie rooms
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
      case 'leave': return this.onLeave(ws, att);
    }
  }

  private async onHello(ws: WebSocket, att: Attachment, msg: HelloMessage): Promise<void> {
    if (att.state === 'joined') return this.sendError(ws, 'BAD_MESSAGE');
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
    // reconnect-token reclaim comes before the fresh-join path (§3.5)
    if (msg.reconnectToken !== undefined) {
      const seat = this.store.findSeatByTokenHash(await hashToken(msg.reconnectToken));
      if (seat !== null) return this.reclaimSeat(ws, att, seat, msg.reconnectToken, now);
      // invalid or expired token -> fall through to a fresh join
    }
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

  private async reclaimSeat(ws: WebSocket, att: Attachment, seat: Seat, token: string, now: number): Promise<void> {
    const old = this.socketFor(seat.playerId);
    if (old !== null && old !== ws) {
      const oldAtt = old.deserializeAttachment() as Attachment;
      // strip identity FIRST so the old socket's close handler no-ops
      old.serializeAttachment({ cid: oldAtt.cid, state: 'pending' } satisfies Attachment);
      old.close(4001, 'superseded');
    }
    this.store.setConnected(seat.playerId, true, null); // cancels the grace deadline
    this.store.patchMeta({ lastActivityAt: now });
    ws.serializeAttachment({ cid: att.cid, playerId: seat.playerId, state: 'joined' } satisfies Attachment);
    // stable token for the seat's life (design §9.3 default; rotation deferred)
    this.send(ws, { type: 'welcome', playerId: seat.playerId, reconnectToken: token });
    this.broadcastLobby(); // the resync: fresh lobby right after welcome
    await this.armAlarm(); // drop the now-moot grace deadline eagerly
  }

  private onLeave(ws: WebSocket, att: Attachment): void {
    if (att.state === 'joined' && att.playerId !== undefined) {
      const seat = this.store.getSeat(att.playerId);
      if (seat !== null) this.removeSeat(seat, Date.now());
    }
    ws.serializeAttachment({ cid: att.cid, state: 'pending' } satisfies Attachment);
    ws.close(1000, 'bye');
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment;
    if (att.state !== 'joined' || att.playerId === undefined) return; // pending/left/superseded
    const seat = this.store.getSeat(att.playerId);
    if (seat === null || !seat.connected) return; // already removed or already in grace
    const now = Date.now();
    this.store.setConnected(seat.playerId, false, now + GRACE_MS);
    this.store.patchMeta({ lastActivityAt: now });
    this.broadcastLobby(); // seat greys out — NOT freed
    await this.armAlarm();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  /**
   * Everything due at `now`. PUBLIC so in-runtime tests drive time directly
   * instead of sleeping. Plan 2c seam: the §6 AlarmQueue EDF multiplexer
   * replaces this computed sweep (adding the 'phase' timer kind); the
   * persisted truth it loads from — roster.grace_until + meta.lastActivityAt
   * — is already in place.
   */
  async sweep(now: number): Promise<void> {
    if (this.store.getMeta() === null) return;
    for (const seat of this.store.listSeats()) {
      if (seat.graceUntil !== null && seat.graceUntil <= now) {
        // Lobby semantics: the seat is freed. While a game runs (Plan 2c),
        // this instead emits a playerLeft event into the game loop.
        this.removeSeat(seat, now);
      }
    }
    // TTL janitor (§5.4): empty rooms get the short unborn window, otherwise 45
    // min idle. removeSeat above refreshes lastActivityAt, so a just-emptied
    // room lives one more unborn window before the wipe.
    const latest = this.store.getMeta();
    if (latest !== null) {
      const ttl = this.store.rosterSize() === 0 ? UNBORN_TTL_MS : ROOM_TTL_MS;
      if (now - latest.lastActivityAt >= ttl) await this.destroyRoom();
    }
  }

  async alarm(): Promise<void> {
    await this.sweep(Date.now());
    await this.armAlarm();
  }

  /** Remove a seat + migrate host + tell the lobby. Shared by leave and grace expiry. */
  private removeSeat(seat: Seat, now: number): void {
    this.store.removePlayer(seat.playerId);
    if (seat.isHost) {
      const next = pickNextHost(this.store.listSeats());
      if (next !== null) this.store.setHost(next);
    }
    this.store.patchMeta({ lastActivityAt: now });
    this.broadcastLobby();
  }

  private socketFor(playerId: string): WebSocket | null {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment;
      if (att.state === 'joined' && att.playerId === playerId) return ws;
    }
    return null;
  }

  /**
   * Single alarm = earliest pending deadline (grace deadlines vs the TTL
   * horizon). Activity does NOT re-arm eagerly: an early alarm just sweeps
   * nothing and re-arms later — the design §6.2 ttl-branch pattern.
   */
  private async armAlarm(): Promise<void> {
    const meta = this.store.getMeta();
    if (meta === null) { await this.ctx.storage.deleteAlarm(); return; }
    let earliest = meta.lastActivityAt + (this.store.rosterSize() === 0 ? UNBORN_TTL_MS : ROOM_TTL_MS);
    for (const seat of this.store.listSeats()) {
      if (seat.graceUntil !== null && seat.graceUntil < earliest) earliest = seat.graceUntil;
    }
    await this.ctx.storage.setAlarm(earliest);
  }

  /**
   * Review C3 fix, in THIS order: close every socket (hibernating ones
   * included — deleteAll does not terminate them), THEN deleteAlarm (deleteAll
   * does not clear it, and a dangling alarm would wake the wiped room), THEN
   * deleteAll, THEN re-create the empty schema so this immortal DO instance
   * keeps serving — the next createRoom() on this code finds a cleanly
   * claimable object.
   */
  private async destroyRoom(): Promise<void> {
    this.closeAllSockets(1000, 'room-closed');
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.store.migrate();
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
