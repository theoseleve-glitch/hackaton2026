import '../models/models.dart';

/// Provider-agnostic address search. Implementations: mock (dev),
/// Mapbox/Google/OpenRouteService placeholders. Selected via MAP_PROVIDER.
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
