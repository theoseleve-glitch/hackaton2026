// apps/mobile/src/dev/inAppBot.ts
// In-app dev bot: joins a room via WebSocket, auto-votes during tracer vote phase.
// RN ships global WebSocket — no extra deps needed.
import { PROTOCOL_VERSION } from '@bloop/protocol';
import { wsUrl } from '../config';

const BOT_AVATARS = [
  'emoji:robot',
  'emoji:alien',
  'emoji:ghost',
  'emoji:dino',
  'emoji:octopus',
  'emoji:penguin',
] as const;

/**
 * Spawns a single bot player in the given room.
 * Returns a cleanup function that closes the socket.
 */
export function spawnBot(serverUrl: string, code: string, index: number): () => void {
  const url = wsUrl(serverUrl, code);
  const ws = new WebSocket(url);
  let playerId: string | null = null;
  let votedRound = -1;

  ws.onopen = () => {
    const hello = {
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      profile: {
        nickname: `Bot ${index}`,
        avatar: BOT_AVATARS[index % BOT_AVATARS.length],
      },
    };
    ws.send(JSON.stringify(hello));
  };

  ws.onmessage = (e: MessageEvent) => {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(String(e.data)) as Record<string, unknown>;
    } catch {
      return;
    }

    if (m['type'] === 'welcome') {
      playerId = m['playerId'] as string;
    }

    if (
      m['type'] === 'view' &&
      typeof m['view'] === 'object' &&
      m['view'] !== null
    ) {
      const view = m['view'] as Record<string, unknown>;
      // option-vote (tu-preferes / gauche-ou-droite): random pick (+ predict when required)
      if (
        view['phase'] === 'choose' &&
        view['myBallot'] === null &&
        view['round'] !== votedRound &&
        playerId !== null
      ) {
        votedRound = view['round'] as number;
        const pick = Math.random() < 0.5 ? 'A' : 'B';
        const needsPredict = view['scoring'] === 'predict-majority';
        const predict = Math.random() < 0.5 ? 'A' : 'B';
        const delay = 800 + Math.random() * 800;
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'action',
              payload: { kind: 'ballot', pick, ...(needsPredict ? { predict } : {}) },
            }));
          }
        }, delay);
        return;
      }

      if (
        view['phase'] === 'vote' &&
        view['myVote'] === null &&
        view['round'] !== votedRound &&
        playerId !== null
      ) {
        votedRound = view['round'] as number;
        const hasVoted = view['hasVoted'] as Record<string, unknown>;
        const targets = Object.keys(hasVoted).filter((p) => p !== playerId);
        if (targets.length === 0) return;
        const target = targets[Math.floor(Math.random() * targets.length)];
        const delay = 800 + Math.random() * 800;
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'action', payload: { kind: 'vote', target } }));
          }
        }, delay);
      }
    }
  };

  return () => {
    ws.close();
  };
}
