import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Tracks the OS "Reduce Motion" accessibility setting (iOS: Reduce Motion,
 * Android: Remove Animations). Seeds from the current value on mount and stays
 * live via the `reduceMotionChanged` subscription.
 *
 * Every juice-kit animation reads this: when it returns `true`, motion degrades
 * to its final/instant state — children still mount, scores still update, badges
 * still render, just without the spring/count-up. Defaults to `false` (motion on)
 * until the async probe resolves, so first paint is never blocked.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (alive) setReduced(v); })
      .catch(() => { /* probe unsupported → leave motion on */ });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { alive = false; sub.remove(); };
  }, []);

  return reduced;
}
