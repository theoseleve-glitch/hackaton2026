import '../../../shared/models/models.dart';

abstract class TripRepository {
  Future<Trip> createTrip({
    required String userId,
    required GeoPoint origin,
    required GeoPoint destination,
    String? originLabel,
    String? destinationLabel,
    ProductContext productContext,
  });

  Future<Trip?> getTrip(String id);
  Future<List<Trip>> listTrips(String userId);
  Future<void> updateTrip(Trip trip);
}

abstract class TrackingRepository {
  Future<void> addTrackPoint(GpsTrackPoint point);
  Future<List<GpsTrackPoint>> getTrackPoints(String tripId);
}

abstract class FavoriteRepository {
  Future<List<Favorite>> listFavorites(String userId);
  Future<Favorite> addFavorite(
      String userId, FavoriteTargetType type, String targetId);
  Future<void> removeFavorite(String favoriteId);
  Future<bool> isFavorite(
      String userId, FavoriteTargetType type, String targetId);
}
