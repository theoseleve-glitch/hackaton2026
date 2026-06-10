import { describe, expect, it } from 'vitest';
import { normalizeText } from '@bloop/kit';

describe('normalizeText', () => {
  it('lowercases and trims', () => {
    expect(normalizeText('  CafE  ')).toBe('cafe');
  });

  it('strips diacritics so café === Café', () => {
    expect(normalizeText('Café')).toBe(normalizeText('café'));
    expect(normalizeText('ÉLÈVE')).toBe('eleve');
  });

  it('strips punctuation and symbols', () => {
    expect(normalizeText("l'eau-de-vie!")).toBe('leaudevie');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeText('au   revoir\t mon  ami')).toBe('au revoir mon ami');
  });

  it('is idempotent and keeps digits', () => {
    const once = normalizeText(' Numéro 10! ');
    expect(once).toBe('numero 10');
    expect(normalizeText(once)).toBe(once);
  });

  it('documents the ligature limit: œ/ß pass through undecomposed', () => {
    expect(normalizeText('cœur')).toBe('cœur');
    expect(normalizeText('cœur')).not.toBe(normalizeText('coeur'));
  });
});
