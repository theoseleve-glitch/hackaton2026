/** Dev wiring: the Android emulator reaches the host machine as 10.0.2.2, so the
 *  default targets local `wrangler dev` (:8787). Override per device/network via
 *  EXPO_PUBLIC_SERVER_URL (inlined by Expo at bundle time — keep the exact
 *  `process.env.EXPO_PUBLIC_SERVER_URL` member access). */
export function normalizeServerUrl(raw: string | undefined): string {
  return (raw ?? 'http://10.0.2.2:8787').replace(/\/+$/, '');
}

export const SERVER_URL: string = normalizeServerUrl(process.env.EXPO_PUBLIC_SERVER_URL);

export const roomsUrl = (serverUrl: string): string => `${serverUrl}/rooms`;

/** WS endpoint per apps/server/src/index.ts: /rooms/:code/ws (codes case-insensitive; normalize for cosmetics). */
export const wsUrl = (serverUrl: string, code: string): string =>
  `${serverUrl.replace(/^http/, 'ws')}/rooms/${code.toUpperCase()}/ws`;
