import '../../../shared/models/models.dart';
import '../domain/trip_repository.dart';

class MockTripRepository implements TripRepository {
  final _trips = <String, Trip>{};
  var _seq = 0;

  @override
  Future<Trip> createTrip({
    required String userId,
    required GeoPoint origin,
    required GeoPoint destination,
    String? originLabel,
    String? destinationLabel,
    ProductContext productContext = ProductContext.common,
  }) async {
    final trip = Trip(
      id: 'trip-${++_seq}',
      userId: userId,
      origin: origin,
      destination: destination,
      originLabel: originLabel,
      destinationLabel: destinationLabel,
      status: TripStatus.planned,
      productContext: productContext,
      createdAt: DateTime.now(),
    );
    _trips[trip.id] = trip;
    return trip;
  }

  @override
  Future<Trip?> getTrip(String id) async => _trips[id];

  @override
  Future<List<Trip>> listTrips(String userId) async =>
      _trips.values.where((t) => t.userId == userId).toList();

  @override
  Future<void> updateTrip(Trip trip) async => _trips[trip.id] = trip;
}

class MockTrackingRepository implements TrackingRepository {
  final _points = <String, List<GpsTrackPoint>>{};

  @override
  Future<void> addTrackPoint(GpsTrackPoint point) async {
    _points.putIfAbsent(point.tripId, () => []).add(point);
  }

  @override
  Future<List<GpsTrackPoint>> getTrackPoints(String tripId) async =>
      List.unmodifiable(_points[tripId] ?? const []);
}

class MockFavoriteRepository implements FavoriteRepository {
  final _favorites = <Favorite>[];
  var _seq = 0;

  @override
  Future<List<Favorite>> listFavorites(String userId) async =>
      _favorites.where((f) => f.userId == userId).toList();

  @override
  Future<Favorite> addFavorite(
      String userId, FavoriteTargetType type, String targetId) async {
    final fav = Favorite(
      id: 'fav-${++_seq}',
      userId: userId,
      targetType: type,
      targetId: targetId,
      createdAt: DateTime.now(),
    );
    _favorites.add(fav);
    return fav;
  }

  @override
  Future<void> removeFavorite(String favoriteId) async {
    _favorites.removeWhere((f) => f.id == favoriteId);
  }

  @override
  Future<bool> isFavorite(
          String userId, FavoriteTargetType type, String targetId) async =>
      _favorites.any((f) =>
          f.userId == userId &&
          f.targetType == type &&
          f.targetId == targetId);
}
