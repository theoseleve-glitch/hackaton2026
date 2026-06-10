import { palette } from './colors';
import { elevation, outline } from './elevation';
import { duration, easing, spring } from './motion';
import { radii } from './radii';
import { layout, spacing } from './spacing';
import { fontFamily, type } from './typography';

/** §6.2 — the single tokens object. Components reach colors via useTheme().theme, never palette. */
export const tokens = {
  colors: palette, spacing, layout, radii, type, fontFamily, elevation, outline,
  motion: { duration, easing, spring },
} as const;
export type Tokens = typeof tokens;
