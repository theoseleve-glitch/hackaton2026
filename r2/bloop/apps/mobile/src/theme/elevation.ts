// apps/mobile/src/theme/elevation.ts
export const elevation = {
  none: {},
  // Soft card shadows (iOS shadow* + Android elevation)
  e1: { shadowColor: '#0F1633', shadowOpacity: 0.06, shadowRadius: 6,  shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  e2: { shadowColor: '#0F1633', shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  e3: { shadowColor: '#0F1633', shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  // Brand Book §15 shadow.pop: "0 4px 0 0 ink" — hard offset, no blur, reads as a cut sticker.
  sticker: { shadowColor: '#0F1633', shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  // Brand Book §15 shadow.clay: "0 6px 0 rgba(ink,.18)" (single-layer approximation —
  // RN can't stack the book's second blurred layer in one style).
  clay: { shadowColor: '#0F1633', shadowOpacity: 0.18, shadowRadius: 0, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
} as const;

/** §2.6 — borderColor strings are SEMANTIC theme keys, resolved at component time via useTheme(). */
export const outline = {
  hairline: { borderWidth: 1, borderColor: 'border' },
  sticker: { borderWidth: 3, borderColor: 'stickerOutline' },
} as const;
