import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/shared/services/map_search_service.dart';

void main() {
  group('NominatimMapSearchService.parseSearchResults', () {
    test('maps rows, shortens labels to two segments', () {
      final results = NominatimMapSearchService.parseSearchResults([
        {
          'place_id': 12345,
          'lat': '45.8992',
          'lon': '6.1294',
          'display_name':
              'Annecy, Haute-Savoie, Auvergne-Rhône-Alpes, France métropolitaine, France',
        },
        {
          'place_id': 67,
          'lat': '49.4194',
          'lon': '0.2332',
          'display_name': 'Honfleur',
        },
      ]);
      expect(results, hasLength(2));
      expect(results.first.label, 'Annecy, Haute-Savoie');
      expect(results.first.latitude, closeTo(45.8992, 1e-6));
      expect(results.first.longitude, closeTo(6.1294, 1e-6));
      expect(results.first.provider, 'nominatim');
      expect(results.last.label, 'Honfleur');
    });

    test('rows with unparseable coordinates are dropped', () {
      final results = NominatimMapSearchService.parseSearchResults([
        {'place_id': 1, 'lat': 'oops', 'lon': '4.8', 'display_name': 'Bad'},
        {'place_id': 2, 'lat': '45.0', 'lon': '4.8', 'display_name': 'Good'},
      ]);
      expect(results, hasLength(1));
      expect(results.first.label, 'Good');
    });

    test('empty payload -> empty list', () {
      expect(NominatimMapSearchService.parseSearchResults(const []), isEmpty);
    });
  });
}
