import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import { useTheme } from '../../theme/useTheme';
import { AppText } from '../ui';
import { Pop } from './Pop';

/**
 * Chrome "round modifier" badge — the "DOUBLE POINTS · ×2" / "DERNIÈRE MANCHE"
 * banner several games slap on the final or special round (see InputGuessPlay's
 * inline `POINTS ×2` band, which this generalises). A solid XP-yellow plate with
 * the hard sticker shadow, an optional headline `title`, and a bold `×N` cap.
 *
 * Pops (keyed on `multiplier` + `title`) when it appears or its value changes.
 * Renders nothing for a 1× multiplier with no title — there's nothing to brag
 * about at base rate.
 *
 * REDUCED-MOTION SAFE via {@link Pop}.
 */
export function MultiplierBadge({
  multiplier,
  title,
  tone = 'xp',
  style,
}: {
  multiplier: number;
  /** Lead copy, e.g. "FINAL ROUND" / "DERNIÈRE MANCHE". Optional. */
  title?: string;
  /** Plate colour key. `xp` (yellow, default), `dare` (pink) or `brand` (coral). */
  tone?: 'xp' | 'dare' | 'brand';
  style?: StyleProp<ViewStyle>;
}) {
  const { theme, tokens } = useTheme();
  if (multiplier <= 1 && title === undefined) return null;
  const bg = tone === 'dare' ? theme.dare : tone === 'brand' ? theme.brand : theme.xp;
  const fg = tone === 'xp' ? 'textPrimary' : 'textOnBrand';
  return (
    <Pop key={`${title ?? ''}-${multiplier}`} from={0.6} style={style}>
      <View
        accessibilityLabel={`${title ?? ''} ${multiplier > 1 ? `times ${multiplier}` : ''}`.trim()}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          gap: tokens.spacing.sm,
          backgroundColor: bg,
          borderRadius: tokens.radii.lg,
          paddingHorizontal: tokens.spacing.lg,
          paddingVertical: tokens.spacing.md,
          borderWidth: 2, borderColor: theme.stickerOutline,
          ...tokens.elevation.sticker,
        }}>
        {title !== undefined && <AppText role="label" color={fg}>{title}</AppText>}
        {multiplier > 1 && <AppText role="titleM" color={fg}>×{multiplier}</AppText>}
      </View>
    </Pop>
  );
}
