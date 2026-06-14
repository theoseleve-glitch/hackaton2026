import { useEffect, useRef, useState } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { useTheme } from '../../theme/useTheme';
import { AppText, type TypeRole } from '../ui';
import { useReducedMotion } from './useReducedMotion';
import { Pop } from './Pop';

/**
 * Counts from the previously-rendered `value` up to the new `value`, emphasising
 * a score delta. Wrapped in a {@link Pop} keyed on the value so each change snaps
 * with the brand sticker bounce. Renders via {@link AppText}, so it inherits the
 * Fredoka/DM Sans roles and theme colours like any other label.
 *
 * `prefix`/`suffix` frame the number ("+", " pts"); set `signed` to force a
 * leading "+" on positive values (handy for "+N" deltas).
 *
 * REDUCED-MOTION SAFE: when Reduce Motion is on, the number jumps straight to its
 * target — no tween, no intermediate frames.
 */
export function ScoreClimb({
  value,
  role = 'headline',
  color = 'xp',
  prefix = '',
  suffix = '',
  signed = false,
  durationMs = 480,
  style,
}: {
  value: number;
  role?: TypeRole;
  color?: Parameters<typeof AppText>[0]['color'];
  prefix?: string;
  suffix?: string;
  signed?: boolean;
  durationMs?: number;
  style?: StyleProp<TextStyle>;
}) {
  const { tokens } = useTheme();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    fromRef.current = value;
    if (reduced || from === to) {
      setShown(to);
      return;
    }
    const dur = durationMs > 0 ? durationMs : tokens.motion.duration.reveal;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / dur);
      // easeOut so the count decelerates into the final value.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (to - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setShown(to);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [value, reduced, durationMs]);

  const sign = signed && shown > 0 ? '+' : '';
  return (
    // Key on the target so the Pop re-fires once per delta, not per count frame.
    <Pop key={value} from={0.7}>
      <AppText role={role} color={color} style={style}>
        {prefix}{sign}{shown}{suffix}
      </AppText>
    </Pop>
  );
}
