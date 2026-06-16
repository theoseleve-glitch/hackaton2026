import { describe, expect, it } from 'vitest';
import { GAME_CATALOG } from '../src/games/catalog';

const WAVE2_IDS = [
  'tu-preferes', 'gauche-ou-droite', 'pires-potes', 'truth-or-dare-2', 'truth-or-drink',
  'double-jeu', 'quizz-culture-ge', 'cinquante-cinquante', 'jeu-de-la-note',
  'devine-la-question', 'devine-l-action', 'devine-l-objet', 'mime-inverse',
  'double-le-mouvement', 'jeu-du-theme', 'trouvez-la-regle', 'loup-garou',
  'le-classement',
];

describe('GAME_CATALOG (wave 2)', () => {
  it('carries all 17 wave-2 games plus tracer', () => {
    const ids = new Set(GAME_CATALOG.map((g) => g.id));
    for (const id of WAVE2_IDS) expect(ids.has(id), id).toBe(true);
    expect(ids.has('tracer')).toBe(true);
    expect(GAME_CATALOG.length).toBeGreaterThanOrEqual(19);
  });

  it('all ids are unique', () => {
    const ids = GAME_CATALOG.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every catalog game is PLAY — all wired to the server registry', () => {
    const plays = GAME_CATALOG.filter((g) => g.badge === 'PLAY').map((g) => g.id).sort();
    expect(plays).toEqual([
      'cinquante-cinquante', 'courtroom', 'devine-l-action', 'devine-l-objet', 'devine-la-question',
      'double-jeu', 'double-le-mouvement', 'gauche-ou-droite', 'jeu-de-la-note',
      'jeu-du-theme', 'le-classement', 'loup-garou', 'mime-inverse', 'pires-potes',
      'qui-a-dit-ca', 'quizz-culture-ge', 'red-green-flag', 'tracer', 'trouvez-la-regle',
      'truth-or-dare-2', 'truth-or-drink', 'tu-preferes',
    ].sort());
    expect(GAME_CATALOG.every((g) => g.badge === 'PLAY')).toBe(true);
  });

  it('all colors are 7-char hex strings', () => {
    for (const g of GAME_CATALOG) {
      expect(g.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('all names and taglines are non-empty in BOTH languages', () => {
    for (const g of GAME_CATALOG) {
      for (const lang of ['fr', 'en'] as const) {
        expect(g.name[lang].trim().length, `${g.id} name.${lang}`).toBeGreaterThan(0);
        expect(g.tagline[lang].trim().length, `${g.id} tagline.${lang}`).toBeGreaterThan(0);
      }
    }
  });

  it('every wave-2 card credits an inspiration source with an https link-out', () => {
    for (const g of GAME_CATALOG) {
      if (!WAVE2_IDS.includes(g.id)) continue;
      expect(g.video, `${g.id} video`).toBeDefined();
      expect(g.video!.creator.trim().length).toBeGreaterThan(0);
      expect(g.video!.url).toMatch(/^https:\/\//);
    }
  });

  it('thumbnails, when present, are platform-served YouTube thumbnails (never re-hosted)', () => {
    for (const g of GAME_CATALOG) {
      if (g.video?.thumbnailUrl === undefined) continue;
      expect(g.video.thumbnailUrl).toMatch(/^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/hqdefault\.jpg$/);
    }
  });
});
