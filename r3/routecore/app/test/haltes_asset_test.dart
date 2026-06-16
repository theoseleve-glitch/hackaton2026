import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/features/poi/data/poi_repositories.dart';
import 'package:routecore/shared/models/models.dart';

/// Vérifie de bout en bout que le carnet embarqué (assets/data/haltes.json)
/// se charge, se parse et fusionne avec le jeu curé — preuve des +10 000
/// haltes RÉELLES dans l'app. Nécessite le binding (rootBundle sert l'asset).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('le carnet charge > 10 000 haltes et les sert le long d\'un trajet',
      () async {
    final repo = MockPoiRepository();

    // Rayon volontairement énorme depuis le centre de la France -> renvoie
    // l'essentiel du carnet chargé (asset + curé).
    const centreFrance = GeoPoint(latitude: 46.6, longitude: 2.5);
    final all = await repo.nearbyPois(centreFrance, radiusMeters: 1500000);
    expect(all.length, greaterThan(10000),
        reason: 'le carnet doit dépasser 10 000 haltes une fois l\'asset chargé');

    // Qualité : une part significative porte des infos enrichies.
    final enriched = all.where((p) =>
        p.address != null ||
        p.phone != null ||
        p.websiteUrl != null ||
        (p.openingHours?['raw'] != null));
    expect(enriched.length, greaterThan(5000),
        reason: 'qualité : beaucoup de haltes ont adresse/contact/horaires');

    // Toutes les catégories de mood sont représentées (filtres UI utiles).
    final cats = {for (final p in all) p.categorySlug};
    for (final c in ['producer', 'market', 'viewpoint', 'village', 'nature']) {
      expect(cats, contains(c), reason: 'catégorie $c présente');
    }
  });

  test('poisAlongRoute trouve des haltes réelles sur un corridor Lyon→Valence',
      () async {
    final repo = MockPoiRepository();
    const lyon = GeoPoint(latitude: 45.7640, longitude: 4.8357);
    const valence = GeoPoint(latitude: 44.9334, longitude: 4.8924);
    final along = await repo.poisAlongRoute(lyon, valence,
        corridorMeters: 5000,
        routePolyline: const [lyon, valence]);
    expect(along.length, greaterThan(20),
        reason: 'le corridor de la vallée du Rhône regorge de haltes');
    // Tri par distance au trajet (contrat existant).
    for (var i = 1; i < along.length; i++) {
      expect(along[i].distanceFromRouteMeters,
          greaterThanOrEqualTo(along[i - 1].distanceFromRouteMeters));
    }
  });
}
