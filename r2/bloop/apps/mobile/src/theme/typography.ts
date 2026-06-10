// apps/mobile/src/theme/typography.ts
export const fontFamily = {
  display: 'Baloo2_800ExtraBold',  // hero numbers, screen titles, "BLOOP!" shouts
  displaySemi: 'Baloo2_600SemiBold',
  ui: 'Inter_600SemiBold',         // buttons, labels, list items
  body: 'Inter_400Regular',        // paragraphs, helper text
  bodyMedium: 'Inter_500Medium',
} as const;

export const type = {
  // role:        { size, lineHeight, family, letterSpacing }
  displayXL: { fontSize: 48, lineHeight: 52, fontFamily: fontFamily.display, letterSpacing: 0.5 }, // room code, win score
  displayL:  { fontSize: 36, lineHeight: 40, fontFamily: fontFamily.display, letterSpacing: 0.3 },
  titleL:    { fontSize: 28, lineHeight: 34, fontFamily: fontFamily.display, letterSpacing: 0 },   // screen titles
  titleM:    { fontSize: 22, lineHeight: 28, fontFamily: fontFamily.displaySemi },
  headline:  { fontSize: 18, lineHeight: 24, fontFamily: fontFamily.ui },
  body:      { fontSize: 16, lineHeight: 24, fontFamily: fontFamily.body },
  bodyStrong:{ fontSize: 16, lineHeight: 24, fontFamily: fontFamily.bodyMedium },
  label:     { fontSize: 14, lineHeight: 18, fontFamily: fontFamily.ui, letterSpacing: 0.2 },       // chips, buttons
  caption:   { fontSize: 12, lineHeight: 16, fontFamily: fontFamily.body },
  overline:  { fontSize: 11, lineHeight: 14, fontFamily: fontFamily.ui, letterSpacing: 1.2 },       // ALL-CAPS tags
} as const;
