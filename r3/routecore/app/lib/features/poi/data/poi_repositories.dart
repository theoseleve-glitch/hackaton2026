import 'dart:math' as math;

import 'package:supabase_flutter/supabase_flutter.dart' hide AuthException;

import '../../../core/constants/app_constants.dart';
import '../../../core/errors/app_exception.dart';
import '../../../shared/models/models.dart';
import '../../routing/domain/detour_planner.dart';
import '../domain/poi_repository.dart';
import 'mock_poi_dataset.dart';

class SupabasePoiRepository implements PoiRepository {
  SupabasePoiRepository(this._client);

  final SupabaseClient _client;

  @override
  Future<List<PoiCategory>> getCategories({ProductContext? context}) async {
    var query = _client.from('poi_categories').select();
    if (context != null) {
      query = query.inFilter('product_context', [context.name, 'common']);
    }
    final rows = await query;
    return (rows as List)
        .map((r) => PoiCategory.fromJson(r as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<Poi?> getPoi(String id) async {
    final row =
        await _client.from('pois').select().eq('id', id).maybeSingle();
    if (row == null) return null;
    return _poiFromRpcRow(row);
  }

  @override
  Future<List<Poi>> nearbyPois(GeoPoint center,
      {double radiusMeters = AppConstants.defaultPoiSearchRadiusMeters,
      List<String>? categorySlugs}) async {
    try {
      final rows = await _client.rpc('nearby_pois', params: {
        'lat': center.latitude,
        'lng': center.longitude,
        'radius_meters': radiusMeters,
        'category_slugs': categorySlugs,
      });
      return (rows as List)
          .map((r) => _poiFromRpcRow(r as Map<String, dynamic>))
          .toList();
    } on PostgrestException catch (e) {
      throw NetworkException('Recherche de POI impossible: ${e.message}', e);
    }
  }

  @override
  Future<List<PoiAlongRoute>> poisAlongRoute(
      GeoPoint origin, GeoPoint destination,
      {double corridorMeters = AppConstants.defaultRouteCorridorMeters,
      List<String>? categorySlugs,
      List<GeoPoint>? routePolyline}) async {
    try {
      // Prefer the real-geometry corridor when the polyline is known; the
      // straight-segment RPC remains as fallback (older DB schemas).
      if (routePolyline != null && routePolyline.length >= 2) {
        try {
          final rows = await _client.rpc('pois_along_polyline', params: {
            'polyline': [
              for (final p in routePolyline) [p.latitude, p.longitude],
            ],
            'corridor_meters': corridorMeters,
            'category_slugs': categorySlugs,
          });
          return _alongRouteRows(rows as List);
        } on PostgrestException {
          // Function not deployed yet — fall through to the segment RPC.
        }
      }
      final rows = await _client.rpc('pois_along_route', params: {
        'origin_lat': origin.latitude,
        'origin_lng': origin.longitude,
        'dest_lat': destination.latitude,
        'dest_lng': destination.longitude,
        'corridor_meters': corridorMeters,
        'category_slugs': categorySlugs,
      });
      return _alongRouteRows(rows as List);
    } on PostgrestException catch (e) {
      throw NetworkException('POI sur trajet impossible: ${e.message}', e);
    }
  }

  List<PoiAlongRoute> _alongRouteRows(List rows) => rows.map((r) {
        final map = r as Map<String, dynamic>;
        final distance = (map['distance_from_route_meters'] as num).toDouble();
        return PoiAlongRoute(
          poi: _poiFromRpcRow(map),
          distanceFromRouteMeters: distance,
          // Rough: assumes ~30 km/h average on the detour, both ways.
          detourMinutesEstimate: distance * 2 / 500,
          relevanceScore: 0, // computed by product-specific scorers
        );
      }).toList();

  Poi _poiFromRpcRow(Map<String, dynamic> r) => Poi(
        id: (r['poi_id'] ?? r['id']) as String,
        name: r['name'] as String,
        categoryId: r['category_id'] as String? ?? '',
        categorySlug: r['category_slug'] as String?,
        latitude: (r['latitude'] as num?)?.toDouble() ?? 0,
        longitude: (r['longitude'] as num?)?.toDouble() ?? 0,
        description: r['description'] as String?,
        address: r['address'] as String?,
        city: r['city'] as String?,
        region: r['region'] as String?,
        phone: r['phone'] as String?,
        websiteUrl: r['website_url'] as String?,
        imageUrl: r['image_url'] as String?,
        tags: (r['tags'] as List?)?.cast<String>() ?? const [],
        isVerified: r['is_verified'] as bool? ?? true,
        isSponsored: r['is_sponsored'] as bool? ?? false,
        source: r['source'] as String? ?? 'supabase',
      );
}

/// In-memory POIs mirroring supabase/seed.sql — keeps the app fully usable
/// without a backend.
class MockPoiRepository implements PoiRepository {
  static const List<PoiCategory> categories = mockPoiCategories;

  static const List<Poi> pois = mockPoiDataset;

  @override
  Future<List<PoiCategory>> getCategories({ProductContext? context}) async =>
      context == null
          ? categories
          : categories
              .where((c) =>
                  c.productContext == context ||
                  c.productContext == ProductContext.common)
              .toList();

  @override
  Future<Poi?> getPoi(String id) async {
    for (final p in pois) {
      if (p.id == id) return p;
    }
    return null;
  }

  @override
  Future<List<Poi>> nearbyPois(GeoPoint center,
      {double radiusMeters = AppConstants.defaultPoiSearchRadiusMeters,
      List<String>? categorySlugs}) async {
    await Future<void>.delayed(const Duration(milliseconds: 250));
    return pois
        .where((p) => center.distanceTo(p.point) <= radiusMeters)
        .where((p) => _matchesCategory(p, categorySlugs))
        .toList();
  }

  @override
  Future<List<PoiAlongRoute>> poisAlongRoute(
      GeoPoint origin, GeoPoint destination,
      {double corridorMeters = AppConstants.defaultRouteCorridorMeters,
      List<String>? categorySlugs,
      List<GeoPoint>? routePolyline}) async {
    await Future<void>.delayed(const Duration(milliseconds: 250));
    final hasPolyline = routePolyline != null && routePolyline.length >= 2;
    final result = <PoiAlongRoute>[];
    for (final p in pois.where((p) => _matchesCategory(p, categorySlugs))) {
      final d = hasPolyline
          ? DetourPlanner.distanceToPolyline(p.point, routePolyline)
          : _distanceToSegment(p.point, origin, destination);
      if (d <= corridorMeters) {
        result.add(PoiAlongRoute(
          poi: p,
          distanceFromRouteMeters: d,
          detourMinutesEstimate: d * 2 / 500,
          relevanceScore: 0,
        ));
      }
    }
    result.sort((a, b) =>
        a.distanceFromRouteMeters.compareTo(b.distanceFromRouteMeters));
    return result;
  }

  bool _matchesCategory(Poi p, List<String>? slugs) {
    if (slugs == null || slugs.isEmpty) return true;
    if (p.categorySlug != null) return slugs.contains(p.categorySlug);
    final cat = categories.where((c) => c.id == p.categoryId).firstOrNull;
    return cat != null && slugs.contains(cat.slug);
  }

  /// Approximate distance point->segment using equirectangular projection —
  /// fine at regional scale for the mock.
  double _distanceToSegment(GeoPoint p, GeoPoint a, GeoPoint b) {
    double x(GeoPoint g) => g.longitude * 111320 * 0.7; // cos(45°)≈0.7
    double y(GeoPoint g) => g.latitude * 110574;
    final px = x(p), py = y(p), ax = x(a), ay = y(a), bx = x(b), by = y(b);
    final dx = bx - ax, dy = by - ay;
    final len2 = dx * dx + dy * dy;
    var t = len2 == 0 ? 0.0 : ((px - ax) * dx + (py - ay) * dy) / len2;
    t = t.clamp(0.0, 1.0);
    final cx = ax + t * dx, cy = ay + t * dy;
    final ddx = px - cx, ddy = py - cy;
    return math.sqrt(ddx * ddx + ddy * ddy);
  }
}
