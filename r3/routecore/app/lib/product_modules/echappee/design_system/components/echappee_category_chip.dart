import 'package:flutter/material.dart';

import '../echappee_colors.dart';
import '../echappee_radius.dart';
import '../echappee_spacing.dart';
import '../echappee_typography.dart';

/// Chip de catégorie L'Échappée (Producteurs, Marchés, Villages…).
///
/// Au repos : pill Soft White bordée Warm Stone, icône à la couleur de la
/// catégorie. Sélectionnée : la pill prend la couleur de catégorie, texte et
/// icône passent en Soft White. Transition douce de 180 ms.
class EchappeeCategoryChip extends StatelessWidget {
  const EchappeeCategoryChip({
    super.key,
    required this.label,
    required this.icon,
    this.color = EchappeeColors.nature,
    this.selected = false,
    this.onSelected,
  });

  final String label;
  final IconData icon;
  final Color color;
  final bool selected;
  final ValueChanged<bool>? onSelected;

  static const _duration = Duration(milliseconds: 180);
  static const double _minTouchTarget = 44;
  static const double _iconSize = 18;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(
        begin: selected ? 1 : 0,
        end: selected ? 1 : 0,
      ),
      duration: _duration,
      curve: Curves.easeOut,
      builder: (context, t, _) {
        final background = Color.lerp(EchappeeColors.surface, color, t)!;
        final foreground =
            Color.lerp(EchappeeColors.textPrimary, EchappeeColors.surface, t)!;
        final iconColor = Color.lerp(color, EchappeeColors.surface, t)!;
        final borderColor = Color.lerp(EchappeeColors.border, color, t)!;

        return Semantics(
          button: true,
          selected: selected,
          child: Material(
            color: background,
            shape: RoundedRectangleBorder(
              borderRadius: EchappeeRadius.fullAll,
              side: BorderSide(color: borderColor),
            ),
            child: InkWell(
              customBorder: const RoundedRectangleBorder(
                borderRadius: EchappeeRadius.fullAll,
              ),
              onTap:
                  onSelected == null ? null : () => onSelected!(!selected),
              child: Container(
                constraints:
                    const BoxConstraints(minHeight: _minTouchTarget),
                padding: const EdgeInsets.symmetric(
                  horizontal: EchappeeSpacing.s16,
                  vertical: EchappeeSpacing.s8,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, size: _iconSize, color: iconColor),
                    const SizedBox(width: EchappeeSpacing.s8),
                    Text(
                      label,
                      style: EchappeeTypography.body.copyWith(
                        color: foreground,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
