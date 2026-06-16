import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/shared/models/models.dart';

void main() {
  group('Poi.fromJson (carnet haltes compact)', () {
    test('mappe toutes les clés compactes', () {
      final p = Poi.fromJson({
        'id': 'osn123',
        'name': 'Ferme du Pré Vert',
        'cat': 'producer',
        'lat': 45.12,
        'lng': 4.83,
        'addr': '3 route des Vignes, 26000 Valence',
        'city': 'Valence',
        'phone': '+33 4 75 00 00 00',
        'web': 'https://ferme-pre-vert.fr',
        'email': 'bonjour@ferme.fr',
        'hours': 'Mo-Sa 09:00-19:00',
        'desc': 'Fromages fermiers et légumes de saison.',
        'tags': ['bio', 'cuisine:french'],
      });
      expect(p.id, 'osn123');
      expect(p.name, 'Ferme du Pré Vert');
      expect(p.categorySlug, 'producer');
      expect(p.latitude, 45.12);
      expect(p.longitude, 4.83);
      expect(p.address, contains('Valence'));
      expect(p.city, 'Valence');
      expect(p.phone, '+33 4 75 00 00 00');
      expect(p.websiteUrl, 'https://ferme-pre-vert.fr');
      expect(p.email, 'bonjour@ferme.fr');
      expect(p.openingHours?['raw'], 'Mo-Sa 09:00-19:00');
      expect(p.description, startsWith('Fromages'));
      expect(p.tags, containsAll(['bio', 'cuisine:french']));
      expect(p.source, 'osm', reason: 'défaut OSM');
      expect(p.isVerified, isTrue);
      expect(p.country, 'FR');
    });

    test('enregistrement minimal : champs optionnels nuls', () {
      final p = Poi.fromJson({
        'id': 'osw9',
        'name': 'Marché de Crest',
        'cat': 'market',
        'lat': 44.73,
        'lng': 5.02,
      });
      expect(p.address, isNull);
      expect(p.phone, isNull);
      expect(p.websiteUrl, isNull);
      expect(p.email, isNull);
      expect(p.openingHours, isNull);
      expect(p.tags, isEmpty);
      expect(p.categorySlug, 'market');
    });

    test('accepte aussi le schéma horaires déjà structuré', () {
      final p = Poi.fromJson({
        'id': 'x',
        'name': 'Y',
        'cat': 'viewpoint',
        'lat': 1.0,
        'lng': 2.0,
        'hours': {'raw': '24/7'},
      });
      expect(p.openingHours?['raw'], '24/7');
    });
  });
}
