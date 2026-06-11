// apps/mobile/src/theme/typography.ts
// Brand Book v1.0 §4: Fredoka = display & logo; DM Sans = UI & body.
// Caveat (sticker labels) lands with the first sticker component. Size scale kept from 3a.
export const fontFamily = {
  display: 'Fredoka_700Bold',      // hero numbers, screen titles, "BLOOP!" shouts
  displaySemi: 'Fredoka_600SemiBold',
  ui: 'DMSans_700Bold',            // buttons, labels, badges (book: Button = DM Sans 700)
  body: 'DMSans_400Regular',       // paragraphs, helper text
  bodyMedium: 'DMSans_500Medium',
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
