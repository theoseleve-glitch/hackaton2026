import 'dart:math' as math;

import '../../../shared/models/models.dart';

/// Pure route-geometry helpers + the detour-budget stop selector.
///
/// All distances use a per-segment equirectangular projection (meters), which
/// is accurate enough at regional driving scale and ~50x cheaper than
/// haversine per segment.
class DetourPlanner {
  const DetourPlanner._();

  static const double _metersPerDegLat = 110574.0;

  static double _metersPerDegLng(double latitude) =>
      111320.0 * math.cos(latitude * math.pi / 180);

  /// Perpendicular distance (meters) from [p] to segment [a]-[b].
  static double distanceToSegment(GeoPoint p, GeoPoint a, GeoPoint b) {
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
    return math.sqrt(ddx * ddx + ddy * ddy);
  }

  /// Minimum distance (meters) from [p] to the [polyline].
  static double distanceToPolyline(GeoPoint p, List<GeoPoint> polyline) {
    if (polyline.isEmpty) return double.infinity;
    if (polyline.length == 1) return p.distanceTo(polyline.first);
    var best = double.infinity;
    for (var i = 0; i < polyline.length - 1; i++) {
      final d = distanceToSegment(p, polyline[i], polyline[i + 1]);
      if (d < best) best = d;
    }
    return best;
  }

  /// Cumulative distance (meters) along the polyline of the projection of
  /// [p] — used to order stops in driving order.
  static double positionAlong(GeoPoint p, List<GeoPoint> polyline) {
    if (polyline.length < 2) return 0;
    var best = double.infinity;
    var bestPosition = 0.0;
    var traveled = 0.0;
    for (var i = 0; i < polyline.length - 1; i++) {
      final a = polyline[i], b = polyline[i + 1];
      final segLen = a.distanceTo(b);
      final d = distanceToSegment(p, a, b);
      if (d < best) {
        best = d;
        // Fraction of the segment where the projection lands.
        final mLng = _metersPerDegLng((a.latitude + b.latitude) / 2);
        final px = p.longitude * mLng, py = p.latitude * _metersPerDegLat;
        final ax = a.longitude * mLng, ay = a.latitude * _metersPerDegLat;
        final bx = b.longitude * mLng, by = b.latitude * _metersPerDegLat;
        final dx = bx - ax, dy = by - ay;
        final len2 = dx * dx + dy * dy;
        final t = len2 == 0
            ? 0.0
            : (((px - ax) * dx + (py - ay) * dy) / len2).clamp(0.0, 1.0);
        bestPosition = traveled + segLen * t;
      }
      traveled += segLen;
    }
    return bestPosition;
  }

  /// Douglas-Peucker simplification. OSRM full geometries carry thousands of
  /// points; ~30-50 m tolerance keeps the drawn line identical at map scale
  /// while making corridor filtering and rendering much cheaper.
  static List<GeoPoint> simplifyPolyline(List<GeoPoint> polyline,
      {double toleranceMeters = 30}) {
    if (polyline.length <= 2) return polyline;
    final keep = List<bool>.filled(polyline.length, false);
    keep[0] = true;
    keep[polyline.length - 1] = true;
    // Iterative stack — route geometries can be deep enough to blow the
    // call stack with naive recursion.
    final stack = <(int, int)>[(0, polyline.length - 1)];
    while (stack.isNotEmpty) {
      final (first, last) = stack.removeLast();
      var maxDist = 0.0;
      var index = -1;
      for (var i = first + 1; i < last; i++) {
        final d =
            distanceToSegment(polyline[i], polyline[first], polyline[last]);
        if (d > maxDist) {
          maxDist = d;
          index = i;
        }
      }
      if (index != -1 && maxDist > toleranceMeters) {
        keep[index] = true;
        stack
          ..add((first, index))
          ..add((index, last));
      }
    }
    return [
      for (var i = 0; i < polyline.length; i++)
        if (keep[i]) polyline[i],
    ];
  }

  /// How many stops a detour budget realistically allows — mirrors the three
  /// atelier zones (Une pause / Une après-midi / Une journée).
  static int maxStopsForBudget(int budgetMinutes) =>
      budgetMinutes <= 25 ? 2 : (budgetMinutes <= 70 ? 4 : 6);

  /// Greedy budgeted selection: walk the relevance-ranked candidates, accept
  /// each stop whose marginal detour fits the remaining budget, keep stops
  /// spread out along the route, then return them in driving order.
  static DetourPlan selectStops({
    required List<GeoPoint> polyline,
    required List<PoiAlongRoute> rankedCandidates,
    required int budgetMinutes,
    double minSpacingMeters = 2000,
  }) {
    if (rankedCandidates.isEmpty) {
      return const DetourPlan(stops: [], detourMinutesEstimate: 0);
    }
    final maxStops = maxStopsForBudget(budgetMinutes);
    var remaining = budgetMinutes.toDouble();
    final accepted = <PoiAlongRoute>[];
    for (final candidate in rankedCandidates) {
      if (accepted.length >= maxStops) break;
      final cost = candidate.detourMinutesEstimate;
      if (cost > remaining) continue;
      final tooClose = accepted.any((s) =>
          s.poi.point.distanceTo(candidate.poi.point) < minSpacingMeters);
      if (tooClose) continue;
      accepted.add(candidate);
      remaining -= cost;
    }
    if (polyline.length >= 2) {
      final positions = {
        for (final s in accepted) s.poi.id: positionAlong(s.poi.point, polyline)
      };
      accepted.sort(
          (a, b) => positions[a.poi.id]!.compareTo(positions[b.poi.id]!));
    }
    return DetourPlan(
      stops: accepted,
      detourMinutesEstimate: budgetMinutes - remaining,
    );
  }
}

/// Result of [DetourPlanner.selectStops]: the haltes retenues in driving
/// order and the estimated detour they consume.
class DetourPlan {
  const DetourPlan({required this.stops, required this.detourMinutesEstimate});

  final List<PoiAlongRoute> stops;
  final double detourMinutesEstimate;
}
