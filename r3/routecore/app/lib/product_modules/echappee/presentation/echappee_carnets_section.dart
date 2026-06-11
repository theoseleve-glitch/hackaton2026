import 'package:flutter/material.dart';

import '../design_system/design_system.dart';
import '../domain/echappee_carnets.dart';
import 'echappee_page.dart';

/// Section « Carnets de route » de l'atelier : carrousel horizontal
/// d'échappées éditorialisées. [onCarnetTap] préremplit l'atelier
/// (départ, destination, détour, humeurs) puis lance le calcul.
class EchappeeCarnetsSection extends StatelessWidget {
  const EchappeeCarnetsSection({super.key, required this.onCarnetTap});

  final ValueChanged<EchappeeCarnet> onCarnetTap;

  static const double _cardHeight = 190;
  static const double _cardWidth = 240;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const EchappeeEyebrow('Carnets de route'),
        const SizedBox(height: EchappeeSpacing.s12),
        const Text('Des échappées qui ont déjà respiré.',
            style: EchappeeTypography.h2),
        const SizedBox(height: EchappeeSpacing.s20),
        SizedBox(
          height: _cardHeight,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: EchappeeCarnet.all.length,
            separatorBuilder: (_, __) =>
                const SizedBox(width: EchappeeSpacing.s12),
            itemBuilder: (context, index) {
              final carnet = EchappeeCarnet.all[index];
              return _CarnetCard(
                carnet: carnet,
                width: _cardWidth,
                onTap: () => onCarnetTap(carnet),
              );
            },
          ),
        ),
      ],
    );
  }
}

/// Card d'un carnet de route — dégradé doux teinté par le carnet, titre
/// Inter Bold sur deux lignes max et métadonnées (région, détour, arrêts).
class _CarnetCard extends StatelessWidget {
  const _CarnetCard({
    required this.carnet,
    required this.width,
    required this.onTap,
  });

  final EchappeeCarnet carnet;
  final double width;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: width,
        padding: const EdgeInsets.all(EchappeeSpacing.card),
        decoration: BoxDecoration(
          borderRadius: EchappeeRadius.xlAll,
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [carnet.tone, EchappeeColors.primaryTint],
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              carnet.title,
              style: EchappeeTypography.h3,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const Spacer(),
            Text(
              '${carnet.region} · +${carnet.detourMinutes} min · '
              '${carnet.stops} arrêts',
              style: EchappeeTypography.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
