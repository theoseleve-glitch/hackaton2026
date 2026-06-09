import 'dart:math' as math;

class GeoPoint {
  const GeoPoint({required this.latitude, required this.longitude});

  final double latitude;
  final double longitude;

  factory GeoPoint.fromJson(Map<String, dynamic> json) => GeoPoint(
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
      );

  Map<String, dynamic> toJson() =>
      {'latitude': latitude, 'longitude': longitude};

  /// Haversine distance in meters.
  double distanceTo(GeoPoint other) {
    const r = 6371000.0;
    final dLat = _rad(other.latitude - latitude);
    final dLng = _rad(other.longitude - longitude);
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_rad(latitude)) *
            math.cos(_rad(other.latitude)) *
            math.sin(dLng / 2) *
            math.sin(dLng / 2);
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  static double _rad(double deg) => deg * math.pi / 180;

  @override
  bool operator ==(Object other) =>
      other is GeoPoint &&
      other.latitude == latitude &&
      other.longitude == longitude;

  @override
  int get hashCode => Object.hash(latitude, longitude);

  @override
  String toString() => 'GeoPoint($latitude, $longitude)';
}

class AddressSearchResult {
  const AddressSearchResult({
    required this.id,
    required this.label,
    required this.latitude,
    required this.longitude,
    required this.provider,
    this.rawData,
  });

  final String id;
  final String label;
  final double latitude;
  final double longitude;
  final String provider;
  final Map<String, dynamic>? rawData;

  GeoPoint get point => GeoPoint(latitude: latitude, longitude: longitude);
}
