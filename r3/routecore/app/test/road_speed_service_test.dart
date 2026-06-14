import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/features/navigation/data/road_speed_service.dart';
import 'package:routecore/shared/models/models.dart';

void main() {
  group('RoadSpeedService.parseMaxspeedKmh', () {
    test('plain numeric values', () {
      expect(RoadSpeedService.parseMaxspeedKmh('90'), 90);
      expect(RoadSpeedService.parseMaxspeedKmh('50'), 50);
      expect(RoadSpeedService.parseMaxspeedKmh('130'), 130);
    });

    test('mph converts to km/h (30 mph => 48)', () {
      expect(RoadSpeedService.parseMaxspeedKmh('30 mph'), 48);
      expect(RoadSpeedService.parseMaxspeedKmh('70 mph'), 113);
    });

    test('French implicit zones', () {
      expect(RoadSpeedService.parseMaxspeedKmh('FR:urban'), 50);
      expect(RoadSpeedService.parseMaxspeedKmh('FR:rural'), 80);
      expect(RoadSpeedService.parseMaxspeedKmh('FR:motorway'), 130);
    });

    test('walk => 6 km/h', () {
      expect(RoadSpeedService.parseMaxspeedKmh('walk'), 6);
    });

    test('non-numeric / no-limit tokens => null', () {
      expect(RoadSpeedService.parseMaxspeedKmh('none'), isNull);
      expect(RoadSpeedService.parseMaxspeedKmh('signals'), isNull);
    });

    test('null / empty / garbage => null', () {
      expect(RoadSpeedService.parseMaxspeedKmh(null), isNull);
      expect(RoadSpeedService.parseMaxspeedKmh(''), isNull);
      expect(RoadSpeedService.parseMaxspeedKmh('   '), isNull);
      expect(RoadSpeedService.parseMaxspeedKmh('fast'), isNull);
    });

    test('handles km/h suffix and whitespace', () {
      expect(RoadSpeedService.parseMaxspeedKmh('50 km/h'), 50);
      expect(RoadSpeedService.parseMaxspeedKmh(' 80 '), 80);
    });
  });

  group('RoadSpeedService.parseOverpass', () {
    // Fixture Overpass : 2 ways valides + 1 way à ignorer (sans maxspeed).
    final fixture = <String, dynamic>{
      'elements': [
        {
          'type': 'way',
          'id': 1,
          'tags': {'highway': 'primary', 'maxspeed': '90'},
          'geometry': [
            {'lat': 45.0, 'lon': 4.0},
            {'lat': 45.001, 'lon': 4.001},
          ],
        },
        {
          'type': 'way',
          'id': 2,
          'tags': {'highway': 'residential', 'maxspeed': 'FR:urban'},
          'geometry': [
            {'lat': 46.0, 'lon': 5.0},
            {'lat': 46.001, 'lon': 5.001},
          ],
        },
        {
          // Ignoré : pas de maxspeed parsable.
          'type': 'way',
          'id': 3,
          'tags': {'highway': 'service'},
          'geometry': [
            {'lat': 47.0, 'lon': 6.0},
          ],
        },
      ],
    };

    test('parses two ways, ignores the one without maxspeed', () {
      final zones = RoadSpeedService.parseOverpass(fixture);
      expect(zones, hasLength(2));
      expect(zones[0].maxspeedKmh, 90);
      expect(zones[0].points, hasLength(2));
      expect(zones[1].maxspeedKmh, 50); // FR:urban
    });

    test('ignores a way with maxspeed but no geometry', () {
      final zones = RoadSpeedService.parseOverpass({
        'elements': [
          {
            'type': 'way',
            'tags': {'maxspeed': '90'},
            'geometry': const [],
          },
        ],
      });
      expect(zones, isEmpty);
    });

    test('empty / missing elements => empty list', () {
      expect(RoadSpeedService.parseOverpass(const {}), isEmpty);
      expect(RoadSpeedService.parseOverpass({'elements': const []}), isEmpty);
    });
  });

  group('RoadSpeedService.limitAt', () {
    final zones = [
      const SpeedZone(
        points: [GeoPoint(latitude: 45.0, longitude: 4.0)],
        maxspeedKmh: 90,
      ),
      const SpeedZone(
        points: [GeoPoint(latitude: 45.01, longitude: 4.0)],
        maxspeedKmh: 50,
      ),
    ];

    test('picks the nearest zone within tolerance', () {
      // Point ~quasi sur la zone 90.
      const p = GeoPoint(latitude: 45.00005, longitude: 4.0);
      expect(RoadSpeedService.limitAt(p, zones), 90);
    });

    test('picks the other zone when closer to it', () {
      const p = GeoPoint(latitude: 45.00995, longitude: 4.0);
      expect(RoadSpeedService.limitAt(p, zones), 50);
    });

    test('returns null when no zone within tolerance', () {
      // Loin de tout (plusieurs km).
      const p = GeoPoint(latitude: 45.5, longitude: 4.0);
      expect(RoadSpeedService.limitAt(p, zones, toleranceMeters: 35), isNull);
    });

    test('empty zones => null', () {
      const p = GeoPoint(latitude: 45.0, longitude: 4.0);
      expect(RoadSpeedService.limitAt(p, const []), isNull);
    });
  });
}
