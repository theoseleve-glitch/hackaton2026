import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/shared/models/models.dart';
import 'package:routecore/shared/services/osrm_routing_service.dart';

void main() {
  const lyon = GeoPoint(latitude: 45.7640, longitude: 4.8357);
  const valence = GeoPoint(latitude: 44.9334, longitude: 4.8924);

  // Minimal OSRM /route response: 2 alternatives, GeoJSON [lng, lat].
  final fixture = {
    'code': 'Ok',
    'routes': [
      {
        'distance': 101200.0,
        'duration': 4980.0,
        'geometry': {
          'type': 'LineString',
          'coordinates': [
            [4.8357, 45.7640],
            [4.86, 45.40],
            [4.8924, 44.9334],
          ],
        },
      },
      {
        'distance': 96500.0,
        'duration': 5400.0,
        'geometry': {
          'type': 'LineString',
          'coordinates': [
            [4.8357, 45.7640],
            [4.80, 45.35],
            [4.8924, 44.9334],
          ],
        },
      },
    ],
  };

  group('OsrmRoutingService.parseRoutes', () {
    final service = OsrmRoutingService();

    test('maps fastest/shortest/eco from alternatives', () {
      const request = RouteRequest(origin: lyon, destination: valence);
      final options = service.parseRoutes(fixture, request);

      final fastest =
          options.firstWhere((o) => o.routeMode == RouteMode.fastest);
      final shortest =
          options.firstWhere((o) => o.routeMode == RouteMode.shortest);

      expect(fastest.distanceMeters, 101200);
      expect(fastest.durationSeconds, 4980);
      expect(shortest.distanceMeters, 96500,
          reason: 'shortest picks the min-distance alternative');
      expect(options.every((o) => o.provider == 'osrm'), isTrue);
      expect(options.every((o) => o.estimatedCo2Kg != null), isTrue);
    });

    test('GeoJSON lng,lat is converted to lat,lng polyline and decodes', () {
      const request = RouteRequest(origin: lyon, destination: valence);
      final fastest = service
          .parseRoutes(fixture, request)
          .firstWhere((o) => o.routeMode == RouteMode.fastest);
      final points = service.getRoutePolyline(fastest);
      expect(points.first.latitude, closeTo(45.7640, 1e-6));
      expect(points.first.longitude, closeTo(4.8357, 1e-6));
      expect(points.last.latitude, closeTo(44.9334, 1e-6));
    });

    test('discovery mode adds the most scenic alternative', () {
      const request = RouteRequest(
          origin: lyon, destination: valence, routeMode: RouteMode.discovery);
      final options = service.parseRoutes(fixture, request);
      final discovery =
          options.firstWhere((o) => o.routeMode == RouteMode.discovery);
      expect(discovery.distanceMeters, 101200,
          reason: 'longest alternative = byDistance.last');
    });

    test('empty routes -> empty list (caller falls back to mock)', () {
      const request = RouteRequest(origin: lyon, destination: valence);
      expect(service.parseRoutes({'routes': []}, request), isEmpty);
    });
  });
}
