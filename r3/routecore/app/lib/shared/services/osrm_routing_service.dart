import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../core/logging/app_logger.dart';
import '../models/models.dart';
import 'routing_service.dart';

/// Real road routing via the public OSRM demo server (router.project-osrm.org)
/// — free, no API key, real road geometry. Demo server policy: light usage
/// only (fine for dev/MVP); self-host or switch provider before production.
///
/// Falls back to the mock synthesis on any network/parse failure so the app
/// keeps working offline.
class OsrmRoutingService extends MockRoutingService {
  OsrmRoutingService({http.Client? client, this.baseUrl})
      : _client = client ?? http.Client();

  final http.Client _client;
  final String? baseUrl;
  static const _log = AppLogger('osrm');

  String get _base => baseUrl ?? 'https://router.project-osrm.org';

  @override
  Future<List<RouteOption>> getRouteOptions(RouteRequest request) async {
    try {
      final uri = Uri.parse(
        '$_base/route/v1/driving/'
        '${request.origin.longitude},${request.origin.latitude};'
        '${request.destination.longitude},${request.destination.latitude}'
        '?overview=full&geometries=geojson&alternatives=true',
      );
      final res =
          await _client.get(uri).timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) {
        throw Exception('OSRM HTTP ${res.statusCode}');
      }
      final options = parseRoutes(
        jsonDecode(res.body) as Map<String, dynamic>,
        request,
      );
      if (options.isEmpty) throw Exception('OSRM: no route');
      return options;
    } catch (e) {
      _log.warn('falling back to mock routing: $e');
      return super.getRouteOptions(request);
    }
  }

  /// Pure mapping OSRM JSON -> RouteOptions (unit-tested).
  /// fastest = main route; shortest = alternative with min distance;
  /// eco = min-distance route with eco metrics (gentler consumption);
  /// discovery (when requested) = the most scenic (longest) alternative.
  List<RouteOption> parseRoutes(
      Map<String, dynamic> json, RouteRequest request) {
    final routes = (json['routes'] as List? ?? const [])
        .cast<Map<String, dynamic>>();
    if (routes.isEmpty) return const [];

    RouteOption build(Map<String, dynamic> r, RouteMode mode, String id) {
      final geometry = r['geometry'] as Map<String, dynamic>;
      final coords = (geometry['coordinates'] as List)
          .cast<List>()
          // GeoJSON is [lng, lat]; polyline format is `lat,lng;...`.
          .map((c) =>
              '${(c[1] as num).toDouble()},${(c[0] as num).toDouble()}')
          .join(';');
      return estimateRouteMetrics(
        RouteOption(
          id: id,
          origin: request.origin,
          destination: request.destination,
          polyline: coords,
          distanceMeters: (r['distance'] as num).round(),
          durationSeconds: (r['duration'] as num).round(),
          routeMode: mode,
          provider: 'osrm',
          metadata: const {'polylineFormat': 'latlng-list'},
        ),
        vehicleType: request.vehicleType,
      );
    }

    final byDistance = [...routes]..sort((a, b) =>
        (a['distance'] as num).compareTo(b['distance'] as num));

    final options = <RouteOption>[
      build(routes.first, RouteMode.fastest, 'osrm-fastest'),
      build(byDistance.first, RouteMode.shortest, 'osrm-shortest'),
      build(byDistance.first, RouteMode.eco, 'osrm-eco'),
      if (request.routeMode == RouteMode.discovery)
        build(byDistance.last, RouteMode.discovery, 'osrm-discovery'),
    ];
    return options;
  }
}
