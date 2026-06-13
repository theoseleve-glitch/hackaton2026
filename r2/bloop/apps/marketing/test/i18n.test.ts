import { describe, it, expect, beforeEach } from 'vitest';
import { detectLocale, t } from '../src/lib/i18n';

describe('i18n', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to fr when nav language is not english', () => {
    expect(detectLocale('de-DE')).toBe('fr');
    expect(detectLocale('fr-FR')).toBe('fr');
    expect(detectLocale(undefined)).toBe('fr');
  });
  it('detects en', () => {
    expect(detectLocale('en-GB')).toBe('en');
  });
  it('respects a persisted choice over nav language', () => {
    localStorage.setItem('bloop_locale', 'en');
    expect(detectLocale('fr-FR')).toBe('en');
  });
  it('looks up nested keys per locale', () => {
    expect(t('hero.headline', 'fr')).toMatch(/expose/i);
    expect(t('hero.headline', 'en')).toMatch(/expose/i);
  });
  it('falls back to the key when missing', () => {
    expect(t('nope.missing', 'fr')).toBe('nope.missing');
  });
});
