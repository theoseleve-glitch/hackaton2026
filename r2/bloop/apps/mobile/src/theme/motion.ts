// apps/mobile/src/theme/motion.ts
import { Easing } from 'react-native-reanimated';

export const duration = {
  instant: 80,
  fast: 150,    // chip select, button press
  base: 220,    // default enter/leave, phase cross-fade
  slow: 320,    // sheet, modal
  reveal: 480,  // vote reveal, score count-up
  celebrate: 900, // confetti / win burst lifetime
} as const;

export const easing = {
  // standard UI motion
  standard: Easing.bezier(0.2, 0, 0, 1),
  decelerate: Easing.out(Easing.cubic),
  accelerate: Easing.in(Easing.cubic),
  // playful overshoot for "pop"
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
} as const;

// Named spring presets map 1:1 to the board's five motion cues.
export const spring = {
  pop:    { damping: 12, stiffness: 320, mass: 0.7 }, // scale 0.6→1, button/sticker entrance
  bounce: { damping: 9,  stiffness: 180, mass: 0.9 }, // avatar join, badge land
  slide:  { damping: 20, stiffness: 240, mass: 1   }, // sheets, screen-to-screen content
  pulse:  { damping: 6,  stiffness: 120, mass: 0.6 }, // timer ring "hurry up", live dot
  float:  { damping: 8,  stiffness: 40,  mass: 1.2 }, // idle hero / mascot bob (looped)
} as const;
