import 'dart:math' as math;

import '../../../shared/models/models.dart';

/// Immutable input bundle for [EcoScoringEngine.score].
class EcoScoringInput {
  /// Creates a scoring input. [points] may be unsorted (the engine sorts).
  const EcoScoringInput({
    required this.points,
    this.speedLimitsKmh,
    this.plannedRoute,
  });

  /// The recorded GPS trace for the trip.
  final List<GpsTrackPoint> points;

  /// Optional speed limits in km/h aligned index-for-index with [points]. When
  /// `null`, the speed-compliance sub-score is omitted and its weight is
  /// renormalised away.
  final List<int>? speedLimitsKmh;

  /// Optional planned route used to score route efficiency (planned distance vs
  /// driven distance). When `null`, a stop-and-go heuristic is used instead.
  final RouteOption? plannedRoute;
}

/// Result of an eco-driving evaluation: overall score, sub-scores, diagnostics.
///
/// All scores are integers in `[0, 100]` (higher is better). See
/// `docs/ECODRIVE.md`.
class EcoScoringResult {
  /// Creates an eco-scoring result.
  const EcoScoringResult({
    required this.overall,
    required this.acceleration,
    required this.braking,
    required this.speedStability,
    required this.routeEfficiency,
    required this.speedCompliance,
    required this.harshAccelerationCount,
    required this.harshBrakingCount,
    required this.speedVariance,
    required this.avgSpeedMps,
    required this.distanceMeters,
    required this.durationSeconds,
  });

  /// Weighted overall eco-driving score, `[0, 100]`.
  final int overall;

  /// Acceleration smoothness sub-score, `[0, 100]`.
  final int acceleration;

  /// Braking smoothness sub-score, `[0, 100]`.
  final int braking;

  /// Speed-stability sub-score (steadier speed scores higher), `[0, 100]`.
  final int speedStability;

  /// Route-efficiency sub-score, `[0, 100]`.
  final int routeEfficiency;

  /// Speed-limit compliance sub-score, `[0, 100]`, or `null` when no limits
  /// were supplied.
  final int? speedCompliance;

  /// Harsh acceleration events detected (`a > +2.0 m/s²`).
  final int harshAccelerationCount;

  /// Harsh braking events detected (`a < -2.5 m/s²`).
  final int harshBrakingCount;

  /// Variance of per-segment speeds, in (m/s)².
  final double speedVariance;

  /// Mean speed across the trip, in m/s.
  final double avgSpeedMps;

  /// Total driven distance, in metres.
  final double distanceMeters;

  /// Total tracked duration (sum of valid segment intervals), in seconds.
  final int durationSeconds;

  /// One short French advice based on the weakest sub-score (positive message
  /// when [overall] `>= 85`). See `docs/ECODRIVE.md`.
  String get advice {
    if (overall >= 85) return 'Excellente conduite, continuez ainsi !';
    final candidates = <String, int>{
      'acceleration': acceleration,
      'braking': braking,
      'stability': speedStability,
      'route': routeEfficiency,
      if (speedCompliance != null) 'compliance': speedCompliance!,
    };
    var weakestKey = candidates.keys.first;
    var weakestValue = candidates[weakestKey]!;
    candidates.forEach((key, value) {
      if (value < weakestValue) {
        weakestValue = value;
        weakestKey = key;
      }
    });
    return switch (weakestKey) {
      'acceleration' =>
        'Accélérez plus progressivement pour économiser du carburant.',
      'braking' => 'Anticipez le trafic pour freiner moins brusquement.',
      'stability' =>
        'Maintenez une vitesse plus régulière pour réduire la consommation.',
      'route' =>
        "L'itinéraire éco était un peu plus long mais probablement plus sobre.",
      'compliance' => 'Évitez les pointes de vitesse inutiles.',
      _ => 'Excellente conduite, continuez ainsi !',
    };
  }
}

/// Pure eco-driving scoring engine.
///
/// Turns a GPS trace into an [EcoScoringResult] by deriving per-segment speed
/// and acceleration, counting harsh events, measuring speed stability, and
/// (optionally) route efficiency and speed-limit compliance. No Flutter, no
/// I/O — fully unit-testable. See `docs/ECODRIVE.md` for the full spec.
class EcoScoringEngine {
  /// Creates a stateless scoring engine.
  const EcoScoringEngine();

  /// Max gap between consecutive points (s); larger gaps are treated as a
  /// recording break and skipped to avoid spurious acceleration.
  static const double _maxGapSeconds = 30.0;

  /// Harsh acceleration threshold in m/s².
  static const double _harshAccel = 2.0;

  /// Harsh braking threshold in m/s² (negative).
  static const double _harshBrake = -2.5;

  /// Sub-score weights; renormalised when a component is absent.
  static const double _wAccel = 0.25;
  static const double _wBrake = 0.25;
  static const double _wStability = 0.20;
  static const double _wRouteEff = 0.20;
  static const double _wCompliance = 0.10;

  /// Speed (m/s) below which the vehicle is considered stopped (stop-and-go).
  static const double _stoppedMps = 2.0;

  int _clamp0to100(double v) => v.clamp(0, 100).round();

  /// Scores the given [input], returning sub-scores and diagnostics.
  EcoScoringResult score(EcoScoringInput input) {
    final pts = List<GpsTrackPoint>.from(input.points)
      ..sort((a, b) => a.recordedAt.compareTo(b.recordedAt));

    if (pts.length < 2) {
      // Not enough data to judge: neutral-perfect on derived metrics.
      return const EcoScoringResult(
        overall: 100,
        acceleration: 100,
        braking: 100,
        speedStability: 100,
        routeEfficiency: 100,
        speedCompliance: null,
        harshAccelerationCount: 0,
        harshBrakingCount: 0,
        speedVariance: 0,
        avgSpeedMps: 0,
        distanceMeters: 0,
        durationSeconds: 0,
      );
    }

    final speeds = <double>[];
    var totalMeters = 0.0;
    var totalSeconds = 0.0;
    var overLimitSeconds = 0.0;
    var harshAccel = 0;
    var harshBrake = 0;
    var stopGoTransitions = 0;
    var wasStopped = false;

    final limits = input.speedLimitsKmh;
    final hasLimits = limits != null && limits.length == pts.length;

    double? prevSpeed;

    for (var i = 1; i < pts.length; i++) {
      final a = pts[i - 1];
      final b = pts[i];
      final dt =
          b.recordedAt.difference(a.recordedAt).inMilliseconds / 1000.0;
      if (dt <= 0 || dt > _maxGapSeconds) {
        prevSpeed = null; // recording gap: reset acceleration continuity
        continue;
      }

      final segMeters = a.point.distanceTo(b.point);
      totalMeters += segMeters;
      totalSeconds += dt;

      // Prefer the device-reported speed; otherwise derive from distance/time.
      final v = b.speedMps ?? (segMeters / dt);
      speeds.add(v);

      if (prevSpeed != null) {
        final acc = (v - prevSpeed) / dt;
        if (acc > _harshAccel) harshAccel++;
        if (acc < _harshBrake) harshBrake++;
      }
      prevSpeed = v;

      final isStopped = v < _stoppedMps;
      if (wasStopped && !isStopped) stopGoTransitions++;
      wasStopped = isStopped;

      if (hasLimits) {
        final limitKmh = limits[i];
        if (limitKmh > 0 && v * 3.6 > limitKmh) overLimitSeconds += dt;
      }
    }

    final km = totalMeters / 1000.0;
    final safeKm = km <= 0 ? 1e-9 : km;

    final mean =
        speeds.isEmpty ? 0.0 : speeds.reduce((s, e) => s + e) / speeds.length;
    var variance = 0.0;
    if (speeds.length > 1) {
      for (final s in speeds) {
        variance += (s - mean) * (s - mean);
      }
      variance /= speeds.length;
    }
    final cov = mean <= 0.01 ? 0.0 : math.sqrt(variance) / mean;

    final acceleration = _clamp0to100(100 - 12 * (harshAccel / safeKm));
    final braking = _clamp0to100(100 - 14 * (harshBrake / safeKm));
    final speedStability = _clamp0to100(100 - 120 * cov);

    final int routeEfficiency;
    final planned = input.plannedRoute;
    if (planned != null && totalMeters > 0) {
      final ratio = (planned.distanceMeters / totalMeters).clamp(0.0, 1.0);
      routeEfficiency = _clamp0to100(100 * ratio);
    } else {
      routeEfficiency = _clamp0to100(100 - 8 * (stopGoTransitions / safeKm));
    }

    int? speedCompliance;
    if (hasLimits && totalSeconds > 0) {
      speedCompliance =
          _clamp0to100(100 - 200 * (overLimitSeconds / totalSeconds));
    }

    final entries = <MapEntry<double, int>>[
      MapEntry(_wAccel, acceleration),
      MapEntry(_wBrake, braking),
      MapEntry(_wStability, speedStability),
      MapEntry(_wRouteEff, routeEfficiency),
      if (speedCompliance != null) MapEntry(_wCompliance, speedCompliance),
    ];
    var weightSum = 0.0;
    var weighted = 0.0;
    for (final e in entries) {
      weightSum += e.key;
      weighted += e.key * e.value;
    }
    final overall = weightSum <= 0 ? 0 : (weighted / weightSum).round();

    return EcoScoringResult(
      overall: overall.clamp(0, 100),
      acceleration: acceleration,
      braking: braking,
      speedStability: speedStability,
      routeEfficiency: routeEfficiency,
      speedCompliance: speedCompliance,
      harshAccelerationCount: harshAccel,
      harshBrakingCount: harshBrake,
      speedVariance: variance,
      avgSpeedMps: mean,
      distanceMeters: totalMeters,
      durationSeconds: totalSeconds.round(),
    );
  }
}
