/**
 * Reconnect tokens are opaque bearer capabilities for one seat in one
 * ephemeral room; the token lives ONLY on the device — the DO stores this
 * SHA-256 hex digest (§3.5). Web Crypto exists in workerd AND Node 20+.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Two uuids = 72 chars, comfortably inside the protocol's 128-char cap. */
export function newReconnectToken(): string {
  return crypto.randomUUID() + crypto.randomUUID();
}
