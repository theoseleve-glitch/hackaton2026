import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/logging/app_logger.dart';
import '../../../shared/models/models.dart';

/// Limites de vitesse réglementaires le long d'un trajet, via l'API publique
/// OSM Overpass (https://overpass-api.de) — gratuite, sans clé.
///
/// Source de données : OpenStreetMap (tag `maxspeed` des ways), exposée par
/// Overpass. Licence : ODbL (Open Database License) — © contributeurs OSM.
///
/// La classe est scindée en un cœur PUR (parsing du tag, parsing de la réponse
/// Overpass, proximité) entièrement testable sans réseau, et une fine couche
/// I/O ([speedLimitsAlong]). Règle « never fake data » : tout échec
/// réseau/parse renvoie une LISTE VIDE (jamais de fausses limites).

/// Une zone de vitesse : la géométrie d'un way OSM et sa limite en km/h.
class SpeedZone {
  const SpeedZone({required this.points, required this.maxspeedKmh});

  /// Géométrie du tronçon (nœuds OSM du way), dans l'ordre.
  final List<GeoPoint> points;

  /// Limite réglementaire en km/h.
  final int maxspeedKmh;

  /// Distance (mètres) du point [p] au nœud le plus proche de la zone.
  /// Approximation par sommets (suffisante : les nœuds OSM sont rapprochés).
  double nearestDistanceMeters(GeoPoint p) {
    var best = double.infinity;
    for (final node in points) {
      final d = p.distanceTo(node);
      if (d < best) best = d;
    }
    return best;
  }
}

/// Limites de vitesse via OSM Overpass.
class RoadSpeedService {
  RoadSpeedService({http.Client? client, this.baseUrl})
      : _client = client ?? http.Client();

  final http.Client _client;

  /// Surcharge de l'hôte Overpass (tests). Défaut : serveur démo public.
  final String? baseUrl;

  static const _log = AppLogger('road-speed');

  String get _base => baseUrl ?? 'https://overpass-api.de/api/interpreter';

  /// Marge (degrés) ajoutée autour de la bbox englobante (~1 km) pour capter
  /// les ways qui dépassent légèrement de l'enveloppe de la polyline.
  static const double _bboxMarginDeg = 0.01;

  /// PUR : convertit un tag OSM `maxspeed` brut en km/h.
  /// - "90", "50", "130" => la valeur entière ;
  /// - "30 mph" => conversion en km/h (×1.609, arrondi : 30 mph => 48) ;
  /// - "FR:urban" => 50, "FR:rural" => 80, "FR:motorway" => 130 ;
  /// - "walk" => 6 (allure du pas) ;
  /// - "none" / "signals" / "variable" => null (pas de limite chiffrée) ;
  /// - null / "" / non parsable => null.
  static int? parseMaxspeedKmh(String? raw) {
    if (raw == null) return null;
    final s = raw.trim().toLowerCase();
    if (s.isEmpty) return null;

    // Zones implicites par pays (France).
    switch (s) {
      case 'fr:urban':
        return 50;
      case 'fr:rural':
        return 80;
      case 'fr:motorway':
        return 130;
      case 'walk':
        return 6;
      case 'none':
      case 'signals':
      case 'variable':
      case 'unknown':
        return null;
    }

    // "30 mph" / "30mph" => km/h.
    final mph = RegExp(r'^(\d+(?:\.\d+)?)\s*mph$').firstMatch(s);
    if (mph != null) {
      final v = double.parse(mph.group(1)!);
      return (v * 1.609344).round();
    }

    // "50 km/h" / "50kmh" / "50" => valeur km/h.
    final kmh = RegExp(r'^(\d+(?:\.\d+)?)\s*(?:km/?h)?$').firstMatch(s);
    if (kmh != null) {
      final v = double.parse(kmh.group(1)!).round();
      return v > 0 ? v : null;
    }

    return null;
  }

  /// PUR : transforme une réponse Overpass JSON en zones de vitesse.
  /// Lit `json['elements']` : chaque way avec `tags.maxspeed` parsable et une
  /// `geometry` (liste de {lat, lon}) devient une [SpeedZone]. Les ways sans
  /// maxspeed parsable ou sans géométrie sont ignorés.
  static List<SpeedZone> parseOverpass(Map<String, dynamic> json) {
    final elements = (json['elements'] as List? ?? const []).whereType<Map>();
    final zones = <SpeedZone>[];
    for (final el in elements) {
      if (el['type'] != 'way') continue;
      final tags = el['tags'];
      if (tags is! Map) continue;
      final maxspeed = parseMaxspeedKmh(tags['maxspeed']?.toString());
      if (maxspeed == null) continue;
      final geometry = (el['geometry'] as List? ?? const []).whereType<Map>();
      final points = <GeoPoint>[];
      for (final node in geometry) {
        final lat = node['lat'];
        final lon = node['lon'];
        if (lat is num && lon is num) {
          points.add(
            GeoPoint(latitude: lat.toDouble(), longitude: lon.toDouble()),
          );
        }
      }
      if (points.isEmpty) continue;
      zones.add(SpeedZone(points: points, maxspeedKmh: maxspeed));
    }
    return zones;
  }

  /// PUR : limite de vitesse au point [p] = celle de la zone la plus proche
  /// dont la distance est sous [toleranceMeters], sinon null (on n'invente
  /// rien hors de portée d'un tronçon connu).
  static int? limitAt(
    GeoPoint p,
    List<SpeedZone> zones, {
    double toleranceMeters = 35,
  }) {
    int? best;
    var bestDist = double.infinity;
    for (final zone in zones) {
      final d = zone.nearestDistanceMeters(p);
      if (d <= toleranceMeters && d < bestDist) {
        bestDist = d;
        best = zone.maxspeedKmh;
      }
    }
    return best;
  }

  /// Charge les limites de vitesse le long de la [polyline] : calcule la bbox
  /// englobante (avec marge), interroge Overpass pour tous les ways portant un
  /// tag `maxspeed`, et renvoie les [SpeedZone] parsées.
  ///
  /// Renvoie [] (jamais de fausses données) sur polyline vide, échec réseau,
  /// statut HTTP non-200, ou parse impossible. Timeout 8 s.
  ///
  /// Usage attendu : pré-charger UNE FOIS au calcul du trajet (le serveur démo
  /// Overpass est rate-limité — ne JAMAIS appeler en polling pendant le guidage).
  Future<List<SpeedZone>> speedLimitsAlong(List<GeoPoint> polyline) async {
    if (polyline.isEmpty) return const [];
    try {
      final bbox = _boundingBox(polyline);
      final query = 'way["maxspeed"]'
          '(${bbox.south},${bbox.west},${bbox.north},${bbox.east});'
          'out tags geom;';
      final res = await _client
          .post(
            Uri.parse(_base),
            headers: const {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'data=${Uri.encodeQueryComponent(query)}',
          )
          .timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) {
        _log.warn('Overpass HTTP ${res.statusCode}');
        return const [];
      }
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      return parseOverpass(json);
    } catch (e) {
      _log.warn('speedLimitsAlong failed (non-fatal): $e');
      return const [];
    }
  }

  /// PUR : bbox (south, west, north, east) englobant la polyline + marge.
  static ({double south, double west, double north, double east}) _boundingBox(
    List<GeoPoint> polyline,
  ) {
    var south = polyline.first.latitude;
    var north = polyline.first.latitude;
    var west = polyline.first.longitude;
    var east = polyline.first.longitude;
    for (final p in polyline) {
      if (p.latitude < south) south = p.latitude;
      if (p.latitude > north) north = p.latitude;
      if (p.longitude < west) west = p.longitude;
      if (p.longitude > east) east = p.longitude;
    }
    return (
      south: south - _bboxMarginDeg,
      west: west - _bboxMarginDeg,
      north: north + _bboxMarginDeg,
      east: east + _bboxMarginDeg,
    );
  }
}
