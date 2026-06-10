import { describe, expect, it } from 'vitest';
import { sanitizeNickname } from '../src/room/profanity.js';

describe('obscenity inside workerd (design §1.5/§3.4 import smoke)', () => {
  it('loads, matches, and censors identically to Node in the workers runtime', () => {
    expect(sanitizeNickname('Alice')).toBe('Alice');
    expect(sanitizeNickname('fuck')).toBeNull();
    expect(sanitizeNickname('fuck yeah')).toBe('**** yeah');
  });
});
