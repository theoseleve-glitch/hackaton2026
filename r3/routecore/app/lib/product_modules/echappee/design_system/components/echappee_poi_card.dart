import 'package:flutter/material.dart';

import '../echappee_colors.dart';
import '../echappee_radius.dart';
import '../echappee_shadows.dart';
import '../echappee_spacing.dart';
import '../echappee_typography.dart';
import 'echappee_partner_badge.dart';

/// Card de point d'intérêt : une halte proposée le long de la route.
/// Image en haut, nom, catégorie, statut d'ouverture, coût du détour,
/// raison de la suggestion et actions (favori, ajout à la route).
class EchappeePoiCard extends StatelessWidget {
  const EchappeePoiCard({
    super.key,
    required this.name,
    required this.category,
    this.imageUrl,
    this.isOpen,
    this.detourLabel,
    this.reason,
    this.isPartner = false,
    this.categoryColor = EchappeeColors.nature,
    this.onTap,
    this.onFavorite,
    this.onAddToRoute,
  });

  final String name;
  final String category;
  final String? imageUrl;
  final bool? isOpen;

  /// Ex. '+8 min de détour · 1,4 km de ta route'.
  final String? detourLabel;

  /// Pourquoi cette halte est proposée, en une phrase chaleureuse.
  final String? reason;
  final bool isPartner;
  final Color categoryColor;
  final VoidCallback? onTap;
  final VoidCallback? onFavorite;
  final VoidCallback? onAddToRoute;

  static const double _imageHeight = 140;

  @override
  Widget build(BuildContext context) {
    final url = imageUrl;
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: EchappeeColors.surface,
        borderRadius: EchappeeRadius.xlAll,
        boxShadow: EchappeeShadows.md,
      ),
      child: ClipRRect(
        borderRadius: EchappeeRadius.xlAll,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Stack(
                  children: [
                    SizedBox(
                      height: _imageHeight,
                      width: double.infinity,
                      child: url != null
                          ? Image.network(
                              url,
                              fit: BoxFit.cover,
                              errorBuilder: (context, error, stackTrace) =>
                                  const _PoiImagePlaceholder(),
                            )
                          : const _PoiImagePlaceholder(),
                    ),
                    if (isPartner)
                      const Positioned(
                        top: EchappeeSpacing.s12,
                        left: EchappeeSpacing.s12,
                        child: EchappeePartnerBadge(),
                      ),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.all(EchappeeSpacing.card),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(name, style: EchappeeTypography.h3),
                      const SizedBox(height: EchappeeSpacing.s4),
                      _CategoryLine(
                        category: category,
                        categoryColor: categoryColor,
                        isOpen: isOpen,
                      ),
                      if (detourLabel != null) ...[
                        const SizedBox(height: EchappeeSpacing.s8),
                        Text(detourLabel!, style: EchappeeTypography.bodySmall),
                      ],
                      if (reason != null) ...[
                        const SizedBox(height: EchappeeSpacing.s8),
                        Text(reason!, style: EchappeeTypography.body),
                      ],
                      const SizedBox(height: EchappeeSpacing.s16),
                      Row(
                        children: [
                          IconButton(
                            onPressed: onFavorite,
                            tooltip: 'Ajouter aux favoris',
                            icon: const Icon(
                              Icons.favorite_border_rounded,
                              color: EchappeeColors.textSecondary,
                            ),
                            constraints: const BoxConstraints(
                              minWidth: 44,
                              minHeight: 44,
                            ),
                          ),
                          const SizedBox(width: EchappeeSpacing.s8),
                          Expanded(
                            child: TextButton(
                              onPressed: onAddToRoute,
                              style: TextButton.styleFrom(
                                backgroundColor: EchappeeColors.primary,
                                foregroundColor: EchappeeColors.surface,
                                disabledBackgroundColor:
                                    EchappeeColors.disabled,
                                minimumSize: const Size(44, 48),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: EchappeeSpacing.s16,
                                  vertical: EchappeeSpacing.s12,
                                ),
                                shape: const RoundedRectangleBorder(
                                  borderRadius: EchappeeRadius.lgAll,
                                ),
                                textStyle: EchappeeTypography.button,
                              ),
                              child: const Text('Ajouter à ma route'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Placeholder doux quand le lieu n'a pas encore de photo.
class _PoiImagePlaceholder extends StatelessWidget {
  const _PoiImagePlaceholder();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: EchappeeColors.primaryTint,
      child: Center(
        child: Icon(
          Icons.route_rounded,
          size: 32,
          color: EchappeeColors.primary,
        ),
      ),
    );
  }
}

/// Ligne catégorie + statut d'ouverture, en couleurs de tokens.
class _CategoryLine extends StatelessWidget {
  const _CategoryLine({
    required this.category,
    required this.categoryColor,
    required this.isOpen,
  });

  final String category;
  final Color categoryColor;
  final bool? isOpen;

  @override
  Widget build(BuildContext context) {
    final open = isOpen;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: Text(
            category,
            overflow: TextOverflow.ellipsis,
            style: EchappeeTypography.caption.copyWith(color: categoryColor),
          ),
        ),
        if (open != null) ...[
          const Text(' · ', style: EchappeeTypography.caption),
          Text(
            open ? 'Ouvert' : 'Fermé',
            style: EchappeeTypography.caption.copyWith(
              color: open
                  ? EchappeeColors.statusOpen
                  : EchappeeColors.statusClosed,
            ),
          ),
        ],
      ],
    );
  }
}
