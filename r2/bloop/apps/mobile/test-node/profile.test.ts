import { describe, expect, it } from 'vitest';
import { playerProfileSchema } from '@bloop/protocol';
import { AVATAR_WIRE_VALUE } from '../src/avatars';
import {
  loadProfile, loadReconnectToken, normalizeNickname, PROFILE_KEY,
  randomProfile, reconnectKey, saveProfile, saveReconnectToken, type KV,
} from '../src/storage/profile';

function fakeKv(): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: async (k) => map.get(k) ?? null, setItem: async (k, v) => void map.set(k, v) };
}

describe('nickname + random identity (§5 picker UX)', () => {
  it('normalizeNickname trims, collapses whitespace, clamps to the protocol max of 20', () => {
    expect(normalizeNickname('  DJ   Bloop  ')).toBe('DJ Bloop');
    expect(normalizeNickname('x'.repeat(30))).toBe('x'.repeat(20));
    expect(normalizeNickname('   ')).toBeNull();
  });

  it('randomProfile is deterministic under an injected rng and protocol-valid', () => {
    const a = randomProfile(() => 0.42);
    expect(randomProfile(() => 0.42)).toEqual(a);
    expect(playerProfileSchema.safeParse(a).success).toBe(true);
    expect(a.avatar).toBe(AVATAR_WIRE_VALUE); // Brand Book §5: avatar derives from the name now
  });
});

describe('device-local persistence (anonymous, on-device only)', () => {
  it('profile round-trips through KV and rejects corrupt JSON', async () => {
    const kv = fakeKv();
    expect(await loadProfile(kv)).toBeNull();
    await saveProfile(kv, { nickname: 'Théo', avatar: AVATAR_WIRE_VALUE });
    expect(await loadProfile(kv)).toEqual({ nickname: 'Théo', avatar: AVATAR_WIRE_VALUE });
    kv.map.set(PROFILE_KEY, '{not json');
    expect(await loadProfile(kv)).toBeNull();
  });

  it('reconnect tokens are stored per room code, case-normalized', async () => {
    const kv = fakeKv();
    expect(reconnectKey('abCD')).toBe('bloop/reconnect/ABCD');
    await saveReconnectToken(kv, 'abCD', 'tok-1');
    await saveReconnectToken(kv, 'WXYZ', 'tok-2');
    expect(await loadReconnectToken(kv, 'ABCD')).toBe('tok-1');
    expect(await loadReconnectToken(kv, 'wxyz')).toBe('tok-2');
    expect(await loadReconnectToken(kv, 'QQQQ')).toBeNull();
  });
});
