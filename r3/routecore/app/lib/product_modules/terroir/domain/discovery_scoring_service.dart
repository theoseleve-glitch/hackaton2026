import '../../../features/scoring/domain/scoring_service.dart';
import '../../../shared/models/models.dart';

/// Placeholder discovery scoring for Terroir trips (will weigh POIs actually
/// visited along the route). Lives here — not in the core, not in EcoDrive.
class BasicDiscoveryScoringService implements ScoringService {
  const BasicDiscoveryScoringService();

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
