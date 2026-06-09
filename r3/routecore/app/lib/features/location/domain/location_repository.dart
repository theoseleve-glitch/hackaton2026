import '../../../shared/models/models.dart';

abstract class LocationRepository {
  Future<GeoPoint> getCurrentPosition();
  Stream<GpsTrackPoint> watchPosition({required String tripId, required String userId});
}
