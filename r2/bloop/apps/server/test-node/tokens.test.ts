import { describe, expect, it } from 'vitest';
import { hashToken, newReconnectToken } from '../src/room/tokens.js';

describe('reconnect tokens (hashed at rest, §3.5)', () => {
  it('hashToken: 64 lowercase hex, deterministic, matches the SHA-256 vector for "abc"', async () => {
    const a = await hashToken('token-a');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashToken('token-a')).toBe(a);
    expect(await hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('differs across tokens', async () => {
    expect(await hashToken('token-a')).not.toBe(await hashToken('token-b'));
  });

  it('newReconnectToken: 72 uuid chars, unique, within the protocol max of 128', () => {
    const t = newReconnectToken();
    expect(t).toHaveLength(72);
    expect(t).toMatch(/^[0-9a-f-]{72}$/);
    expect(t.length).toBeLessThanOrEqual(128);
    expect(newReconnectToken()).not.toBe(t);
  });
});
