import { describe, expect, it } from 'vitest';
import { AVATAR_DISC_COLORS, AVATAR_WIRE_VALUE, discColor, initialOf } from '../src/avatars';

describe('initial avatars (Brand Book v1.0 §5: initial on a name-hashed color disc)', () => {
  it('initialOf takes the first character, uppercased', () => {
    expect(initialOf('theo')).toBe('T');
    expect(initialOf('émile')).toBe('É');
    expect(initialOf('  zoe')).toBe('Z'); // leading space trimmed
    expect(initialOf('🦖rex')).toBe('🦖'); // astral-plane first char survives intact
    expect(initialOf('')).toBe('?');
    expect(initialOf('   ')).toBe('?');
  });

  it('discColor is deterministic, stable across sessions, and from the brand set', () => {
    expect(discColor('Theo')).toBe(discColor('Theo'));
    expect(AVATAR_DISC_COLORS).toContain(discColor('Theo'));
    expect(AVATAR_DISC_COLORS).toContain(discColor('🦖rex'));
  });

  it('discColor varies across a typical room of names', () => {
    const names = ['Theo', 'Emma', 'Hugo', 'Sarah', 'Liam', 'Maya', 'Zoe', 'Nina'];
    const distinct = new Set(names.map(discColor));
    expect(distinct.size).toBeGreaterThan(2);
  });

  it('is case- and whitespace-insensitive so a cosmetic rename keeps the hue', () => {
    expect(discColor('theo')).toBe(discColor('  THEO '));
  });

  it('wire value stays protocol-safe (≤64 chars)', () => {
    expect(AVATAR_WIRE_VALUE.length).toBeLessThanOrEqual(64);
  });
});
