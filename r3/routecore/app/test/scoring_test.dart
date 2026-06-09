import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/features/scoring/domain/scoring_service.dart';
import 'package:routecore/product_modules/ecodrive/domain/eco_driving_analyzer.dart';
import 'package:routecore/shared/models/models.dart';

Trip _trip() => const Trip(
      id: 't1',
      userId: 'u1',
      origin: GeoPoint(latitude: 45.76, longitude: 4.84),
      destination: GeoPoint(latitude: 45.52, longitude: 4.87),
    );

List<GpsTrackPoint> _track(List<double> speeds) {
  final base = DateTime(2026, 1, 1, 10);
  return [
    for (var i = 0; i < speeds.length; i++)
      GpsTrackPoint(
        id: 'p$i',
        tripId: 't1',
        userId: 'u1',
        latitude: 45.76 - i * 0.002,
        longitude: 4.84,
        speedMps: speeds[i],
        recordedAt: base.add(Duration(seconds: i * 2)),
      ),
  ];
}

void main() {
  group('BasicTripScoringService', () {
    const service = BasicTripScoringService();

    test('few points -> neutral score with advice', () {
      final result = service.scoreTrip(trip: _trip(), trackPoints: const []);
      expect(result.scoreOverall, 50);
      expect(result.adviceText, isNotNull);
    });

    test('steady speed scores higher than erratic speed', () {
      final steady =
          service.scoreTrip(trip: _trip(), trackPoints: _track(List.filled(30, 14)));
      final erratic = service.scoreTrip(
          trip: _trip(),
          trackPoints:
              _track([for (var i = 0; i < 30; i++) i.isEven ? 5.0 : 25.0]));
      expect(steady.scoreOverall, greaterThan(erratic.scoreOverall));
      expect(steady.scoreOverall, inInclusiveRange(0, 100));
      expect(erratic.scoreOverall, inInclusiveRange(0, 100));
    });
  });

  group('EcoDrivingAnalyzer', () {
    test('detects harsh acceleration and braking', () {
      // 0->10 m/s in 2s = +5 m/s2 (harsh accel); 20->10 in 2s = -5 (harsh brake)
      final points = _track([0, 10, 12, 20, 10, 11]);
      final m = const EcoDrivingAnalyzer().analyze(points);
      expect(m.harshAccelerationCount, greaterThanOrEqualTo(1));
      expect(m.harshBrakingCount, greaterThanOrEqualTo(1));
      expect(m.averageSpeed, greaterThan(0));
      expect(m.fuelEstimateLiters, greaterThan(0));
      expect(m.co2EstimateKg, greaterThan(m.fuelEstimateLiters));
    });
  });

  group('BasicEcoDrivingScoringService', () {
    test('smooth driving beats aggressive driving', () {
      const service = BasicEcoDrivingScoringService();
      final smooth = service.scoreTrip(
          trip: _trip(), trackPoints: _track(List.filled(40, 13.5)));
      final aggressive = service.scoreTrip(
          trip: _trip(),
          trackPoints:
              _track([for (var i = 0; i < 40; i++) i % 3 == 0 ? 3.0 : 22.0]));
      expect(smooth.scoreOverall, greaterThan(aggressive.scoreOverall));
      expect(smooth.adviceText, isNotNull);
      expect(aggressive.metrics['harshBrakingCount'], greaterThan(0));
    });
  });
}
