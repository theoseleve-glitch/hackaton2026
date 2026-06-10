import { describe, expect, it } from 'vitest';
import { GAME_CATALOG, type GameCard } from '../src/games/catalog';

describe('GAME_CATALOG', () => {
  it('has at least 6 entries', () => {
    expect(GAME_CATALOG.length).toBeGreaterThanOrEqual(6);
  });

  it('all ids are unique', () => {
    const ids = GAME_CATALOG.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exactly one PLAY badge and it belongs to tracer', () => {
    const plays = GAME_CATALOG.filter((g) => g.badge === 'PLAY');
    expect(plays).toHaveLength(1);
    expect(plays[0]?.id).toBe('tracer');
  });

  it('all colors are 7-char hex strings', () => {
    for (const g of GAME_CATALOG) {
      expect(g.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('all names and taglines are non-empty strings', () => {
    for (const g of GAME_CATALOG) {
      expect(g.name.trim().length).toBeGreaterThan(0);
      expect(g.tagline.trim().length).toBeGreaterThan(0);
    }
  });
});
