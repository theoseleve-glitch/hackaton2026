/**
 * Deterministic, locale-independent normalization for equality compares
 * (e.g. impostor guess vs secret word): Unicode-decompose (NFD), strip
 * combining diacritics, lowercase, drop everything except letters / digits /
 * whitespace, collapse whitespace runs to a single space, trim. Pure — same
 * input, same output, no locale tables. NOT a profanity filter: that lives
 * at the DO boundary, never in a reducer.
 * Known limit: NFD does not decompose ligatures — 'cœur' ≠ 'coeur',
 * 'Straße' ≠ 'strasse'. Games comparing guesses against words containing
 * œ/æ/ß should expand them in their CONTENT PACKS (or accept both spellings),
 * not patch the reducer.
 */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}