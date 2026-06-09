import 'enums.dart';
import 'geo.dart';

class RouteRequest {
  const RouteRequest({
    required this.origin,
    required this.destination,
    this.routeMode = RouteMode.fastest,
    this.maxDetourMinutes,
    this.preferredPoiCategories,
    this.vehicleType,
  });

  final GeoPoint origin;
  final GeoPoint destination;
  final RouteMode routeMode;
  final int? maxDetourMinutes;
  final List<String>? preferredPoiCategories;
  final String? vehicleType;

  RouteRequest copyWith({
    GeoPoint? origin,
    GeoPoint? destination,
    RouteMode? routeMode,
    int? maxDetourMinutes,
    List<String>? preferredPoiCategories,
    String? vehicleType,
  }) =>
      RouteRequest(
        origin: origin ?? this.origin,
        destination: destination ?? this.destination,
        routeMode: routeMode ?? this.routeMode,
        maxDetourMinutes: maxDetourMinutes ?? this.maxDetourMinutes,
        preferredPoiCategories:
            preferredPoiCategories ?? this.preferredPoiCategories,
        vehicleType: vehicleType ?? this.vehicleType,
      );
}

class RouteOption {
  const RouteOption({
    required this.id,
    required this.origin,
    required this.destination,
    required this.polyline,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.routeMode,
    required this.provider,
    this.estimatedFuelLiters,
    this.estimatedCo2Kg,
    this.metadata = const {},
  });

  final String id;
  final GeoPoint origin;
  final GeoPoint destination;

  /// Encoded polyline or simple `lat,lng;lat,lng` list for the mock provider.
  /// The encoding is identified by [provider] + metadata['polylineFormat'].
  final String polyline;
  final int distanceMeters;
  final int durationSeconds;
  final double? estimatedFuelLiters;
  final double? estimatedCo2Kg;
  final RouteMode routeMode;
  final String provider;
  final Map<String, dynamic> metadata;

  // NOTE: this json shape is the app-local wire format (used by tests and
  // future caching). Persisting into the route_options table requires a
  // dedicated mapping (uuid ids, PostGIS points) — see docs/TODO.md.
  factory RouteOption.fromJson(Map<String, dynamic> json) => RouteOption(
        id: json['id'] as String,
        origin: GeoPoint.fromJson(json['origin'] as Map<String, dynamic>),
        destination:
            GeoPoint.fromJson(json['destination'] as Map<String, dynamic>),
        polyline: json['polyline'] as String,
        distanceMeters: json['distance_meters'] as int,
        durationSeconds: json['duration_seconds'] as int,
        estimatedFuelLiters:
            (json['estimated_fuel_liters'] as num?)?.toDouble(),
        estimatedCo2Kg: (json['estimated_co2_kg'] as num?)?.toDouble(),
        routeMode: RouteMode.fromName(json['route_mode'] as String?),
        provider: json['provider'] as String? ?? 'unknown',
        metadata: (json['metadata'] as Map<String, dynamic>?) ?? const {},
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'origin': origin.toJson(),
        'destination': destination.toJson(),
        'polyline': polyline,
        'distance_meters': distanceMeters,
        'duration_seconds': durationSeconds,
        'estimated_fuel_liters': estimatedFuelLiters,
        'estimated_co2_kg': estimatedCo2Kg,
        'route_mode': routeMode.name,
        'provider': provider,
        'metadata': metadata,
      };
}
