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
    this.headingDegrees = 0,
    this.matchedIndex = 0,
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

  /// Bearing of the ROUTE at the matched point, degrees clockwise from north
  /// (0 = N, 90 = E), exponentially smoothed across updates — drives the
  /// course-up camera. Using the projected polyline segment instead of the
  /// raw GPS course is far more stable against jitter.
  final double headingDegrees;

  /// Index of the polyline segment the position projects onto (between
  /// vertices [matchedIndex] and [matchedIndex] + 1) — lets the UI split the
  /// traveled portion of the route from the portion still ahead.
  final int matchedIndex;
}

/// Exponential smoothing for angles in degrees, wrap-aware: 359 → 1 eases
/// through 0 instead of spinning 358° the long way. Jumps larger than
/// [snapThresholdDegrees] are accepted immediately so U-turns don't lag.
class HeadingSmoother {
  HeadingSmoother({this.factor = 0.25});

  /// Weight of the newest sample in (0, 1] — 1 disables smoothing.
  final double factor;

  /// Angular jump beyond which the new sample is taken as-is.
  static const double snapThresholdDegrees = 90;

  double? _value;

  /// Last smoothed heading, degrees in [0, 360) — 0 before the first sample.
  double get value => _value ?? 0;

  /// Feeds [degrees] and returns the new smoothed heading in [0, 360).
  double smooth(double degrees) {
    final target = degrees % 360; // Dart % is non-negative for divisor > 0.
    final current = _value;
    if (current == null) {
      _value = target;
      return target;
    }
    // Shortest signed angular difference, in [-180, 180).
    final delta = (target - current + 540) % 360 - 180;
    if (delta.abs() > snapThresholdDegrees) {
      _value = target;
      return target;
    }
    final smoothed = (current + factor * delta) % 360;
    _value = smoothed;
    return smoothed;
  }

  /// Forgets the state — the next sample passes through unchanged.
  void reset() => _value = null;
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

  /// Smooths the route bearing across [update] calls (see [HeadingSmoother]).
  final HeadingSmoother _headingSmoother = HeadingSmoother();

  /// Great-circle initial bearing [from] → [to], degrees in [0, 360):
  /// 0 = north, 90 = east. Pure.
  static double bearingDegrees(GeoPoint from, GeoPoint to) {
    final phi1 = from.latitude * math.pi / 180;
    final phi2 = to.latitude * math.pi / 180;
    final dLambda = (to.longitude - from.longitude) * math.pi / 180;
    final y = math.sin(dLambda) * math.cos(phi2);
    final x = math.cos(phi1) * math.sin(phi2) -
        math.sin(phi1) * math.cos(phi2) * math.cos(dLambda);
    return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
  }

  /// Point [meters] away from [origin] toward [bearingDeg] (equirectangular
  /// approximation — plenty accurate at camera look-ahead scale, < 1 km).
  static GeoPoint offsetBy(GeoPoint origin, double bearingDeg, double meters) {
    final rad = bearingDeg * math.pi / 180;
    return GeoPoint(
      latitude: origin.latitude + meters * math.cos(rad) / _metersPerDegLat,
      longitude: origin.longitude +
          meters * math.sin(rad) / _metersPerDegLng(origin.latitude),
    );
  }

  /// Fused course-up heading for the camera (degrees, 0 = N, 90 = E), Waze /
  /// Maps style:
  ///   • MOVING ([speedMps] > [movingThresholdMps] ≈ 11 km/h): keep the
  ///     [routeHeading] (the smoothed bearing of the matched polyline segment).
  ///     It is far more stable than a raw GPS course and keeps the car aligned
  ///     with the screen axis while driving.
  ///   • STOPPED or crawling ([speedMps] ≤ threshold): the route bearing is
  ///     meaningless (the car isn't moving along it), so fall back to the
  ///     device [compass] when present — the map then still reflects where the
  ///     phone/car physically points. The compass is an untilt-compensated
  ///     magnetic heading (see [DrivingSensors.compassHeading]); using it only
  ///     at standstill keeps that roughness invisible.
  /// Falls back to [routeHeading] whenever [compass] is null (no magnetometer,
  /// e.g. emulator). Pure — unit-tested and called by the navigation screen.
  static double cameraHeading({
    required double routeHeading,
    double? compass,
    required double speedMps,
    double movingThresholdMps = 3,
  }) =>
      speedMps > movingThresholdMps ? routeHeading : (compass ?? routeHeading);

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

    // Heading = bearing of the polyline segment the position projects onto
    // (direction of the ROUTE at the matched point), smoothed — much more
    // stable than deriving a course from raw, jittery GPS fixes.
    var heading = _headingSmoother.value;
    if (_polyline.length >= 2) {
      final a = _polyline[projection.segment];
      final b = _polyline[projection.segment + 1];
      if (a != b) heading = _headingSmoother.smooth(bearingDegrees(a, b));
    }

    return NavState(
      current: current,
      next: next,
      distanceToManeuverMeters: distanceToManeuver,
      remainingMeters: remaining,
      etaSeconds: eta,
      offRoute: projection.offset > offRouteThresholdMeters,
      progress: progress,
      headingDegrees: heading,
      matchedIndex: projection.segment,
    );
  }

  /// Closest point of the polyline: cumulative distance along the route
  /// (`along`), perpendicular drift (`offset`, meters) and the index of the
  /// matched segment (`segment`, between vertices i and i + 1).
  ({double along, double offset, int segment}) _project(GeoPoint p) {
    if (_polyline.isEmpty) {
      return (along: 0.0, offset: double.infinity, segment: 0);
    }
    if (_polyline.length == 1) {
      return (along: 0.0, offset: p.distanceTo(_polyline.first), segment: 0);
    }
    var bestOffset = double.infinity;
    var bestAlong = 0.0;
    var bestSegment = 0;
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
        bestSegment = i;
      }
    }
    return (along: bestAlong, offset: bestOffset, segment: bestSegment);
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
