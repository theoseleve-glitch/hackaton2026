import 'dart:math' as math;

import '../../../core/constants/app_constants.dart';
import '../../../features/scoring/domain/scoring_service.dart';
import '../../../shared/models/models.dart';

/// EcoDrive-specific analysis of a GPS track. Detects harsh accelerations
/// and braking, speed regularity, and estimates fuel/CO2. Pure function —
/// fully unit-testable.
class EcoDrivingMetrics {
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

  final int harshAccelerationCount;
  final int harshBrakingCount;
  final double averageSpeed; // m/s
  final double speedVariance;
  final double distanceMeters;
  final double fuelEstimateLiters;
  final double co2EstimateKg;
  final int speedingDurationSeconds; // needs speed-limit data — placeholder
  final double? elevationGain;
}

class EcoDrivingAnalyzer {
  const EcoDrivingAnalyzer({
    this.harshAccelThresholdMps2 = 2.5,
    this.harshBrakeThresholdMps2 = -3.0,
  });

  final double harshAccelThresholdMps2;
  final double harshBrakeThresholdMps2;

  EcoDrivingMetrics analyze(List<GpsTrackPoint> points) {
    var harshAccel = 0, harshBrake = 0;
    var distance = 0.0;
    final speeds = <double>[];

    for (var i = 0; i < points.length; i++) {
      final s = points[i].speedMps;
      if (s != null) speeds.add(s);
      if (i == 0) continue;
      distance += points[i - 1].point.distanceTo(points[i].point);
      final prev = points[i - 1].speedMps;
      final dt = points[i]
          .recordedAt
          .difference(points[i - 1].recordedAt)
          .inMilliseconds /
          1000.0;
      if (prev != null && s != null && dt > 0) {
        final accel = (s - prev) / dt;
        if (accel >= harshAccelThresholdMps2) harshAccel++;
        if (accel <= harshBrakeThresholdMps2) harshBrake++;
      }
    }

    var avg = 0.0, variance = 0.0;
    if (speeds.isNotEmpty) {
      avg = speeds.reduce((a, b) => a + b) / speeds.length;
      variance =
          speeds.map((s) => math.pow(s - avg, 2) as double).reduce((a, b) => a + b) /
              speeds.length;
    }

    // Consumption penalty for jerky driving (very rough heuristic).
    const basePer100 = AppConstants.defaultFuelLitersPer100Km;
    final jerkPenalty = 1 + (harshAccel + harshBrake) * 0.01;
    final fuel = distance / 1000 * basePer100 / 100 * jerkPenalty;

    return EcoDrivingMetrics(
      harshAccelerationCount: harshAccel,
      harshBrakingCount: harshBrake,
      averageSpeed: avg,
      speedVariance: variance,
      distanceMeters: distance,
      fuelEstimateLiters: double.parse(fuel.toStringAsFixed(2)),
      co2EstimateKg: double.parse(
          (fuel * AppConstants.co2KgPerFuelLiter).toStringAsFixed(2)),
    );
  }
}

/// Eco-driving score /100 + main advice, built on EcoDrivingAnalyzer.
class BasicEcoDrivingScoringService implements ScoringService {
  const BasicEcoDrivingScoringService(
      [this.analyzer = const EcoDrivingAnalyzer()]);

  final EcoDrivingAnalyzer analyzer;

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
    final m = analyzer.analyze(trackPoints);
    final km = math.max(m.distanceMeters / 1000, 0.5);

    final accelScore =
        (100 - (m.harshAccelerationCount / km) * 25).clamp(0, 100).round();
    final brakeScore =
        (100 - (m.harshBrakingCount / km) * 25).clamp(0, 100).round();
    final stabilityScore = (100 - m.speedVariance * 4).clamp(0, 100).round();
    final overall =
        ((accelScore + brakeScore + stabilityScore * 2) / 4).round();

    String advice;
    if (accelScore <= brakeScore && accelScore <= stabilityScore) {
      advice = 'Accélérez plus progressivement pour économiser du carburant.';
    } else if (brakeScore <= stabilityScore) {
      advice = 'Anticipez davantage pour éviter les freinages brusques.';
    } else if (overall < 80) {
      advice = 'Maintenez une vitesse plus régulière (régulateur conseillé).';
    } else {
      advice = 'Excellente conduite souple — continuez ainsi !';
    }

    return TripScoreResult(
      scoreOverall: overall,
      adviceText: advice,
      metrics: {
        'harshAccelerationCount': m.harshAccelerationCount,
        'harshBrakingCount': m.harshBrakingCount,
        'averageSpeed': m.averageSpeed,
        'speedVariance': m.speedVariance,
        'fuelEstimate': m.fuelEstimateLiters,
        'co2Estimate': m.co2EstimateKg,
        'scoreAcceleration': accelScore,
        'scoreBraking': brakeScore,
        'scoreSpeedStability': stabilityScore,
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
