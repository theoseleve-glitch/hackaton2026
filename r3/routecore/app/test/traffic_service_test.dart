import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/shared/models/models.dart';
import 'package:routecore/shared/services/traffic_service.dart';

void main() {
  // Corridor Lyon -> Valence (A7), simplifié à 2 sommets.
  const lyon = GeoPoint(latitude: 45.7640, longitude: 4.8357);
  const valence = GeoPoint(latitude: 44.9334, longitude: 4.8924);
  const corridor = [lyon, valence];

  // Fixture DATEX II minimale : 2 situationRecord.
  // - Record 1 : accident à ~quelques mètres de Lyon -> DANS le corridor.
  // - Record 2 : travaux à Paris -> HORS corridor.
  const datexXml = '''
<?xml version="1.0" encoding="UTF-8"?>
<d2LogicalModel xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <payloadPublication>
    <situation id="S1">
      <situationRecord id="R1" xsi:type="Accident">
        <generalPublicComment>
          <comment><value>Accident A7 sens sud</value></comment>
        </generalPublicComment>
        <groupOfLocations>
          <locationContainedInGroup>
            <pointByCoordinates>
              <pointCoordinates>
                <latitude>45.7641</latitude>
                <longitude>4.8358</longitude>
              </pointCoordinates>
            </pointByCoordinates>
          </locationContainedInGroup>
        </groupOfLocations>
      </situationRecord>
    </situation>
    <situation id="S2">
      <situationRecord id="R2" xsi:type="MaintenanceWorks">
        <comment><value>Travaux peripherique parisien</value></comment>
        <delays><delayTimeValue>900</delayTimeValue></delays>
        <groupOfLocations>
          <pointByCoordinates>
            <pointCoordinates>
              <latitude>48.8566</latitude>
              <longitude>2.3522</longitude>
            </pointCoordinates>
          </pointByCoordinates>
        </groupOfLocations>
      </situationRecord>
    </situation>
  </payloadPublication>
</d2LogicalModel>
''';

  group('BisonFuteTrafficService.parseDatex (pur)', () {
    test('garde le record DANS le corridor, écarte celui hors corridor', () {
      final incidents = BisonFuteTrafficService.parseDatex(
        datexXml,
        corridor: corridor,
        corridorMeters: 400,
      );
      expect(incidents, hasLength(1), reason: 'seul R1 est près du corridor');
      final r1 = incidents.single;
      expect(r1.kind, 'accident');
      expect(r1.description, 'Accident A7 sens sud');
      expect(r1.location.latitude, closeTo(45.7641, 1e-9));
      expect(r1.location.longitude, closeTo(4.8358, 1e-9));
      expect(r1.delayMinutes, isNull);
    });

    test('le record hors corridor n\'apparaît pas même avec son retard', () {
      final incidents = BisonFuteTrafficService.parseDatex(
        datexXml,
        corridor: corridor,
        corridorMeters: 400,
      );
      expect(incidents.any((i) => i.kind == 'works'), isFalse);
      expect(incidents.any((i) => i.delayMinutes == 15), isFalse);
    });

    test('XML invalide -> liste vide (honnête, jamais de fausses données)', () {
      expect(
        BisonFuteTrafficService.parseDatex('<not-xml',
            corridor: corridor, corridorMeters: 400),
        isEmpty,
      );
      expect(
        BisonFuteTrafficService.parseDatex('',
            corridor: corridor, corridorMeters: 400),
        isEmpty,
      );
    });

    test('un corridor vide -> liste vide', () {
      expect(
        BisonFuteTrafficService.parseDatex(datexXml,
            corridor: const [], corridorMeters: 400),
        isEmpty,
      );
    });
  });

  group('BisonFuteTrafficService.nearCorridor (pur)', () {
    test('vrai quand un point est sous le seuil de distance', () {
      const near = GeoPoint(latitude: 45.7641, longitude: 4.8358);
      expect(BisonFuteTrafficService.nearCorridor(near, corridor, 400), isTrue);
    });

    test('faux quand le point est loin du corridor', () {
      const paris = GeoPoint(latitude: 48.8566, longitude: 2.3522);
      expect(
          BisonFuteTrafficService.nearCorridor(paris, corridor, 400), isFalse);
    });
  });

  group('BisonFuteTrafficService.incidentsAlong', () {
    test('sans URL configurée -> liste vide (ne lève plus UnimplementedError)',
        () async {
      final incidents =
          await const BisonFuteTrafficService().incidentsAlong(corridor);
      expect(incidents, isEmpty);
    });

    test('const BisonFuteTrafficService() compile et est honnête', () async {
      const service = BisonFuteTrafficService();
      expect(await service.incidentsAlong(corridor), isEmpty);
    });
  });

  group('MockTrafficService', () {
    test('renvoie une liste vide honnête', () async {
      final incidents =
          await const MockTrafficService().incidentsAlong(corridor);
      expect(incidents, isEmpty);
    });
  });
}
