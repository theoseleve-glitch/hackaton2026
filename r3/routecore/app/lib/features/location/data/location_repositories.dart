import 'dart:async';
import 'dart:math' as math;

import 'package:geolocator/geolocator.dart';

import '../../../core/errors/app_exception.dart';
import '../../../core/permissions/location_permission_service.dart';
import '../../../shared/models/models.dart';
import '../domain/location_repository.dart';

class GeolocatorLocationRepository implements LocationRepository {
  GeolocatorLocationRepository(this._permissions);

  final LocationPermissionService _permissions;

  @override
  Future<GeoPoint> getCurrentPosition() async {
    if (!await _permissions.ensurePermission()) {
      throw const PermissionException('Permission de localisation refusée.');
    }
    final pos = await Geolocator.getCurrentPosition();
    return GeoPoint(latitude: pos.latitude, longitude: pos.longitude);
  }

  @override
  Stream<GpsTrackPoint> watchPosition(
      {required String tripId, required String userId}) {
    return Geolocator.getPositionStream(
      locationSettings: const LocationSettings(distanceFilter: 10),
    ).map((pos) => GpsTrackPoint(
          id: '$tripId-${pos.timestamp.millisecondsSinceEpoch}',
          tripId: tripId,
          userId: userId,
          latitude: pos.latitude,
          longitude: pos.longitude,
          speedMps: pos.speed,
          accuracyMeters: pos.accuracy,
          altitudeMeters: pos.altitude,
          heading: pos.heading,
          recordedAt: pos.timestamp,
        ));
  }
}

/// Simulates a realistic urban→road drive starting near Lyon — used on
/// desktop/dev and in demo mode where no real GPS is available.
///
/// Positions are produced by dead-reckoning (integrating the speed along a
/// heading), so the driven distance stays CONSISTENT with the reported speed.
/// That lets the eco-score actually react to the synthetic harsh accelerations,
/// braking and stop-and-go. The drive is seeded by [tripId], so each trip
/// differs and the trip history shows a real trend. MOCK — see `docs/ECODRIVE.md`.
class MockLocationRepository implements LocationRepository {
  static const _start = GeoPoint(latitude: 45.7640, longitude: 4.8357); // Lyon

  @override
  Future<GeoPoint> getCurrentPosition() async => _start;

  @override
  Stream<GpsTrackPoint> watchPosition(
      {required String tripId, required String userId}) {
    final rng = math.Random(tripId.hashCode);
    final speeds = _driveProfile(rng); // m/s, one sample per 2 s tick
    final base = DateTime.now();
    // Roughly south-bound (down the Rhône valley) with a per-trip wiggle.
    final heading = math.pi + (rng.nextDouble() - 0.5) * 0.5;
    var lat = _start.latitude;
    var lng = _start.longitude;
    var tick = -1;
    return Stream.periodic(const Duration(seconds: 2), (_) {
      tick++;
      final v = speeds[math.min(tick, speeds.length - 1)];
      // Dead-reckon: advance v * dt (2 s) along the (gently curving) heading.
      final h = heading + math.sin(tick / 7) * 0.15;
      final meters = v * 2.0;
      lat += (meters * math.cos(h)) / 111320.0;
      lng += (meters * math.sin(h)) /
          (111320.0 * math.cos(lat * math.pi / 180.0));
      return GpsTrackPoint(
        id: '$tripId-$tick',
        tripId: tripId,
        userId: userId,
        latitude: lat,
        longitude: lng,
        speedMps: v,
        accuracyMeters: 5,
        heading: h * 180.0 / math.pi,
        recordedAt: base.add(Duration(seconds: tick * 2)),
      );
    });
  }

  /// A varied city→road→arrival drive (m/s per 2 s tick): a stop-and-go city
  /// start with a few harsh accelerations/braking, then open road, then braking
  /// to a stop. Intensity is jittered per trip so scores differ run to run.
  List<double> _driveProfile(math.Random rng) {
    const keyframes = <double>[
      0, 9, 12, 13, 2, 1, 10, 15, 18, 22, // city: harsh accel/brake + stop-go
      26, 28, 27, 28, 26, 27, 29, 21, 24, 26, // open road, one harsh brake
      28, 16, 9, 4, 0, // arrival: braking to a stop
    ];
    final scale = 0.85 + rng.nextDouble() * 0.4; // 0.85..1.25 overall pace
    return [
      for (final s in keyframes)
        (s * scale + (rng.nextDouble() - 0.5) * 3).clamp(0.0, 35.0).toDouble(),
    ];
  }
}
