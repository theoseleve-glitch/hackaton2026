// apps/mobile/src/theme/colors.ts

/** Raw palette — Brand Book v1.0 §3/§15 (docs/da/brand/bloop-brand-book-v1.pdf).
 *  Hexes extracted from the brand book PDF's vector fills (the text layer is
 *  glyph-corrupted; the fills are canonical). */
export const palette = {
  // --- Ink (grounding) ---
  ink:          '#0F1633', // ink.900 — primary text, shadow.pop color
  inkCard:      '#1E2654', // ink.800 — dark-mode card
  inkInset:     '#1A2350', // dark-mode inset surface

  // --- Cream (light base) ---
  cream:        '#FBF6EC', // cream.50 — app background
  creamAlt:     '#F4EAD5', // cream.100 — surface alt / inset fills
  card:         '#FFFFFF', // raised card surface

  // --- Brights ---
  coral:        '#FF6F61', // coral.500 — THE accent CTA
  coralPressed: '#E85D50', // derived darker step for pressed state
  yellow:       '#FFCC4D', // yellow.400 — highlight, awards, XP
  yellowSoft:   '#FFE08A',
  teal:         '#4ECDC4', // success-chill accent, "Truth"
  cobalt:       '#5B7BFF', // info / night-mode accent
  lavender:     '#B6A8FF', // secondary accent
  lavenderSoft: '#D6CCFF',
  pink:         '#FF6B9D', // burst / "Dare" / spice
  pinkSoft:     '#FFC2D6',

  // --- Semantic singletons ---
  success:      '#3DC97A',
  warning:      '#FDC700',
  danger:       '#E5503F',
  white:        '#FFFFFF',
  black:        '#000000',
} as const;

export type PaletteColor = keyof typeof palette;

// Semantic tokens — components reference THESE, never raw palette.

export interface ColorTheme {
  bg: string;            // screen background
  surface: string;       // card / sheet
  surfaceAlt: string;    // nested / inset surface
  border: string;        // hairline / card outline
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnBrand: string;   // text on a brand-filled button

  brand: string;         // primary brand CTA (Join Game)
  brandPressed: string;
  accent: string;        // secondary/info accent (Invite Friends, toasts)
  truth: string;         // category chip "Truth"
  dare: string;          // category chip "Dare" / Dare Mode
  xp: string;            // progress / XP bar fill
  success: string;
  danger: string;
  warning: string;

  // Sticker Pop layer
  stickerOutline: string;
  burst: string;         // confetti/burst base
}

export const lightTheme: ColorTheme = {
  bg: palette.cream,
  surface: palette.card,
  surfaceAlt: palette.creamAlt,
  border: 'rgba(15, 22, 51, 0.12)',   // book §15: border = ink @ 12%
  textPrimary: palette.ink,
  textSecondary: 'rgba(15, 22, 51, 0.72)',
  textMuted: 'rgba(15, 22, 51, 0.48)',
  textOnBrand: palette.white,

  brand: palette.coral,                // §3: "Coral — Accent CTA"
  brandPressed: palette.coralPressed,
  accent: palette.cobalt,              // info accent (invite, toasts)
  truth: palette.teal,
  dare: palette.pink,
  xp: palette.yellow,
  success: palette.success,
  danger: palette.danger,
  warning: palette.warning,

  stickerOutline: palette.ink,
  burst: palette.pink,
};

// Night Pop Lite — book §3: "use sparingly, night-mode lobby ambience & reveals".
export const darkTheme: ColorTheme = {
  bg: palette.ink,
  surface: palette.inkCard,
  surfaceAlt: palette.inkInset,
  border: 'rgba(251, 246, 236, 0.10)', // book §15: cream @ 10%
  textPrimary: palette.cream,
  textSecondary: 'rgba(251, 246, 236, 0.72)',
  textMuted: 'rgba(251, 246, 236, 0.48)',
  textOnBrand: palette.white,

  brand: palette.coral,                // book §15: accent coral.500 → coral.500
  brandPressed: palette.coralPressed,
  accent: palette.cobalt,
  truth: palette.teal,
  dare: palette.pink,
  xp: palette.yellow,
  success: palette.success,
  danger: palette.danger,
  warning: palette.warning,

  stickerOutline: palette.black,       // book §15: shadow.pop ink → black
  burst: palette.pink,
};
