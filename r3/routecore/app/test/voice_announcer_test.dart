import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/features/navigation/data/osrm_directions_service.dart';
import 'package:routecore/features/navigation/domain/navigation_engine.dart';
import 'package:routecore/features/navigation/domain/voice_announcer.dart';
import 'package:routecore/shared/models/models.dart';

void main() {
  const here = GeoPoint(latitude: 45.0, longitude: 4.8);

  NavInstruction turn({String modifier = 'right', String? road = 'la D7'}) =>
      NavInstruction(
        maneuverType: 'turn',
        modifier: modifier,
        roadName: road,
        location: here,
        distanceMeters: 500,
        durationSeconds: 30,
      );

  NavState state(NavInstruction? current, double distanceToManeuver) => NavState(
        current: current,
        distanceToManeuverMeters: distanceToManeuver,
        remainingMeters: 2000,
        etaSeconds: 200,
        offRoute: false,
        progress: 0.3,
      );

  group('VoiceAnnouncer', () {
    test('départ annoncé une seule fois', () {
      final a = VoiceAnnouncer();
      const depart = NavInstruction(
          maneuverType: 'depart',
          location: here,
          distanceMeters: 0,
          durationSeconds: 0);
      expect(a.onNav(state(depart, 2000)), 'Prends la route');
      expect(a.onNav(state(depart, 1900)), isNull, reason: 'pas de répétition');
    });

    test('manœuvre : rien trop loin, préparation puis imminence', () {
      final a = VoiceAnnouncer(prepareDistanceMeters: 350, nowDistanceMeters: 90);
      final t = turn();
      expect(a.onNav(state(t, 800)), isNull, reason: 'trop loin');
      final prep = a.onNav(state(t, 300));
      expect(prep, isNotNull);
      expect(prep, contains('mètres'));
      expect(prep, contains('tourne à droite'),
          reason: 'minuscule en milieu de phrase');
      expect(a.onNav(state(t, 250)), isNull, reason: 'préparation déjà dite');
      final now = a.onNav(state(t, 70));
      expect(now, 'Tourne à droite sur la D7');
      expect(a.onNav(state(t, 40)), isNull, reason: 'imminence déjà dite');
    });

    test('step court : on passe direct à l\'imminence', () {
      final a = VoiceAnnouncer(nowDistanceMeters: 90);
      final t = turn(modifier: 'left', road: null);
      expect(a.onNav(state(t, 60)), 'Tourne à gauche');
      expect(a.onNav(state(t, 30)), isNull);
    });

    test('nouvelle manœuvre : les phases se réarment', () {
      final a = VoiceAnnouncer();
      final t1 = turn(modifier: 'right');
      final t2 = turn(modifier: 'left', road: 'la N7');
      expect(a.onNav(state(t1, 70)), isNotNull);
      expect(a.onNav(state(t1, 50)), isNull);
      // Manœuvre suivante (instance différente) -> ré-annonce.
      expect(a.onNav(state(t2, 70)), 'Tourne à gauche sur la N7');
    });

    test('arrivée annoncée une seule fois', () {
      final a = VoiceAnnouncer();
      const arrive = NavInstruction(
          maneuverType: 'arrive',
          location: here,
          distanceMeters: 0,
          durationSeconds: 0);
      expect(a.onNav(state(arrive, 20)), contains('arrivé'));
      expect(a.onNav(state(arrive, 5)), isNull);
    });

    test('current null -> aucune annonce', () {
      expect(VoiceAnnouncer().onNav(state(null, 100)), isNull);
    });
  });
}
