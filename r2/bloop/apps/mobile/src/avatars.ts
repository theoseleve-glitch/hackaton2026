/** Brand Book v1.0 §5 — no mascot, no emoji identity. A player is an initial on a
 *  color disc; the hue is hashed from the (normalized) name so it is consistent
 *  across sessions and across everyone's screens, with zero coordination.
 *  The wire field playerProfileSchema.avatar is kept for compatibility (≤64 chars)
 *  but rendering ignores it; new profiles send AVATAR_WIRE_VALUE. */

export const AVATAR_WIRE_VALUE = 'initial';

/** Brand brights with enough mutual distance; ink text passes on all of them. */
export const AVATAR_DISC_COLORS: readonly string[] = [
  '#FF6F61', // coral
  '#FFCC4D', // yellow
  '#4ECDC4', // teal
  '#5B7BFF', // cobalt
  '#B6A8FF', // lavender
  '#FF6B9D', // pink
  '#3DC97A', // green
  '#FFE08A', // soft yellow
] as const;

/** FNV-1a 32-bit — tiny, stable, good-enough spread for 8 buckets. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const normalize = (name: string): string => name.trim().toLowerCase();

export function discColor(name: string): string {
  return AVATAR_DISC_COLORS[fnv1a(normalize(name)) % AVATAR_DISC_COLORS.length]!;
}

export function initialOf(name: string): string {
  const t = name.trim();
  if (t.length === 0) return '?';
  // codePointAt keeps astral-plane leading chars (emoji nicknames) intact.
  return String.fromCodePoint(t.codePointAt(0)!).toUpperCase();
}
