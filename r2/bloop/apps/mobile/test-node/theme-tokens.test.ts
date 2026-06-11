import { describe, expect, it } from 'vitest';
// NEVER import src/theme/index.ts or motion.ts here: they pull react-native-reanimated.
import { darkTheme, lightTheme, palette } from '../src/theme/colors';
import { elevation, outline } from '../src/theme/elevation';
import { radii } from '../src/theme/radii';
import { layout, spacing } from '../src/theme/spacing';
import { fontFamily, type } from '../src/theme/typography';

describe('design-system tokens (docs/designs/2026-06-10-mobile-design-system.md §2)', () => {
  it('palette is hex-for-hex per §2.1', () => {
    expect(palette).toEqual({
      blurpleberry: '#5B6CFF', bubblegum: '#FF5DA2', tangerine: '#FF7A3C', sunbeam: '#FFC23C',
      limeade: '#6FD66B', aqua: '#36C5D0',
      skyMist: '#8FD3F4', lilac: '#C3A7FF', blush: '#FFB3C9', mint: '#BFE9C8', butter: '#FFE39A',
      paper: '#FFF9F0', cloud: '#FFFFFF', fog: '#F1ECE3', pebble: '#D9D2C7',
      slate: '#8A8478', graphite: '#4A4742', ink: '#23201C',
      midnight: '#10142A', abyss: '#0A0D1F', navySurface: '#1B2147', navyBorder: '#2C3566',
      success: '#3FB75E', warning: '#FF9F1C', danger: '#F4453E',
      white: '#FFFFFF', black: '#000000', stickerLine: '#1A1714',
    });
  });

  it('lightTheme maps semantics exactly per §2.1', () => {
    expect(lightTheme).toEqual({
      bg: '#FFF9F0', surface: '#FFFFFF', surfaceAlt: '#F1ECE3', border: '#D9D2C7',
      textPrimary: '#23201C', textSecondary: '#4A4742', textMuted: '#8A8478', textOnBrand: '#FFFFFF',
      brand: '#5B6CFF', brandPressed: '#4655E6', accent: '#36C5D0', truth: '#6FD66B',
      dare: '#FF7A3C', xp: '#FFC23C', success: '#3FB75E', danger: '#F4453E', warning: '#FF9F1C',
      stickerOutline: '#1A1714', burst: '#FF5DA2',
    });
  });

  it('darkTheme (Night Pop Lite, reserved) keeps the §2.1 anchors', () => {
    expect(darkTheme.bg).toBe('#10142A');
    expect(darkTheme.surface).toBe('#1B2147');
    expect(darkTheme.brand).toBe('#7B8AFF');
    expect(darkTheme.textPrimary).toBe('#F4F2FF');
  });

  it('spacing + layout per §2.2', () => {
    expect(spacing).toEqual({ none: 0, xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 40, giant: 56 });
    expect(layout).toEqual({ screenPadding: 16, cardPadding: 20, minTouchTarget: 48, maxContentWidth: 480 });
  });

  it('radii per §2.3', () => {
    expect(radii).toEqual({ none: 0, sm: 8, md: 14, lg: 20, xl: 28, xxl: 36, pill: 999 });
  });

  it('type scale per §2.4; font families per Brand Book v1.0 §4 (supersedes §2.4 Baloo/Inter)', () => {
    expect(fontFamily).toEqual({
      display: 'Fredoka_700Bold', displaySemi: 'Fredoka_600SemiBold',
      ui: 'DMSans_700Bold', body: 'DMSans_400Regular', bodyMedium: 'DMSans_500Medium',
    });
    expect(type.displayXL).toEqual({ fontSize: 48, lineHeight: 52, fontFamily: 'Fredoka_700Bold', letterSpacing: 0.5 });
    expect(type.body).toEqual({ fontSize: 16, lineHeight: 24, fontFamily: 'DMSans_400Regular' });
    expect(type.overline).toEqual({ fontSize: 11, lineHeight: 14, fontFamily: 'DMSans_700Bold', letterSpacing: 1.2 });
  });

  it('elevation + outline per §2.5/§2.6 (sticker = hard offset, no blur)', () => {
    expect(elevation.sticker).toEqual({ shadowColor: '#1A1714', shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: 4 }, elevation: 8 });
    expect(elevation.e2).toEqual({ shadowColor: '#3A2E1E', shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 });
    expect(outline).toEqual({ hairline: { borderWidth: 1, borderColor: 'border' }, sticker: { borderWidth: 3, borderColor: 'stickerOutline' } });
  });
});
