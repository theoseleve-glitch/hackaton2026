// apps/mobile/src/theme/radii.ts
// Brand Book v1.0 §15 radius scale (xxl is our extension for the room-code panel).
export const radii = {
  none: 0,
  sm: 10,
  md: 14,    // chips, small tiles
  lg: 22,    // cards (the default card radius)
  xl: 28,    // hero cards, sheets
  xxl: 36,   // large modal / room-code panel
  pill: 999, // buttons, avatar discs, badges
} as const;
