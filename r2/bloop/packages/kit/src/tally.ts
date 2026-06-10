import type { PlayerId } from '@bloop/engine';

/**
 * Count occurrences of each value in a player-keyed hidden buffer
 * (generalizes tracer's votes -> tally promotion). The result is the PUBLIC
 * aggregate a reveal transition may expose; the buffer itself stays hidden.
 * Output is null-prototype + JSON-safe, so a hostile value like "__proto__"
 * becomes a plain counted key instead of corrupting the record.
 *
 * Hidden-buffer convention (synthesis §1.5, enforced per-game with
 * leakedSecrets tests): buffers are doc-commented HIDDEN in state, never
 * appear in any non-owner view, and the owner-only echo is always
 * `buffer[viewer] ?? null` — never an indexed lookup that could return a
 * foreign player's value.
 */
export function tally<T extends string>(buffer: Record<PlayerId, T>): Record<T, number> {
  const counts = Object.create(null) as Record<T, number>;
  for (const value of Object.values(buffer)) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}
