import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/features/places/data/saved_places_store.dart';

void main() {
  SavedPlace place(String label, double lat, double lng) =>
      SavedPlace(label: label, latitude: lat, longitude: lng);

  group('SavedPlace JSON', () {
    test('round-trip préserve les champs', () {
      final p = place('Maison', 45.1, 4.8).withKind(SavedPlaceKind.home);
      final back = SavedPlace.fromJson(p.toJson());
      expect(back, isNotNull);
      expect(back!.label, 'Maison');
      expect(back.latitude, 45.1);
      expect(back.kind, SavedPlaceKind.home);
    });

    test('fromJson rejette une entrée incomplète', () {
      expect(SavedPlace.fromJson({'label': 'x'}), isNull);
      expect(SavedPlace.fromJson({'lat': 1.0, 'lng': 2.0}), isNull);
    });
  });

  group('encode/decode liste', () {
    test('round-trip d\'une liste, entrées cassées ignorées', () {
      final list = [place('A', 45.0, 4.0), place('B', 46.0, 5.0)];
      final decoded = SavedPlacesStore.decodeList(SavedPlacesStore.encodeList(list));
      expect(decoded, hasLength(2));
      expect(decoded.first.label, 'A');
    });

    test('décodage robuste : null / vide / JSON invalide -> []', () {
      expect(SavedPlacesStore.decodeList(null), isEmpty);
      expect(SavedPlacesStore.decodeList(''), isEmpty);
      expect(SavedPlacesStore.decodeList('{pas du json'), isEmpty);
    });
  });

  group('withRecent (dédup + plafond)', () {
    test('insère en tête et marque comme récent', () {
      final next = SavedPlacesStore.withRecent(const [], place('Lyon', 45.76, 4.83));
      expect(next.first.label, 'Lyon');
      expect(next.first.kind, SavedPlaceKind.recent);
    });

    test('déduplique un lieu déjà présent (~50 m) en le remontant', () {
      final lyon = place('Lyon', 45.7640, 4.8357);
      final lyonBis = place('Lyon centre', 45.7641, 4.8357); // ~11 m
      final start = SavedPlacesStore.withRecent(const [], lyon);
      final afterOther =
          SavedPlacesStore.withRecent(start, place('Paris', 48.85, 2.35));
      final reAdded = SavedPlacesStore.withRecent(afterOther, lyonBis);
      expect(reAdded.where((p) => p.point.distanceTo(lyon.point) < 50).length, 1,
          reason: 'pas de doublon du même endroit');
      expect(reAdded.first.label, 'Lyon centre', reason: 'remonté en tête');
    });

    test('plafonne à 15 récents', () {
      var list = <SavedPlace>[];
      for (var i = 0; i < 20; i++) {
        list = SavedPlacesStore.withRecent(list, place('p$i', 40.0 + i, 2.0 + i));
      }
      expect(list, hasLength(15));
      expect(list.first.label, 'p19', reason: 'le plus récent en tête');
    });
  });
}
