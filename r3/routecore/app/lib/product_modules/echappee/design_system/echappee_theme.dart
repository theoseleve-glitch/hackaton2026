import 'package:flutter/material.dart';

import 'echappee_colors.dart';
import 'echappee_radius.dart';
import 'echappee_spacing.dart';
import 'echappee_typography.dart';

/// ThemeData L'Échappée. Appliqué aux écrans du module (wrap via Theme) sans
/// toucher au thème core RouteCore — la neutralité du core est préservée.
abstract final class EchappeeTheme {
  static ThemeData light() {
    const colorScheme = ColorScheme.light(
      primary: EchappeeColors.primary,
      onPrimary: EchappeeColors.surface,
      secondary: EchappeeColors.nature,
      onSecondary: EchappeeColors.surface,
      tertiary: EchappeeColors.accent,
      surface: EchappeeColors.surface,
      onSurface: EchappeeColors.textPrimary,
      error: EchappeeColors.error,
      onError: EchappeeColors.surface,
      outline: EchappeeColors.border,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: EchappeeColors.background,
      cardColor: EchappeeColors.surface,
      dividerColor: EchappeeColors.border,
      disabledColor: EchappeeColors.disabled,
      textTheme: const TextTheme(
        displayLarge: EchappeeTypography.display,
        headlineLarge: EchappeeTypography.h1,
        headlineMedium: EchappeeTypography.h2,
        titleLarge: EchappeeTypography.h3,
        bodyLarge: EchappeeTypography.bodyLarge,
        bodyMedium: EchappeeTypography.body,
        bodySmall: EchappeeTypography.bodySmall,
        labelSmall: EchappeeTypography.caption,
        labelLarge: EchappeeTypography.button,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: EchappeeColors.background,
        foregroundColor: EchappeeColors.textPrimary,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: EchappeeTypography.h2,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: EchappeeColors.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: EchappeeSpacing.s16,
          vertical: EchappeeSpacing.s16,
        ),
        border: const OutlineInputBorder(
          borderRadius: EchappeeRadius.lgAll,
          borderSide: BorderSide(color: EchappeeColors.border),
        ),
        enabledBorder: const OutlineInputBorder(
          borderRadius: EchappeeRadius.lgAll,
          borderSide: BorderSide(color: EchappeeColors.border),
        ),
        focusedBorder: const OutlineInputBorder(
          borderRadius: EchappeeRadius.lgAll,
          borderSide: BorderSide(color: EchappeeColors.primary, width: 1.5),
        ),
        hintStyle: EchappeeTypography.body
            .copyWith(color: EchappeeColors.textSecondary),
      ),
      chipTheme: const ChipThemeData(
        backgroundColor: EchappeeColors.surface,
        selectedColor: EchappeeColors.primary,
        labelStyle: EchappeeTypography.body,
        side: BorderSide(color: EchappeeColors.border),
        shape: StadiumBorder(),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: EchappeeColors.surface,
        shape: RoundedRectangleBorder(borderRadius: EchappeeRadius.xlTop),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: EchappeeColors.textPrimary,
        contentTextStyle:
            EchappeeTypography.body.copyWith(color: EchappeeColors.surface),
        behavior: SnackBarBehavior.floating,
        shape: const RoundedRectangleBorder(borderRadius: EchappeeRadius.mdAll),
      ),
    );
  }
}
