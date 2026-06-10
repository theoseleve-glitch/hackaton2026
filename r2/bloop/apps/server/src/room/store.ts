import type { PlayerProfile } from '@bloop/protocol';

export interface RoomMeta {
  code: string;
  protocolVersion: number; // pinned at creation, never re-pinned (§3.3/§7.3)
  status: 'lobby'; // 2c adds 'playing' | 'roundOver' | 'ended' with the game loop
  createdAt: number;
  lastActivityAt: number; // drives the TTL janitor (§5.4)
}

export interface Seat {
  playerId: string;
  profile: PlayerProfile;
  isHost: boolean;
  connected: boolean;
  reconnectTokenHash: string; // sha-256 hex; the token itself is NEVER stored
  joinedAt: number;
  /** Absolute ms deadline while disconnected; null when connected. 2c's AlarmQueue derives its 'grace' timers from this column. */
  graceUntil: number | null;
}

interface RosterRow extends Record<string, SqlStorageValue> {
  player_id: string; profile_json: string; is_host: number; connected: number;
  reconnect_hash: string; joined_at: number; grace_until: number | null;
}

export class Store {
  constructor(private readonly sql: SqlStorage) {}

  /** Idempotent; re-run after destroyRoom() and at createRoom() entry (C3 ghost states). 2c adds events/snapshots tables (§5.1) here. */
  migrate(): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS room_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS roster (
      player_id TEXT PRIMARY KEY, profile_json TEXT NOT NULL, is_host INTEGER NOT NULL,
      connected INTEGER NOT NULL, reconnect_hash TEXT NOT NULL, joined_at INTEGER NOT NULL,
      grace_until INTEGER
    )`);
  }

  getMeta(): RoomMeta | null {
    const rows = this.sql.exec<{ v: string }>(`SELECT v FROM room_meta WHERE k = 'meta'`).toArray();
    return rows.length === 0 ? null : (JSON.parse(rows[0]!.v) as RoomMeta);
  }

  setMeta(meta: RoomMeta): void {
    this.sql.exec(`INSERT OR REPLACE INTO room_meta (k, v) VALUES ('meta', ?)`, JSON.stringify(meta));
  }

  patchMeta(patch: Partial<RoomMeta>): void {
    const meta = this.getMeta();
    if (meta !== null) this.setMeta({ ...meta, ...patch });
  }

  addPlayer(seat: Seat): void {
    this.sql.exec(
      `INSERT INTO roster (player_id, profile_json, is_host, connected, reconnect_hash, joined_at, grace_until)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      seat.playerId, JSON.stringify(seat.profile), seat.isHost ? 1 : 0, seat.connected ? 1 : 0,
      seat.reconnectTokenHash, seat.joinedAt, seat.graceUntil,
    );
  }

  /** Join order — host migration ("longest-joined") relies on it. */
  listSeats(): Seat[] {
    return this.sql.exec<RosterRow>(`SELECT * FROM roster ORDER BY joined_at ASC, rowid ASC`).toArray().map(rowToSeat);
  }

  getSeat(playerId: string): Seat | null {
    const rows = this.sql.exec<RosterRow>(`SELECT * FROM roster WHERE player_id = ?`, playerId).toArray();
    return rows.length === 0 ? null : rowToSeat(rows[0]!);
  }

  findSeatByTokenHash(hash: string): Seat | null {
    const rows = this.sql.exec<RosterRow>(`SELECT * FROM roster WHERE reconnect_hash = ?`, hash).toArray();
    return rows.length === 0 ? null : rowToSeat(rows[0]!);
  }

  rosterSize(): number {
    return Number(this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM roster`).one().n);
  }

  setConnected(playerId: string, connected: boolean, graceUntil: number | null): void {
    this.sql.exec(`UPDATE roster SET connected = ?, grace_until = ? WHERE player_id = ?`, connected ? 1 : 0, graceUntil, playerId);
  }

  removePlayer(playerId: string): void {
    this.sql.exec(`DELETE FROM roster WHERE player_id = ?`, playerId);
  }

  /** Exactly one host: flips is_host on for playerId, off for everyone else. */
  setHost(playerId: string): void {
    this.sql.exec(`UPDATE roster SET is_host = (player_id = ?)`, playerId);
  }
}

function rowToSeat(r: RosterRow): Seat {
  return {
    playerId: r.player_id, profile: JSON.parse(r.profile_json) as PlayerProfile,
    isHost: r.is_host === 1, connected: r.connected === 1,
    reconnectTokenHash: r.reconnect_hash, joinedAt: r.joined_at, graceUntil: r.grace_until,
  };
}
