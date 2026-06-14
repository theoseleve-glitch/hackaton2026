import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import { useTheme } from '../../theme/useTheme';
import { AppText } from '../ui';
import { Pop } from './Pop';

/**
 * "On fire" streak chip — a flame + "xN" pill that pops in to celebrate a run of
 * correct answers / wins. Tinted with the warm XP/coral end of the palette and
 * carrying the hard sticker shadow so it reads as a slapped-on sticker.
 *
 * Pops (keyed on `count`) each time the streak grows. Hidden entirely below
 * `minCount` (default 2) — a streak of one isn't a streak.
 *
 * REDUCED-MOTION SAFE via {@link Pop}.
 */
export function StreakTag({
  count,
  minCount = 2,
  label,
  style,
}: {
  count: number;
  /** Don't render below this streak length. Default 2. */
  minCount?: number;
  /** Override the default "ON FIRE" / "EN FEU" lead text. */
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme, tokens } = useTheme();
  if (count < minCount) return null;
  return (
    <Pop key={count} from={0.5} style={style}>
      <View
        accessibilityLabel={`${label ?? 'On fire'} x${count}`}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs,
          alignSelf: 'flex-start',
          backgroundColor: theme.xp,
          borderRadius: tokens.radii.pill,
          paddingHorizontal: tokens.spacing.md,
          paddingVertical: tokens.spacing.xs,
          borderWidth: 2, borderColor: theme.stickerOutline,
          ...tokens.elevation.sticker,
        }}>
        <AppText role="label">🔥</AppText>
        {label !== undefined && <AppText role="overline">{label}</AppText>}
        <AppText role="label">×{count}</AppText>
      </View>
    </Pop>
  );
}
