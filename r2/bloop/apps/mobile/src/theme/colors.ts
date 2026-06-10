// apps/mobile/src/theme/colors.ts

/** Raw, theme-agnostic palette sampled from the moodboards. */
export const palette = {
  // --- Primary (Bubblegum brights, board-2 "Primary Palette" row) ---
  blurpleberry: '#5B6CFF', // the Bloop logo / primary brand blue-violet
  bubblegum:    '#FF5DA2', // hot pink — "Join", energy
  tangerine:    '#FF7A3C', // orange — Sticker Pop "Dare", warmth
  sunbeam:      '#FFC23C', // golden yellow — XP, badges, stars
  limeade:      '#6FD66B', // fresh green — "Truth", success
  aqua:         '#36C5D0', // teal — secondary actions, calm accent

  // --- Accent (board-2 "Accent Palette", softer pops) ---
  skyMist:      '#8FD3F4', // soft sky
  lilac:        '#C3A7FF', // lavender
  blush:        '#FFB3C9', // soft pink tint
  mint:         '#BFE9C8', // soft mint
  butter:       '#FFE39A', // soft yellow

  // --- Neutrals (warm paper → ink, board-2 "Neutrals" row) ---
  paper:        '#FFF9F0', // app background, warm off-white (NOT pure white)
  cloud:        '#FFFFFF', // raised card surface
  fog:          '#F1ECE3', // subtle fills, disabled, dividers
  pebble:       '#D9D2C7', // borders on paper
  slate:        '#8A8478', // muted text / icons
  graphite:     '#4A4742', // secondary text
  ink:          '#23201C', // primary text on light

  // --- Dark navy family (board-2 dark swatch → reserved for Night Pop Lite) ---
  midnight:     '#10142A', // dark-mode background base
  abyss:        '#0A0D1F', // dark-mode deepest
  navySurface:  '#1B2147', // dark-mode raised card
  navyBorder:   '#2C3566', // dark-mode hairline

  // --- Semantic singletons ---
  success:      '#3FB75E',
  warning:      '#FF9F1C',
  danger:       '#F4453E',
  white:        '#FFFFFF',
  black:        '#000000',
  stickerLine:  '#1A1714', // the hard near-black outline on Sticker Pop elements
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

  brand: string;         // primary brand (Join Game)
  brandPressed: string;
  accent: string;        // secondary brand (Invite Friends)
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
  bg: palette.paper,
  surface: palette.cloud,
  surfaceAlt: palette.fog,
  border: palette.pebble,
  textPrimary: palette.ink,
  textSecondary: palette.graphite,
  textMuted: palette.slate,
  textOnBrand: palette.white,

  brand: palette.blurpleberry,
  brandPressed: '#4655E6',
  accent: palette.aqua,
  truth: palette.limeade,
  dare: palette.tangerine,
  xp: palette.sunbeam,
  success: palette.success,
  danger: palette.danger,
  warning: palette.warning,

  stickerOutline: palette.stickerLine,
  burst: palette.bubblegum,
};

// Night Pop Lite — reserved, shippable as a token swap (see §1).
export const darkTheme: ColorTheme = {
  bg: palette.midnight,
  surface: palette.navySurface,
  surfaceAlt: palette.abyss,
  border: palette.navyBorder,
  textPrimary: '#F4F2FF',
  textSecondary: '#C6C9E8',
  textMuted: '#8B90C0',
  textOnBrand: palette.white,

  brand: '#7B8AFF',      // brighter on dark
  brandPressed: '#6675FF',
  accent: '#46D6E0',
  truth: '#7CE87A',
  dare: '#FF8C4D',
  xp: '#FFD24D',
  success: '#5BD17A',
  danger: '#FF5A52',
  warning: '#FFB13C',

  stickerOutline: '#000000',
  burst: '#FF6FB0',
};
