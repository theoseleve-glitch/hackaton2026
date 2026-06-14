import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '../../theme/useTheme';
import { useReducedMotion } from './useReducedMotion';

/**
 * Brand "Sticker Pop" entrance (Brand Book §2.7 / §15): the wrapped children
 * spring up from a slightly-shrunk state to full size on mount, using the shared
 * `motion.spring.pop` preset — the same cue PrimaryButton uses on press.
 *
 * Re-pops whenever the React `key` changes (mount the element with a changing
 * key — e.g. the round number or a score value — to replay the pop on update).
 *
 * REDUCED-MOTION SAFE: when Reduce Motion is on, the spring is skipped and the
 * children render at full scale immediately (no transform animation at all).
 */
export function Pop({ from = 0.6, style, children }: {
  /** Starting scale the children pop up from. Default 0.6 = brand "sticker" snap. */
  from?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { tokens } = useTheme();
  const reduced = useReducedMotion();
  // Start at final scale when reduced so the very first frame is correct.
  const scale = useSharedValue(reduced ? 1 : from);

  useEffect(() => {
    if (reduced) {
      scale.value = 1;
      return;
    }
    scale.value = from;
    scale.value = withSpring(1, tokens.motion.spring.pop);
  }, [reduced, from]);

  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** Alias — the brand name for {@link Pop}. Identical behaviour. */
export const StickerPop = Pop;
