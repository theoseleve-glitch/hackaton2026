import 'package:flutter/material.dart';

import '../echappee_colors.dart';
import '../echappee_radius.dart';
import '../echappee_spacing.dart';
import '../echappee_typography.dart';

/// Variantes du bouton L'Échappée.
enum EchappeeButtonVariant { primary, secondary, tertiary }

/// Bouton du design system L'Échappée.
///
/// - [EchappeeButtonVariant.primary] : CTA Clay Red, hauteur 54.
/// - [EchappeeButtonVariant.secondary] : fond Soft White bordé, hauteur 52.
/// - [EchappeeButtonVariant.tertiary] : texte seul Clay Red.
///
/// Cible tactile garantie >= 44 px sur toutes les variantes.
class EchappeeButton extends StatelessWidget {
  const EchappeeButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = EchappeeButtonVariant.primary,
    this.icon,
    this.loading = false,
    this.expanded = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final EchappeeButtonVariant variant;
  final IconData? icon;
  final bool loading;
  final bool expanded;

  static const double _primaryHeight = 54;
  static const double _secondaryHeight = 52;
  static const double _minTouchTarget = 44;
  static const double _iconSize = 20;
  static const double _spinnerSize = 18;
  static const double _spinnerStroke = 2;

  bool get _isEnabled => onPressed != null && !loading;

  VoidCallback? get _effectiveOnPressed => _isEnabled ? onPressed : null;

  @override
  Widget build(BuildContext context) {
    final button = switch (variant) {
      EchappeeButtonVariant.primary => _buildPrimary(),
      EchappeeButtonVariant.secondary => _buildSecondary(),
      EchappeeButtonVariant.tertiary => _buildTertiary(),
    };
    if (!expanded) return button;
    return SizedBox(width: double.infinity, child: button);
  }

  Widget _buildPrimary() {
    return FilledButton(
      onPressed: _effectiveOnPressed,
      style: ButtonStyle(
        backgroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) {
            return EchappeeColors.disabled;
          }
          if (states.contains(WidgetState.pressed)) {
            return EchappeeColors.primaryPressed;
          }
          return EchappeeColors.primary;
        }),
        foregroundColor:
            const WidgetStatePropertyAll(EchappeeColors.surface),
        overlayColor: const WidgetStatePropertyAll(Colors.transparent),
        textStyle: const WidgetStatePropertyAll(EchappeeTypography.button),
        minimumSize: const WidgetStatePropertyAll(
          Size(_minTouchTarget, _primaryHeight),
        ),
        padding: const WidgetStatePropertyAll(
          EdgeInsets.symmetric(horizontal: EchappeeSpacing.s24),
        ),
        shape: const WidgetStatePropertyAll(
          RoundedRectangleBorder(borderRadius: EchappeeRadius.lgAll),
        ),
        elevation: const WidgetStatePropertyAll(0),
      ),
      child: _content(EchappeeColors.surface),
    );
  }

  Widget _buildSecondary() {
    return OutlinedButton(
      onPressed: _effectiveOnPressed,
      style: ButtonStyle(
        backgroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.pressed)) {
            return EchappeeColors.primaryTint;
          }
          return EchappeeColors.surface;
        }),
        foregroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) {
            return EchappeeColors.disabled;
          }
          return EchappeeColors.textPrimary;
        }),
        overlayColor: const WidgetStatePropertyAll(Colors.transparent),
        side: const WidgetStatePropertyAll(
          BorderSide(color: EchappeeColors.border),
        ),
        textStyle: const WidgetStatePropertyAll(EchappeeTypography.button),
        minimumSize: const WidgetStatePropertyAll(
          Size(_minTouchTarget, _secondaryHeight),
        ),
        padding: const WidgetStatePropertyAll(
          EdgeInsets.symmetric(horizontal: EchappeeSpacing.s24),
        ),
        shape: const WidgetStatePropertyAll(
          RoundedRectangleBorder(borderRadius: EchappeeRadius.lgAll),
        ),
      ),
      child: _content(EchappeeColors.textPrimary),
    );
  }

  Widget _buildTertiary() {
    return TextButton(
      onPressed: _effectiveOnPressed,
      style: ButtonStyle(
        foregroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) {
            return EchappeeColors.disabled;
          }
          if (states.contains(WidgetState.pressed)) {
            return EchappeeColors.primaryPressed;
          }
          return EchappeeColors.primary;
        }),
        overlayColor: const WidgetStatePropertyAll(Colors.transparent),
        textStyle: const WidgetStatePropertyAll(EchappeeTypography.button),
        minimumSize: const WidgetStatePropertyAll(
          Size(_minTouchTarget, EchappeeSpacing.s48),
        ),
        padding: const WidgetStatePropertyAll(
          EdgeInsets.symmetric(horizontal: EchappeeSpacing.s16),
        ),
        shape: const WidgetStatePropertyAll(
          RoundedRectangleBorder(borderRadius: EchappeeRadius.lgAll),
        ),
      ),
      child: _content(EchappeeColors.primary),
    );
  }

  /// Contenu du bouton : spinner en chargement, sinon icône + libellé.
  Widget _content(Color foreground) {
    if (loading) {
      return SizedBox(
        width: _spinnerSize,
        height: _spinnerSize,
        child: CircularProgressIndicator(
          strokeWidth: _spinnerStroke,
          color: foreground,
        ),
      );
    }
    if (icon == null) return Text(label);
    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, size: _iconSize),
        const SizedBox(width: EchappeeSpacing.s8),
        Text(label, overflow: TextOverflow.ellipsis),
      ],
    );
  }
}
