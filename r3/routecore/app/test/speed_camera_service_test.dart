import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/features/safety/data/speed_camera_service.dart';
import 'package:routecore/shared/models/models.dart';

void main() {
  // Point de référence (Lyon, vallée du Rhône). On positionne des radars de
  // synthèse au nord/sud/est en mètres pour tester le filtre cap + couloir
  // de façon déterministe. ~1 deg latitude ≈ 111320 m.
  const ref = GeoPoint(latitude: 45.0, longitude: 4.8);
  const mPerDegLat = 111320.0;
  const mPerDegLng = 111320.0 * 0.7071; // cos(45deg)

  // Décale [ref] de [northM] mètres vers le nord et [eastM] vers l'est.
  GeoPoint offset(double northM, double eastM) => GeoPoint(
        latitude: ref.latitude + northM / mPerDegLat,
        longitude: ref.longitude + eastM / mPerDegLng,
      );

  SpeedCamera camAt(double northM, double eastM, {String road = 'A7'}) =>
      SpeedCamera(location: offset(northM, eastM), road: road, limitKmh: 130);

  group('SpeedCameraService.camerasAhead — devant / derrière', () {
    test('cap NORD : garde le radar au nord, écarte celui au sud', () {
      final north = camAt(800, 0); // 800 m devant (cap 0°)
      final south = camAt(-800, 0); // 800 m derrière
      final result = SpeedCameraService.camerasAhead(ref, 0, [north, south]);
      expect(result, [north]);
    });

    test('cap SUD (180°) : inverse — garde le radar au sud', () {
      final north = camAt(800, 0);
      final south = camAt(-800, 0);
      final result =
          SpeedCameraService.camerasAhead(ref, 180, [north, south]);
      expect(result, [south]);
    });
  });

  group('SpeedCameraService.camerasAhead — couloir latéral', () {
    test('écarte un radar devant mais hors du couloir (trop à l\'est)', () {
      // 600 m devant (nord) mais 400 m à l'est : hors couloir 150 m.
      final offCorridor = camAt(600, 400);
      final inCorridor = camAt(600, 50); // 50 m d'écart : dans le couloir
      final result = SpeedCameraService.camerasAhead(
        ref,
        0,
        [offCorridor, inCorridor],
        corridorMeters: 150,
      );
      expect(result, [inCorridor]);
    });

    test('respecte aheadMeters : radar trop loin devant écarté', () {
      final near = camAt(500, 0);
      final far = camAt(3000, 0); // au-delà du défaut 1500 m
      final result = SpeedCameraService.camerasAhead(ref, 0, [near, far]);
      expect(result, [near]);
    });
  });

  group('SpeedCameraService.camerasAhead — tri par proximité', () {
    test('trie du plus proche au plus lointain le long du cap', () {
      final far = camAt(1200, 0);
      final near = camAt(300, 0);
      final mid = camAt(700, 0);
      final result =
          SpeedCameraService.camerasAhead(ref, 0, [far, near, mid]);
      expect(result, [near, mid, far]);
    });
  });

  group('SpeedCameraService.nextCamera', () {
    test('renvoie le plus proche devant', () {
      final far = camAt(1200, 0);
      final near = camAt(300, 0);
      expect(SpeedCameraService.nextCamera(ref, 0, [far, near]), near);
    });

    test('null quand aucun radar dans le couloir/portée', () {
      final behind = camAt(-500, 0);
      expect(SpeedCameraService.nextCamera(ref, 0, [behind]), isNull);
      expect(SpeedCameraService.nextCamera(ref, 0, const []), isNull);
    });
  });

  group('SpeedCameraService.parse', () {
    test('parse les entrées valides et ignore celles sans coordonnées', () {
      final list = SpeedCameraService.parse({
        'cameras': [
          {'lat': 45.0, 'lng': 4.8, 'road': 'A7', 'limitKmh': 130, 'type': 'fixed'},
          {'road': 'A6'}, // pas de coordonnées -> ignorée
        ],
      });
      expect(list, hasLength(1));
      expect(list.first.road, 'A7');
      expect(list.first.limitKmh, 130);
      expect(list.first.type, 'fixed');
    });

    test('document vide / sans clé cameras -> liste vide', () {
      expect(SpeedCameraService.parse(const {}), isEmpty);
      expect(SpeedCameraService.parse({'cameras': const []}), isEmpty);
    });
  });
}
