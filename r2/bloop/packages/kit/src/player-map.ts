import type { PlayerId } from '@bloop/engine';

/**
 * Null-prototype, JSON-serializable map keyed by untrusted player ids.
 * Player IDs are untrusted strings: assigning obj['__proto__'] on a
 * default-prototype object silently corrupts the map instead of creating a
 * key. Null-proto objects stay JSON-serializable (unlike Map), which
 * event-sourcing requires. Every player-keyed map in every game state MUST
 * be built with this.
 */
export function emptyPlayerMap<V>(): Record<PlayerId, V> {
  return Object.create(null) as Record<PlayerId, V>;
}
