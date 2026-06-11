import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../core/logging/app_logger.dart';
import '../models/models.dart';

/// Provider-agnostic address search. Implementations: mock (dev),
/// Nominatim (OSM, free), Mapbox placeholder. Selected via MAP_PROVIDER.
abstract class MapSearchService {
  Future<List<AddressSearchResult>> searchAddress(String query);
  Future<AddressSearchResult?> reverseGeocode(GeoPoint point);
}

class MockMapSearchService implements MapSearchService {
  static const _cities = <String, GeoPoint>{
    'Lyon': GeoPoint(latitude: 45.7640, longitude: 4.8357),
    'Vienne': GeoPoint(latitude: 45.5256, longitude: 4.8740),
    'Valence': GeoPoint(latitude: 44.9334, longitude: 4.8924),
    'Grenoble': GeoPoint(latitude: 45.1885, longitude: 5.7245),
    'Saint-Étienne': GeoPoint(latitude: 45.4397, longitude: 4.3872),
  };

  @override
  Future<List<AddressSearchResult>> searchAddress(String query) async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return [];
    return _cities.entries
        .where((e) => e.key.toLowerCase().contains(q))
        .map((e) => AddressSearchResult(
              id: 'mock-${e.key.toLowerCase()}',
              label: '${e.key}, France',
              latitude: e.value.latitude,
              longitude: e.value.longitude,
              provider: 'mock',
            ))
        .toList();
  }

  @override
  Future<AddressSearchResult?> reverseGeocode(GeoPoint point) async {
    await Future<void>.delayed(const Duration(milliseconds: 200));
    String nearest = 'Position';
    var best = double.infinity;
    for (final e in _cities.entries) {
      final d = point.distanceTo(e.value);
      if (d < best) {
        best = d;
        nearest = e.key;
      }
    }
    return AddressSearchResult(
      id: 'mock-reverse',
      label: 'Près de $nearest',
      latitude: point.latitude,
      longitude: point.longitude,
      provider: 'mock',
    );
  }
}

/// Real geocoding via Nominatim (nominatim.openstreetmap.org) — free, no
/// key, same OSM stack as the tiles and OSRM. Usage policy: identify with a
/// User-Agent and stay under 1 request/second (enforced below). Falls back
/// to the mock on any network/parse failure so the app keeps working
/// offline.
class NominatimMapSearchService extends MockMapSearchService {
  NominatimMapSearchService({http.Client? client, this.baseUrl})
      : _client = client ?? http.Client();

  final http.Client _client;
  final String? baseUrl;
  static const _log = AppLogger('nominatim');
  static const _userAgent = 'routecore-echappee/0.1 (dev build)';
  static const _minInterval = Duration(milliseconds: 1100);
  DateTime? _lastCall;

  String get _base => baseUrl ?? 'https://nominatim.openstreetmap.org';

  /// Nominatim policy: max 1 req/s. The UI debounce already spaces calls;
  /// this is the hard guarantee.
  Future<void> _throttle() async {
    final last = _lastCall;
    if (last != null) {
      final wait = _minInterval - DateTime.now().difference(last);
      if (wait > Duration.zero) await Future<void>.delayed(wait);
    }
    _lastCall = DateTime.now();
  }

  @override
  Future<List<AddressSearchResult>> searchAddress(String query) async {
    final q = query.trim();
    if (q.isEmpty) return [];
    try {
      await _throttle();
      final uri = Uri.parse('$_base/search').replace(queryParameters: {
        'q': q,
        'format': 'jsonv2',
        'limit': '6',
        'countrycodes': 'fr',
        'accept-language': 'fr',
      });
      final res = await _client.get(uri,
          headers: {'User-Agent': _userAgent}).timeout(
        const Duration(seconds: 6),
      );
      if (res.statusCode != 200) {
        throw Exception('Nominatim HTTP ${res.statusCode}');
      }
      return parseSearchResults(jsonDecode(res.body) as List<dynamic>);
    } catch (e) {
      _log.warn('falling back to mock search: $e');
      return super.searchAddress(query);
    }
  }

  @override
  Future<AddressSearchResult?> reverseGeocode(GeoPoint point) async {
    try {
      await _throttle();
      final uri = Uri.parse('$_base/reverse').replace(queryParameters: {
        'lat': '${point.latitude}',
        'lon': '${point.longitude}',
        'format': 'jsonv2',
        'accept-language': 'fr',
      });
      final res = await _client.get(uri,
          headers: {'User-Agent': _userAgent}).timeout(
        const Duration(seconds: 6),
      );
      if (res.statusCode != 200) {
        throw Exception('Nominatim HTTP ${res.statusCode}');
      }
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      final results = parseSearchResults([json]);
      return results.isEmpty ? null : results.first;
    } catch (e) {
      _log.warn('falling back to mock reverse geocode: $e');
      return super.reverseGeocode(point);
    }
  }

  /// Pure mapping Nominatim JSON -> results (unit-tested). Labels keep the
  /// first two segments of display_name ("Annecy, Haute-Savoie") — the full
  /// string drowns the UI in region/postcode noise.
  static List<AddressSearchResult> parseSearchResults(List<dynamic> json) {
    final results = <AddressSearchResult>[];
    for (final raw in json) {
      final row = raw as Map<String, dynamic>;
      final lat = double.tryParse('${row['lat']}');
      final lon = double.tryParse('${row['lon']}');
      if (lat == null || lon == null) continue;
      final display = (row['display_name'] as String? ?? '').trim();
      final parts = display.split(',').map((s) => s.trim()).toList();
      final label = switch (parts.length) {
        0 => display,
        1 => parts.first,
        _ => '${parts[0]}, ${parts[1]}',
      };
      if (label.isEmpty) continue;
      results.add(AddressSearchResult(
        id: '${row['place_id'] ?? '$lat,$lon'}',
        label: label,
        latitude: lat,
        longitude: lon,
        provider: 'nominatim',
        rawData: row,
      ));
    }
    return results;
  }
}

/// TODO(provider): implement with the Mapbox Geocoding API.
/// Read the token from Env.mapboxAccessToken — never hardcode it.
class MapboxMapSearchService implements MapSearchService {
  @override
  Future<List<AddressSearchResult>> searchAddress(String query) =>
      throw UnimplementedError('Mapbox search not implemented yet');

  @override
  Future<AddressSearchResult?> reverseGeocode(GeoPoint point) =>
      throw UnimplementedError('Mapbox reverse geocode not implemented yet');
}
