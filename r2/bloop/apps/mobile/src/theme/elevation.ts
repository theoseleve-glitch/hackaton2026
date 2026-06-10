// apps/mobile/src/theme/elevation.ts
export const elevation = {
  none: {},
  // Soft card shadows (iOS shadow* + Android elevation)
  e1: { shadowColor: '#3A2E1E', shadowOpacity: 0.06, shadowRadius: 6,  shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  e2: { shadowColor: '#3A2E1E', shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  e3: { shadowColor: '#3A2E1E', shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  // Sticker Pop hard shadow — no blur, hard offset, reads as a cut sticker.
  sticker: { shadowColor: '#1A1714', shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
} as const;

/** §2.6 — borderColor strings are SEMANTIC theme keys, resolved at component time via useTheme(). */
export const outline = {
  hairline: { borderWidth: 1, borderColor: 'border' },
  sticker: { borderWidth: 3, borderColor: 'stickerOutline' },
} as const;
