// Service 4 — Carburant / bornes VE / parking (données ouvertes FR, gratuit).
//
// SOURCES & LICENCES
// - Carburant : data.economie.gouv.fr « Prix des carburants en France — flux
//   instantané » via l'API OpenDataSoft (records/1.0), GRATUIT, SANS CLÉ.
//   Licence Ouverte (Etalab) v2.0. Mis à jour ~quotidiennement — c'est l'un
//   des rares flux RÉELLEMENT temps quasi-réel et gratuit en France.
//   Endpoint (exemple) :
//   https://data.economie.gouv.fr/api/records/1.0/search/?dataset=prix-des-carburants-en-france-flux-instantane-v2
// - Bornes VE : OpenStreetMap via Overpass API (amenity=charging_station),
//   licence ODbL. Référence officielle complémentaire : dataset IRVE de
//   transport.data.gouv.fr (« Infrastructures de recharge pour véhicules
//   électriques », Licence Ouverte) — non requis ici, OSM suffit pour le MVP.
// - Parking : OpenStreetMap via Overpass API (amenity=parking), licence ODbL.
//
// HONNÊTETÉ : tout échec réseau/parse renvoie une LISTE VIDE (jamais de
// fausses données). Le cœur métier (parsing + filtrage corridor + proximité)
// est PUR et sans I/O pour rester testable hors-ligne.

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/logging/app_logger.dart';
import '../../../shared/models/models.dart';
import '../../routing/domain/detour_planner.dart';

/// Une station-service avec ses prix carburant.
class FuelStation {
  const FuelStation({
    required this.location,
    required this.name,
    required this.prices,
    this.brand,
  });

  final GeoPoint location;
  final String name;

  /// Prix au litre par type de carburant, ex. {'Gazole':1.79,'SP95':1.85}.
  final Map<String, double> prices;
  final String? brand;

  /// Prix le moins cher disponible pour [fuelType], ou null si non vendu ici.
  double? cheapest(String fuelType) => prices[fuelType];
}

/// Une borne de recharge pour véhicule électrique.
class ChargingStation {
  const ChargingStation({
    required this.location,
    required this.name,
    this.powerKw,
    this.points,
  });

  final GeoPoint location;
  final String name;

  /// Puissance maximale en kW (null si non renseignée dans OSM).
  final double? powerKw;

  /// Nombre de points de charge (null si non renseigné).
  final int? points;
}

/// Un parking (place de stationnement).
class ParkingLot {
  const ParkingLot({
    required this.location,
    required this.name,
    this.capacity,
  });

  final GeoPoint location;
  final String name;

  /// Nombre de places (null si non renseigné dans OSM).
  final int? capacity;
}

/// Agrège trois flux ouverts gratuits : prix carburant (data.economie.gouv.fr),
/// bornes VE et parkings (OpenStreetMap/Overpass).
///
/// La couche HTTP est une fine coquille ; toute la logique vit dans les
/// fonctions PURES [parseFuel] / [parseCharging] / [parseParking] /
/// [cheapestAlong] pour rester testable sans réseau.
class FuelStationService {
  FuelStationService({http.Client? client, this.fuelBaseUrl, this.overpassUrl})
      : _client = client ?? http.Client();

  final http.Client _client;

  /// Base OpenDataSoft (surchargée dans les tests).
  final String? fuelBaseUrl;

  /// Endpoint Overpass (surchargé dans les tests).
  final String? overpassUrl;

  static const _log = AppLogger('fuel-station');

  static const _fuelDataset =
      'prix-des-carburants-en-france-flux-instantane-v2';

  String get _fuelBase =>
      fuelBaseUrl ?? 'https://data.economie.gouv.fr/api/records/1.0/search/';

  String get _overpass =>
      overpassUrl ?? 'https://overpass-api.de/api/interpreter';

  // -------------------------------------------------------------------------
  // CARBURANT — data.economie.gouv.fr (OpenDataSoft, Licence Ouverte)
  // -------------------------------------------------------------------------

  /// PUR : parse une réponse OpenDataSoft `records/1.0/search` en stations.
  ///
  /// Forme attendue : `{ "records": [ { "fields": { ... } }, ... ] }`.
  /// Les champs `gazole_prix`, `sp95_prix`, `sp98_prix`, `e10_prix`,
  /// `e85_prix`, `gplc_prix` portent les prix (€/L) ; `geom`/`latlong`/
  /// `geo_point_2d` portent la position ; `adresse`/`ville`/`enseigne` le nom.
  /// Les enregistrements sans position ou sans aucun prix sont ignorés.
  static List<FuelStation> parseFuel(Map<String, dynamic> json) {
    final records = (json['records'] as List? ?? const []).whereType<Map>();
    final out = <FuelStation>[];
    for (final rec in records) {
      final fields =
          (rec['fields'] as Map?)?.cast<String, dynamic>() ?? const {};
      final loc = _fuelLocation(fields);
      if (loc == null) continue;
      final prices = _fuelPrices(fields);
      if (prices.isEmpty) continue;
      out.add(FuelStation(
        location: loc,
        name: _fuelName(fields),
        prices: prices,
        brand: _trimOrNull(fields['enseigne'] ?? fields['marque']),
      ));
    }
    return out;
  }

  /// Étiquettes canoniques des carburants -> liste de champs OpenDataSoft
  /// possibles (le flux a varié au fil des versions du dataset).
  static const Map<String, List<String>> _fuelFields = {
    'Gazole': ['gazole_prix', 'prix_gazole'],
    'SP95': ['sp95_prix', 'prix_sp95'],
    'SP98': ['sp98_prix', 'prix_sp98'],
    'E10': ['e10_prix', 'prix_e10'],
    'E85': ['e85_prix', 'prix_e85'],
    'GPLc': ['gplc_prix', 'prix_gplc'],
  };

  static Map<String, double> _fuelPrices(Map<String, dynamic> fields) {
    final prices = <String, double>{};
    _fuelFields.forEach((label, keys) {
      for (final k in keys) {
        final v = _asDouble(fields[k]);
        if (v != null && v > 0) {
          prices[label] = v;
          break;
        }
      }
    });
    return prices;
  }

  static GeoPoint? _fuelLocation(Map<String, dynamic> fields) {
    // geo_point_2d / latlong : [lat, lng]
    for (final key in const ['geo_point_2d', 'latlong']) {
      final p = _latLngPair(fields[key]);
      if (p != null) return p;
    }
    // geom GeoJSON Point : coordinates [lng, lat]
    final geom = fields['geom'];
    if (geom is Map) {
      final coords = geom['coordinates'];
      if (coords is List && coords.length >= 2) {
        final lng = _asDouble(coords[0]);
        final lat = _asDouble(coords[1]);
        if (lat != null && lng != null) {
          return GeoPoint(latitude: lat, longitude: lng);
        }
      }
    }
    // Champs latitude/longitude séparés (parfois en 1/100000 de degré).
    final lat = _asDouble(fields['latitude']);
    final lng = _asDouble(fields['longitude']);
    if (lat != null && lng != null) {
      return GeoPoint(latitude: _maybeScale(lat), longitude: _maybeScale(lng));
    }
    return null;
  }

  /// Certains millésimes du flux encodent lat/lng en centièmes de millième de
  /// degré (ex. 4880000 pour 48.8). Si la magnitude est aberrante, on divise.
  static double _maybeScale(double v) => v.abs() > 1000 ? v / 100000.0 : v;

  static GeoPoint? _latLngPair(dynamic v) {
    if (v is List && v.length >= 2) {
      final lat = _asDouble(v[0]);
      final lng = _asDouble(v[1]);
      if (lat != null && lng != null) {
        return GeoPoint(latitude: lat, longitude: lng);
      }
    }
    return null;
  }

  static String _fuelName(Map<String, dynamic> fields) {
    final enseigne = _trimOrNull(fields['enseigne'] ?? fields['marque']);
    final ville = _trimOrNull(fields['ville'] ?? fields['cp']);
    if (enseigne != null && ville != null) return '$enseigne — $ville';
    if (enseigne != null) return enseigne;
    if (ville != null) return 'Station — $ville';
    final adresse = _trimOrNull(fields['adresse']);
    return adresse ?? 'Station-service';
  }

  /// Stations-service avec prix autour de [center]. [] en cas d'échec.
  Future<List<FuelStation>> stationsNear(GeoPoint center,
      {double radiusMeters = 5000}) async {
    try {
      // OpenDataSoft : `geofilter.distance=lat,lng,rayon_m` filtre par rayon.
      final uri = Uri.parse(_fuelBase).replace(queryParameters: {
        'dataset': _fuelDataset,
        'rows': '200',
        'geofilter.distance':
            '${center.latitude},${center.longitude},${radiusMeters.round()}',
      });
      final res = await _client.get(uri).timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) {
        _log.warn('fuel HTTP ${res.statusCode}');
        return const [];
      }
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      return parseFuel(json);
    } catch (e) {
      _log.warn('stationsNear failed: $e');
      return const [];
    }
  }

  // -------------------------------------------------------------------------
  // BORNES VE — OpenStreetMap / Overpass (ODbL)
  // -------------------------------------------------------------------------

  /// PUR : parse une réponse Overpass JSON (`elements`) en bornes de recharge.
  /// node : `lat`/`lon` directs ; way/relation : `center`. `tags.name`,
  /// `tags.charging_station:output`/`tags.maxpower` (kW), `tags.capacity`.
  static List<ChargingStation> parseCharging(Map<String, dynamic> json) {
    final out = <ChargingStation>[];
    for (final el in _overpassElements(json)) {
      final loc = _overpassLocation(el);
      if (loc == null) continue;
      final tags = (el['tags'] as Map?)?.cast<String, dynamic>() ?? const {};
      out.add(ChargingStation(
        location: loc,
        name: _trimOrNull(tags['name']) ?? 'Borne de recharge',
        powerKw: _powerKw(tags),
        points: _asInt(tags['capacity'] ?? tags['socket:type2']),
      ));
    }
    return out;
  }

  /// Extrait une puissance en kW depuis les tags OSM les plus courants
  /// (`charging_station:output`, `maxpower`, `socket:type2:output`). Gère les
  /// suffixes « kW »/« W » et les virgules décimales.
  static double? _powerKw(Map<String, dynamic> tags) {
    for (final key in const [
      'charging_station:output',
      'maxpower',
      'socket:type2_combo:output',
      'socket:type2:output',
    ]) {
      final raw = tags[key];
      if (raw == null) continue;
      final s = raw.toString().toLowerCase().replaceAll(',', '.');
      final m = RegExp(r'([\d.]+)\s*(kw|w)?').firstMatch(s);
      if (m == null) continue;
      final v = double.tryParse(m.group(1)!);
      if (v == null) continue;
      // « W » sans k -> conversion en kW ; sinon valeur déjà en kW.
      return m.group(2) == 'w' ? v / 1000.0 : v;
    }
    return null;
  }

  /// Bornes VE autour de [center]. [] en cas d'échec.
  Future<List<ChargingStation>> chargingNear(GeoPoint center,
      {double radiusMeters = 5000}) async {
    final query = '[out:json][timeout:25];'
        '(node["amenity"="charging_station"]'
        '(around:${radiusMeters.round()},${center.latitude},${center.longitude});'
        'way["amenity"="charging_station"]'
        '(around:${radiusMeters.round()},${center.latitude},${center.longitude}););'
        'out center;';
    return _overpassQuery(query, parseCharging, 'chargingNear');
  }

  // -------------------------------------------------------------------------
  // PARKING — OpenStreetMap / Overpass (ODbL)
  // -------------------------------------------------------------------------

  /// PUR : parse une réponse Overpass JSON (`elements`) en parkings.
  static List<ParkingLot> parseParking(Map<String, dynamic> json) {
    final out = <ParkingLot>[];
    for (final el in _overpassElements(json)) {
      final loc = _overpassLocation(el);
      if (loc == null) continue;
      final tags = (el['tags'] as Map?)?.cast<String, dynamic>() ?? const {};
      out.add(ParkingLot(
        location: loc,
        name: _trimOrNull(tags['name']) ?? 'Parking',
        capacity: _asInt(tags['capacity']),
      ));
    }
    return out;
  }

  /// Parkings autour de [center]. [] en cas d'échec.
  Future<List<ParkingLot>> parkingNear(GeoPoint center,
      {double radiusMeters = 5000}) async {
    final query = '[out:json][timeout:25];'
        '(node["amenity"="parking"]'
        '(around:${radiusMeters.round()},${center.latitude},${center.longitude});'
        'way["amenity"="parking"]'
        '(around:${radiusMeters.round()},${center.latitude},${center.longitude}););'
        'out center;';
    return _overpassQuery(query, parseParking, 'parkingNear');
  }

  // -------------------------------------------------------------------------
  // CORRIDOR — sélection le long d'un trajet (PUR)
  // -------------------------------------------------------------------------

  /// PUR : la station la MOINS CHÈRE pour [fuelType] le long du [corridor]
  /// (polyligne du trajet), dans une bande de [corridorMeters] de part et
  /// d'autre. null si aucune station vendant ce carburant n'est dans le
  /// corridor (ou corridor vide).
  static FuelStation? cheapestAlong(
    List<FuelStation> stations,
    List<GeoPoint> corridor,
    String fuelType, {
    double corridorMeters = 2000,
  }) {
    if (corridor.length < 2) return null;
    FuelStation? best;
    double? bestPrice;
    for (final s in stations) {
      final price = s.cheapest(fuelType);
      if (price == null) continue;
      final d = DetourPlanner.distanceToPolyline(s.location, corridor);
      if (d > corridorMeters) continue;
      if (bestPrice == null || price < bestPrice) {
        bestPrice = price;
        best = s;
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // Helpers HTTP & parsing (privés)
  // -------------------------------------------------------------------------

  /// POST Overpass + parse via [parser]. [] en cas d'échec.
  Future<List<T>> _overpassQuery<T>(
    String query,
    List<T> Function(Map<String, dynamic>) parser,
    String tag,
  ) async {
    try {
      final res = await _client
          .post(Uri.parse(_overpass), body: {'data': query})
          .timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) {
        _log.warn('$tag HTTP ${res.statusCode}');
        return const [];
      }
      return parser(jsonDecode(res.body) as Map<String, dynamic>);
    } catch (e) {
      _log.warn('$tag failed: $e');
      return const [];
    }
  }

  static Iterable<Map<String, dynamic>> _overpassElements(
          Map<String, dynamic> json) =>
      (json['elements'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => e.cast<String, dynamic>());

  /// node : lat/lon ; way/relation : `center.{lat,lon}`.
  static GeoPoint? _overpassLocation(Map<String, dynamic> el) {
    var lat = _asDouble(el['lat']);
    var lng = _asDouble(el['lon']);
    if (lat == null || lng == null) {
      final center = (el['center'] as Map?)?.cast<String, dynamic>();
      if (center != null) {
        lat = _asDouble(center['lat']);
        lng = _asDouble(center['lon']);
      }
    }
    if (lat == null || lng == null) return null;
    return GeoPoint(latitude: lat, longitude: lng);
  }

  static double? _asDouble(dynamic v) {
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v.replaceAll(',', '.'));
    return null;
  }

  static int? _asInt(dynamic v) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    if (v is String) return int.tryParse(v.trim());
    return null;
  }

  static String? _trimOrNull(dynamic v) {
    if (v == null) return null;
    final s = v.toString().trim();
    return s.isEmpty ? null : s;
  }
}
