import 'dart:math' as math;

import 'package:supabase_flutter/supabase_flutter.dart' hide AuthException;

import '../../../core/constants/app_constants.dart';
import '../../../core/errors/app_exception.dart';
import '../../../shared/models/models.dart';
import '../domain/poi_repository.dart';

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
      List<String>? categorySlugs}) async {
    try {
      final rows = await _client.rpc('pois_along_route', params: {
        'origin_lat': origin.latitude,
        'origin_lng': origin.longitude,
        'dest_lat': destination.latitude,
        'dest_lng': destination.longitude,
        'corridor_meters': corridorMeters,
        'category_slugs': categorySlugs,
      });
      return (rows as List).map((r) {
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
    } on PostgrestException catch (e) {
      throw NetworkException('POI sur trajet impossible: ${e.message}', e);
    }
  }

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
  static const categories = [
    PoiCategory(id: 'c1', name: 'Producteur', slug: 'producer', productContext: ProductContext.terroir, iconName: 'agriculture'),
    PoiCategory(id: 'c2', name: 'Marché', slug: 'market', productContext: ProductContext.terroir, iconName: 'storefront'),
    PoiCategory(id: 'c3', name: 'Artisan', slug: 'artisan', productContext: ProductContext.terroir, iconName: 'handyman'),
    PoiCategory(id: 'c4', name: 'Restaurant local', slug: 'restaurant', productContext: ProductContext.terroir, iconName: 'restaurant'),
    PoiCategory(id: 'c5', name: 'Village', slug: 'village', productContext: ProductContext.terroir, iconName: 'church'),
    PoiCategory(id: 'c6', name: 'Point de vue', slug: 'viewpoint', productContext: ProductContext.terroir, iconName: 'landscape'),
    PoiCategory(id: 'c7', name: 'Événement', slug: 'event', productContext: ProductContext.terroir, iconName: 'celebration'),
    PoiCategory(id: 'c8', name: 'Borne de recharge', slug: 'ev-charger', productContext: ProductContext.ecodrive, iconName: 'ev_station'),
    PoiCategory(id: 'c10', name: 'Station-service', slug: 'gas-station', productContext: ProductContext.common, iconName: 'local_gas_station'),
  ];

  static const pois = [
    Poi(id: 'p1', name: 'Ferme des Coteaux', categoryId: 'c1', latitude: 45.62, longitude: 4.82, city: 'Vienne', description: 'Vente directe de fromages de chèvre fermiers.', tags: ['fromage', 'bio'], isVerified: true, source: 'mock'),
    Poi(id: 'p2', name: 'Marché de Condrieu', categoryId: 'c2', latitude: 45.463, longitude: 4.767, city: 'Condrieu', description: 'Marché de producteurs le dimanche matin.', isVerified: true, source: 'mock'),
    Poi(id: 'p3', name: 'Atelier Poterie du Pilat', categoryId: 'c3', latitude: 45.40, longitude: 4.65, city: 'Pélussin', description: 'Céramiste, démonstrations et boutique.', isVerified: true, source: 'mock'),
    Poi(id: 'p4', name: 'Auberge de la Vallée', categoryId: 'c4', latitude: 45.25, longitude: 4.85, city: 'Saint-Vallier', description: 'Cuisine du terroir, produits 100% locaux.', isVerified: true, isSponsored: true, source: 'mock'),
    Poi(id: 'p5', name: 'Village de Malleval', categoryId: 'c5', latitude: 45.409, longitude: 4.729, city: 'Malleval', description: 'Village médiéval perché classé.', isVerified: true, source: 'mock'),
    Poi(id: 'p6', name: 'Belvédère de Pierre-Aiguille', categoryId: 'c6', latitude: 45.07, longitude: 4.833, city: 'Crozes-Hermitage', description: 'Vue panoramique sur les vignobles.', isVerified: true, source: 'mock'),
    Poi(id: 'p7', name: 'Fête de la Pogne', categoryId: 'c7', latitude: 45.044, longitude: 4.892, city: 'Romans-sur-Isère', description: 'Fête gourmande annuelle.', isVerified: true, source: 'mock'),
    Poi(id: 'p8', name: 'Borne Rapide A7 Sud', categoryId: 'c8', latitude: 44.93, longitude: 4.89, city: 'Valence', description: 'Recharge DC 150 kW.', isVerified: true, source: 'mock'),
    Poi(id: 'p10', name: 'Station du Rhône', categoryId: 'c10', latitude: 45.32, longitude: 4.842, city: 'Chanas', description: 'Carburants + GPL.', isVerified: true, source: 'mock'),
  ];

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
      List<String>? categorySlugs}) async {
    await Future<void>.delayed(const Duration(milliseconds: 250));
    final result = <PoiAlongRoute>[];
    for (final p in pois.where((p) => _matchesCategory(p, categorySlugs))) {
      final d = _distanceToSegment(p.point, origin, destination);
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
