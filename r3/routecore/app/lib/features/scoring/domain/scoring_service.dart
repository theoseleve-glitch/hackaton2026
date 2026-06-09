import '../../../shared/models/models.dart';

/// Result of scoring a finished trip. Generic on purpose — product-specific
/// fields go into [metrics].
class TripScoreResult {
  const TripScoreResult({
    required this.scoreOverall,
    this.adviceText,
    this.metrics = const {},
  });

  final int scoreOverall; // 0..100
  final String? adviceText;
  final Map<String, dynamic> metrics;
}

abstract class ScoringService {
  TripScoreResult scoreTrip({
    required Trip trip,
    required List<GpsTrackPoint> trackPoints,
  });
}

/// Neutral placeholder scoring used by the core TripSummary screen.
/// Looks at duration, distance and speed regularity when tracking exists.
class BasicTripScoringService implements ScoringService {
  const BasicTripScoringService();

  @override
  TripScoreResult scoreTrip({
    required Trip trip,
    required List<GpsTrackPoint> trackPoints,
  }) {
    if (trackPoints.length < 2) {
      return const TripScoreResult(
        scoreOverall: 50,
        adviceText: 'Pas assez de données GPS pour un score précis.',
      );
    }
    final speeds = trackPoints
        .map((p) => p.speedMps)
        .whereType<double>()
        .toList();
    double avg = 0, variance = 0;
    if (speeds.isNotEmpty) {
      avg = speeds.reduce((a, b) => a + b) / speeds.length;
      variance = speeds
              .map((s) => (s - avg) * (s - avg))
              .reduce((a, b) => a + b) /
          speeds.length;
    }
    // Lower speed variance -> steadier driving -> better score.
    final stability = (100 - variance * 4).clamp(0, 100).round();
    final score = ((stability * 0.7) + 30).clamp(0, 100).round();
    return TripScoreResult(
      scoreOverall: score,
      adviceText: score >= 70
          ? 'Conduite régulière, continuez ainsi.'
          : 'Essayez de maintenir une vitesse plus stable.',
      metrics: {
        'averageSpeed': avg,
        'speedVariance': variance,
        'trackPointCount': trackPoints.length,
      },
    );
  }
}
