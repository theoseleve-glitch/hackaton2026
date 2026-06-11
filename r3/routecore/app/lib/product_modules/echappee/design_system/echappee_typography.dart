import 'package:flutter/material.dart';

import 'echappee_colors.dart';

/// L'Échappée type scale. Fraunces porte l'émotion (onboarding, moments
/// forts), Inter porte la clarté (UI, navigation, métadonnées).
///
/// Les polices sont embarquées (assets/fonts, statiques Google Fonts OFL,
/// déclarées dans pubspec.yaml) ; les fallbacks serif/sans-serif système
/// restent en filet de sécurité.
abstract final class EchappeeTypography {
  static const headingFont = 'Fraunces';
  static const bodyFont = 'Inter';

  static const _headingFallback = ['Georgia', 'Times New Roman', 'serif'];
  static const _bodyFallback = ['Segoe UI', 'Roboto', 'sans-serif'];

  /// Display 40/46 Fraunces SemiBold — landing, hero.
  static const display = TextStyle(
    fontFamily: headingFont,
    fontFamilyFallback: _headingFallback,
    fontSize: 40,
    height: 46 / 40,
    fontWeight: FontWeight.w600,
    color: EchappeeColors.textPrimary,
  );

  /// H1 32/38 Fraunces SemiBold — onboarding, écrans clés.
  static const h1 = TextStyle(
    fontFamily: headingFont,
    fontFamilyFallback: _headingFallback,
    fontSize: 32,
    height: 38 / 32,
    fontWeight: FontWeight.w600,
    color: EchappeeColors.textPrimary,
  );

  /// H2 26/32 Fraunces SemiBold — titres de section.
  static const h2 = TextStyle(
    fontFamily: headingFont,
    fontFamilyFallback: _headingFallback,
    fontSize: 26,
    height: 32 / 26,
    fontWeight: FontWeight.w600,
    color: EchappeeColors.textPrimary,
  );

  /// H3 20/26 Inter Bold — cards, sections d'écran.
  static const h3 = TextStyle(
    fontFamily: bodyFont,
    fontFamilyFallback: _bodyFallback,
    fontSize: 20,
    height: 26 / 20,
    fontWeight: FontWeight.w700,
    color: EchappeeColors.textPrimary,
  );

  /// Body L 17/25 Inter Regular — paragraphes.
  static const bodyLarge = TextStyle(
    fontFamily: bodyFont,
    fontFamilyFallback: _bodyFallback,
    fontSize: 17,
    height: 25 / 17,
    fontWeight: FontWeight.w400,
    color: EchappeeColors.textPrimary,
  );

  /// Body 15/22 Inter Regular — UI principale.
  static const body = TextStyle(
    fontFamily: bodyFont,
    fontFamilyFallback: _bodyFallback,
    fontSize: 15,
    height: 22 / 15,
    fontWeight: FontWeight.w400,
    color: EchappeeColors.textPrimary,
  );

  /// Body S 13/18 Inter Regular — métadonnées.
  static const bodySmall = TextStyle(
    fontFamily: bodyFont,
    fontFamilyFallback: _bodyFallback,
    fontSize: 13,
    height: 18 / 13,
    fontWeight: FontWeight.w400,
    color: EchappeeColors.textSecondary,
  );

  /// Caption 12/16 Inter Medium — badges, labels.
  static const caption = TextStyle(
    fontFamily: bodyFont,
    fontFamilyFallback: _bodyFallback,
    fontSize: 12,
    height: 16 / 12,
    fontWeight: FontWeight.w500,
    color: EchappeeColors.textSecondary,
  );

  /// Button 16/20 Inter SemiBold — CTA.
  static const button = TextStyle(
    fontFamily: bodyFont,
    fontFamilyFallback: _bodyFallback,
    fontSize: 16,
    height: 20 / 16,
    fontWeight: FontWeight.w600,
    color: EchappeeColors.surface,
  );
}
