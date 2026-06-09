import '../../../features/scoring/domain/scoring_service.dart';
import '../../../shared/models/models.dart';
import 'eco_scoring_engine.dart';
import 'eco_vehicle_type.dart';
import 'fuel_co2_estimator.dart';

/// EcoDrive-specific summary of a GPS track: harsh events, speed regularity and
/// an (approximate) fuel/CO2 estimate. Thin compatibility wrapper over
/// [EcoScoringEngine] + [FuelCo2Estimator] — pure and unit-testable.
class EcoDrivingMetrics {
  /// Creates a metrics bundle.
  const EcoDrivingMetrics({
    required this.harshAccelerationCount,
    required this.harshBrakingCount,
    required this.averageSpeed,
    required this.speedVariance,
    required this.distanceMeters,
    required this.fuelEstimateLiters,
    required this.co2EstimateKg,
    this.speedingDurationSeconds = 0,
    this.elevationGain,
  });

  /// Harsh acceleration events (`a > +2.0 m/s²`).
  final int harshAccelerationCount;

  /// Harsh braking events (`a < -2.5 m/s²`).
  final int harshBrakingCount;

  /// Mean speed across the trip, in m/s.
  final double averageSpeed;

  /// Variance of per-segment speeds, in (m/s)².
  final double speedVariance;

  /// Total driven distance, in metres.
  final double distanceMeters;

  /// Estimated fuel consumed, in litres (0 for electric).
  final double fuelEstimateLiters;

  /// Estimated CO2 emitted, in kilograms.
  final double co2EstimateKg;

  /// Seconds spent over the speed limit — requires speed-limit data (0 until
  /// then). Placeholder for a future map-matched implementation.
  final int speedingDurationSeconds;

  /// Optional cumulative elevation gain in metres (null until altitude is used).
  final double? elevationGain;
}

/// Computes [EcoDrivingMetrics] from a GPS track.
///
/// Delegates harsh-event detection and speed statistics to [EcoScoringEngine]
/// and fuel/CO2 to [FuelCo2Estimator] for [vehicle], so there is a single
/// source of truth for the eco maths.
class EcoDrivingAnalyzer {
  /// Creates an analyzer. Defaults estimate fuel for a petrol vehicle.
  const EcoDrivingAnalyzer({
    this.engine = const EcoScoringEngine(),
    this.estimator = const FuelCo2Estimator(),
    this.vehicle = EcoVehicleType.petrol,
  });

  /// The scoring engine that detects harsh events and computes speed stats.
  final EcoScoringEngine engine;

  /// The fuel/CO2 estimator.
  final FuelCo2Estimator estimator;

  /// Vehicle type used for the fuel/CO2 estimate.
  final EcoVehicleType vehicle;

  /// Analyses [points] into an [EcoDrivingMetrics] bundle.
  EcoDrivingMetrics analyze(List<GpsTrackPoint> points) {
    final r = engine.score(EcoScoringInput(points: points));
    final est = estimator.estimateForRoute(
      vehicle: vehicle,
      distanceMeters: r.distanceMeters.round(),
      durationSeconds: r.durationSeconds,
    );
    return EcoDrivingMetrics(
      harshAccelerationCount: r.harshAccelerationCount,
      harshBrakingCount: r.harshBrakingCount,
      averageSpeed: r.avgSpeedMps,
      speedVariance: r.speedVariance,
      distanceMeters: r.distanceMeters,
      fuelEstimateLiters: double.parse(est.fuelLiters.toStringAsFixed(2)),
      co2EstimateKg: double.parse(est.co2Kg.toStringAsFixed(2)),
    );
  }
}

/// Eco-driving [ScoringService]: turns a finished trip's GPS trace into a
/// `/100` score, one actionable advice, and a rich `metrics` map.
///
/// This is the EcoDrive plug-in for the platform's scoring extension point. It
/// is selected by `scoringServiceProvider` when the product mode is EcoDrive.
class BasicEcoDrivingScoringService implements ScoringService {
  /// Creates the service. [vehicle] drives the fuel/CO2 estimate.
  const BasicEcoDrivingScoringService({
    this.vehicle = EcoVehicleType.petrol,
    this.engine = const EcoScoringEngine(),
    this.estimator = const FuelCo2Estimator(),
  });

  /// Vehicle type used for fuel/CO2 estimation.
  final EcoVehicleType vehicle;

  /// The pure scoring engine.
  final EcoScoringEngine engine;

  /// The fuel/CO2 estimator.
  final FuelCo2Estimator estimator;

  @override
  TripScoreResult scoreTrip({
    required Trip trip,
    required List<GpsTrackPoint> trackPoints,
  }) {
    if (trackPoints.length < 2) {
      return const TripScoreResult(
        scoreOverall: 50,
        adviceText: 'Trajet trop court pour une analyse écoconduite.',
      );
    }

    final r = engine.score(EcoScoringInput(points: trackPoints));
    final est = estimator.estimateForRoute(
      vehicle: vehicle,
      distanceMeters: r.distanceMeters.round(),
      durationSeconds: r.durationSeconds,
    );

    // APPROX: smoother driving is credited up to ~15% savings versus an
    // aggressive baseline, scaled by the overall score. Not a measured figure.
    final savedFraction = (r.overall / 100.0) * 0.15;
    final fuelSaved = est.fuelLiters * savedFraction;
    final co2Saved = est.co2Kg * savedFraction;

    return TripScoreResult(
      scoreOverall: r.overall,
      adviceText: r.advice,
      metrics: {
        // Existing keys (kept stable for the dashboard + tests).
        'harshAccelerationCount': r.harshAccelerationCount,
        'harshBrakingCount': r.harshBrakingCount,
        'averageSpeed': r.avgSpeedMps,
        'speedVariance': r.speedVariance,
        'fuelEstimate': double.parse(est.fuelLiters.toStringAsFixed(2)),
        'co2Estimate': double.parse(est.co2Kg.toStringAsFixed(2)),
        'scoreAcceleration': r.acceleration,
        'scoreBraking': r.braking,
        'scoreSpeedStability': r.speedStability,
        // New keys from the upgraded 5-component engine.
        'scoreRouteEfficiency': r.routeEfficiency,
        'scoreSpeedCompliance': r.speedCompliance,
        'distanceMeters': r.distanceMeters,
        'durationSeconds': r.durationSeconds,
        'estimatedFuelSavedLiters':
            double.parse(fuelSaved.toStringAsFixed(2)),
        'estimatedCo2SavedKg': double.parse(co2Saved.toStringAsFixed(2)),
        'vehicleType': vehicle.name,
        if (est.kwh != null) ...{
          'kwhEstimate': double.parse(est.kwh!.toStringAsFixed(2)),
          'estimatedKwhSavedKwh':
              double.parse((est.kwh! * savedFraction).toStringAsFixed(2)),
        },
      },
    );
  }
}

/// Placeholder discovery scoring for Terroir (counts POIs visited later).
class BasicDiscoveryScoringService implements ScoringService {
  @override
  TripScoreResult scoreTrip({
    required Trip trip,
    required List<GpsTrackPoint> trackPoints,
  }) =>
      const TripScoreResult(
        scoreOverall: 60,
        adviceText: 'Score découverte — à enrichir avec les POI visités.',
      );
}
