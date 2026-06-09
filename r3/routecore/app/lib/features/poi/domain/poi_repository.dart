import '../../../shared/models/models.dart';

abstract class PoiRepository {
  Future<List<PoiCategory>> getCategories({ProductContext? context});
  Future<Poi?> getPoi(String id);

  Future<List<Poi>> nearbyPois(
    GeoPoint center, {
    double radiusMeters,
    List<String>? categorySlugs,
  });

  /// MVP: corridor around the straight origin->destination segment.
  /// See pois_along_route() SQL function and ARCHITECTURE.md for limits.
  Future<List<PoiAlongRoute>> poisAlongRoute(
    GeoPoint origin,
    GeoPoint destination, {
    double corridorMeters,
    List<String>? categorySlugs,
  });
}
