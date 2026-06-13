import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/features/navigation/data/osrm_directions_service.dart';
import 'package:routecore/features/navigation/domain/navigation_engine.dart';
import 'package:routecore/shared/models/models.dart';

void main() {
  // Minimal OSRM /route?steps=true response: depart, a right turn, a
  // roundabout (exit 2) and arrive. GeoJSON order is [lng, lat].
  final fixture = {
    'code': 'Ok',
    'routes': [
      {
        'distance': 2400.0,
        'duration': 180.0,
        'legs': [
          {
            'steps': [
              {
                'distance': 800.0,
                'duration': 60.0,
                'name': 'Route de Vienne',
                'geometry': {
                  'coordinates': [
                    [4.80, 45.70],
                    [4.81, 45.70],
                  ],
                },
                'maneuver': {
                  'location': [4.80, 45.70],
                  'type': 'depart',
                },
              },
              {
                'distance': 900.0,
                'duration': 70.0,
                'name': 'Avenue des Vignes',
                'geometry': {
                  'coordinates': [
                    [4.81, 45.70],
                    [4.81, 45.71],
                  ],
                },
                'maneuver': {
                  'location': [4.81, 45.70],
                  'type': 'turn',
                  'modifier': 'right',
                },
              },
              {
                'distance': 700.0,
                'duration': 50.0,
                'name': 'D386',
                'geometry': {
                  'coordinates': [
                    [4.81, 45.71],
                    [4.82, 45.71],
                  ],
                },
                'maneuver': {
                  'location': [4.81, 45.71],
                  'type': 'roundabout',
                  'modifier': 'straight',
                  'exit': 2,
                },
              },
              {
                'distance': 0.0,
                'duration': 0.0,
                'name': '',
                'geometry': {
                  'coordinates': [
                    [4.82, 45.71],
                    [4.82, 45.71],
                  ],
                },
                'maneuver': {
                  'location': [4.82, 45.71],
                  'type': 'arrive',
                },
              },
            ],
          },
        ],
      },
    ],
  };

  group('parseSteps', () {
    test('maps every step of every leg in driving order', () {
      final instructions = parseSteps(fixture);
      expect(instructions, hasLength(4));
      expect(instructions[0].maneuverType, 'depart');
      expect(instructions[1].maneuverType, 'turn');
      expect(instructions[1].modifier, 'right');
      expect(instructions[1].roadName, 'Avenue des Vignes');
      expect(instructions[2].maneuverType, 'roundabout');
      expect(instructions[2].exitNumber, 2);
      expect(instructions[3].maneuverType, 'arrive');
      expect(instructions[3].roadName, isNull,
          reason: 'empty OSRM name → null');
    });

    test('converts GeoJSON [lng, lat] to GeoPoint(lat, lng)', () {
      final instructions = parseSteps(fixture);
      expect(instructions.first.location.latitude, closeTo(45.70, 1e-9));
      expect(instructions.first.location.longitude, closeTo(4.80, 1e-9));
      expect(instructions.first.points.first.latitude, closeTo(45.70, 1e-9));
      expect(instructions.first.points.last.longitude, closeTo(4.81, 1e-9));
    });

    test('empty routes → empty list', () {
      expect(parseSteps({'routes': <Object>[]}), isEmpty);
    });

    test('stitchGeometry concatenates steps without duplicated joints', () {
      final geometry = stitchGeometry(parseSteps(fixture));
      // 4 steps of 2 points share 3 joints + 1 degenerate arrive segment.
      expect(geometry, hasLength(4));
      expect(geometry.first,
          const GeoPoint(latitude: 45.70, longitude: 4.80));
      expect(geometry.last,
          const GeoPoint(latitude: 45.71, longitude: 4.82));
    });
  });

  group('frenchText', () {
    NavInstruction make(String type,
            {String? modifier, int? exit, String? road}) =>
        NavInstruction(
          maneuverType: type,
          modifier: modifier,
          exitNumber: exit,
          roadName: road,
          location: const GeoPoint(latitude: 0, longitude: 0),
          distanceMeters: 0,
          durationSeconds: 0,
        );

    test('depart', () {
      expect(frenchText(make('depart')), 'Prends la route');
    });

    test('roundabout with exit number', () {
      expect(frenchText(make('roundabout', exit: 2)),
          'Au rond-point, prends la 2e sortie');
      expect(frenchText(make('rotary', exit: 1)),
          'Au rond-point, prends la 1re sortie');
    });

    test('turns, with and without road name', () {
      expect(frenchText(make('turn', modifier: 'left', road: 'D36')),
          'Tourne à gauche sur D36');
      expect(frenchText(make('turn', modifier: 'right')), 'Tourne à droite');
      expect(frenchText(make('fork', modifier: 'slight left')),
          'Serre à gauche');
      expect(frenchText(make('turn', modifier: 'slight right', road: 'D7')),
          'Serre à droite sur D7');
      expect(frenchText(make('continue', modifier: 'straight')),
          'Continue tout droit');
    });

    test('arrive', () {
      expect(frenchText(make('arrive')), 'Tu es arrivé·e — belle route.');
    });
  });

  group('NavigationEngine.update', () {
    // L-shaped route: ~787 m east then ~1106 m north (total ~1893 m).
    const start = GeoPoint(latitude: 45.0, longitude: 4.0);
    const corner = GeoPoint(latitude: 45.0, longitude: 4.01);
    const end = GeoPoint(latitude: 45.01, longitude: 4.01);
    const polyline = [start, corner, end];

    NavInstruction maneuver(String type, GeoPoint at,
            {String? modifier, double distance = 0, double duration = 0}) =>
        NavInstruction(
          maneuverType: type,
          modifier: modifier,
          location: at,
          distanceMeters: distance,
          durationSeconds: duration,
        );

    final instructions = [
      maneuver('depart', start, distance: 787, duration: 60),
      maneuver('turn', corner, modifier: 'left', distance: 1106, duration: 90),
      maneuver('arrive', end),
    ];

    NavigationEngine engine() =>
        NavigationEngine(instructions: instructions, polyline: polyline);

    test('mid-route → next maneuver is the corner turn, sane metrics', () {
      final state = engine().update(
        const GeoPoint(latitude: 45.0, longitude: 4.005),
        speedMps: 25,
      );
      expect(state.current?.maneuverType, 'turn');
      expect(state.next?.maneuverType, 'arrive');
      expect(state.distanceToManeuverMeters, closeTo(394, 50));
      expect(state.remainingMeters, closeTo(1500, 80));
      expect(state.etaSeconds, greaterThan(0));
      expect(state.offRoute, isFalse);
      expect(state.progress, inExclusiveRange(0, 1));
    });

    test('advancing decreases distance to maneuver and remaining', () {
      final e = engine();
      final before =
          e.update(const GeoPoint(latitude: 45.0, longitude: 4.005));
      final after =
          e.update(const GeoPoint(latitude: 45.0, longitude: 4.008));
      expect(after.distanceToManeuverMeters,
          lessThan(before.distanceToManeuverMeters));
      expect(after.remainingMeters, lessThan(before.remainingMeters));
      expect(after.progress, greaterThan(before.progress));
    });

    test('past the corner → arrive becomes the current maneuver', () {
      final state =
          engine().update(const GeoPoint(latitude: 45.005, longitude: 4.01));
      expect(state.current?.maneuverType, 'arrive');
      expect(state.next, isNull);
    });

    test('detects off-route beyond 60 m', () {
      final state =
          engine().update(const GeoPoint(latitude: 45.003, longitude: 4.003));
      expect(state.offRoute, isTrue);
      final onRoute =
          engine().update(const GeoPoint(latitude: 45.0002, longitude: 4.005));
      expect(onRoute.offRoute, isFalse, reason: '~22 m drift stays on-route');
    });

    test('eta uses the better of live speed and route average', () {
      final e = engine();
      const p = GeoPoint(latitude: 45.0, longitude: 4.005);
      final slow = e.update(p, speedMps: 1);
      final fast = e.update(p, speedMps: 25);
      expect(fast.etaSeconds, lessThan(slow.etaSeconds));
      expect(slow.etaSeconds, lessThanOrEqualTo(slow.remainingMeters / 1),
          reason: 'a stopped car never yields an infinite ETA');
    });
  });

  group('SimulatedDrive', () {
    const start = GeoPoint(latitude: 45.0, longitude: 4.0);
    const east = GeoPoint(latitude: 45.0, longitude: 4.01);

    test('emits monotonically advancing positions', () async {
      final drive = SimulatedDrive(
        polyline: const [start, east],
        speedKmh: 90,
        timeLapse: 1.5,
        tick: const Duration(milliseconds: 20),
      );
      final events = await drive.positions().take(3).toList();
      expect(events, hasLength(3));
      final d0 = start.distanceTo(events[0]);
      final d1 = start.distanceTo(events[1]);
      final d2 = start.distanceTo(events[2]);
      expect(d1, greaterThan(d0));
      expect(d2, greaterThan(d1));
    });

    test('ends on the last polyline point and closes the stream', () async {
      // ~16 m route, ~3.75 m per tick → finishes in a handful of ticks.
      const tinyEnd = GeoPoint(latitude: 45.0, longitude: 4.0002);
      final drive = SimulatedDrive(
        polyline: const [start, tinyEnd],
        speedKmh: 90,
        timeLapse: 1.5,
        tick: const Duration(milliseconds: 20),
      );
      final events = await drive.positions().toList();
      expect(events, isNotEmpty);
      expect(events.last, tinyEnd);
    });
  });

  group('NavigationEngine.bearingDegrees', () {
    const origin = GeoPoint(latitude: 45.0, longitude: 4.0);

    test('cardinal directions (0=N, 90=E, 180=S, 270=W)', () {
      expect(
          NavigationEngine.bearingDegrees(
              origin, const GeoPoint(latitude: 45.001, longitude: 4.0)),
          closeTo(0, 0.01));
      expect(
          NavigationEngine.bearingDegrees(
              origin, const GeoPoint(latitude: 45.0, longitude: 4.001)),
          closeTo(90, 0.01));
      expect(
          NavigationEngine.bearingDegrees(
              origin, const GeoPoint(latitude: 44.999, longitude: 4.0)),
          closeTo(180, 0.01));
      expect(
          NavigationEngine.bearingDegrees(
              origin, const GeoPoint(latitude: 45.0, longitude: 3.999)),
          closeTo(270, 0.01));
    });

    test('slightly west of north wraps into [0, 360) instead of negative', () {
      final bearing = NavigationEngine.bearingDegrees(
          origin, const GeoPoint(latitude: 45.001, longitude: 3.9999));
      expect(bearing, closeTo(356, 1));
      expect(bearing, inExclusiveRange(0, 360));
    });
  });

  group('HeadingSmoother', () {
    test('first sample passes through unchanged', () {
      expect(HeadingSmoother().smooth(123), 123);
    });

    test('eases toward the target with the configured factor', () {
      final smoother = HeadingSmoother(factor: 0.25);
      smoother.smooth(0);
      expect(smoother.smooth(40), closeTo(10, 1e-9));
    });

    test('359 -> 1 eases through 0 instead of spinning the long way', () {
      final smoother = HeadingSmoother(factor: 0.25);
      smoother.smooth(359);
      expect(smoother.smooth(1), closeTo(359.5, 1e-9),
          reason: 'shortest path is +2 degrees, not -358');
      for (var i = 0; i < 60; i++) {
        smoother.smooth(1);
      }
      expect(smoother.value, closeTo(1, 0.05),
          reason: 'converges across the 0 wrap');
    });

    test('1 -> 359 eases through 0 the other way', () {
      final smoother = HeadingSmoother(factor: 0.25);
      smoother.smooth(1);
      expect(smoother.smooth(359), closeTo(0.5, 1e-9));
    });

    test('jumps over 90 degrees snap immediately (U-turn)', () {
      final smoother = HeadingSmoother(factor: 0.25);
      smoother.smooth(10);
      expect(smoother.smooth(150), 150, reason: '140-degree jump snaps');
      expect(smoother.smooth(330), 330, reason: '180-degree jump snaps');
    });

    test('reset forgets the state', () {
      final smoother = HeadingSmoother(factor: 0.25);
      smoother.smooth(10);
      smoother.reset();
      expect(smoother.smooth(50), 50);
    });
  });

  group('NavState heading and matched segment', () {
    // Same L-shaped route as the update group: east leg then north leg.
    const start = GeoPoint(latitude: 45.0, longitude: 4.0);
    const corner = GeoPoint(latitude: 45.0, longitude: 4.01);
    const end = GeoPoint(latitude: 45.01, longitude: 4.01);

    NavigationEngine engine() => NavigationEngine(
          instructions: const [],
          polyline: const [start, corner, end],
        );

    test('heading follows the bearing of the matched route segment', () {
      final east =
          engine().update(const GeoPoint(latitude: 45.0, longitude: 4.005));
      expect(east.headingDegrees, closeTo(90, 0.5));
      expect(east.matchedIndex, 0);

      final north =
          engine().update(const GeoPoint(latitude: 45.005, longitude: 4.01));
      expect(north.headingDegrees, closeTo(0, 0.5));
      expect(north.matchedIndex, 1);
    });

    test('heading is smoothed across a corner on the same engine', () {
      final e = engine();
      final before =
          e.update(const GeoPoint(latitude: 45.0, longitude: 4.005));
      expect(before.headingDegrees, closeTo(90, 0.5));
      final after =
          e.update(const GeoPoint(latitude: 45.005, longitude: 4.01));
      // 90 -> 0 is exactly the snap threshold, so it eases: 90 + 0.25*(-90).
      expect(after.headingDegrees, closeTo(67.5, 0.5));
    });
  });

  group('NavigationEngine.offsetBy', () {
    const origin = GeoPoint(latitude: 45.0, longitude: 4.0);

    test('moves ~meters toward the bearing', () {
      final east = NavigationEngine.offsetBy(origin, 90, 250);
      expect(origin.distanceTo(east), closeTo(250, 2));
      expect(NavigationEngine.bearingDegrees(origin, east), closeTo(90, 0.5));

      final north = NavigationEngine.offsetBy(origin, 0, 250);
      expect(origin.distanceTo(north), closeTo(250, 2));
      expect(NavigationEngine.bearingDegrees(origin, north), closeTo(0, 0.5));
    });
  });

  group('NavigationEngine.cameraHeading (course-up fusion)', () {
    test('moving (> 3 m/s) keeps the route/course bearing', () {
      expect(
        NavigationEngine.cameraHeading(
            routeHeading: 90, compass: 200, speedMps: 10),
        90,
      );
    });

    test('stopped / crawling (<= 3 m/s) uses the device compass', () {
      expect(
        NavigationEngine.cameraHeading(
            routeHeading: 90, compass: 200, speedMps: 0),
        200,
      );
      expect(
        NavigationEngine.cameraHeading(
            routeHeading: 90, compass: 200, speedMps: 3),
        200,
        reason: 'exactly at the threshold counts as stopped',
      );
    });

    test('falls back to the route bearing when no compass (emulator)', () {
      expect(
        NavigationEngine.cameraHeading(
            routeHeading: 90, compass: null, speedMps: 0),
        90,
      );
    });

    test('custom moving threshold is honored', () {
      expect(
        NavigationEngine.cameraHeading(
            routeHeading: 90,
            compass: 200,
            speedMps: 4,
            movingThresholdMps: 5),
        200,
        reason: '4 m/s is below a 5 m/s threshold → still uses compass',
      );
    });
  });
}
