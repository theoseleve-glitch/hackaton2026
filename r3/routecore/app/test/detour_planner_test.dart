import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/features/routing/domain/detour_planner.dart';
import 'package:routecore/shared/models/models.dart';

PoiAlongRoute _candidate(String id, double lat, double lng, double detourMin,
        {double score = 0.5}) =>
    PoiAlongRoute(
      poi: Poi(
          id: id, name: id, categoryId: 'c1', latitude: lat, longitude: lng),
      distanceFromRouteMeters: detourMin * 500 / 2,
      detourMinutesEstimate: detourMin,
      relevanceScore: score,
    );

void main() {
  // Méridien 4.8°E, du sud au nord — segments de ~55,3 km chacun.
  const line = [
    GeoPoint(latitude: 45.0, longitude: 4.8),
    GeoPoint(latitude: 45.5, longitude: 4.8),
    GeoPoint(latitude: 46.0, longitude: 4.8),
  ];

  group('DetourPlanner geometry', () {
    test('distanceToPolyline measures lateral offset', () {
      const p = GeoPoint(latitude: 45.75, longitude: 4.9);
      // 0.1° de longitude à 45.75° de latitude ≈ 7.77 km.
      expect(DetourPlanner.distanceToPolyline(p, line),
          closeTo(7770, 7770 * 0.02));
    });

    test('point on the line is at ~zero distance', () {
      const p = GeoPoint(latitude: 45.25, longitude: 4.8);
      expect(DetourPlanner.distanceToPolyline(p, line), lessThan(50));
    });

    test('positionAlong orders projections in driving order', () {
      const early = GeoPoint(latitude: 45.1, longitude: 4.85);
      const late = GeoPoint(latitude: 45.9, longitude: 4.75);
      final posEarly = DetourPlanner.positionAlong(early, line);
      final posLate = DetourPlanner.positionAlong(late, line);
      expect(posEarly, lessThan(posLate));
    });

    test('simplifyPolyline drops collinear points, keeps endpoints', () {
      final dense = [
        for (var i = 0; i <= 100; i++)
          GeoPoint(latitude: 45.0 + i * 0.01, longitude: 4.8),
      ];
      final simplified =
          DetourPlanner.simplifyPolyline(dense, toleranceMeters: 30);
      expect(simplified.first, dense.first);
      expect(simplified.last, dense.last);
      expect(simplified.length, lessThan(5),
          reason: 'a straight line collapses to its endpoints');
    });

    test('simplifyPolyline preserves real corners', () {
      const corner = [
        GeoPoint(latitude: 45.0, longitude: 4.8),
        GeoPoint(latitude: 45.5, longitude: 4.8),
        GeoPoint(latitude: 45.5, longitude: 5.5),
      ];
      final simplified =
          DetourPlanner.simplifyPolyline(corner, toleranceMeters: 30);
      expect(simplified.length, 3, reason: 'the bend must survive');
    });
  });

  group('DetourPlanner.selectStops', () {
    test('respects the stop cap for the budget zone', () {
      final candidates = [
        for (var i = 0; i < 6; i++)
          _candidate('p$i', 45.05 + i * 0.15, 4.85, 8),
      ];
      final plan = DetourPlanner.selectStops(
          polyline: line, rankedCandidates: candidates, budgetMinutes: 60);
      expect(plan.stops.length, 4, reason: 'budget 60 -> après-midi -> 4 max');
      expect(plan.detourMinutesEstimate, 32);
    });

    test('never exceeds the detour budget', () {
      final candidates = [
        _candidate('big', 45.1, 4.9, 15),
        _candidate('mid', 45.4, 4.9, 10),
        _candidate('small', 45.8, 4.9, 6),
      ];
      final plan = DetourPlanner.selectStops(
          polyline: line, rankedCandidates: candidates, budgetMinutes: 20);
      expect(plan.stops.map((s) => s.poi.id), ['big'],
          reason: '15 min consommées, 5 restantes: rien ne rentre');
      expect(plan.detourMinutesEstimate, lessThanOrEqualTo(20));
    });

    test('skips stops clustered together', () {
      final candidates = [
        _candidate('a', 45.2, 4.85, 5),
        _candidate('a-twin', 45.201, 4.851, 5), // ~150 m du premier
        _candidate('b', 45.8, 4.85, 5),
      ];
      final plan = DetourPlanner.selectStops(
          polyline: line, rankedCandidates: candidates, budgetMinutes: 60);
      expect(plan.stops.map((s) => s.poi.id), isNot(contains('a-twin')));
      expect(plan.stops.map((s) => s.poi.id), containsAll(['a', 'b']));
    });

    test('returns stops in driving order, not relevance order', () {
      final candidates = [
        // Le plus pertinent est en FIN de route…
        _candidate('north', 45.9, 4.85, 5, score: 0.9),
        // …le second en début de route.
        _candidate('south', 45.1, 4.85, 5, score: 0.8),
      ];
      final plan = DetourPlanner.selectStops(
          polyline: line, rankedCandidates: candidates, budgetMinutes: 60);
      expect(plan.stops.map((s) => s.poi.id), ['south', 'north'],
          reason: 'ordre de conduite sud -> nord');
    });

    test('empty candidates -> empty plan', () {
      final plan = DetourPlanner.selectStops(
          polyline: line, rankedCandidates: const [], budgetMinutes: 45);
      expect(plan.stops, isEmpty);
      expect(plan.detourMinutesEstimate, 0);
    });
  });
}
