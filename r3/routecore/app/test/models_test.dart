import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/shared/models/models.dart';

void main() {
  group('GeoPoint', () {
    test('distance Lyon-Valence is roughly 93 km as the crow flies', () {
      const lyon = GeoPoint(latitude: 45.7640, longitude: 4.8357);
      const valence = GeoPoint(latitude: 44.9334, longitude: 4.8924);
      final d = lyon.distanceTo(valence);
      expect(d, greaterThan(85000));
      expect(d, lessThan(100000));
    });
  });

  group('RouteOption json round-trip', () {
    test('serializes and deserializes', () {
      const origin = GeoPoint(latitude: 45.0, longitude: 4.0);
      const dest = GeoPoint(latitude: 44.0, longitude: 5.0);
      const option = RouteOption(
        id: 'r1',
        origin: origin,
        destination: dest,
        polyline: '45.0,4.0;44.0,5.0',
        distanceMeters: 120000,
        durationSeconds: 4800,
        estimatedFuelLiters: 7.8,
        estimatedCo2Kg: 18.0,
        routeMode: RouteMode.eco,
        provider: 'mock',
        metadata: {'polylineFormat': 'latlng-list'},
      );
      final decoded = RouteOption.fromJson(option.toJson());
      expect(decoded.id, 'r1');
      expect(decoded.routeMode, RouteMode.eco);
      expect(decoded.distanceMeters, 120000);
      expect(decoded.estimatedCo2Kg, 18.0);
      expect(decoded.origin, origin);
    });
  });

  group('RouteRequest', () {
    test('copyWith preserves unset fields', () {
      const req = RouteRequest(
        origin: GeoPoint(latitude: 1, longitude: 2),
        destination: GeoPoint(latitude: 3, longitude: 4),
        routeMode: RouteMode.discovery,
        maxDetourMinutes: 20,
      );
      final updated = req.copyWith(maxDetourMinutes: 45);
      expect(updated.routeMode, RouteMode.discovery);
      expect(updated.maxDetourMinutes, 45);
      expect(updated.origin.latitude, 1);
    });
  });
}
