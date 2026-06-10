import 'package:flutter/material.dart';

import '../echappee_colors.dart';
import '../echappee_radius.dart';
import '../echappee_spacing.dart';
import '../echappee_typography.dart';

/// État vide L'Échappée — un moment calme, jamais un constat d'échec.
///
/// Exemple de copy :
/// ```dart
/// EchappeeEmptyState(
///   title: 'Pas encore de belle halte ici.',
///   message: "Essaie d'élargir ton détour ou de changer de catégorie.",
///   actionLabel: 'Élargir le détour',
///   onAction: () {},
/// )
/// ```
class EchappeeEmptyState extends StatelessWidget {
  const EchappeeEmptyState({
    super.key,
    required this.title,
    this.message,
    this.actionLabel,
    this.onAction,
    this.icon = Icons.route,
  });

  /// Titre en Fraunces — porte l'émotion.
  final String title;

  /// Message d'accompagnement, ton doux.
  final String? message;

  /// Libellé du bouton secondaire ; rien n'est affiché s'il est null.
  final String? actionLabel;

  /// Action du bouton secondaire.
  final VoidCallback? onAction;

  /// Icône douce affichée dans un cercle teinté.
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final message = this.message;
    final actionLabel = this.actionLabel;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(EchappeeSpacing.section),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DecoratedBox(
              decoration: const BoxDecoration(
                color: EchappeeColors.primaryTint,
                shape: BoxShape.circle,
              ),
              child: Padding(
                padding: const EdgeInsets.all(EchappeeSpacing.s24),
                child: Icon(
                  icon,
                  size: EchappeeSpacing.s48,
                  color: EchappeeColors.textSecondary,
                ),
              ),
            ),
            const SizedBox(height: EchappeeSpacing.s24),
            Text(
              title,
              style: EchappeeTypography.h2,
              textAlign: TextAlign.center,
            ),
            if (message != null) ...[
              const SizedBox(height: EchappeeSpacing.s8),
              Text(
                message,
                style: EchappeeTypography.body
                    .copyWith(color: EchappeeColors.textSecondary),
                textAlign: TextAlign.center,
              ),
            ],
            if (actionLabel != null) ...[
              const SizedBox(height: EchappeeSpacing.s24),
              TextButton(
                onPressed: onAction,
                style: TextButton.styleFrom(
                  backgroundColor: EchappeeColors.surface,
                  foregroundColor: EchappeeColors.textPrimary,
                  // Cible tactile >= 44 px.
                  minimumSize:
                      const Size(EchappeeSpacing.s48, EchappeeSpacing.s48),
                  padding: const EdgeInsets.symmetric(
                    horizontal: EchappeeSpacing.s24,
                    vertical: EchappeeSpacing.s12,
                  ),
                  shape: const RoundedRectangleBorder(
                    borderRadius: EchappeeRadius.lgAll,
                    side: BorderSide(color: EchappeeColors.border),
                  ),
                  textStyle: EchappeeTypography.button,
                ),
                child: Text(actionLabel),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
