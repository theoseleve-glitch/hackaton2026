import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../features/analytics/domain/analytics_repository.dart'
    show AnalyticsEvents;
import '../../../features/routing/presentation/route_planner_controller.dart';
import '../../../shared/models/models.dart';
import '../../terroir/presentation/terroir_screens.dart';
import '../design_system/design_system.dart';
import 'echappee_page.dart';

part 'echappee_map_poi_detail.dart';

/// Style d'affichage d'une catégorie de halte : label, icône, couleur token.
class _CategoryStyle {
  const _CategoryStyle(this.label, this.icon, this.color);

  final String label;
  final IconData icon;
  final Color color;
}

const _categoryStyles = <String, _CategoryStyle>{
  'producer': _CategoryStyle(
      'Producteurs', Icons.agriculture, EchappeeColors.categoryProducteurs),
  'market': _CategoryStyle(
      'Marchés', Icons.storefront, EchappeeColors.categoryMarches),
  'village':
      _CategoryStyle('Villages', Icons.church, EchappeeColors.categoryVillages),
  'artisan': _CategoryStyle(
      'Artisans', Icons.handyman, EchappeeColors.categoryArtisans),
  'viewpoint': _CategoryStyle(
      'Points de vue', Icons.landscape, EchappeeColors.categoryPointsDeVue),
  'restaurant': _CategoryStyle(
      'Bonnes tables', Icons.restaurant, EchappeeColors.categoryBonnesTables),
  'nature': _CategoryStyle('Nature', Icons.park, EchappeeColors.categoryNature),
  'event': _CategoryStyle(
      'Événements', Icons.celebration, EchappeeColors.categoryEvenements),
};

const _defaultCategoryStyle =
    _CategoryStyle('Halte locale', Icons.place, EchappeeColors.nature);

_CategoryStyle _styleFor(String? slug) =>
    _categoryStyles[slug] ?? _defaultCategoryStyle;

/// Tronque un texte long pour garder les cards du carrousel compactes.
String? _clip(String? text, {int max = 72}) {
  if (text == null || text.length <= max) return text;
  return '${text.substring(0, max).trimRight()}…';
}

/// Raccourci d'adresse pour le pill du haut : « Lyon, Rhône… » -> « Lyon ».
String _shortPlace(String? label) {
  if (label == null || label.trim().isEmpty) return '…';
  final head = label.split(',').first.trim();
  return head.length <= 18 ? head : '${head.substring(0, 17).trimRight()}…';
}

/// Carte stylisée L'Échappée : la route respire sur un fond crème, les
/// haltes choisies à la main défilent en bas, prêtes pour le départ.
class EchappeeMapScreen extends ConsumerWidget {
  const EchappeeMapScreen({super.key});

  static const double _poiCardWidth = 280;

  /// L'EchappeePoiCard a une hauteur intrinsèque (image 140 + contenu +
  /// actions) : le carrousel doit la contenir sans déborder.
  static const double _carouselHeight = 372;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final planner = ref.watch(routePlannerProvider);
    if (!planner.isReady) {
      return EchappeePage(
        child: Scaffold(
          body: EchappeeEmptyState(
            title: "Choisis d'abord une destination.",
            message: 'La carte se dessine dès que tu sais où tu vas.',
            actionLabel: 'Retour',
            onAction: () => context.go('/echappee/home'),
            icon: Icons.map_outlined,
          ),
        ),
      );
    }
    final rankedAsync = ref.watch(terroirRankedPoisProvider);
    final selected = planner.selectedOption;
    final polyline = selected == null
        ? const <GeoPoint>[]
        : ref.read(routingServiceProvider).getRoutePolyline(selected);
    return EchappeePage(
      child: Scaffold(
        body: Stack(
          children: [
            Positioned.fill(
              child: CustomPaint(
                painter: _EchappeeMapPainter(
                  origin: planner.origin,
                  destination: planner.destination,
                  polyline: polyline,
                  pois: [
                    for (final item in rankedAsync.valueOrNull ??
                        const <PoiAlongRoute>[])
                      item.poi,
                  ],
                ),
              ),
            ),
            SafeArea(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _MapTopBar(planner: planner),
                  const Spacer(),
                  rankedAsync.when(
                    loading: () => const _MapMessageCard(
                        child: EchappeeLoadingState()),
                    error: (_, __) => const _MapMessageCard(
                      child: Text(
                        'Les haltes se font timides. Réessaie dans un instant.',
                        style: EchappeeTypography.body,
                        textAlign: TextAlign.center,
                      ),
                    ),
                    data: (items) => _HaltesPanel(items: items),
                  ),
                  const SizedBox(height: EchappeeSpacing.s12),
                  Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: EchappeeSpacing.screen),
                    child: EchappeeButton(
                      label: 'Démarrer',
                      icon: Icons.navigation_rounded,
                      onPressed: () => _startTrip(context, ref),
                    ),
                  ),
                  const SizedBox(height: EchappeeSpacing.s16),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _startTrip(BuildContext context, WidgetRef ref) async {
    final planner = ref.read(routePlannerProvider);
    final user = ref.read(authControllerProvider).valueOrNull;
    if (user == null) return;
    final trip = await ref.read(tripRepositoryProvider).createTrip(
          userId: user.id,
          origin: planner.origin!,
          destination: planner.destination!,
          originLabel: planner.originLabel,
          destinationLabel: planner.destinationLabel,
          productContext: ProductContext.terroir,
        );
    if (context.mounted) context.push('/tracking/${trip.id}');
  }
}

/// Rangée du haut : retour, pill du trajet, badge de détour accepté.
class _MapTopBar extends StatelessWidget {
  const _MapTopBar({required this.planner});

  final RoutePlannerState planner;

  @override
  Widget build(BuildContext context) {
    final detour = planner.maxDetourMinutes;
    return Padding(
      padding: const EdgeInsets.fromLTRB(EchappeeSpacing.screen,
          EchappeeSpacing.s12, EchappeeSpacing.screen, 0),
      child: Row(
        children: [
          const _CircleBackButton(),
          const SizedBox(width: EchappeeSpacing.s12),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: EchappeeSpacing.s16,
                vertical: EchappeeSpacing.s12,
              ),
              decoration: const BoxDecoration(
                color: EchappeeColors.surface,
                borderRadius: EchappeeRadius.fullAll,
                boxShadow: EchappeeShadows.sm,
              ),
              child: Text(
                '${_shortPlace(planner.originLabel)} → '
                '${_shortPlace(planner.destinationLabel)}',
                style: EchappeeTypography.body
                    .copyWith(fontWeight: FontWeight.w600),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
            ),
          ),
          if (detour != null) ...[
            const SizedBox(width: EchappeeSpacing.s12),
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: EchappeeSpacing.s12,
                vertical: EchappeeSpacing.s8,
              ),
              decoration: const BoxDecoration(
                color: EchappeeColors.primaryTint,
                borderRadius: EchappeeRadius.fullAll,
              ),
              child: Text(
                '+$detour min',
                style: EchappeeTypography.caption.copyWith(
                  color: EchappeeColors.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Titre + carrousel des haltes trouvées le long de la route.
class _HaltesPanel extends StatelessWidget {
  const _HaltesPanel({required this.items});

  final List<PoiAlongRoute> items;

  @override
  Widget build(BuildContext context) {
    final title = items.isEmpty
        ? 'Aucune halte sur ce tronçon — la route est à toi.'
        : items.length == 1
            ? 'On a trouvé 1 halte sur ta route.'
            : 'On a trouvé ${items.length} haltes sur ta route.';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding:
              const EdgeInsets.symmetric(horizontal: EchappeeSpacing.screen),
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: EchappeeSpacing.card,
              vertical: EchappeeSpacing.s12,
            ),
            decoration: const BoxDecoration(
              color: EchappeeColors.surface,
              borderRadius: EchappeeRadius.xlAll,
              boxShadow: EchappeeShadows.md,
            ),
            child: Text(title, style: EchappeeTypography.h3),
          ),
        ),
        if (items.isNotEmpty) ...[
          const SizedBox(height: EchappeeSpacing.s12),
          SizedBox(
            height: EchappeeMapScreen._carouselHeight,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(
                  horizontal: EchappeeSpacing.screen),
              itemCount: items.length,
              itemBuilder: (context, i) {
                final item = items[i];
                final style = _styleFor(item.poi.categorySlug);
                return Padding(
                  padding:
                      const EdgeInsets.only(right: EchappeeSpacing.s16),
                  child: SizedBox(
                    width: EchappeeMapScreen._poiCardWidth,
                    child: EchappeePoiCard(
                      name: item.poi.name,
                      category: style.label,
                      imageUrl: item.poi.imageUrl,
                      detourLabel:
                          '+${item.detourMinutesEstimate.round()} min de détour',
                      reason: _clip(item.poi.description),
                      isPartner: item.poi.isSponsored,
                      categoryColor: style.color,
                      onTap: () =>
                          context.push('/echappee/poi/${item.poi.id}'),
                      onAddToRoute: () =>
                          context.push('/echappee/poi/${item.poi.id}'),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ],
    );
  }
}

/// Petite card centrée pour les états de chargement / erreur du carrousel.
class _MapMessageCard extends StatelessWidget {
  const _MapMessageCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: EchappeeSpacing.screen),
      child: Container(
        padding: const EdgeInsets.all(EchappeeSpacing.s24),
        decoration: const BoxDecoration(
          color: EchappeeColors.surface,
          borderRadius: EchappeeRadius.xlAll,
          boxShadow: EchappeeShadows.md,
        ),
        child: child,
      ),
    );
  }
}

/// Bouton retour circulaire flottant, commun aux deux écrans.
class _CircleBackButton extends StatelessWidget {
  const _CircleBackButton({this.fallbackRoute = '/echappee/home'});

  final String fallbackRoute;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: EchappeeColors.surface,
        shape: BoxShape.circle,
        boxShadow: EchappeeShadows.sm,
      ),
      child: IconButton(
        tooltip: 'Retour',
        icon: const Icon(Icons.arrow_back_rounded,
            color: EchappeeColors.textPrimary),
        onPressed: () {
          if (context.canPop()) {
            context.pop();
          } else {
            context.go(fallbackRoute);
          }
        },
      ),
    );
  }
}

