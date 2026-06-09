import 'enums.dart';

class Favorite {
  const Favorite({
    required this.id,
    required this.userId,
    required this.targetType,
    required this.targetId,
    this.createdAt,
  });

  final String id;
  final String userId;
  final FavoriteTargetType targetType;
  final String targetId;
  final DateTime? createdAt;
}

class EcoScore {
  const EcoScore({
    required this.id,
    required this.tripId,
    required this.userId,
    required this.scoreOverall,
    this.scoreAcceleration,
    this.scoreBraking,
    this.scoreSpeedStability,
    this.scoreSpeedLimit,
    this.estimatedFuelSavedLiters,
    this.estimatedCo2SavedKg,
    this.adviceText,
    this.metrics = const {},
    this.createdAt,
  });

  final String id;
  final String tripId;
  final String userId;
  final int scoreOverall;
  final int? scoreAcceleration;
  final int? scoreBraking;
  final int? scoreSpeedStability;
  final int? scoreSpeedLimit;
  final double? estimatedFuelSavedLiters;
  final double? estimatedCo2SavedKg;
  final String? adviceText;

  /// Extra raw metrics (harshAccelerationCount, harshBrakingCount,
  /// averageSpeed, speedVariance, ...) — kept generic in the core.
  final Map<String, dynamic> metrics;
  final DateTime? createdAt;
}

class AnalyticsEvent {
  const AnalyticsEvent({
    required this.eventName,
    this.userId,
    this.productContext = ProductContext.common,
    this.properties = const {},
    this.createdAt,
  });

  final String? userId;
  final String eventName;
  final ProductContext productContext;
  final Map<String, dynamic> properties;
  final DateTime? createdAt;
}
