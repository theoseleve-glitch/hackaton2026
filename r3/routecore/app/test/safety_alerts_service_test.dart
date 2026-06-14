import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/features/safety/data/safety_alerts_service.dart';
import 'package:routecore/shared/models/models.dart';

void main() {
  group('SafetyAlertsService.parseOverpass', () {
    test('mappe passage à niveau + école (node & way), ignore le reste', () {
      final json = {
        'elements': [
          {
            'type': 'node',
            'lat': 48.85,
            'lon': 2.35,
            'tags': {'railway': 'level_crossing'},
          },
          {
            'type': 'node',
            'lat': 48.86,
            'lon': 2.36,
            'tags': {'amenity': 'school'},
          },
          {
            // way école : coordonnées via `center` (out center).
            'type': 'way',
            'center': {'lat': 48.87, 'lon': 2.37},
            'tags': {'amenity': 'school'},
          },
          {
            // noeud ignoré : tag non pertinent.
            'type': 'node',
            'lat': 48.88,
            'lon': 2.38,
            'tags': {'amenity': 'restaurant'},
          },
        ],
      };

      final points = SafetyAlertsService.parseOverpass(json);

      expect(points, hasLength(3));
      expect(
        points.where((p) => p.kind == SafetyKind.railwayCrossing),
        hasLength(1),
      );
      expect(
        points.where((p) => p.kind == SafetyKind.school),
        hasLength(2),
      );
      // Aucun point pour le restaurant.
      final crossing = points.firstWhere(
          (p) => p.kind == SafetyKind.railwayCrossing);
      expect(crossing.location.latitude, 48.85);
      expect(crossing.location.longitude, 2.35);
    });

    test('réponse vide / absente -> liste vide (jamais de fausses données)', () {
      expect(SafetyAlertsService.parseOverpass({'elements': <Object>[]}),
          isEmpty);
      expect(SafetyAlertsService.parseOverpass(<String, dynamic>{}), isEmpty);
    });

    test('élément sans coordonnées exploitables est ignoré', () {
      final json = {
        'elements': [
          {
            'type': 'way',
            'tags': {'amenity': 'school'}, // ni lat/lon ni center
          },
        ],
      };
      expect(SafetyAlertsService.parseOverpass(json), isEmpty);
    });
  });

  group('SafetyAlertsService.parseCurves', () {
    test('polyline en L (virage à 90°) -> 1 virage serré au sommet', () {
      // Branche vers l'est puis vers le nord : virage de ~90° au coude.
      const corner = GeoPoint(latitude: 48.0, longitude: 2.01);
      final polyline = [
        const GeoPoint(latitude: 48.0, longitude: 2.0), // départ
        corner, // coude (cap change de Est -> Nord)
        const GeoPoint(latitude: 48.01, longitude: 2.01), // arrivée
      ];

      final curves = SafetyAlertsService.parseCurves(polyline);

      expect(curves, hasLength(1));
      expect(curves.single.kind, SafetyKind.sharpCurve);
      expect(curves.single.location, corner);
    });

    test('ligne droite -> aucun virage', () {
      final straight = [
        const GeoPoint(latitude: 48.0, longitude: 2.0),
        const GeoPoint(latitude: 48.0, longitude: 2.01),
        const GeoPoint(latitude: 48.0, longitude: 2.02),
        const GeoPoint(latitude: 48.0, longitude: 2.03),
      ];
      expect(SafetyAlertsService.parseCurves(straight), isEmpty);
    });

    test('léger virage sous le seuil -> ignoré ; relevé seuil -> détecté', () {
      // Coude doux d'environ 30° : sous le défaut (45°), détecté à 20°.
      final gentle = [
        const GeoPoint(latitude: 48.0, longitude: 2.0),
        const GeoPoint(latitude: 48.0, longitude: 2.01),
        const GeoPoint(latitude: 48.005, longitude: 2.02),
      ];
      expect(SafetyAlertsService.parseCurves(gentle), isEmpty);
      expect(
        SafetyAlertsService.parseCurves(gentle, angleThresholdDeg: 20),
        hasLength(1),
      );
    });

    test('trop court -> liste vide', () {
      expect(SafetyAlertsService.parseCurves(const []), isEmpty);
      expect(
          SafetyAlertsService.parseCurves(
              const [GeoPoint(latitude: 48.0, longitude: 2.0)]),
          isEmpty);
    });
  });

  group('SafetyAlertsService.fatigueDue', () {
    test('vrai au seuil et au-delà, faux en dessous', () {
      expect(SafetyAlertsService.fatigueDue(const Duration(hours: 2)), isTrue);
      expect(
          SafetyAlertsService.fatigueDue(
              const Duration(hours: 2, minutes: 30)),
          isTrue);
      expect(
          SafetyAlertsService.fatigueDue(
              const Duration(hours: 1, minutes: 59)),
          isFalse);
    });

    test('seuil personnalisable', () {
      expect(
        SafetyAlertsService.fatigueDue(
          const Duration(minutes: 90),
          threshold: const Duration(minutes: 90),
        ),
        isTrue,
      );
      expect(
        SafetyAlertsService.fatigueDue(
          const Duration(minutes: 60),
          threshold: const Duration(minutes: 90),
        ),
        isFalse,
      );
    });
  });

  group('SafetyAlertsService.nextHazardAhead', () {
    // Position de référence, cap plein Est (90°).
    const pos = GeoPoint(latitude: 48.0, longitude: 2.0);
    const headingEast = 90.0;

    // ~0.001° de longitude ≈ 74 m à cette latitude ; ~0.002° ≈ 148 m.
    const ahead = SafetyPoint(
      location: GeoPoint(latitude: 48.0, longitude: 2.002), // ~148 m à l'Est
      kind: SafetyKind.railwayCrossing,
    );
    const behind = SafetyPoint(
      location: GeoPoint(latitude: 48.0, longitude: 1.998), // à l'Ouest
      kind: SafetyKind.school,
    );
    const offCorridor = SafetyPoint(
      // Plein Nord : devant à 90° -> hors couloir.
      location: GeoPoint(latitude: 48.002, longitude: 2.0),
      kind: SafetyKind.school,
    );

    test('sélectionne le point devant, dans le couloir', () {
      final next = SafetyAlertsService.nextHazardAhead(
          pos, headingEast, const [ahead, behind, offCorridor]);
      expect(next, isNotNull);
      expect(next!.kind, SafetyKind.railwayCrossing);
      expect(next.location, ahead.location);
    });

    test('ignore les points derrière', () {
      final next = SafetyAlertsService.nextHazardAhead(
          pos, headingEast, const [behind]);
      expect(next, isNull);
    });

    test('ignore les points hors couloir latéral', () {
      final next = SafetyAlertsService.nextHazardAhead(
          pos, headingEast, const [offCorridor]);
      expect(next, isNull);
    });

    test('ignore les points au-delà de aheadMeters', () {
      final next = SafetyAlertsService.nextHazardAhead(
        pos,
        headingEast,
        const [ahead], // ~148 m
        aheadMeters: 100, // trop court
      );
      expect(next, isNull);
    });

    test('renvoie le plus proche quand plusieurs sont devant', () {
      const closer = SafetyPoint(
        location: GeoPoint(latitude: 48.0, longitude: 2.001), // ~74 m
        kind: SafetyKind.sharpCurve,
      );
      final next = SafetyAlertsService.nextHazardAhead(
          pos, headingEast, const [ahead, closer]);
      expect(next!.kind, SafetyKind.sharpCurve);
      expect(next.location, closer.location);
    });

    test('liste vide -> null', () {
      expect(
        SafetyAlertsService.nextHazardAhead(pos, headingEast, const []),
        isNull,
      );
    });
  });

  group('SafetyAlertsService.boundingBox', () {
    test('englobe tous les points du tracé', () {
      final box = SafetyAlertsService.boundingBox(const [
        GeoPoint(latitude: 48.0, longitude: 2.0),
        GeoPoint(latitude: 48.5, longitude: 2.5),
        GeoPoint(latitude: 47.8, longitude: 1.9),
      ]);
      expect(box.south, 47.8);
      expect(box.north, 48.5);
      expect(box.west, 1.9);
      expect(box.east, 2.5);
    });
  });
}
