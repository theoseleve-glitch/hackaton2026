// Radars fixes France — proximité et alerte « radar devant ».
//
// SOURCE DES DONNÉES : base officielle des radars automatiques publiée sur
// data.gouv.fr (« Radars automatiques ») et securite-routiere.gouv.fr.
//   https://www.data.gouv.fr/fr/datasets/radars-automatiques/
// LICENCE : Licence Ouverte (Etalab) — réutilisation libre avec mention.
//
// HONNÊTETÉ : l'asset embarqué assets/data/fr_speed_cameras.json est un
// ÉCHANTILLON PARTIEL (~15 radars fixes connus : A7 vallée du Rhône, A6, A9,
// A1, périphérique parisien, rocades). Ce n'est PAS un dataset exhaustif et il
// doit être rafraîchi depuis le jeu complet ci-dessus. En cas d'échec
// réseau/parse, le service renvoie une liste VIDE (jamais de fausses données).

import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/services.dart' show rootBundle;

import 'package:routecore/core/logging/app_logger.dart';
import 'package:routecore/shared/models/models.dart';

/// Un radar fixe : position, route, limite de vitesse et type.
class SpeedCamera {
  const SpeedCamera({
    required this.location,
    this.road,
    this.limitKmh,
    this.type = 'fixed',
  });

  /// Position géographique du radar.
  final GeoPoint location;

  /// Route portant le radar (ex. « A7 », « Périphérique Paris »), si connue.
  final String? road;

  /// Limite de vitesse au point du radar (km/h), si connue.
  final int? limitKmh;

  /// Type de radar (« fixed » pour cet échantillon).
  final String type;

  /// Parse une entrée JSON {lat, lng, road, limitKmh, type}. `null` si les
  /// coordonnées sont absentes/invalides (on n'invente pas de position).
  static SpeedCamera? fromJson(Map<String, dynamic> json) {
    final lat = (json['lat'] as num?)?.toDouble();
    final lng = (json['lng'] as num?)?.toDouble();
    if (lat == null || lng == null) return null;
    return SpeedCamera(
      location: GeoPoint(latitude: lat, longitude: lng),
      road: json['road'] as String?,
      limitKmh: (json['limitKmh'] as num?)?.toInt(),
      type: (json['type'] as String?) ?? 'fixed',
    );
  }
}

/// Chargement paresseux des radars (asset) + cœur métier PUR (sans I/O) pour
/// le filtrage « devant + dans le couloir ».
class SpeedCameraService {
  static const _log = AppLogger('SpeedCameraService');
  static const _assetPath = 'assets/data/fr_speed_cameras.json';

  static List<SpeedCamera>? _cached;

  /// Charge (et met en cache) la liste des radars depuis l'asset. Sur tout
  /// échec de chargement/parse → liste VIDE (règle « never fake data »).
  static Future<List<SpeedCamera>> load() async {
    final cached = _cached;
    if (cached != null) return cached;
    try {
      final raw = await rootBundle.loadString(_assetPath);
      final json = jsonDecode(raw) as Map<String, dynamic>;
      return _cached = parse(json);
    } catch (e) {
      _log.warn('chargement radars impossible, liste vide — $e');
      return _cached = const <SpeedCamera>[];
    }
  }

  /// PUR : parse le document décodé {"cameras": [ {lat,lng,...}, ... ]}.
  /// Les entrées sans coordonnées valides sont ignorées. Jamais d'exception.
  static List<SpeedCamera> parse(Map<String, dynamic> json) {
    final list = (json['cameras'] as List?) ?? const [];
    final out = <SpeedCamera>[];
    for (final item in list) {
      if (item is! Map) continue;
      final cam = SpeedCamera.fromJson(item.cast<String, dynamic>());
      if (cam != null) out.add(cam);
    }
    return out;
  }

  /// PUR : les radars situés DEVANT [pos] selon le cap [headingDeg] et proches
  /// du couloir de route.
  ///
  /// « Devant » = produit scalaire entre le vecteur (pos→radar) et le vecteur
  /// du cap strictement positif. « Proche du couloir » = distance latérale au
  /// rayon du cap ≤ [corridorMeters]. On borne aussi la portée longitudinale à
  /// [aheadMeters]. Les radars derrière, à côté ou trop loin sont écartés.
  /// Résultat trié du plus proche (le long du cap) au plus lointain.
  static List<SpeedCamera> camerasAhead(
    GeoPoint pos,
    double headingDeg,
    List<SpeedCamera> all, {
    double aheadMeters = 1500,
    double corridorMeters = 150,
  }) {
    // Vecteur unitaire du cap en repère plan local (x = Est, y = Nord).
    final hdg = _rad(headingDeg);
    final hx = math.sin(hdg); // composante Est du cap
    final hy = math.cos(hdg); // composante Nord du cap
    const mPerDegLat = 111320.0;
    final mPerDegLng = 111320.0 * math.cos(_rad(pos.latitude));

    final ahead = <({SpeedCamera cam, double along})>[];
    for (final cam in all) {
      // Déplacement local pos→radar, en mètres.
      final dx = (cam.location.longitude - pos.longitude) * mPerDegLng;
      final dy = (cam.location.latitude - pos.latitude) * mPerDegLat;
      // Projection le long du cap (positif = devant) et latérale (couloir).
      final along = dx * hx + dy * hy;
      if (along <= 0 || along > aheadMeters) continue; // derrière ou trop loin
      final lateral = (dx * hy - dy * hx).abs();
      if (lateral > corridorMeters) continue; // hors du couloir
      ahead.add((cam: cam, along: along));
    }
    ahead.sort((a, b) => a.along.compareTo(b.along));
    return ahead.map((e) => e.cam).toList(growable: false);
  }

  /// PUR : le prochain radar devant (le plus proche le long du cap), ou `null`
  /// s'il n'y en a aucun dans le couloir et la portée.
  static SpeedCamera? nextCamera(
    GeoPoint pos,
    double headingDeg,
    List<SpeedCamera> all, {
    double aheadMeters = 1500,
    double corridorMeters = 150,
  }) {
    final list = camerasAhead(
      pos,
      headingDeg,
      all,
      aheadMeters: aheadMeters,
      corridorMeters: corridorMeters,
    );
    return list.isEmpty ? null : list.first;
  }

  static double _rad(double deg) => deg * math.pi / 180;
}
