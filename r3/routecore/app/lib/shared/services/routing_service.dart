import '../../core/constants/app_constants.dart';
import '../models/models.dart';

/// Provider-agnostic routing. Selected via MAP_PROVIDER (.env).
abstract class RoutingService {
  Future<List<RouteOption>> getRouteOptions(RouteRequest request);

  /// Decodes [RouteOption.polyline] into points for map display.
  List<GeoPoint> getRoutePolyline(RouteOption option);

  /// Fills estimatedFuelLiters / estimatedCo2Kg when the provider does not.
  RouteOption estimateRouteMetrics(RouteOption option, {String? vehicleType});
}

/// Dev implementation: synthesizes plausible options from the straight-line
/// distance. Polyline format: `lat,lng;lat,lng;...` (metadata.polylineFormat
/// = 'latlng-list').
class MockRoutingService implements RoutingService {
  @override
  Future<List<RouteOption>> getRouteOptions(RouteRequest request) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    final crowMeters = request.origin.distanceTo(request.destination);
    final options = <RouteOption>[
      _option(request, RouteMode.fastest, crowMeters * 1.25, 90.0),
      _option(request, RouteMode.shortest, crowMeters * 1.12, 70.0),
      _option(request, RouteMode.eco, crowMeters * 1.18, 78.0),
      if (request.routeMode == RouteMode.discovery)
        _option(request, RouteMode.discovery, crowMeters * 1.35, 65.0),
    ];
    return options.map((o) => estimateRouteMetrics(o)).toList();
  }

  RouteOption _option(
      RouteRequest req, RouteMode mode, double meters, double kmh) {
    final mid = GeoPoint(
      latitude: (req.origin.latitude + req.destination.latitude) / 2 +
          (mode == RouteMode.discovery ? 0.05 : 0.01),
      longitude: (req.origin.longitude + req.destination.longitude) / 2,
    );
    final polyline = [req.origin, mid, req.destination]
        .map((p) => '${p.latitude},${p.longitude}')
        .join(';');
    return RouteOption(
      id: 'mock-${mode.name}',
      origin: req.origin,
      destination: req.destination,
      polyline: polyline,
      distanceMeters: meters.round(),
      durationSeconds: (meters / (kmh / 3.6)).round(),
      routeMode: mode,
      provider: 'mock',
      metadata: const {'polylineFormat': 'latlng-list'},
    );
  }

  @override
  List<GeoPoint> getRoutePolyline(RouteOption option) {
    if (option.metadata['polylineFormat'] != 'latlng-list') {
      // Encoded polylines (Google/Mapbox) need a decoder — added with the
      // real provider implementation.
      return [option.origin, option.destination];
    }
    return option.polyline.split(';').map((pair) {
      final parts = pair.split(',');
      return GeoPoint(
        latitude: double.parse(parts[0]),
        longitude: double.parse(parts[1]),
      );
    }).toList();
  }

  @override
  RouteOption estimateRouteMetrics(RouteOption option, {String? vehicleType}) {
    final km = option.distanceMeters / 1000;
    // Eco routes assume gentler driving -> lower consumption.
    final per100 = option.routeMode == RouteMode.eco
        ? AppConstants.defaultFuelLitersPer100Km * 0.85
        : AppConstants.defaultFuelLitersPer100Km;
    final fuel = km * per100 / 100;
    return RouteOption(
      id: option.id,
      origin: option.origin,
      destination: option.destination,
      polyline: option.polyline,
      distanceMeters: option.distanceMeters,
      durationSeconds: option.durationSeconds,
      estimatedFuelLiters: double.parse(fuel.toStringAsFixed(2)),
      estimatedCo2Kg: double.parse(
          (fuel * AppConstants.co2KgPerFuelLiter).toStringAsFixed(2)),
      routeMode: option.routeMode,
      provider: option.provider,
      metadata: option.metadata,
    );
  }
}

/// TODO(provider): Mapbox Directions API. Token via Env.mapboxAccessToken.
class MapboxRoutingService extends MockRoutingService {
  // Extends the mock so the app still works if selected by mistake; replace
  // overrides with real HTTP calls when implementing.
}

/// TODO(provider): Google Routes API. Key via Env.googleMapsApiKey.
class GoogleMapsRoutingService extends MockRoutingService {}

/// TODO(provider): openrouteservice.org. Key via Env.openRouteServiceApiKey.
class OpenRouteServiceRoutingService extends MockRoutingService {}
