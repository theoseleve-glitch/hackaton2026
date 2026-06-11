import '../../../shared/models/models.dart';

abstract class PoiRepository {
  Future<List<PoiCategory>> getCategories({ProductContext? context});
  Future<Poi?> getPoi(String id);

  Future<List<Poi>> nearbyPois(
    GeoPoint center, {
    double radiusMeters,
    List<String>? categorySlugs,
  });

  /// Corridor search. With [routePolyline] the corridor follows the real
  /// road geometry (pois_along_polyline() SQL function / local filtering);
  /// without it, falls back to the straight origin->destination segment.
  Future<List<PoiAlongRoute>> poisAlongRoute(
    GeoPoint origin,
    GeoPoint destination, {
    double corridorMeters,
    List<String>? categorySlugs,
    List<GeoPoint>? routePolyline,
  });
}
