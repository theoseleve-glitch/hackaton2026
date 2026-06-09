import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/features/poi/data/poi_repositories.dart';
import 'package:routecore/product_modules/terroir/domain/terroir_relevance_scorer.dart';
import 'package:routecore/shared/models/models.dart';
import 'package:routecore/shared/services/map_search_service.dart';
import 'package:routecore/shared/services/routing_service.dart';

void main() {
  const lyon = GeoPoint(latitude: 45.7640, longitude: 4.8357);
  const valence = GeoPoint(latitude: 44.9334, longitude: 4.8924);

  group('MockRoutingService', () {
    final service = MockRoutingService();

    test('returns fastest/shortest/eco options with metrics', () async {
      final options = await service.getRouteOptions(
          const RouteRequest(origin: lyon, destination: valence));
      expect(options.length, 3);
      expect(options.map((o) => o.routeMode),
          containsAll([RouteMode.fastest, RouteMode.shortest, RouteMode.eco]));
      for (final o in options) {
        expect(o.distanceMeters, greaterThan(0));
        expect(o.durationSeconds, greaterThan(0));
        expect(o.estimatedFuelLiters, isNotNull);
        expect(o.estimatedCo2Kg, isNotNull);
      }
    });

    test('eco option consumes less fuel than fastest', () async {
      final options = await service.getRouteOptions(
          const RouteRequest(origin: lyon, destination: valence));
      final fastest =
          options.firstWhere((o) => o.routeMode == RouteMode.fastest);
      final eco = options.firstWhere((o) => o.routeMode == RouteMode.eco);
      expect(eco.estimatedCo2Kg!, lessThan(fastest.estimatedCo2Kg!));
    });

    test('discovery mode adds a discovery option and polyline decodes',
        () async {
      final options = await service.getRouteOptions(const RouteRequest(
          origin: lyon,
          destination: valence,
          routeMode: RouteMode.discovery));
      final discovery =
          options.firstWhere((o) => o.routeMode == RouteMode.discovery);
      final points = service.getRoutePolyline(discovery);
      expect(points.length, greaterThanOrEqualTo(3));
      expect(points.first, lyon);
      expect(points.last, valence);
    });
  });

  group('MockMapSearchService', () {
    test('finds Lyon by partial query', () async {
      final results = await MockMapSearchService().searchAddress('ly');
      expect(results, isNotEmpty);
      expect(results.first.label, contains('Lyon'));
    });

    test('empty query returns nothing', () async {
      expect(await MockMapSearchService().searchAddress('  '), isEmpty);
    });
  });

  group('MockPoiRepository', () {
    final repo = MockPoiRepository();

    test('nearbyPois respects radius and category filter', () async {
      final near = await repo.nearbyPois(
          const GeoPoint(latitude: 45.62, longitude: 4.82),
          radiusMeters: 5000);
      expect(near.map((p) => p.id), contains('p1'));

      final markets = await repo.nearbyPois(lyon,
          radiusMeters: 500000, categorySlugs: ['market']);
      expect(markets, isNotEmpty);
      expect(markets.every((p) => p.categoryId == 'c2'), isTrue);
    });

    test('poisAlongRoute returns corridor POIs sorted by distance', () async {
      final along = await repo.poisAlongRoute(lyon, valence,
          corridorMeters: 25000);
      expect(along, isNotEmpty);
      for (var i = 1; i < along.length; i++) {
        expect(along[i].distanceFromRouteMeters,
            greaterThanOrEqualTo(along[i - 1].distanceFromRouteMeters));
      }
    });
  });

  group('TerroirRelevanceScorer', () {
    test('preferred categories rank higher; detour cap filters', () {
      const scorer = TerroirRelevanceScorer();
      const poiA = Poi(id: 'a', name: 'A', categoryId: 'c1', latitude: 0, longitude: 0);
      const poiB = Poi(id: 'b', name: 'B', categoryId: 'c2', latitude: 0, longitude: 0);
      final items = [
        const PoiAlongRoute(poi: poiA, distanceFromRouteMeters: 1000, detourMinutesEstimate: 4, relevanceScore: 0),
        const PoiAlongRoute(poi: poiB, distanceFromRouteMeters: 1000, detourMinutesEstimate: 4, relevanceScore: 0),
        const PoiAlongRoute(poi: poiB, distanceFromRouteMeters: 90000, detourMinutesEstimate: 360, relevanceScore: 0),
      ];
      final ranked = scorer.rank(
        items,
        maxDetourMinutes: 20,
        preferredCategorySlugs: ['producer'],
        categorySlugByPoiId: {'a': 'producer', 'b': 'market'},
      );
      expect(ranked.length, 2, reason: 'the 360-min detour is filtered out');
      expect(ranked.first.poi.id, 'a',
          reason: 'preferred category ranks first');
      expect(ranked.first.relevanceScore,
          greaterThan(ranked.last.relevanceScore));
    });
  });
}
