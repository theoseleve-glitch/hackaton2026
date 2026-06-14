import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/features/poi/data/fuel_station_service.dart';
import 'package:routecore/shared/models/models.dart';

void main() {
  // ---------------------------------------------------------------------------
  // parseFuel — fixture OpenDataSoft (records/1.0/search), 2 stations
  // ---------------------------------------------------------------------------
  group('FuelStationService.parseFuel', () {
    final fixture = <String, dynamic>{
      'records': [
        {
          'fields': {
            'enseigne': 'TotalEnergies',
            'ville': 'Lyon',
            'adresse': '1 rue de la Paix',
            'geo_point_2d': [45.76, 4.84], // [lat, lng]
            'gazole_prix': 1.79,
            'sp95_prix': 1.85,
          },
        },
        {
          'fields': {
            'enseigne': 'Intermarché',
            'ville': 'Vienne',
            'geom': {
              'type': 'Point',
              'coordinates': [4.87, 45.52], // GeoJSON [lng, lat]
            },
            'gazole_prix': 1.72,
            'e10_prix': 1.81,
          },
        },
      ],
    };

    test('parses two stations with location, prices and brand', () {
      final stations = FuelStationService.parseFuel(fixture);
      expect(stations, hasLength(2));

      final total = stations.first;
      expect(total.brand, 'TotalEnergies');
      expect(total.name, 'TotalEnergies — Lyon');
      expect(total.location.latitude, closeTo(45.76, 1e-9));
      expect(total.location.longitude, closeTo(4.84, 1e-9));
      expect(total.cheapest('Gazole'), 1.79);
      expect(total.cheapest('SP95'), 1.85);
      expect(total.cheapest('E85'), isNull);

      final inter = stations[1];
      // geom GeoJSON is [lng, lat] -> must be reordered to lat/lng.
      expect(inter.location.latitude, closeTo(45.52, 1e-9));
      expect(inter.location.longitude, closeTo(4.87, 1e-9));
      expect(inter.cheapest('Gazole'), 1.72);
      expect(inter.cheapest('E10'), 1.81);
    });

    test('skips records without location or without any price', () {
      final json = {
        'records': [
          {
            'fields': {'enseigne': 'Sans position', 'gazole_prix': 1.5},
          },
          {
            'fields': {
              'enseigne': 'Sans prix',
              'geo_point_2d': [45.0, 4.0],
            },
          },
        ],
      };
      expect(FuelStationService.parseFuel(json), isEmpty);
    });

    test('empty / malformed json -> empty list', () {
      expect(FuelStationService.parseFuel(const {}), isEmpty);
      expect(FuelStationService.parseFuel({'records': null}), isEmpty);
    });
  });

  // ---------------------------------------------------------------------------
  // cheapestAlong — choisit la moins chère DANS le corridor
  // ---------------------------------------------------------------------------
  group('FuelStationService.cheapestAlong', () {
    // Corridor approx Lyon -> sud, le long du méridien 4.84.
    const corridor = [
      GeoPoint(latitude: 45.80, longitude: 4.84),
      GeoPoint(latitude: 45.50, longitude: 4.84),
    ];

    const onRouteCheap = FuelStation(
      location: GeoPoint(latitude: 45.65, longitude: 4.84),
      name: 'Pas cher sur le trajet',
      prices: {'Gazole': 1.70},
    );
    const onRoutePricey = FuelStation(
      location: GeoPoint(latitude: 45.60, longitude: 4.845),
      name: 'Cher sur le trajet',
      prices: {'Gazole': 1.85},
    );
    // ~20 km à l'est du corridor : hors bande de 2 km.
    const offRouteCheapest = FuelStation(
      location: GeoPoint(latitude: 45.65, longitude: 5.10),
      name: 'Moins cher mais loin',
      prices: {'Gazole': 1.50},
    );

    test('picks the cheapest station within the corridor band', () {
      final best = FuelStationService.cheapestAlong(
        const [onRoutePricey, onRouteCheap, offRouteCheapest],
        corridor,
        'Gazole',
      );
      expect(best, isNotNull);
      expect(best!.name, 'Pas cher sur le trajet');
    });

    test('ignores cheaper stations outside the corridor', () {
      final best = FuelStationService.cheapestAlong(
        const [offRouteCheapest],
        corridor,
        'Gazole',
      );
      // 1.50 € existe mais hors corridor -> non retenue.
      expect(best, isNull);
    });

    test('ignores stations that do not sell the fuel type', () {
      const sp98Only = FuelStation(
        location: GeoPoint(latitude: 45.65, longitude: 4.84),
        name: 'SP98 only',
        prices: {'SP98': 1.90},
      );
      expect(
        FuelStationService.cheapestAlong(const [sp98Only], corridor, 'Gazole'),
        isNull,
      );
    });

    test('empty corridor -> null', () {
      expect(
        FuelStationService.cheapestAlong(
          const [onRouteCheap],
          const [GeoPoint(latitude: 45.0, longitude: 4.0)],
          'Gazole',
        ),
        isNull,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // parseCharging — fixture Overpass (amenity=charging_station)
  // ---------------------------------------------------------------------------
  group('FuelStationService.parseCharging', () {
    final fixture = <String, dynamic>{
      'elements': [
        {
          'type': 'node',
          'lat': 45.75,
          'lon': 4.85,
          'tags': {
            'amenity': 'charging_station',
            'name': 'IZIVIA Lyon',
            'charging_station:output': '22 kW',
            'capacity': '4',
          },
        },
        {
          'type': 'way',
          'center': {'lat': 45.70, 'lon': 4.90},
          'tags': {
            'amenity': 'charging_station',
            'maxpower': '50000 W', // 50 kW exprimé en watts
          },
        },
      ],
    };

    test('parses node + way(center), power and points', () {
      final stations = FuelStationService.parseCharging(fixture);
      expect(stations, hasLength(2));

      final izivia = stations.first;
      expect(izivia.name, 'IZIVIA Lyon');
      expect(izivia.location.latitude, closeTo(45.75, 1e-9));
      expect(izivia.powerKw, closeTo(22.0, 1e-9));
      expect(izivia.points, 4);

      final way = stations[1];
      // center used when lat/lon absent.
      expect(way.location.latitude, closeTo(45.70, 1e-9));
      expect(way.name, 'Borne de recharge'); // no name tag -> default
      expect(way.powerKw, closeTo(50.0, 1e-9)); // W -> kW
    });

    test('empty elements -> empty list', () {
      expect(FuelStationService.parseCharging(const {}), isEmpty);
    });
  });

  // ---------------------------------------------------------------------------
  // parseParking — fixture Overpass (amenity=parking)
  // ---------------------------------------------------------------------------
  group('FuelStationService.parseParking', () {
    test('parses parking with capacity and falls back name', () {
      final json = {
        'elements': [
          {
            'type': 'node',
            'lat': 45.76,
            'lon': 4.83,
            'tags': {
              'amenity': 'parking',
              'name': 'Parking Bellecour',
              'capacity': '120',
            },
          },
          {
            'type': 'way',
            'center': {'lat': 45.77, 'lon': 4.82},
            'tags': {'amenity': 'parking'},
          },
        ],
      };
      final lots = FuelStationService.parseParking(json);
      expect(lots, hasLength(2));
      expect(lots.first.name, 'Parking Bellecour');
      expect(lots.first.capacity, 120);
      expect(lots[1].name, 'Parking'); // default
      expect(lots[1].capacity, isNull);
    });
  });
}
