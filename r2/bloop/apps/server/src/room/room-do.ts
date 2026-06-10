import { DurableObject } from 'cloudflare:workers';
import { replay, type Effect, type GameEvent } from '@bloop/engine';
import { clientMessageSchema, type ClientMessage, type ErrorCode, type RoomPlayer, type ServerMessage } from '@bloop/protocol';
import type { Env } from '../types.js';
import { AlarmQueue, nextPhaseDeadline } from './alarm-mux.js';
import { acceptsProtocol } from './protocol-window.js';
import { sanitizeNickname } from './profanity.js';
import { pickNextHost } from './host.js';
import { lookupGame, type GameEntry } from './registry.js';
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
type StartGameMessage = Extract<ClientMessage, { type: 'startGame' }>;
type ActionMessage = Extract<ClientMessage, { type: 'action' }>;

/** In-memory cache of the running game. Losing it to eviction is CORRECT, not a bug: rehydrate() rebuilds it from (seed, roster, content, event log). */
interface GameRuntime { entry: GameEntry; state: unknown }

function safeJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return null; }
}

export class RoomDO extends DurableObject<Env> {
  private readonly store: Store;
  private game: GameRuntime | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new Store(ctx.storage.sql);
    this.store.migrate(); // sync + idempotent. (No AlarmQueue.load: the EDF queue is DERIVED from persisted truth per use — see loadQueue.)
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
    this.game = null; // C3 companion: a stale runtime cache must not leak into the new party
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

  /** The single input boundary (§3.3): size cap -> zod -> route. Token-bucket rate limit: Plan 2d. */
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment;
    if (typeof raw !== 'string' || raw.length > MAX_MSG_CHARS) return this.sendError(ws, 'BAD_MESSAGE');
    const parsed = clientMessageSchema.safeParse(safeJson(raw));
    if (!parsed.success) return this.sendError(ws, 'BAD_MESSAGE');
    const msg = parsed.data;
    switch (msg.type) {
      case 'hello': return this.onHello(ws, att, msg);
      case 'startGame': return this.onStartGame(ws, att, msg);
      case 'action': return this.onAction(ws, att, msg);
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
    // fresh join: lobby or between games only — the game roster froze at
    // startGame (design §3.3d; ROOM_FULL reused per §9.7)
    if (meta.status === 'playing') return this.sendError(ws, 'ROOM_FULL');
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

  /** Design §4.1/§4.5: validate -> seed -> init -> persist binding -> broadcast views. NOTHING is appended: init is re-derivable from (seed, roster, content). */
  private async onStartGame(ws: WebSocket, att: Attachment, msg: StartGameMessage): Promise<void> {
    const seat = att.playerId === undefined ? null : this.store.getSeat(att.playerId);
    if (seat === null) return this.sendError(ws, 'BAD_MESSAGE'); // hello first
    if (!seat.isHost) return this.sendError(ws, 'NOT_HOST');
    const meta = this.store.getMeta();
    if (meta === null || meta.status === 'playing') return this.sendError(ws, 'BAD_MESSAGE');
    const entry = lookupGame(msg.gameId);
    if (entry === null) return this.sendError(ws, 'UNKNOWN_GAME');
    // the roster freezes NOW from connected seats; in-grace seats sit this one out
    const roster = this.store.listSeats().filter((s) => s.connected).map((s) => s.playerId);
    if (roster.length < entry.module.minPlayers || roster.length > entry.module.maxPlayers) {
      return this.sendError(ws, 'BAD_MESSAGE');
    }
    const at = Date.now();
    const seed = crypto.randomUUID(); // unguessable; persisted so init and every replay agree
    const state = entry.module.init(seed, roster, entry.content);
    const dur = entry.module.phaseDurationMs(state);
    this.store.clearEvents(); // a previous game's log must never replay into this one
    this.store.patchMeta({
      status: 'playing', gameId: entry.module.id, gameVersion: entry.module.version, seed,
      contentRef: { gameId: entry.module.id, contentId: entry.content.id, version: entry.content.version },
      roster, phaseKey: entry.module.phaseKey(state),
      deadlineAt: dur === null ? null : at + dur, lastActivityAt: at,
    });
    this.game = { entry, state };
    this.broadcastViews(this.game);
    await this.armAlarm();
  }

  /** Design §4.2: per-game zod -> server-stamped GameEvent -> the applyEvent funnel. */
  private async onAction(ws: WebSocket, att: Attachment, msg: ActionMessage): Promise<void> {
    if (att.state !== 'joined' || att.playerId === undefined) return this.sendError(ws, 'BAD_MESSAGE');
    const meta = this.store.getMeta();
    if (meta === null || meta.status !== 'playing') return this.sendError(ws, 'BAD_MESSAGE');
    const rt = this.rehydrate();
    if (rt === null) return this.sendError(ws, 'BAD_MESSAGE');
    // Per-game payload validation; the module never sees junk. (Free-text
    // scrubbing — sanitizeGameText — joins here when a text game lands.)
    const action = rt.entry.actionSchema.safeParse(msg.payload);
    if (!action.success) return this.sendError(ws, 'BAD_MESSAGE');
    await this.applyEvent(rt, { type: 'action', playerId: att.playerId, action: action.data, at: Date.now() });
  }

  /**
   * C1 fix (adversarial review): live state is ONLY ever built by game code.
   * Rehydration = replay(init, full event log) — every player-keyed map is
   * reconstructed null-prototype by the module itself. Deliberately NO
   * snapshot path: a tracer game is < ~60 events and reduce is microseconds,
   * so replay-from-zero is the simple, pollution-proof choice at party scale.
   * (Seam: if a marathon game ever needs snapshots, they must round-trip
   * through a module-aware revive — never bare JSON.parse.)
   */
  private rehydrate(): GameRuntime | null {
    if (this.game !== null) return this.game;
    const meta = this.store.getMeta();
    if (meta === null || meta.gameId === null || meta.seed === null || meta.roster === null) return null;
    const entry = lookupGame(meta.gameId);
    if (entry === null || entry.module.version !== meta.gameVersion) return null; // killed/bumped mid-game: unrecoverable, room TTLs out
    const state = replay(entry.module, meta.seed, meta.roster, entry.content, this.store.listEvents());
    this.game = { entry, state };
    return this.game;
  }

  /**
   * The single funnel for EVERY game event (action/deadline/playerLeft/
   * playerRejoined). I4 contract: a module rejects by returning the SAME
   * reference -> nothing logged, broadcast, or re-armed. Accepted events:
   * PERSIST BEFORE BROADCAST (spec §7), re-arm iff phaseKey changed (§0.1).
   */
  private async applyEvent(rt: GameRuntime, event: GameEvent<unknown>): Promise<void> {
    const before = rt.state;
    const keyBefore = rt.entry.module.phaseKey(before);
    const { state: after, effects } = rt.entry.module.reduce(before, event);
    if (after === before) return; // rejected by reference (I4) — keeps the log replay-clean
    const meta = this.store.getMeta();
    if (meta === null) return; // room wiped under our feet — drop the event
    this.store.appendEvent(event); // (1) durable log entry — BEFORE any socket send
    rt.state = after;
    const keyAfter = rt.entry.module.phaseKey(after);
    const deadlineAt = nextPhaseDeadline(keyBefore, keyAfter, rt.entry.module.phaseDurationMs(after), event.at, meta.deadlineAt);
    this.store.patchMeta({ phaseKey: keyAfter, deadlineAt }); // (2) timer truth persisted
    for (const eff of effects as Effect[]) this.runEffect(eff); // (3) effects
    this.broadcastViews(rt); // (4) per-player redacted views — strictly after the append
    await this.armAlarm(); // (5) the earliest timer may have moved
  }

  /** Effects are descriptions; the shell executes them. replay() drops historical effects, so eviction never re-runs these. */
  private runEffect(eff: Effect): void {
    if (eff.type === 'analytics') {
      // 2c: log-only. Analytics Engine binding is a later seam — never PostHog from the DO (spec §3).
      console.log(`[analytics] ${eff.name}`, JSON.stringify(eff.props ?? {}));
    } else {
      // gameOver: between-games state; host may startGame again. The terminal
      // view + deadlineAt:null IS the client signal (design §4.3) — no extra
      // protocol message. 'ended' stays reserved for an explicit close flow.
      this.store.patchMeta({ status: 'roundOver' });
    }
  }

  /** Redaction by construction (spec §4): each socket only ever receives view(state, ITS OWN playerId). */
  private broadcastViews(rt: GameRuntime): void {
    const deadlineAt = this.store.getMeta()?.deadlineAt ?? null;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment;
      if (att.state === 'joined' && att.playerId !== undefined) this.sendView(ws, rt, att.playerId, deadlineAt);
    }
  }

  private sendView(ws: WebSocket, rt: GameRuntime, playerId: string, deadlineAt: number | null): void {
    this.send(ws, { type: 'view', gameId: rt.entry.module.id, view: rt.entry.module.view(rt.state, playerId), deadlineAt });
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
    // Mid-game resync (§3.5): offer playerRejoined to the module (most ignore
    // it — I4 then skips append/broadcast), and ALWAYS send the returning
    // phone its current personal view so it catches up regardless.
    const meta = this.store.getMeta();
    if (meta !== null && meta.gameId !== null && meta.status !== 'lobby') {
      const rt = this.rehydrate();
      if (rt !== null) {
        await this.applyEvent(rt, { type: 'playerRejoined', playerId: seat.playerId, at: now });
        this.sendView(ws, rt, seat.playerId, this.store.getMeta()?.deadlineAt ?? null);
      }
    }
    await this.armAlarm(); // drop the now-moot grace deadline eagerly
  }

  private async onLeave(ws: WebSocket, att: Attachment): Promise<void> {
    if (att.state === 'joined' && att.playerId !== undefined) {
      const seat = this.store.getSeat(att.playerId);
      if (seat !== null) await this.seatDeparted(seat, Date.now());
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
   * Everything due at `now`, earliest-deadline-first over {phase, grace, ttl}
   * (§6). PUBLIC so in-runtime tests drive forged time directly. The queue is
   * DERIVED from persisted truth (meta.phaseKey/deadlineAt, roster.grace_until,
   * meta.lastActivityAt) — no timers table to drift, and a retry re-derives a
   * self-consistent queue (C2). Per-timer error isolation lands in Task 8.
   */
  async sweep(now: number): Promise<void> {
    if (this.store.getMeta() === null) return;
    for (const t of this.loadQueue().due(now)) {
      if (t.kind === 'phase') await this.firePhase(t.key, now);
      else if (t.kind === 'grace') await this.fireGrace(t.key, now);
      else await this.fireTtl(now);
      if (this.store.getMeta() === null) return; // ttl wiped the room; alarm already deleted
    }
    await this.armAlarm();
  }

  async alarm(): Promise<void> {
    await this.sweep(Date.now());
  }

  private loadQueue(): AlarmQueue {
    const meta = this.store.getMeta();
    if (meta === null) throw new Error('loadQueue: no room'); // callers guard
    const seats = this.store.listSeats();
    return AlarmQueue.fromRoom({
      phase: meta.deadlineAt !== null && meta.phaseKey !== null ? { key: meta.phaseKey, fireAt: meta.deadlineAt } : null,
      graces: seats.flatMap((s) => (s.graceUntil === null ? [] : [{ playerId: s.playerId, fireAt: s.graceUntil }])),
      ttlFireAt: meta.lastActivityAt + (seats.length === 0 ? UNBORN_TTL_MS : ROOM_TTL_MS),
    });
  }

  /** Phase deadline -> a server-stamped `deadline` GameEvent. The phaseKey guard makes a stale/duplicate alarm a no-op (§6.2). */
  private async firePhase(key: string, now: number): Promise<void> {
    const rt = this.rehydrate();
    if (rt === null) return;
    if (rt.entry.module.phaseKey(rt.state) !== key) return; // the phase already advanced
    await this.applyEvent(rt, { type: 'deadline', at: now });
  }

  /** Grace expiry: idempotent vs the roster — a retry finds the seat gone or its deadline cleared. */
  private async fireGrace(playerId: string, now: number): Promise<void> {
    const seat = this.store.getSeat(playerId);
    if (seat === null || seat.graceUntil === null || seat.graceUntil > now) return;
    await this.seatDeparted(seat, now);
  }

  /** Leave/grace-expiry shared path (design §4 roster events): free the seat (host migration + lobby), then surface the departure to a running game as a playerLeft event. Tracer ignores it (I4 keeps the log clean); presence-aware games react. */
  private async seatDeparted(seat: Seat, now: number): Promise<void> {
    const playing = this.store.getMeta()?.status === 'playing';
    this.removeSeat(seat, now);
    if (playing) {
      const rt = this.rehydrate();
      if (rt !== null) await this.applyEvent(rt, { type: 'playerLeft', playerId: seat.playerId, at: now });
    }
  }

  /** TTL: re-checks PERSISTED idleness — a grace fired earlier in this sweep refreshed lastActivityAt and saves the room. Destroy is terminal: a retry no-ops on null meta. */
  private async fireTtl(now: number): Promise<void> {
    const meta = this.store.getMeta();
    if (meta === null) return;
    const ttl = this.store.rosterSize() === 0 ? UNBORN_TTL_MS : ROOM_TTL_MS;
    if (now - meta.lastActivityAt >= ttl) await this.destroyRoom();
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

  /** Single alarm = the EDF queue's earliest timer (always exists: ttl). */
  private async armAlarm(): Promise<void> {
    if (this.store.getMeta() === null) { await this.ctx.storage.deleteAlarm(); return; }
    await this.ctx.storage.setAlarm(this.loadQueue().earliest().fireAt);
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
    this.game = null; // the in-memory runtime dies with the room
    this.store.migrate();
  }

  // ---- outbound ----

  private broadcastLobby(): void {
    const players: RoomPlayer[] = this.store.listSeats().map((s) => ({
      id: s.playerId, profile: s.profile, connected: s.connected, isHost: s.isHost,
    }));
    const lobby: ServerMessage = { type: 'lobby', players, gameId: this.store.getMeta()?.gameId ?? null };
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
