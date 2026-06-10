import 'package:flutter/material.dart';

import '../echappee_colors.dart';
import '../echappee_radius.dart';
import '../echappee_spacing.dart';
import '../echappee_typography.dart';

/// Badge « Partenaire local » — honnête et visible, jamais caché.
/// Signale tout contenu sponsorisé de façon explicite et apaisée.
class EchappeePartnerBadge extends StatelessWidget {
  const EchappeePartnerBadge({super.key, this.label = 'Partenaire local'});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Contenu sponsorisé : $label',
      child: DecoratedBox(
        decoration: const BoxDecoration(
          color: EchappeeColors.accentTint,
          borderRadius: EchappeeRadius.fullAll,
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: EchappeeSpacing.s8,
            vertical: EchappeeSpacing.s4,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.verified_rounded,
                size: 14,
                color: EchappeeColors.accent,
              ),
              const SizedBox(width: EchappeeSpacing.s4),
              Text(
                label,
                style: EchappeeTypography.caption
                    .copyWith(color: EchappeeColors.textPrimary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
