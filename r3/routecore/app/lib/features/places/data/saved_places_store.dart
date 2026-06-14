import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/logging/app_logger.dart';
import '../../../shared/models/models.dart';

/// Type d'un lieu enregistré. [home]/[work] sont uniques ; [favorite] et
/// [recent] sont des listes.
enum SavedPlaceKind { home, work, favorite, recent }

/// Un lieu enregistré (adresse + coordonnées), persisté localement — donc
/// disponible SANS COMPTE (mode anonyme L'Échappée). Modèle pur, sérialisable.
class SavedPlace {
  const SavedPlace({
    required this.label,
    required this.latitude,
    required this.longitude,
    this.kind = SavedPlaceKind.favorite,
  });

  final String label;
  final double latitude;
  final double longitude;
  final SavedPlaceKind kind;

  GeoPoint get point => GeoPoint(latitude: latitude, longitude: longitude);

  SavedPlace withKind(SavedPlaceKind k) => SavedPlace(
      label: label, latitude: latitude, longitude: longitude, kind: k);

  Map<String, dynamic> toJson() => {
        'label': label,
        'lat': latitude,
        'lng': longitude,
        'kind': kind.name,
      };

  static SavedPlace? fromJson(Map<String, dynamic> json) {
    final lat = (json['lat'] as num?)?.toDouble();
    final lng = (json['lng'] as num?)?.toDouble();
    final label = json['label'] as String?;
    if (lat == null || lng == null || label == null) return null;
    return SavedPlace(
      label: label,
      latitude: lat,
      longitude: lng,
      kind: SavedPlaceKind.values.firstWhere(
        (k) => k.name == json['kind'],
        orElse: () => SavedPlaceKind.favorite,
      ),
    );
  }

  /// Deux lieux sont « les mêmes » s'ils sont à moins de ~50 m (dédup récents).
  bool sameSpotAs(SavedPlace other) =>
      point.distanceTo(other.point) < 50;
}

/// Persistance locale des lieux (shared_preferences) : Domicile, Travail,
/// favoris et destinations récentes. Tout le (dé)codage JSON est pur et
/// testable ; l'accès disque est une fine couche défensive.
class SavedPlacesStore {
  SavedPlacesStore({SharedPreferences? prefs}) : _prefs = prefs;

  SharedPreferences? _prefs;
  static const _log = AppLogger('saved-places');

  static const _kHome = 'places.home';
  static const _kWork = 'places.work';
  static const _kFavorites = 'places.favorites';
  static const _kRecents = 'places.recents';
  static const _recentsCap = 15;

  Future<SharedPreferences> get _p async =>
      _prefs ??= await SharedPreferences.getInstance();

  // --- PUR : encodage/décodage liste <-> chaîne JSON ---

  /// PUR : décode une chaîne JSON-array en lieux (ignore les entrées cassées).
  static List<SavedPlace> decodeList(String? raw) {
    if (raw == null || raw.isEmpty) return const [];
    try {
      final list = jsonDecode(raw) as List;
      return [
        for (final e in list.whereType<Map>())
          if (SavedPlace.fromJson(e.cast<String, dynamic>()) case final p?) p,
      ];
    } catch (_) {
      return const [];
    }
  }

  /// PUR : encode une liste de lieux en chaîne JSON-array.
  static String encodeList(List<SavedPlace> places) =>
      jsonEncode([for (final p in places) p.toJson()]);

  /// PUR : insère [place] en tête des récents, déduplique (~50 m) et plafonne.
  static List<SavedPlace> withRecent(List<SavedPlace> current, SavedPlace place) {
    final recent = place.withKind(SavedPlaceKind.recent);
    final next = <SavedPlace>[
      recent,
      ...current.where((p) => !p.sameSpotAs(recent)),
    ];
    return next.length <= _recentsCap
        ? next
        : next.sublist(0, _recentsCap);
  }

  // --- I/O défensif ---

  Future<SavedPlace?> _single(String key) async {
    try {
      final raw = (await _p).getString(key);
      if (raw == null || raw.isEmpty) return null;
      return SavedPlace.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (e) {
      _log.warn('lecture $key impossible: $e');
      return null;
    }
  }

  Future<void> _setSingle(String key, SavedPlace place) async {
    try {
      await (await _p).setString(key, jsonEncode(place.toJson()));
    } catch (e) {
      _log.warn('écriture $key impossible: $e');
    }
  }

  Future<SavedPlace?> home() => _single(_kHome);
  Future<void> setHome(SavedPlace p) =>
      _setSingle(_kHome, p.withKind(SavedPlaceKind.home));

  Future<SavedPlace?> work() => _single(_kWork);
  Future<void> setWork(SavedPlace p) =>
      _setSingle(_kWork, p.withKind(SavedPlaceKind.work));

  Future<List<SavedPlace>> favorites() async =>
      decodeList((await _p).getString(_kFavorites));

  Future<void> addFavorite(SavedPlace p) async {
    final favs = await favorites();
    if (favs.any((f) => f.sameSpotAs(p))) return;
    final next = [...favs, p.withKind(SavedPlaceKind.favorite)];
    await (await _p).setString(_kFavorites, encodeList(next));
  }

  Future<void> removeFavorite(SavedPlace p) async {
    final favs = await favorites();
    await (await _p)
        .setString(_kFavorites, encodeList(favs.where((f) => !f.sameSpotAs(p)).toList()));
  }

  Future<List<SavedPlace>> recents() async =>
      decodeList((await _p).getString(_kRecents));

  Future<void> addRecent(SavedPlace p) async {
    final next = withRecent(await recents(), p);
    await (await _p).setString(_kRecents, encodeList(next));
  }
}
