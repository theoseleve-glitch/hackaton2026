import { AccessibilityInfo, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Thin, fire-and-forget wrapper over expo-haptics (SDK 55: `impactAsync`,
 * `notificationAsync`). Every call is a NO-OP when:
 *   - the platform has no haptics engine (web, or a device that lacks one), or
 *   - the user has "Reduce Motion" enabled (haptics are a motion-adjacent cue).
 *
 * Nothing here ever throws or rejects: the underlying promises are swallowed so
 * a missing taptic engine can never crash a render path. Import and call freely
 * from press handlers, reveals and score pops — `haptics.impact('light')` etc.
 */

type ImpactWeight = 'light' | 'medium' | 'heavy';

// The platforms expo-haptics actually drives. Web exposes the API but is inert
// and noisy in dev, so we treat it as unsupported.
const SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

// Cache the Reduce-Motion flag so callers stay synchronous. Seeded async on load
// and kept live via the same event the useReducedMotion hook listens to.
let reduceMotion = false;
if (SUPPORTED) {
  AccessibilityInfo.isReduceMotionEnabled()
    .then((v) => { reduceMotion = v; })
    .catch(() => { /* probe unsupported → assume motion on */ });
  AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => { reduceMotion = v; });
}

const enabled = (): boolean => SUPPORTED && !reduceMotion;

/** Swallow every rejection — a missing engine must never bubble into a render. */
const safe = (run: () => Promise<void>): void => {
  if (!enabled()) return;
  try {
    void run().catch(() => { /* no-op: haptics are best-effort */ });
  } catch {
    /* no-op: synchronous throw from a broken native module */
  }
};

const IMPACT: Record<ImpactWeight, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

export const haptics = {
  /** A physical tap. `light` = chip/select, `medium` = lock-in, `heavy` = big reveal. */
  impact(weight: ImpactWeight = 'medium'): void {
    safe(() => Haptics.impactAsync(IMPACT[weight]));
  },
  /** Win / correct / "you scored" notification buzz. */
  success(): void {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  /** Caution / time-low / "careful" notification buzz. */
  warning(): void {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
} as const;

export type HapticsApi = typeof haptics;
