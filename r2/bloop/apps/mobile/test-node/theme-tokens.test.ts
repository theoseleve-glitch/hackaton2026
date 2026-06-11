import { describe, expect, it } from 'vitest';
// NEVER import src/theme/index.ts or motion.ts here: they pull react-native-reanimated.
import { darkTheme, lightTheme, palette } from '../src/theme/colors';
import { elevation, outline } from '../src/theme/elevation';
import { radii } from '../src/theme/radii';
import { layout, spacing } from '../src/theme/spacing';
import { fontFamily, type } from '../src/theme/typography';

describe('design-system tokens (docs/designs/2026-06-10-mobile-design-system.md §2)', () => {
  it('palette is hex-for-hex per Brand Book v1.0 §3/§15 (supersedes §2.1)', () => {
    expect(palette).toEqual({
      ink: '#0F1633', inkCard: '#1E2654', inkInset: '#1A2350',
      cream: '#FBF6EC', creamAlt: '#F4EAD5', card: '#FFFFFF',
      coral: '#FF6F61', coralPressed: '#E85D50',
      yellow: '#FFCC4D', yellowSoft: '#FFE08A',
      teal: '#4ECDC4', cobalt: '#5B7BFF',
      lavender: '#B6A8FF', lavenderSoft: '#D6CCFF',
      pink: '#FF6B9D', pinkSoft: '#FFC2D6',
      success: '#3DC97A', warning: '#FDC700', danger: '#E5503F',
      white: '#FFFFFF', black: '#000000',
    });
  });

  it('lightTheme maps semantics exactly per Brand Book v1.0 §3/§15 (supersedes §2.1)', () => {
    expect(lightTheme).toEqual({
      bg: '#FBF6EC', surface: '#FFFFFF', surfaceAlt: '#F4EAD5', border: 'rgba(15, 22, 51, 0.12)',
      textPrimary: '#0F1633', textSecondary: 'rgba(15, 22, 51, 0.72)',
      textMuted: 'rgba(15, 22, 51, 0.48)', textOnBrand: '#FFFFFF',
      brand: '#FF6F61', brandPressed: '#E85D50', accent: '#5B7BFF', truth: '#4ECDC4',
      dare: '#FF6B9D', xp: '#FFCC4D', success: '#3DC97A', danger: '#E5503F', warning: '#FDC700',
      stickerOutline: '#0F1633', burst: '#FF6B9D',
    });
  });

  it('darkTheme (Night Pop Lite, reserved) keeps the Brand Book v1.0 §3/§15 anchors', () => {
    expect(darkTheme.bg).toBe('#0F1633');
    expect(darkTheme.surface).toBe('#1E2654');
    expect(darkTheme.brand).toBe('#FF6F61');
    expect(darkTheme.textPrimary).toBe('#FBF6EC');
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
