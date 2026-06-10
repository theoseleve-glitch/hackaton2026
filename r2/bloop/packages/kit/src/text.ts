/**
 * Deterministic, locale-independent normalization for equality compares
 * (e.g. impostor guess vs secret word): Unicode-decompose (NFD), strip
 * combining diacritics, lowercase, drop everything except letters / digits /
 * whitespace, collapse whitespace runs to a single space, trim. Pure — same
 * input, same output, no locale tables. NOT a profanity filter: that lives
 * at the DO boundary, never in a reducer.
 */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
