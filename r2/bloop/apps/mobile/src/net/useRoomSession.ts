import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebSocket as ReconnectingWebSocket } from 'partysocket';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { PROTOCOL_VERSION, type ClientMessage, type PlayerProfile } from '@bloop/protocol';
import { SERVER_URL, wsUrl } from '../config';
import { loadProfile, loadReconnectToken, saveReconnectToken } from '../storage/profile';
import { parseServerMessage } from './parse';
import { initialSession, reduceSession, type SessionState } from './session';

export interface RoomSession {
  state: SessionState;
  /** null until AsyncStorage resolves; 'missing' sends the user back Home to pick an identity. */
  profile: PlayerProfile | 'missing' | null;
  sendStartGame(gameId: string): void;
  sendVote(target: string): void;
  leave(): void;
}

export function useRoomSession(code: string): RoomSession {
  const [state, dispatch] = useReducer(reduceSession, initialSession);
  const [profile, setProfile] = useState<RoomSession['profile']>(null);
  const sockRef = useRef<ReconnectingWebSocket | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let sock: ReconnectingWebSocket | null = null;
    void (async () => {
      const [p, token] = await Promise.all([loadProfile(AsyncStorage), loadReconnectToken(AsyncStorage, code)]);
      if (disposed) return;
      if (p === null) { setProfile('missing'); return; } // no identity → no socket
      setProfile(p);
      tokenRef.current = token;
      sock = new ReconnectingWebSocket(() => wsUrl(SERVER_URL, code), [], {
        connectionTimeout: 4_000, maxRetries: 16, minReconnectionDelay: 300, maxReconnectionDelay: 4_000,
      });
      sockRef.current = sock;
      sock.addEventListener('open', () => {
        dispatch({ type: 'socketOpen' });
        // EVERY (re)open re-introduces us; the stored token reclaims our seat mid-game (§3.5).
        const hello: ClientMessage = {
          type: 'hello', protocolVersion: PROTOCOL_VERSION, profile: p,
          ...(tokenRef.current !== null ? { reconnectToken: tokenRef.current } : {}),
        };
        sock?.send(JSON.stringify(hello));
      });
      // Param typed structurally — RN tsconfigs don't load the DOM lib's MessageEvent.
      sock.addEventListener('message', (e: { data: unknown }) => {
        const m = parseServerMessage(e.data);
        if (m === null) return;
        if (m.type === 'welcome') {
          tokenRef.current = m.reconnectToken;
          void saveReconnectToken(AsyncStorage, code, m.reconnectToken);
        }
        dispatch({ type: 'message', message: m });
      });
      sock.addEventListener('close', () => dispatch({ type: 'socketClosed' }));
    })();
    return () => { disposed = true; sock?.close(); sockRef.current = null; };
  }, [code]);

  // Fatal (UPGRADE_REQUIRED / ROOM_FULL): stop partysocket's retry loop for good.
  useEffect(() => {
    if (state.fatal !== null) sockRef.current?.close();
  }, [state.fatal]);

  const send = useCallback((m: ClientMessage) => {
    const s = sockRef.current;
    if (s !== null && s.readyState === 1 /* OPEN */) s.send(JSON.stringify(m));
  }, []);

  return {
    state, profile,
    sendStartGame: useCallback((gameId: string) => send({ type: 'startGame', gameId }), [send]),
    sendVote: useCallback((target: string) => send({ type: 'action', payload: { kind: 'vote', target } }), [send]),
    leave: useCallback(() => { send({ type: 'leave' }); sockRef.current?.close(); }, [send]),
  };
}
