import 'dart:async';
import 'dart:math' as math;

import '../../../shared/models/geo.dart';
import '../data/osrm_directions_service.dart' show NavInstruction;

/// Snapshot of the live guidance at one GPS position.
class NavState {
  const NavState({
    required this.distanceToManeuverMeters,
    required this.remainingMeters,
    required this.etaSeconds,
    required this.offRoute,
    required this.progress,
    this.current,
    this.next,
  });

  /// Upcoming maneuver to announce (null when the route has no instructions).
  final NavInstruction? current;

  /// The maneuver after [current] (null near the arrival).
  final NavInstruction? next;

  /// Meters left along the route before [current] happens.
  final double distanceToManeuverMeters;

  /// Meters left along the route until the destination.
  final double remainingMeters;

  /// Estimated seconds to destination.
  final double etaSeconds;

  /// True when the position drifted away from the route polyline.
  final bool offRoute;

  /// Route completion, 0 (departure) → 1 (arrival).
  final double progress;
}

/// Pure progression engine: feed it the route (instructions + polyline) once,
/// then call [update] with each GPS fix. No I/O, no timers — unit-testable.
///
/// The projection math (per-segment equirectangular) mirrors
/// `DetourPlanner.distanceToSegment` / `positionAlong`; the small helpers are
/// duplicated privately on purpose to keep this engine dependency-free.
class NavigationEngine {
  NavigationEngine({
    required List<NavInstruction> instructions,
    required List<GeoPoint> polyline,
    this.offRouteThresholdMeters = 60,
  })  : _instructions = List.unmodifiable(instructions),
        _polyline = List.unmodifiable(polyline) {
    _cumulative = cumulativeDistances(_polyline);
    _totalMeters = _cumulative.isEmpty ? 0 : _cumulative.last;
    // Position of each maneuver along the polyline, forced monotonic so a
    // noisy projection can never send the guidance backwards.
    var previous = 0.0;
    _instructionAlong = [
      for (final instruction in _instructions)
        previous = math.max(previous, _project(instruction.location).along),
    ];
    final totalDuration = _instructions.fold<double>(
        0, (sum, i) => sum + i.durationSeconds);
    _avgSpeedMps =
        totalDuration > 0 ? _totalMeters / totalDuration : _fallbackSpeedMps;
  }

  /// Drift beyond which the position is considered off-route.
  final double offRouteThresholdMeters;

  final List<NavInstruction> _instructions;
  final List<GeoPoint> _polyline;
  late final List<double> _cumulative;
  late final List<double> _instructionAlong;
  late final double _totalMeters;
  late final double _avgSpeedMps;

  /// 50 km/h — used when the route carries no duration at all.
  static const double _fallbackSpeedMps = 13.9;

  /// A maneuver closer behind than this is considered passed.
  static const double _passedGraceMeters = 5.0;

  static const double _metersPerDegLat = 110574.0;

  static double _metersPerDegLng(double latitude) =>
      111320.0 * math.cos(latitude * math.pi / 180);

  /// Average driving speed implied by the route itself (m/s).
  double get averageSpeedMps => _avgSpeedMps;

  /// Full route length in meters.
  double get totalMeters => _totalMeters;

  /// Projects [position] on the route and derives the guidance snapshot.
  NavState update(GeoPoint position, {double? speedMps}) {
    final projection = _project(position);
    final remaining = math.max(0.0, _totalMeters - projection.along);
    final progress = _totalMeters <= 0
        ? 1.0
        : (projection.along / _totalMeters).clamp(0.0, 1.0);

    NavInstruction? current;
    NavInstruction? next;
    var distanceToManeuver = remaining;
    if (_instructions.isNotEmpty) {
      var index = _instructionAlong.indexWhere(
          (along) => along > projection.along + _passedGraceMeters);
      if (index == -1) index = _instructions.length - 1; // approche d'arrivée
      current = _instructions[index];
      next =
          index + 1 < _instructions.length ? _instructions[index + 1] : null;
      distanceToManeuver =
          math.max(0.0, _instructionAlong[index] - projection.along);
    }

    // ETA on the better of the live speed and the route average, so a stop
    // at a light does not blow the estimate up to infinity.
    final speed = (speedMps == null || speedMps <= 0)
        ? _avgSpeedMps
        : math.max(speedMps, _avgSpeedMps);
    final eta = speed <= 0 ? 0.0 : remaining / speed;

    return NavState(
      current: current,
      next: next,
      distanceToManeuverMeters: distanceToManeuver,
      remainingMeters: remaining,
      etaSeconds: eta,
      offRoute: projection.offset > offRouteThresholdMeters,
      progress: progress,
    );
  }

  /// Closest point of the polyline: cumulative distance along the route
  /// (`along`) and perpendicular drift (`offset`), both in meters.
  ({double along, double offset}) _project(GeoPoint p) {
    if (_polyline.isEmpty) return (along: 0.0, offset: double.infinity);
    if (_polyline.length == 1) {
      return (along: 0.0, offset: p.distanceTo(_polyline.first));
    }
    var bestOffset = double.infinity;
    var bestAlong = 0.0;
    for (var i = 0; i < _polyline.length - 1; i++) {
      final a = _polyline[i], b = _polyline[i + 1];
      final mLng = _metersPerDegLng((a.latitude + b.latitude) / 2);
      final px = p.longitude * mLng, py = p.latitude * _metersPerDegLat;
      final ax = a.longitude * mLng, ay = a.latitude * _metersPerDegLat;
      final bx = b.longitude * mLng, by = b.latitude * _metersPerDegLat;
      final dx = bx - ax, dy = by - ay;
      final len2 = dx * dx + dy * dy;
      var t = len2 == 0 ? 0.0 : ((px - ax) * dx + (py - ay) * dy) / len2;
      t = t.clamp(0.0, 1.0);
      final cx = ax + t * dx, cy = ay + t * dy;
      final ddx = px - cx, ddy = py - cy;
      final offset = math.sqrt(ddx * ddx + ddy * ddy);
      if (offset < bestOffset) {
        bestOffset = offset;
        bestAlong = _cumulative[i] + (_cumulative[i + 1] - _cumulative[i]) * t;
      }
    }
    return (along: bestAlong, offset: bestOffset);
  }

  /// Cumulative meters at each vertex of [polyline] (`[0, d01, d01+d12…]`).
  static List<double> cumulativeDistances(List<GeoPoint> polyline) {
    if (polyline.isEmpty) return const [];
    final cumulative = List<double>.filled(polyline.length, 0);
    for (var i = 1; i < polyline.length; i++) {
      cumulative[i] = cumulative[i - 1] + polyline[i - 1].distanceTo(polyline[i]);
    }
    return cumulative;
  }
}

/// Replays a drive along [polyline] for emulator demos: emits an interpolated
/// position every [tick] as if the vehicle drove at [speedKmh], accelerated
/// by [timeLapse] (1.5 = the demo runs 1.5x faster than real time).
class SimulatedDrive {
  SimulatedDrive({
    required this.polyline,
    this.speedKmh = 90,
    this.timeLapse = 1.5,
    this.tick = const Duration(milliseconds: 500),
  });

  final List<GeoPoint> polyline;
  final double speedKmh;
  final double timeLapse;
  final Duration tick;

  /// Vehicle ground speed (m/s) — what should be fed to
  /// [NavigationEngine.update] (the time-lapse only accelerates the demo).
  double get speedMps => speedKmh / 3.6;

  /// Positions along the route; completes after emitting the last point.
  Stream<GeoPoint> positions() {
    final cumulative = NavigationEngine.cumulativeDistances(polyline);
    final total = cumulative.isEmpty ? 0.0 : cumulative.last;
    final stepMeters = speedMps * timeLapse * tick.inMilliseconds / 1000.0;
    late final StreamController<GeoPoint> controller;
    Timer? timer;
    var traveled = 0.0;

    void emitTick(Timer t) {
      traveled += stepMeters;
      if (traveled >= total) {
        if (polyline.isNotEmpty) controller.add(polyline.last);
        t.cancel();
        controller.close();
        return;
      }
      controller.add(_pointAt(traveled, cumulative));
    }

    controller = StreamController<GeoPoint>(
      onListen: () {
        if (polyline.length < 2 || total <= 0 || stepMeters <= 0) {
          if (polyline.isNotEmpty) controller.add(polyline.last);
          controller.close();
          return;
        }
        timer = Timer.periodic(tick, emitTick);
      },
      onCancel: () => timer?.cancel(),
    );
    return controller.stream;
  }

  /// Linear interpolation of the point [traveled] meters along the polyline
  /// (fine at driving scale — segments are short).
  GeoPoint _pointAt(double traveled, List<double> cumulative) {
    for (var i = 0; i < polyline.length - 1; i++) {
      if (cumulative[i + 1] >= traveled) {
        final segment = cumulative[i + 1] - cumulative[i];
        final t = segment <= 0 ? 0.0 : (traveled - cumulative[i]) / segment;
        final a = polyline[i], b = polyline[i + 1];
        return GeoPoint(
          latitude: a.latitude + (b.latitude - a.latitude) * t,
          longitude: a.longitude + (b.longitude - a.longitude) * t,
        );
      }
    }
    return polyline.last;
  }
}
