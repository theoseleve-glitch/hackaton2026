import 'dart:convert';
import 'dart:math' as math;

import 'package:http/http.dart' as http;

import '../../../core/logging/app_logger.dart';
import '../../../shared/models/models.dart';

// Source des données : OpenStreetMap via l'API Overpass
// (https://overpass-api.de) — données sous licence ODbL.
// Tags utilisés : node railway=level_crossing (passage à niveau),
// (node|way) amenity=school (zone scolaire).
// Les virages serrés sont calculés on-device à partir du tracé (aucune I/O).

/// Nature d'un point de vigilance le long d'un itinéraire.
enum SafetyKind { railwayCrossing, school, sharpCurve }

/// Un point de vigilance géolocalisé (passage à niveau, école, virage serré).
class SafetyPoint {
  const SafetyPoint({required this.location, required this.kind});

  final GeoPoint location;
  final SafetyKind kind;

  @override
  bool operator ==(Object other) =>
      other is SafetyPoint &&
      other.location == location &&
      other.kind == kind;

  @override
  int get hashCode => Object.hash(location, kind);

  @override
  String toString() => 'SafetyPoint($kind @ $location)';
}

/// Alertes sécurité géo : interroge Overpass (OSM) pour les passages à niveau
/// et zones scolaires le long d'un tracé, détecte les virages serrés
/// on-device et rappelle les pauses (fatigue, code de la route ~2 h).
///
/// La couche réseau est une fine coquille ; toute la logique (parsing,
/// géométrie, filtrage de proximité) vit dans des fonctions PURES et statiques,
/// testables sans réseau. En cas d'échec réseau/parse : LISTE VIDE (jamais de
/// fausses données — règle « never fake data »).
class SafetyAlertsService {
  SafetyAlertsService({http.Client? client, this.baseUrl})
      : _client = client ?? http.Client();

  final http.Client _client;
  final String? baseUrl;
  static const _log = AppLogger('safety-alerts');

  String get _base => baseUrl ?? 'https://overpass-api.de/api/interpreter';

  /// Interroge Overpass (bbox du [polyline]) pour les passages à niveau
  /// (node railway=level_crossing) et les écoles ((node|way) amenity=school)
  /// puis renvoie les [SafetyPoint] correspondants. Renvoie [] en cas de
  /// tracé vide ou d'échec réseau/parse (jamais de fausses données).
  Future<List<SafetyPoint>> hazardsAlong(List<GeoPoint> polyline) async {
    if (polyline.length < 2) return const [];
    try {
      final query = _overpassQuery(boundingBox(polyline));
      final res = await _client
          .post(Uri.parse(_base), body: {'data': query})
          .timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) {
        _log.warn('Overpass HTTP ${res.statusCode}');
        return const [];
      }
      return parseOverpass(jsonDecode(res.body) as Map<String, dynamic>);
    } catch (e) {
      _log.warn('hazardsAlong échoué: $e');
      return const [];
    }
  }

  // --------------------------------------------------------------------------
  // Cœur PUR (sans I/O) — testable sur fixtures en dur.
  // --------------------------------------------------------------------------

  /// PUR : boîte englobante (sud, ouest, nord, est) d'un tracé.
  static ({double south, double west, double north, double east}) boundingBox(
      List<GeoPoint> polyline) {
    var south = polyline.first.latitude;
    var north = polyline.first.latitude;
    var west = polyline.first.longitude;
    var east = polyline.first.longitude;
    for (final p in polyline) {
      south = math.min(south, p.latitude);
      north = math.max(north, p.latitude);
      west = math.min(west, p.longitude);
      east = math.max(east, p.longitude);
    }
    return (south: south, west: west, north: north, east: east);
  }

  /// Construit la requête Overpass QL pour la bbox donnée.
  static String _overpassQuery(
      ({double south, double west, double north, double east}) bbox) {
    final b = '${bbox.south},${bbox.west},${bbox.north},${bbox.east}';
    return '[out:json][timeout:25];'
        '('
        'node["railway"="level_crossing"]($b);'
        'node["amenity"="school"]($b);'
        'way["amenity"="school"]($b);'
        ');'
        'out center;';
  }

  /// PUR : mappe une réponse Overpass JSON en [SafetyPoint]. Mappe les tags
  /// railway=level_crossing -> railwayCrossing et amenity=school -> school ;
  /// ignore tout le reste. Les `way` utilisent leur `center` (sortie
  /// `out center`). Les éléments sans coordonnées exploitables sont ignorés.
  static List<SafetyPoint> parseOverpass(Map<String, dynamic> json) {
    final elements = (json['elements'] as List? ?? const []).whereType<Map>();
    final out = <SafetyPoint>[];
    for (final el in elements) {
      final kind = _kindFromTags(el['tags']);
      if (kind == null) continue;
      final point = _pointFor(el);
      if (point == null) continue;
      out.add(SafetyPoint(location: point, kind: kind));
    }
    return out;
  }

  /// PUR : mappe les tags OSM vers un [SafetyKind], ou null si non pertinent.
  static SafetyKind? _kindFromTags(Object? tags) {
    if (tags is! Map) return null;
    if (tags['railway'] == 'level_crossing') return SafetyKind.railwayCrossing;
    if (tags['amenity'] == 'school') return SafetyKind.school;
    return null;
  }

  /// PUR : coordonnées d'un élément Overpass — `lat`/`lon` (node) ou `center`
  /// (way/relation après `out center`). Null si aucune coordonnée.
  static GeoPoint? _pointFor(Map el) {
    final lat = el['lat'];
    final lon = el['lon'];
    if (lat is num && lon is num) {
      return GeoPoint(latitude: lat.toDouble(), longitude: lon.toDouble());
    }
    final center = el['center'];
    if (center is Map) {
      final clat = center['lat'];
      final clon = center['lon'];
      if (clat is num && clon is num) {
        return GeoPoint(latitude: clat.toDouble(), longitude: clon.toDouble());
      }
    }
    return null;
  }

  /// PUR : détecte les virages serrés par variation de cap entre segments
  /// consécutifs. Un sommet dont le cap dévie de plus de [angleThresholdDeg]
  /// par rapport au segment précédent est marqué SafetyKind.sharpCurve. Les
  /// segments de longueur nulle (points dupliqués) sont ignorés.
  static List<SafetyPoint> parseCurves(List<GeoPoint> polyline,
      {double angleThresholdDeg = 45}) {
    if (polyline.length < 3) return const [];
    final out = <SafetyPoint>[];
    // Cap du segment précédent : null tant qu'aucun segment valide n'a été vu.
    // Un point de départ dupliqué (artefact GPS) ne fabrique donc pas de
    // virage fantôme (règle « never fake data »).
    double? prevBearing = polyline[0] == polyline[1]
        ? null
        : _bearing(polyline[0], polyline[1]);
    for (var i = 1; i < polyline.length - 1; i++) {
      final a = polyline[i];
      final b = polyline[i + 1];
      if (a == b) continue; // segment nul -> cap indéfini, on saute
      final bearing = _bearing(a, b);
      if (prevBearing != null &&
          _angleDiff(prevBearing, bearing) > angleThresholdDeg) {
        out.add(SafetyPoint(location: a, kind: SafetyKind.sharpCurve));
      }
      prevBearing = bearing;
    }
    return out;
  }

  /// PUR : prochain point de vigilance DEVANT [pos] selon le cap [headingDeg],
  /// dans un couloir de [corridorMeters] de large et jusqu'à [aheadMeters].
  /// « Devant » = écart de cap < 90° entre le cap et la direction pos->hazard ;
  /// « dans le couloir » = distance latérale au cap <= corridorMeters/2.
  /// Renvoie le plus proche, ou null si aucun.
  static SafetyPoint? nextHazardAhead(
    GeoPoint pos,
    double headingDeg,
    List<SafetyPoint> all, {
    double aheadMeters = 600,
    double corridorMeters = 120,
  }) {
    SafetyPoint? best;
    var bestDist = double.infinity;
    final halfCorridor = corridorMeters / 2;
    for (final h in all) {
      final dist = pos.distanceTo(h.location);
      if (dist <= 0 || dist > aheadMeters) continue;
      final toHazard = _bearing(pos, h.location);
      final off = _signedAngleDiff(headingDeg, toHazard).abs();
      if (off >= 90) continue; // derrière nous
      // Distance latérale au cap (projection perpendiculaire).
      final lateral = dist * math.sin(off * math.pi / 180);
      if (lateral > halfCorridor) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = h;
      }
    }
    return best;
  }

  /// PUR : rappel de pause. Vrai quand [drivingElapsed] atteint ou dépasse
  /// [threshold] (par défaut 2 h, recommandation du code de la route).
  static bool fatigueDue(Duration drivingElapsed,
          {Duration threshold = const Duration(hours: 2)}) =>
      drivingElapsed >= threshold;

  // --------------------------------------------------------------------------
  // Géométrie in-file (cap simple, écarts d'angle).
  // --------------------------------------------------------------------------

  /// Cap initial (degrés, 0=Nord, sens horaire) du segment [a]->[b].
  static double _bearing(GeoPoint a, GeoPoint b) {
    final lat1 = a.latitude * math.pi / 180;
    final lat2 = b.latitude * math.pi / 180;
    final dLon = (b.longitude - a.longitude) * math.pi / 180;
    final y = math.sin(dLon) * math.cos(lat2);
    final x = math.cos(lat1) * math.sin(lat2) -
        math.sin(lat1) * math.cos(lat2) * math.cos(dLon);
    final deg = math.atan2(y, x) * 180 / math.pi;
    return (deg + 360) % 360;
  }

  /// Écart absolu minimal entre deux caps (0..180 degrés).
  static double _angleDiff(double a, double b) {
    final d = (a - b).abs() % 360;
    return d > 180 ? 360 - d : d;
  }

  /// Écart signé [from]->[to] ramené à (-180, 180]. La valeur absolue donne
  /// l'écart minimal ; le signe (non utilisé ici) indiquerait le côté.
  static double _signedAngleDiff(double from, double to) {
    var d = (to - from) % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }
}
