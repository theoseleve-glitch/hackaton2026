import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../analytics/domain/analytics_repository.dart';
import '../../../app/providers.dart';
import '../../../shared/models/models.dart';

class TrackingState {
  const TrackingState({
    this.tripId,
    this.isTracking = false,
    this.points = const [],
    this.distanceMeters = 0,
    this.elapsed = Duration.zero,
  });

  final String? tripId;
  final bool isTracking;
  final List<GpsTrackPoint> points;
  final double distanceMeters;
  final Duration elapsed;

  TrackingState copyWith({
    String? tripId,
    bool? isTracking,
    List<GpsTrackPoint>? points,
    double? distanceMeters,
    Duration? elapsed,
  }) =>
      TrackingState(
        tripId: tripId ?? this.tripId,
        isTracking: isTracking ?? this.isTracking,
        points: points ?? this.points,
        distanceMeters: distanceMeters ?? this.distanceMeters,
        elapsed: elapsed ?? this.elapsed,
      );
}

class TrackingController extends Notifier<TrackingState> {
  StreamSubscription<GpsTrackPoint>? _sub;
  Timer? _timer;
  DateTime? _startedAt;

  @override
  TrackingState build() {
    ref.onDispose(_cancel);
    return const TrackingState();
  }

  Future<void> start(String tripId) async {
    final user = ref.read(authControllerProvider).valueOrNull;
    if (user == null) return;

    final tripRepo = ref.read(tripRepositoryProvider);
    final trip = await tripRepo.getTrip(tripId);
    if (trip != null) {
      await tripRepo.updateTrip(trip.copyWith(
          status: TripStatus.active, startedAt: DateTime.now()));
    }
    await ref
        .read(analyticsRepositoryProvider)
        .logEvent(AnalyticsEvents.tripStarted, properties: {'tripId': tripId});
    if (ref.read(productModeProvider) == ProductContext.ecodrive) {
      await ref.read(analyticsRepositoryProvider).logEvent(
            AnalyticsEvents.ecodriveTripStarted,
            productContext: ProductContext.ecodrive,
            properties: {'tripId': tripId},
          );
    }

    _startedAt = DateTime.now();
    state = TrackingState(tripId: tripId, isTracking: true);

    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      state =
          state.copyWith(elapsed: DateTime.now().difference(_startedAt!));
    });

    _sub = ref
        .read(locationRepositoryProvider)
        .watchPosition(tripId: tripId, userId: user.id)
        .listen((point) {
      final points = [...state.points, point];
      var distance = state.distanceMeters;
      if (state.points.isNotEmpty) {
        distance += state.points.last.point.distanceTo(point.point);
      }
      state = state.copyWith(points: points, distanceMeters: distance);
      // Fire-and-forget persistence; failures are logged by the repository.
      ref.read(trackingRepositoryProvider).addTrackPoint(point);
    });
  }

  /// Stops tracking and returns the tripId for navigation to the summary.
  Future<String?> stop() async {
    final tripId = state.tripId;
    _cancel();
    if (tripId != null) {
      final tripRepo = ref.read(tripRepositoryProvider);
      final trip = await tripRepo.getTrip(tripId);
      if (trip != null) {
        await tripRepo.updateTrip(trip.copyWith(
            status: TripStatus.completed, endedAt: DateTime.now()));
      }
      await ref
          .read(analyticsRepositoryProvider)
          .logEvent(AnalyticsEvents.tripCompleted,
              properties: {'tripId': tripId});
      if (ref.read(productModeProvider) == ProductContext.ecodrive) {
        await ref.read(analyticsRepositoryProvider).logEvent(
              AnalyticsEvents.ecodriveTripCompleted,
              productContext: ProductContext.ecodrive,
              properties: {'tripId': tripId},
            );
      }
    }
    state = state.copyWith(isTracking: false);
    return tripId;
  }

  void _cancel() {
    _sub?.cancel();
    _sub = null;
    _timer?.cancel();
    _timer = null;
  }
}

final trackingControllerProvider =
    NotifierProvider<TrackingController, TrackingState>(
        TrackingController.new);
