import { describe, expect, it } from 'vitest';
import { sanitizeNickname } from '../src/room/profanity.js';

describe('sanitizeNickname (the single text boundary, design §3.4)', () => {
  it('passes clean names through, trimmed', () => {
    expect(sanitizeNickname('  Alice  ')).toBe('Alice');
  });

  it('hard-caps at 20 chars before matching', () => {
    expect(sanitizeNickname('A'.repeat(30))).toBe('A'.repeat(20));
  });

  it('censors profanity embedded in an otherwise fine name', () => {
    expect(sanitizeNickname('fuck yeah')).toBe('**** yeah');
  });

  it('rejects fully-profane, variant, and empty names', () => {
    expect(sanitizeNickname('fuck')).toBeNull();
    expect(sanitizeNickname('fuuuuck')).toBeNull(); // recommended transformers catch elongation
    expect(sanitizeNickname('FuCk')).toBeNull();
    expect(sanitizeNickname('   ')).toBeNull();
  });
});
