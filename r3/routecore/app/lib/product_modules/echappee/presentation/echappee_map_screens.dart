import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart' show LatLng;

import '../../../app/providers.dart';
import '../../../features/analytics/domain/analytics_repository.dart'
    show AnalyticsEvents;
import '../../../features/routing/presentation/route_planner_controller.dart';
import '../../../shared/models/models.dart';
import '../design_system/design_system.dart';
import '../domain/echappee_itinerary.dart';
import 'echappee_page.dart';

part 'echappee_map_osm.dart';
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
  /// actions) : le carrousel doit la contenir sans déborder. Mesurée avec
  /// les vraies Inter/Fraunces embarquées (plus hautes que les fallbacks).
  static const double _carouselHeight = 396;

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
    final itineraryAsync = ref.watch(echappeeItineraryProvider);
    final itinerary = itineraryAsync.valueOrNull;
    final stops = itinerary?.stops ?? const <PoiAlongRoute>[];
    final pois = [for (final item in stops) item.poi];
    // Numéros de halte dans le sens de la route (1, 2, 3…).
    final stopNumbers = {
      for (var i = 0; i < pois.length; i++) pois[i].id: i + 1,
    };
    final option = _displayOption(planner, itinerary);
    final polyline = option == null
        ? const <GeoPoint>[]
        : ref.read(routingServiceProvider).getRoutePolyline(option);
    return EchappeePage(
      child: Scaffold(
        body: Stack(
          children: [
            Positioned.fill(
              child: _EchappeeOsmMap(
                // Recrée la carte quand la route ou les haltes changent :
                // l'initialCameraFit recadre alors l'ensemble des points.
                key: ValueKey('${option?.id}-${pois.length}'),
                origin: planner.origin!,
                destination: planner.destination!,
                polyline: polyline,
                pois: pois,
                stopNumbers: stopNumbers,
              ),
            ),
            SafeArea(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _MapTopBar(planner: planner),
                  const Spacer(),
                  const Padding(
                    padding: EdgeInsets.only(
                      right: EchappeeSpacing.screen,
                      bottom: EchappeeSpacing.s4,
                    ),
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: Text(
                        '© OpenStreetMap',
                        style: EchappeeTypography.bodySmall,
                      ),
                    ),
                  ),
                  itineraryAsync.when(
                    loading: () => const _MapMessageCard(
                        child: EchappeeLoadingState()),
                    error: (_, __) => const _MapMessageCard(
                      child: Text(
                        'Les haltes se font timides. Réessaie dans un instant.',
                        style: EchappeeTypography.body,
                        textAlign: TextAlign.center,
                      ),
                    ),
                    data: (it) =>
                        _HaltesPanel(items: it?.stops ?? const []),
                  ),
                  const SizedBox(height: EchappeeSpacing.s12),
                  Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: EchappeeSpacing.screen),
                    child: EchappeeButton(
                      label: 'Démarrer la navigation',
                      icon: Icons.navigation_rounded,
                      onPressed: () => _startNavigation(context, ref),
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

  /// Option à tracer : la sélection du planner, sinon l'échappée calculée
  /// (la route qui passe par les haltes), à défaut la première option.
  RouteOption? _displayOption(
      RoutePlannerState planner, EchappeeItinerary? itinerary) {
    final selected = planner.selectedOption;
    if (selected != null) return selected;
    if (itinerary != null) return itinerary.route;
    final options = planner.options.valueOrNull ?? const <RouteOption>[];
    if (options.isEmpty) return null;
    return options.firstWhere(
      (o) => o.routeMode == RouteMode.discovery,
      orElse: () => options.first,
    );
  }

  /// Crée le trajet (journal local) puis lance la navigation guidée
  /// tour-par-tour. Le profil est local et anonyme — pas de compte.
  Future<void> _startNavigation(BuildContext context, WidgetRef ref) async {
    final planner = ref.read(routePlannerProvider);
    final user = ref.read(authControllerProvider).valueOrNull;
    if (user != null) {
      // Journalisation best-effort : la navigation part même si elle échoue.
      try {
        await ref.read(tripRepositoryProvider).createTrip(
              userId: user.id,
              origin: planner.origin!,
              destination: planner.destination!,
              originLabel: planner.originLabel,
              destinationLabel: planner.destinationLabel,
              productContext: ProductContext.terroir,
            );
      } catch (_) {}
    }
    if (context.mounted) context.push('/echappee/navigation');
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
            ? 'Ton échappée passe par 1 halte choisie.'
            : 'Ton échappée passe par ${items.length} haltes choisies.';
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

