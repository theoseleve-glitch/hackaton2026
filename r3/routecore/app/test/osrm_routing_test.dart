import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/shared/models/models.dart';
import 'package:routecore/shared/services/osrm_routing_service.dart';
import 'package:routecore/shared/services/routing_service.dart';
import 'package:routecore/shared/services/traffic_service.dart';

void main() {
  const lyon = GeoPoint(latitude: 45.7640, longitude: 4.8357);
  const valence = GeoPoint(latitude: 44.9334, longitude: 4.8924);

  // Minimal OSRM /route response: 2 alternatives, GeoJSON [lng, lat].
  final fixture = {
    'code': 'Ok',
    'routes': [
      {
        'distance': 101200.0,
        'duration': 4980.0,
        'geometry': {
          'type': 'LineString',
          'coordinates': [
            [4.8357, 45.7640],
            [4.86, 45.40],
            [4.8924, 44.9334],
          ],
        },
      },
      {
        'distance': 96500.0,
        'duration': 5400.0,
        'geometry': {
          'type': 'LineString',
          'coordinates': [
            [4.8357, 45.7640],
            [4.80, 45.35],
            [4.8924, 44.9334],
          ],
        },
      },
    ],
  };

  group('OsrmRoutingService.parseRoutes', () {
    final service = OsrmRoutingService();

    test('maps fastest/shortest/eco from alternatives', () {
      const request = RouteRequest(origin: lyon, destination: valence);
      final options = service.parseRoutes(fixture, request);

      final fastest =
          options.firstWhere((o) => o.routeMode == RouteMode.fastest);
      final shortest =
          options.firstWhere((o) => o.routeMode == RouteMode.shortest);

      expect(fastest.distanceMeters, 101200);
      expect(fastest.durationSeconds, 4980);
      expect(shortest.distanceMeters, 96500,
          reason: 'shortest picks the min-distance alternative');
      expect(options.every((o) => o.provider == 'osrm'), isTrue);
      expect(options.every((o) => o.estimatedCo2Kg != null), isTrue);
    });

    test('GeoJSON lng,lat is converted to lat,lng polyline and decodes', () {
      const request = RouteRequest(origin: lyon, destination: valence);
      final fastest = service
          .parseRoutes(fixture, request)
          .firstWhere((o) => o.routeMode == RouteMode.fastest);
      final points = service.getRoutePolyline(fastest);
      expect(points.first.latitude, closeTo(45.7640, 1e-6));
      expect(points.first.longitude, closeTo(4.8357, 1e-6));
      expect(points.last.latitude, closeTo(44.9334, 1e-6));
    });

    test('discovery mode adds the most scenic alternative', () {
      const request = RouteRequest(
          origin: lyon, destination: valence, routeMode: RouteMode.discovery);
      final options = service.parseRoutes(fixture, request);
      final discovery =
          options.firstWhere((o) => o.routeMode == RouteMode.discovery);
      expect(discovery.distanceMeters, 101200,
          reason: 'longest alternative = byDistance.last');
    });

    test('empty routes -> empty list (caller falls back to mock)', () {
      const request = RouteRequest(origin: lyon, destination: valence);
      expect(service.parseRoutes({'routes': []}, request), isEmpty);
    });
  });

  group('OsrmRoutingService.parseViaRoute', () {
    final service = OsrmRoutingService();

    final viaFixture = {
      'code': 'Ok',
      'routes': [
        {
          'distance': 118400.0,
          'duration': 6120.0,
          'geometry': {
            'type': 'LineString',
            'coordinates': [
              [4.8357, 45.7640],
              [4.7670, 45.4630], // halte 1
              [4.8470, 45.0730], // halte 2
              [4.8924, 44.9334],
            ],
          },
        },
      ],
    };

    test('maps the échappée route through the haltes', () {
      final option = service.parseViaRoute(
        viaFixture,
        origin: lyon,
        destination: valence,
        viaCount: 2,
      );
      expect(option, isNotNull);
      expect(option!.routeMode, RouteMode.discovery);
      expect(option.provider, 'osrm');
      expect(option.distanceMeters, 118400);
      expect(option.durationSeconds, 6120);
      expect(option.metadata['viaCount'], 2);
      final points = service.getRoutePolyline(option);
      expect(points, hasLength(4));
      expect(points[1].latitude, closeTo(45.4630, 1e-6),
          reason: 'la ligne passe par la halte');
    });

    test('no route -> null (caller falls back to direct)', () {
      expect(
        service.parseViaRoute({'routes': []},
            origin: lyon, destination: valence, viaCount: 1),
        isNull,
      );
    });
  });

  group('MockRoutingService.getRouteVia', () {
    test('synthesizes a polyline through the vias', () async {
      const via = GeoPoint(latitude: 45.4, longitude: 5.2);
      final option = await MockRoutingService().getRouteVia(
        origin: lyon,
        vias: const [via],
        destination: valence,
      );
      expect(option, isNotNull);
      expect(option!.routeMode, RouteMode.discovery);
      final points = MockRoutingService().getRoutePolyline(option);
      expect(points, hasLength(3));
      expect(points[1], via);
      expect(option.durationSeconds, greaterThan(0));
      expect(option.estimatedCo2Kg, isNotNull);
    });
  });

  group('OsrmRoutingService.assembleOptions', () {
    final service = OsrmRoutingService();

    // (a) standard request: alternatives=true & steps=true. The main route
    // rides the A7 for 71.2 km.
    final aFixture = {
      'code': 'Ok',
      'routes': [
        {
          'distance': 101200.0,
          'duration': 4980.0,
          'geometry': {
            'type': 'LineString',
            'coordinates': [
              [4.8357, 45.7640],
              [4.86, 45.40],
              [4.8924, 44.9334],
            ],
          },
          'legs': [
            {
              'steps': [
                {
                  'distance': 71200.0,
                  'name': 'Autoroute du Soleil',
                  'ref': 'A 7',
                  'intersections': [
                    {
                      'classes': ['motorway'],
                    },
                  ],
                },
                {
                  'distance': 30000.0,
                  'name': 'Avenue Berthelot',
                  'intersections': [
                    {'classes': <String>[]},
                  ],
                },
              ],
            },
          ],
        },
        {
          'distance': 96500.0,
          'duration': 5400.0,
          'geometry': {
            'type': 'LineString',
            'coordinates': [
              [4.8357, 45.7640],
              [4.80, 45.35],
              [4.8924, 44.9334],
            ],
          },
        },
      ],
    };

    // (b) exclude=motorway: single route, longer and slower.
    final bFixture = {
      'code': 'Ok',
      'routes': [
        {
          'distance': 132000.0,
          'duration': 7800.0,
          'geometry': {
            'type': 'LineString',
            'coordinates': [
              [4.8357, 45.7640],
              [4.95, 45.30],
              [4.8924, 44.9334],
            ],
          },
        },
      ],
    };

    test('fastest keeps highways + toll estimate; shortest/eco avoid them',
        () {
      const request = RouteRequest(origin: lyon, destination: valence);
      final options = service.assembleOptions(aFixture, bFixture, request);

      final fastest =
          options.firstWhere((o) => o.routeMode == RouteMode.fastest);
      expect(fastest.distanceMeters, 101200);
      expect(fastest.metadata['highway'], isTrue);
      expect(fastest.metadata['motorwayKm'], closeTo(71.2, 0.01));
      expect(fastest.metadata['tollEstimateEur'], greaterThan(0));
      expect(fastest.metadata['tollEstimateEur'], closeTo(8.4, 0.01),
          reason: '71.2 km x 0.118 EUR/km');

      for (final mode in [RouteMode.shortest, RouteMode.eco]) {
        final option = options.firstWhere((o) => o.routeMode == mode);
        expect(option.distanceMeters, 132000,
            reason: '$mode uses the no-motorway (b) route');
        expect(option.metadata['noHighway'], isTrue);
        expect(option.metadata['highway'], isFalse);
        final points = service.getRoutePolyline(option);
        expect(points[1].latitude, closeTo(45.30, 1e-6),
            reason: '$mode carries the (b) geometry');
        expect(points[1].longitude, closeTo(4.95, 1e-6));
      }
    });

    test('eco keeps gentler consumption than shortest on the same route', () {
      const request = RouteRequest(origin: lyon, destination: valence);
      final options = service.assembleOptions(aFixture, bFixture, request);
      final shortest =
          options.firstWhere((o) => o.routeMode == RouteMode.shortest);
      final eco = options.firstWhere((o) => o.routeMode == RouteMode.eco);
      expect(eco.estimatedFuelLiters!, lessThan(shortest.estimatedFuelLiters!));
    });

    test('bJson == null falls back to min-distance alternative of (a)', () {
      const request = RouteRequest(origin: lyon, destination: valence);
      final options = service.assembleOptions(aFixture, null, request);

      final shortest =
          options.firstWhere((o) => o.routeMode == RouteMode.shortest);
      final eco = options.firstWhere((o) => o.routeMode == RouteMode.eco);
      expect(shortest.distanceMeters, 96500,
          reason: 'previous behavior: min-distance alternative of (a)');
      expect(eco.distanceMeters, 96500);
      expect(shortest.metadata.containsKey('noHighway'), isFalse);
      expect(eco.metadata.containsKey('noHighway'), isFalse);

      // (a) succeeded, so fastest still documents its highway nature.
      final fastest =
          options.firstWhere((o) => o.routeMode == RouteMode.fastest);
      expect(fastest.metadata['highway'], isTrue);
    });

    test('(b) with empty routes is treated like a failed (b)', () {
      const request = RouteRequest(origin: lyon, destination: valence);
      final options = service.assembleOptions(
          aFixture, {'code': 'NoRoute', 'routes': <Object>[]}, request);
      final shortest =
          options.firstWhere((o) => o.routeMode == RouteMode.shortest);
      expect(shortest.distanceMeters, 96500);
      expect(shortest.metadata.containsKey('noHighway'), isFalse);
    });

    test('discovery stays the most scenic alternative of (a)', () {
      const request = RouteRequest(
          origin: lyon, destination: valence, routeMode: RouteMode.discovery);
      final options = service.assembleOptions(aFixture, bFixture, request);
      final discovery =
          options.firstWhere((o) => o.routeMode == RouteMode.discovery);
      expect(discovery.distanceMeters, 101200);
    });

    test('empty (a) routes -> empty list (caller falls back to mock)', () {
      const request = RouteRequest(origin: lyon, destination: valence);
      expect(
        service.assembleOptions({'routes': <Object>[]}, bFixture, request),
        isEmpty,
      );
    });
  });

  group('toll estimation', () {
    test('motorwayKmFromRoute sums only motorway/toll steps', () {
      final route = {
        'legs': [
          {
            'steps': [
              {'distance': 12000.0, 'ref': 'A 7'},
              {
                'distance': 3000.0,
                'intersections': [
                  {
                    'classes': ['motorway'],
                  },
                ],
              },
              {'distance': 5000.0, 'name': 'Route de Valence', 'ref': 'D 86'},
            ],
          },
        ],
      };
      expect(OsrmRoutingService.motorwayKmFromRoute(route),
          closeTo(15.0, 1e-9));
    });

    test('route without steps -> 0 km', () {
      expect(OsrmRoutingService.motorwayKmFromRoute({'legs': <Object>[]}), 0);
      expect(OsrmRoutingService.motorwayKmFromRoute(<String, dynamic>{}), 0);
    });

    test('estimateTollEur clamps short distances, ~0.118 EUR/km otherwise',
        () {
      expect(OsrmRoutingService.estimateTollEur(0), 0);
      expect(OsrmRoutingService.estimateTollEur(4.9), 0,
          reason: '< 5 km motorway = assumed free section');
      expect(OsrmRoutingService.estimateTollEur(100), closeTo(11.8, 0.001));
    });
  });

  group('TrafficService', () {
    test('MockTrafficService returns an honest empty list', () async {
      final incidents =
          await const MockTrafficService().incidentsAlong([lyon, valence]);
      expect(incidents, isEmpty);
    });

    test('BisonFuteTrafficService is an explicit stub', () {
      expect(
        () => const BisonFuteTrafficService().incidentsAlong([lyon, valence]),
        throwsUnimplementedError,
      );
    });
  });
}
