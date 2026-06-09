import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/errors/app_exception.dart';
import '../../../core/logging/app_logger.dart';
import '../../../shared/models/models.dart';
import '../../analytics/domain/analytics_repository.dart'
    show AnalyticsEvents;

class TrackingState {
  const TrackingState({
    this.tripId,
    this.isTracking = false,
    this.points = const [],
    this.distanceMeters = 0,
    this.elapsed = Duration.zero,
    this.error,
  });

  final String? tripId;
  final bool isTracking;
  final List<GpsTrackPoint> points;
  final double distanceMeters;
  final Duration elapsed;

  /// User-facing error (consent missing, GPS lost...). Cleared on start().
  final String? error;

  TrackingState copyWith({
    String? tripId,
    bool? isTracking,
    List<GpsTrackPoint>? points,
    double? distanceMeters,
    Duration? elapsed,
    String? error,
    bool clearError = false,
  }) =>
      TrackingState(
        tripId: tripId ?? this.tripId,
        isTracking: isTracking ?? this.isTracking,
        points: points ?? this.points,
        distanceMeters: distanceMeters ?? this.distanceMeters,
        elapsed: elapsed ?? this.elapsed,
        error: clearError ? null : (error ?? this.error),
      );
}

class TrackingController extends Notifier<TrackingState> {
  static const _log = AppLogger('tracking-controller');

  StreamSubscription<GpsTrackPoint>? _sub;
  Timer? _timer;
  DateTime? _startedAt;

  @override
  TrackingState build() {
    ref.onDispose(_cancel);
    return const TrackingState();
  }

  Future<void> start(String tripId) async {
    if (state.isTracking) return; // re-entrancy guard (double tap)
    final user = ref.read(authControllerProvider).valueOrNull;
    if (user == null) return;
    if (!ref.read(consentAcceptedProvider)) {
      // Never track GPS without explicit consent (RGPD) — the UI promise
      // in Settings/Onboarding is enforced here, at the single entry point.
      state = state.copyWith(
          error: 'Consentement localisation requis (voir Réglages).');
      return;
    }

    _cancel(); // defensive: never leak a previous timer/subscription
    _startedAt = DateTime.now();
    // Flip isTracking before any await so the start button disables now.
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
    }, onError: (Object e, StackTrace st) {
      _cancel();
      final message = e is AppException ? e.message : 'Signal GPS perdu.';
      state = state.copyWith(isTracking: false, error: message);
    });

    // Persist the status change after subscribing; skip it if the stream
    // already died (e.g. immediate PermissionException) so a trip without a
    // single point is never marked active. Network failures must not crash
    // the fire-and-forget button callback.
    try {
      if (!state.isTracking || state.tripId != tripId) return;
      final tripRepo = ref.read(tripRepositoryProvider);
      final trip = await tripRepo.getTrip(tripId);
      if (trip != null && state.isTracking) {
        await tripRepo.updateTrip(trip.copyWith(
            status: TripStatus.active, startedAt: DateTime.now()));
      }
      await ref.read(analyticsRepositoryProvider).logEvent(
          AnalyticsEvents.tripStarted,
          properties: {'tripId': tripId});
    } catch (e) {
      _log.warn('start: trip status update failed: $e');
    }
  }

  /// Stops tracking and returns the tripId for navigation to the summary.
  Future<String?> stop() async {
    final tripId = state.tripId;
    _cancel();
    // Update UI state first: a network failure below must never leave the
    // screen stuck on "tracking".
    state = state.copyWith(isTracking: false);
    if (tripId != null) {
      try {
        final tripRepo = ref.read(tripRepositoryProvider);
        final trip = await tripRepo.getTrip(tripId);
        if (trip != null) {
          await tripRepo.updateTrip(trip.copyWith(
              status: TripStatus.completed, endedAt: DateTime.now()));
        }
        await ref.read(analyticsRepositoryProvider).logEvent(
            AnalyticsEvents.tripCompleted,
            properties: {'tripId': tripId});
      } catch (e) {
        _log.warn('stop: trip status update failed: $e');
      }
    }
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
