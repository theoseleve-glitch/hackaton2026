/**
 * Bloop "juice kit" — shared, pure-presentational, brand-styled feedback
 * components + helpers. Every animated piece is REDUCED-MOTION SAFE (degrades to
 * instant via {@link useReducedMotion}). No game logic, no screen state — the
 * Wire phase maps per-game payloads onto these props.
 */
export { useReducedMotion } from './useReducedMotion';
export { haptics } from './haptics';
export { Pop, StickerPop } from './Pop';
export { ScoreClimb } from './ScoreClimb';
export { StreakTag } from './StreakTag';
export { MultiplierBadge } from './MultiplierBadge';
export {
  EpilogueCard,
  SuperlativeRow,
  type EpilogueStanding,
  type EpilogueSuperlative,
} from './EpilogueCard';
