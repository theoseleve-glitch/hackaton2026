import 'package:flutter/material.dart';

import '../echappee_colors.dart';
import '../echappee_radius.dart';
import '../echappee_shadows.dart';
import '../echappee_spacing.dart';
import '../echappee_typography.dart';

/// Une option de détour proposée au voyageur.
class EchappeeDetourOption {
  const EchappeeDetourOption({
    required this.title,
    required this.subtitle,
    this.minutes,
  });

  final String title;
  final String subtitle;

  /// Durée du détour en minutes — null pour le mode surprise.
  final int? minutes;

  /// Les quatre respirations proposées par défaut.
  static const presets = [
    EchappeeDetourOption(
      title: '10 min',
      subtitle: 'Une petite respiration',
      minutes: 10,
    ),
    EchappeeDetourOption(
      title: '25 min',
      subtitle: 'Je prends le temps',
      minutes: 25,
    ),
    EchappeeDetourOption(
      title: '45 min',
      subtitle: 'Je pars en échappée',
      minutes: 45,
    ),
    EchappeeDetourOption(
      title: 'Surprends-moi',
      subtitle: 'Laisse-toi guider',
    ),
  ];
}

/// Composant signature de L'Échappée : la card de choix de détour.
/// « Combien de temps as-tu envie de prendre ? »
class EchappeeDetourCard extends StatelessWidget {
  const EchappeeDetourCard({
    super.key,
    required this.option,
    this.selected = false,
    this.onTap,
  });

  final EchappeeDetourOption option;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: '${option.title}, ${option.subtitle}',
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
        decoration: BoxDecoration(
          color:
              selected ? EchappeeColors.primaryTint : EchappeeColors.surface,
          borderRadius: EchappeeRadius.xlAll,
          border: Border.all(
            color: selected ? EchappeeColors.primary : EchappeeColors.border,
            width: selected ? 1.5 : 1,
          ),
          boxShadow: EchappeeShadows.sm,
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: EchappeeRadius.xlAll,
            child: Padding(
              padding: const EdgeInsets.all(EchappeeSpacing.cardLoose),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(option.title, style: EchappeeTypography.h3),
                  const SizedBox(height: EchappeeSpacing.s4),
                  Text(option.subtitle, style: EchappeeTypography.bodySmall),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
