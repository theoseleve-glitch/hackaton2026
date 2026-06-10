import 'package:flutter/material.dart';

import '../echappee_colors.dart';
import '../echappee_radius.dart';
import '../echappee_shadows.dart';
import '../echappee_spacing.dart';
import '../echappee_typography.dart';

/// Bottom sheet L'Échappée — un panneau qui se pose doucement sur la carte.
/// Fond Soft White, haut arrondi, poignée de drag discrète, ombre douce.
///
/// Usage direct (`EchappeeBottomSheet(child: ...)`) ou via le helper
/// [EchappeeBottomSheet.show] qui passe par [showModalBottomSheet].
class EchappeeBottomSheet extends StatelessWidget {
  const EchappeeBottomSheet({super.key, required this.child, this.title});

  /// Contenu du panneau.
  final Widget child;

  /// Titre optionnel, affiché sous la poignée de drag.
  final String? title;

  /// Ouvre le panneau en modal et retourne la valeur passée à `pop`.
  static Future<T?> show<T>(
    BuildContext context, {
    required Widget child,
    String? title,
    bool isScrollControlled = true,
  }) {
    return showModalBottomSheet<T>(
      context: context,
      isScrollControlled: isScrollControlled,
      backgroundColor: Colors.transparent,
      barrierColor: EchappeeColors.darkOverlay,
      builder: (sheetContext) => Padding(
        // Laisse le clavier repousser le panneau (champs de recherche, etc.).
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(sheetContext).bottom,
        ),
        child: EchappeeBottomSheet(title: title, child: child),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final title = this.title;
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: EchappeeColors.surface,
        borderRadius: EchappeeRadius.xlTop,
        boxShadow: EchappeeShadows.lg,
      ),
      padding: const EdgeInsets.all(EchappeeSpacing.cardLoose),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Center(child: _DragHandle()),
            const SizedBox(height: EchappeeSpacing.s16),
            if (title != null) ...[
              Text(title, style: EchappeeTypography.h3),
              const SizedBox(height: EchappeeSpacing.s12),
            ],
            child,
          ],
        ),
      ),
    );
  }
}

/// Poignée de drag — pill 40 x 4, couleur Warm Stone.
class _DragHandle extends StatelessWidget {
  const _DragHandle();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: EchappeeSpacing.s40,
      height: EchappeeSpacing.s4,
      decoration: const BoxDecoration(
        color: EchappeeColors.border,
        borderRadius: EchappeeRadius.fullAll,
      ),
    );
  }
}
