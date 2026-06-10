import {
  RegExpMatcher, TextCensor, asteriskCensorStrategy, englishDataset, englishRecommendedTransformers,
} from 'obscenity';

// Singleton matcher: built once per isolate, reused across hibernation wakes
// (§3.4). Asterisk strategy (not the default grawlix) so output — and the
// "fully censored" rejection below — is deterministic.
const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
const censor = new TextCensor().setStrategy(asteriskCensorStrategy());

export const MAX_NICKNAME_CHARS = 20;

/**
 * Censored nickname, or null when the whole name is profane or empty (reject
 * — nobody ships as "****"). English-only; locales are a config concern
 * (design §9.2). sanitizeGameText lands with the game loop in Plan 2c.
 */
export function sanitizeNickname(input: string): string | null {
  const trimmed = [...input.trim()].slice(0, MAX_NICKNAME_CHARS).join('');
  if (trimmed.length === 0) return null;
  const matches = matcher.getAllMatches(trimmed);
  if (matches.length === 0) return trimmed;
  const censored = censor.applyTo(trimmed, matches);
  if (censored.replace(/\*/g, '').trim().length === 0) return null;
  return censored;
}
