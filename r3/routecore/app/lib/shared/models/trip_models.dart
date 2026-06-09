import 'enums.dart';
import 'geo.dart';

class Trip {
  const Trip({
    required this.id,
    required this.userId,
    required this.origin,
    required this.destination,
    this.originLabel,
    this.destinationLabel,
    this.selectedRouteId,
    this.status = TripStatus.draft,
    this.productContext = ProductContext.common,
    this.createdAt,
    this.startedAt,
    this.endedAt,
  });

  final String id;
  final String userId;
  final String? originLabel;
  final String? destinationLabel;
  final GeoPoint origin;
  final GeoPoint destination;
  final String? selectedRouteId;
  final TripStatus status;
  final ProductContext productContext;
  final DateTime? createdAt;
  final DateTime? startedAt;
  final DateTime? endedAt;

  Trip copyWith({
    String? selectedRouteId,
    TripStatus? status,
    DateTime? startedAt,
    DateTime? endedAt,
  }) =>
      Trip(
        id: id,
        userId: userId,
        origin: origin,
        destination: destination,
        originLabel: originLabel,
        destinationLabel: destinationLabel,
        selectedRouteId: selectedRouteId ?? this.selectedRouteId,
        status: status ?? this.status,
        productContext: productContext,
        createdAt: createdAt,
        startedAt: startedAt ?? this.startedAt,
        endedAt: endedAt ?? this.endedAt,
      );
}

class GpsTrackPoint {
  const GpsTrackPoint({
    required this.id,
    required this.tripId,
    required this.userId,
    required this.latitude,
    required this.longitude,
    required this.recordedAt,
    this.speedMps,
    this.accuracyMeters,
    this.altitudeMeters,
    this.heading,
  });

  final String id;
  final String tripId;
  final String userId;
  final double latitude;
  final double longitude;
  final double? speedMps;
  final double? accuracyMeters;
  final double? altitudeMeters;
  final double? heading;
  final DateTime recordedAt;

  GeoPoint get point => GeoPoint(latitude: latitude, longitude: longitude);
}
