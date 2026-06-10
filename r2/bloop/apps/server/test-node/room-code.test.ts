import { describe, expect, it } from 'vitest';
import {
  BLOCKED_CODES, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH,
  generateRoomCode, isBlockedCode, isValidRoomCode, normalizeRoomCode,
} from '../src/front-door/room-code.js';

describe('room codes (design §2.1)', () => {
  it('alphabet is the 31-char unambiguous set; codes are 4 chars', () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(31);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(31);
    for (const ch of 'ILO01') expect(ROOM_CODE_ALPHABET).not.toContain(ch);
    expect(ROOM_CODE_LENGTH).toBe(4);
  });

  it('generateRoomCode always emits valid codes and is not constant', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const code = generateRoomCode();
      expect(isValidRoomCode(code)).toBe(true);
      seen.add(code);
    }
    expect(seen.size).toBeGreaterThan(100);
  });

  it('normalizeRoomCode uppercases case-insensitive input (review I2)', () => {
    expect(normalizeRoomCode('abcd')).toBe('ABCD');
    expect(normalizeRoomCode('AbCd')).toBe('ABCD');
  });

  it('normalizeRoomCode rejects anything outside the code space', () => {
    for (const bad of ['AB', 'ABCDE', 'AIL0', 'AB!?']) expect(normalizeRoomCode(bad)).toBeNull();
  });

  it('blocklist blocks the static slur set, and every entry is generatable', () => {
    expect(isBlockedCode('FUCK')).toBe(true);
    expect(isBlockedCode('ABCD')).toBe(false);
    for (const code of BLOCKED_CODES) expect(isValidRoomCode(code)).toBe(true); // no dead entries
  });
});
