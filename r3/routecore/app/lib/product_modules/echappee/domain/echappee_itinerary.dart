import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../features/routing/domain/detour_planner.dart';
import '../../../features/routing/presentation/route_planner_controller.dart';
import '../../../shared/models/models.dart';
import '../../terroir/domain/terroir_relevance_scorer.dart';

/// L'échappée calculée : la route qui passe vraiment par les haltes choisies
/// (waypoints OSRM), les haltes dans l'ordre de conduite, et le trajet direct
/// de référence pour le « + X min ».
class EchappeeItinerary {
  const EchappeeItinerary({
    required this.route,
    required this.stops,
    required this.directDurationSeconds,
  });

  /// Route via les haltes quand il y en a, sinon le trajet direct.
  final RouteOption route;

  /// Haltes retenues, ordonnées dans le sens de la route.
  final List<PoiAlongRoute> stops;

  /// Durée du trajet direct le plus rapide — référence du détour.
  final int directDurationSeconds;

  /// Détour réellement consenti (différence de durée mesurée sur la route).
  int get detourMinutes {
    final extra = route.durationSeconds - directDurationSeconds;
    return extra <= 0 ? 0 : (extra / 60).round();
  }
}

/// Pipeline de l'atelier : route directe -> POIs dans le couloir de la VRAIE
/// géométrie -> scoring humeurs -> sélection gloutonne sous budget détour ->
/// re-routage OSRM via les haltes. Recalcule à chaque changement du planner
/// (destination, curseur détour, humeurs).
final echappeeItineraryProvider =
    FutureProvider<EchappeeItinerary?>((ref) async {
  final planner = ref.watch(routePlannerProvider);
  if (!planner.isReady) return null;
  final options = planner.options.valueOrNull;
  if (options == null || options.isEmpty) return null;
  final direct = options.firstWhere(
    (o) => o.routeMode == RouteMode.fastest,
    orElse: () => options.first,
  );

  final routing = ref.read(routingServiceProvider);
  // ~30-50 m de tolérance : ligne identique à l'échelle carte, filtrage et
  // rendu beaucoup plus légers.
  final line = DetourPlanner.simplifyPolyline(
    routing.getRoutePolyline(direct),
    toleranceMeters: 50,
  );

  final budget = planner.maxDetourMinutes ?? 45;
  // Portée latérale : aller-retour à ~30 km/h dans le budget (500 m/min),
  // bornée pour rester pertinente (2 à 15 km du trait).
  final corridor = (budget / 2 * 500).clamp(2000.0, 15000.0);

  final poiRepo = ref.read(poiRepositoryProvider);
  final raw = await poiRepo.poisAlongRoute(
    planner.origin!,
    planner.destination!,
    corridorMeters: corridor,
    categorySlugs: planner.preferredPoiCategories.isEmpty
        ? null
        : planner.preferredPoiCategories,
    routePolyline: line,
  );
  final categories = await poiRepo.getCategories();
  final slugByCategoryId = {for (final c in categories) c.id: c.slug};
  final ranked = const TerroirRelevanceScorer().rank(
    raw,
    maxDetourMinutes: budget,
    preferredCategorySlugs: planner.preferredPoiCategories,
    preferredTags: planner.preferredPoiTags,
    categorySlugByPoiId: {
      for (final item in raw)
        item.poi.id: item.poi.categorySlug ??
            slugByCategoryId[item.poi.categoryId] ??
            ''
    },
  );

  final plan = DetourPlanner.selectStops(
    polyline: line,
    rankedCandidates: ranked,
    budgetMinutes: budget,
  );
  if (plan.stops.isEmpty) {
    return EchappeeItinerary(
      route: direct,
      stops: const [],
      directDurationSeconds: direct.durationSeconds,
    );
  }

  final via = await routing.getRouteVia(
    origin: planner.origin!,
    vias: [for (final stop in plan.stops) stop.poi.point],
    destination: planner.destination!,
  );
  return EchappeeItinerary(
    route: via ?? direct,
    stops: plan.stops,
    directDurationSeconds: direct.durationSeconds,
  );
});
