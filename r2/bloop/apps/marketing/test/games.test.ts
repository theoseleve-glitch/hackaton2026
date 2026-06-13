import { describe, it, expect } from 'vitest';
import { GAMES } from '../src/content/games';

describe('catalog', () => {
  it('has the launch games with bilingual names + hooks', () => {
    expect(GAMES.length).toBeGreaterThanOrEqual(8);
    for (const g of GAMES) {
      expect(g.name.fr).toBeTruthy();
      expect(g.name.en).toBeTruthy();
      expect(g.hook.fr).toBeTruthy();
      expect(g.hook.en).toBeTruthy();
      expect(g.accent).toMatch(/^#/);
    }
  });
  it('flags 18+ games', () => {
    expect(GAMES.some((g) => g.spicy)).toBe(true);
  });
});
