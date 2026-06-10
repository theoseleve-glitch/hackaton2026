import { SELF } from 'cloudflare:test';
import { PROTOCOL_VERSION, serverMessageSchema, type ServerMessage } from '@bloop/protocol';

export async function createRoomViaApi(): Promise<string> {
  const res = await SELF.fetch('https://bloop.test/rooms', { method: 'POST' });
  if (res.status !== 201) throw new Error(`POST /rooms failed: ${res.status}`);
  return ((await res.json()) as { code: string }).code;
}

export interface TestSocket {
  ws: WebSocket;
  next(): Promise<ServerMessage>;
  closed: Promise<number>; // resolves with the close code
}

export async function connect(code: string): Promise<TestSocket> {
  const res = await SELF.fetch(`https://bloop.test/rooms/${code}/ws`, { headers: { Upgrade: 'websocket' } });
  const ws = res.webSocket;
  if (ws === null) throw new Error(`expected 101 + webSocket, got ${res.status}`);
  const queue: ServerMessage[] = [];
  const waiters: Array<(m: ServerMessage) => void> = [];
  ws.accept();
  ws.addEventListener('message', (event) => {
    const msg = serverMessageSchema.parse(JSON.parse(event.data as string));
    const waiter = waiters.shift();
    if (waiter !== undefined) waiter(msg);
    else queue.push(msg);
  });
  let resolveClosed!: (code: number) => void;
  const closed = new Promise<number>((resolve) => { resolveClosed = resolve; });
  ws.addEventListener('close', (event) => resolveClosed(event.code));
  return {
    ws,
    next(): Promise<ServerMessage> {
      const head = queue.shift();
      if (head !== undefined) return Promise.resolve(head);
      return new Promise<ServerMessage>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timed out waiting for a server message')), 2_000);
        waiters.push((msg) => { clearTimeout(timer); resolve(msg); });
      });
    },
    closed,
  };
}

export function sendJson(sock: TestSocket, msg: unknown): void {
  sock.ws.send(JSON.stringify(msg));
}

export async function join(
  code: string, nickname: string,
  opts: { protocolVersion?: number; reconnectToken?: string } = {},
): Promise<TestSocket> {
  const sock = await connect(code);
  sendJson(sock, {
    type: 'hello',
    protocolVersion: opts.protocolVersion ?? PROTOCOL_VERSION,
    profile: { nickname, avatar: 'a0' },
    ...(opts.reconnectToken !== undefined ? { reconnectToken: opts.reconnectToken } : {}),
  });
  return sock;
}

export async function expectWelcome(sock: TestSocket): Promise<{ playerId: string; reconnectToken: string }> {
  const msg = await sock.next();
  if (msg.type !== 'welcome') throw new Error(`expected welcome, got ${msg.type}`);
  return { playerId: msg.playerId, reconnectToken: msg.reconnectToken };
}

export async function expectLobby(sock: TestSocket): Promise<Extract<ServerMessage, { type: 'lobby' }>> {
  const msg = await sock.next();
  if (msg.type !== 'lobby') throw new Error(`expected lobby, got ${msg.type}`);
  return msg;
}

export async function expectError(sock: TestSocket): Promise<string> {
  const msg = await sock.next();
  if (msg.type !== 'error') throw new Error(`expected error, got ${msg.type}`);
  return msg.code;
}

export interface JoinedRoom {
  code: string;
  socks: TestSocket[];
  welcomes: Array<{ playerId: string; reconnectToken: string }>;
}

/** Create a room and join players in order, draining every welcome/lobby so all queues start empty. */
export async function setupRoom(nicknames: string[]): Promise<JoinedRoom> {
  const code = await createRoomViaApi();
  const socks: TestSocket[] = [];
  const welcomes: JoinedRoom['welcomes'] = [];
  for (const nickname of nicknames) {
    const sock = await join(code, nickname);
    welcomes.push(await expectWelcome(sock));
    socks.push(sock);
    for (const s of socks) await expectLobby(s); // every joined socket sees the grown lobby
  }
  return { code, socks, welcomes };
}
