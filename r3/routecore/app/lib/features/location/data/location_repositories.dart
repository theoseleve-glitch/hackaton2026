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
      {required String tripId, required String userId}) async* {
    // Same permission gate as getCurrentPosition: a denied permission or a
    // disabled service surfaces as a stream error the consumer can handle.
    if (!await _permissions.ensurePermission()) {
      throw const PermissionException('Permission de localisation refusée.');
    }
    yield* Geolocator.getPositionStream(
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

/// Simulates a drive between Lyon and Vienne — used on desktop/dev where no
/// GPS is available.
class MockLocationRepository implements LocationRepository {
  static const _start = GeoPoint(latitude: 45.7640, longitude: 4.8357);
  static const _end = GeoPoint(latitude: 45.5256, longitude: 4.8740);

  @override
  Future<GeoPoint> getCurrentPosition() async => _start;

  @override
  Stream<GpsTrackPoint> watchPosition(
      {required String tripId, required String userId}) {
    var tick = 0;
    final rng = math.Random(42);
    return Stream.periodic(const Duration(seconds: 2), (_) {
      tick++;
      final t = math.min(tick / 120.0, 1.0);
      return GpsTrackPoint(
        id: '$tripId-$tick',
        tripId: tripId,
        userId: userId,
        latitude: _start.latitude + (_end.latitude - _start.latitude) * t,
        longitude: _start.longitude + (_end.longitude - _start.longitude) * t,
        // Speed oscillates to make scoring interesting in demos.
        speedMps: 13 + 6 * math.sin(tick / 5) + rng.nextDouble() * 2,
        accuracyMeters: 5,
        recordedAt: DateTime.now(),
      );
    });
  }
}
