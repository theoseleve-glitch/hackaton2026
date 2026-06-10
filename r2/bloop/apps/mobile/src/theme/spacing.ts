// apps/mobile/src/theme/spacing.ts
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,   // default gutter
  xl: 20,
  xxl: 24,  // section gap
  xxxl: 32,
  huge: 40,
  giant: 56,
} as const;

// Screen edge gutter and min touch target are constants, not ad-hoc.
export const layout = {
  screenPadding: spacing.lg,   // 16
  cardPadding: spacing.xl,     // 20
  minTouchTarget: 48,          // accessibility floor (see §6)
  maxContentWidth: 480,        // tablet / large phone clamp
} as const;
