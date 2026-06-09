import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/product_modules/ecodrive/domain/eco_driving_analyzer.dart';
import 'package:routecore/product_modules/ecodrive/domain/eco_scoring_engine.dart';
import 'package:routecore/product_modules/ecodrive/domain/eco_vehicle_type.dart';
import 'package:routecore/product_modules/ecodrive/domain/fuel_co2_estimator.dart';
import 'package:routecore/shared/models/models.dart';

/// Builds a synthetic GPS trace from a list of speeds (m/s). Points are spaced
/// [latStep]° of latitude apart and [dtSeconds] seconds apart. Deterministic.
List<GpsTrackPoint> _track(
  List<double> speeds, {
  double latStep = 0.001,
  int dtSeconds = 2,
}) {
  final base = DateTime.utc(2026, 1, 1, 10);
  return [
    for (var i = 0; i < speeds.length; i++)
      GpsTrackPoint(
        id: 'p$i',
        tripId: 't1',
        userId: 'u1',
        latitude: 45.76 - i * latStep,
        longitude: 4.84,
        speedMps: speeds[i],
        recordedAt: base.add(Duration(seconds: i * dtSeconds)),
      ),
  ];
}

void main() {
  group('EcoVehicleProfile', () {
    test('canonical baselines', () {
      expect(EcoVehicleProfile.of(EcoVehicleType.petrol).baseConsumptionL100km,
          7.0);
      expect(EcoVehicleProfile.of(EcoVehicleType.diesel).co2KgPerLiter, 2.68);
      final ev = EcoVehicleProfile.of(EcoVehicleType.electric);
      expect(ev.baseConsumptionL100km, 0);
      expect(ev.kwhPer100km, 18);
    });

    test('fromName falls back to petrol', () {
      expect(EcoVehicleType.fromName('diesel'), EcoVehicleType.diesel);
      expect(EcoVehicleType.fromName('unknown'), EcoVehicleType.petrol);
      expect(EcoVehicleType.fromName(null), EcoVehicleType.petrol);
    });
  });

  group('FuelCo2Estimator', () {
    const estimator = FuelCo2Estimator();

    test('petrol consumes more than hybrid on the same leg', () {
      final petrol = estimator.estimateForRoute(
          vehicle: EcoVehicleType.petrol,
          distanceMeters: 10000,
          durationSeconds: 600);
      final hybrid = estimator.estimateForRoute(
          vehicle: EcoVehicleType.hybrid,
          distanceMeters: 10000,
          durationSeconds: 600);
      expect(petrol.fuelLiters, greaterThan(hybrid.fuelLiters));
    });

    test('electric burns no liquid fuel but emits grid CO2', () {
      final ev = estimator.estimateForRoute(
          vehicle: EcoVehicleType.electric,
          distanceMeters: 10000,
          durationSeconds: 600);
      expect(ev.fuelLiters, 0);
      expect(ev.co2Kg, greaterThan(0));
      expect(ev.kwh, isNotNull);
      expect(ev.kwh!, greaterThan(0));
    });

    test('fuel grows with distance at constant speed', () {
      final short = estimator.estimateForRoute(
          vehicle: EcoVehicleType.petrol,
          distanceMeters: 10000,
          durationSeconds: 600);
      final long = estimator.estimateForRoute(
          vehicle: EcoVehicleType.petrol,
          distanceMeters: 20000,
          durationSeconds: 1200);
      expect(long.fuelLiters, greaterThan(short.fuelLiters));
    });

    test('annotate fills the route option fuel/CO2 fields', () {
      const opt = RouteOption(
        id: 'x',
        origin: GeoPoint(latitude: 45.76, longitude: 4.84),
        destination: GeoPoint(latitude: 45.50, longitude: 4.80),
        polyline: '',
        distanceMeters: 12000,
        durationSeconds: 720,
        routeMode: RouteMode.eco,
        provider: 'mock',
      );
      final annotated = estimator.annotate(opt, EcoVehicleType.petrol);
      expect(annotated.estimatedFuelLiters, isNotNull);
      expect(annotated.estimatedFuelLiters!, greaterThan(0));
      expect(annotated.estimatedCo2Kg!, greaterThan(0));
    });
  });

  group('EcoScoringEngine', () {
    const engine = EcoScoringEngine();

    test('too few points -> neutral score', () {
      final r = engine.score(const EcoScoringInput(points: []));
      expect(r.overall, 100);
      expect(r.speedCompliance, isNull);
    });

    test('smooth driving scores high with no harsh events', () {
      final r = engine.score(EcoScoringInput(points: _track(List.filled(20, 14))));
      expect(r.harshAccelerationCount, 0);
      expect(r.harshBrakingCount, 0);
      expect(r.overall, greaterThan(80));
      expect(r.overall, inInclusiveRange(0, 100));
    });

    test('aggressive driving is detected and scores lower', () {
      final smooth =
          engine.score(EcoScoringInput(points: _track(List.filled(20, 14))));
      final aggressive = engine.score(EcoScoringInput(
          points: _track([for (var i = 0; i < 20; i++) i.isEven ? 3.0 : 22.0])));
      expect(aggressive.harshBrakingCount, greaterThan(0));
      expect(aggressive.harshAccelerationCount, greaterThan(0));
      expect(aggressive.overall, lessThan(smooth.overall));
      expect(aggressive.overall, inInclusiveRange(0, 100));
    });

    test('speed compliance is null without limits and scored with them', () {
      final noLimits =
          engine.score(EcoScoringInput(points: _track(List.filled(10, 14))));
      expect(noLimits.speedCompliance, isNull);

      final speeding = engine.score(EcoScoringInput(
        points: _track(List.filled(10, 30)), // 108 km/h
        speedLimitsKmh: List.filled(10, 90),
      ));
      expect(speeding.speedCompliance, isNotNull);
      expect(speeding.speedCompliance!, lessThan(100));
    });
  });

  group('EcoScoringResult.advice', () {
    test('weakest sub-score drives the advice', () {
      const r = EcoScoringResult(
        overall: 60,
        acceleration: 30,
        braking: 90,
        speedStability: 90,
        routeEfficiency: 90,
        speedCompliance: null,
        harshAccelerationCount: 5,
        harshBrakingCount: 0,
        speedVariance: 1,
        avgSpeedMps: 10,
        distanceMeters: 1000,
        durationSeconds: 100,
      );
      expect(r.advice, contains('Accélérez'));
    });

    test('excellent overall returns a positive message', () {
      const r = EcoScoringResult(
        overall: 92,
        acceleration: 95,
        braking: 95,
        speedStability: 90,
        routeEfficiency: 88,
        speedCompliance: null,
        harshAccelerationCount: 0,
        harshBrakingCount: 0,
        speedVariance: 0.2,
        avgSpeedMps: 14,
        distanceMeters: 5000,
        durationSeconds: 400,
      );
      expect(r.advice, contains('Excellente'));
    });
  });

  group('BasicEcoDrivingScoringService', () {
    test('exposes the upgraded metrics keys', () {
      const service = BasicEcoDrivingScoringService();
      final result = service.scoreTrip(
        trip: const Trip(
          id: 't1',
          userId: 'u1',
          origin: GeoPoint(latitude: 45.76, longitude: 4.84),
          destination: GeoPoint(latitude: 45.52, longitude: 4.87),
        ),
        trackPoints: _track(List.filled(30, 13.5)),
      );
      expect(result.metrics['scoreRouteEfficiency'], isA<int>());
      expect(result.metrics['estimatedFuelSavedLiters'], isA<double>());
      expect(result.metrics['vehicleType'], 'petrol');
    });

    test('electric vehicle reports zero fuel but a kWh estimate', () {
      const service =
          BasicEcoDrivingScoringService(vehicle: EcoVehicleType.electric);
      final result = service.scoreTrip(
        trip: const Trip(
          id: 't1',
          userId: 'u1',
          origin: GeoPoint(latitude: 45.76, longitude: 4.84),
          destination: GeoPoint(latitude: 45.52, longitude: 4.87),
        ),
        trackPoints: _track(List.filled(30, 13.5)),
      );
      expect(result.metrics['fuelEstimate'], 0);
      expect(result.metrics['kwhEstimate'], isNotNull);
    });
  });
}
