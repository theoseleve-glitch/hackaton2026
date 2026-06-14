// Incidents trafic nationaux — Bison Futé (TIPI DATEX II).
//
// Source : tipi.bison-fute.gouv.fr — flux DATEX II XML, sous Licence Ouverte
// (data.gouv.fr). Couverture du RÉSEAU NATIONAL uniquement (autoroutes +
// routes nationales) : pas de voirie locale, et incidents PONCTUELS
// (accidents, travaux, fermetures, ralentissements) — ce n'est PAS un flux de
// vitesses temps réel. Certains flux DATEX II requièrent une inscription /
// un jeton d'accès : sans URL configurée, le service renvoie [] (honnête,
// jamais de fausses données).

import 'package:http/http.dart' as http;
import 'package:xml/xml.dart';

import '../../core/logging/app_logger.dart';
import '../models/models.dart';

/// Un évènement de trafic situé sur ou près d'un corridor d'itinéraire.
class TrafficIncident {
  const TrafficIncident({
    required this.location,
    required this.kind,
    this.description,
    this.delayMinutes,
  });

  final GeoPoint location;

  /// L'un de : 'accident' | 'works' | 'closure' | 'slowdown'.
  final String kind;

  /// Libellé descriptif quand la source en fournit un (peut être null).
  final String? description;

  /// Surcoût de temps de trajet (minutes) quand la source le donne.
  final int? delayMinutes;
}

/// Source de trafic enfichable : retourne les incidents dans un corridor
/// autour de la polyligne d'itinéraire. La couche routage reste sans
/// dépendance au fournisseur.
abstract class TrafficService {
  /// Incidents à moins de [corridorMeters] de [polyline] (points en ordre de
  /// conduite). Les implémentations utilisent 500 m par défaut.
  Future<List<TrafficIncident>> incidentsAlong(
    List<GeoPoint> polyline, {
    double corridorMeters,
  });
}

/// Implémentation honnête vide : ne signale AUCUN incident (jamais de faux),
/// pour que l'UI puisse livrer le panneau trafic avant tout vrai flux.
class MockTrafficService implements TrafficService {
  const MockTrafficService();

  @override
  Future<List<TrafficIncident>> incidentsAlong(
    List<GeoPoint> polyline, {
    double corridorMeters = 500,
  }) async =>
      const [];
}

/// Bison Futé — flux national gratuit français (DATEX II XML, Licence Ouverte).
///
/// Sans [datexUrl] configurée (défaut null), [incidentsAlong] renvoie [] :
/// honnête, pas de fausses données. Avec une URL : GET XML, parse, filtre au
/// corridor. Le cœur (parseDatex / nearCorridor) est PUR et sans I/O, donc
/// testable sans réseau.
///
/// LIMITES : réseau national seulement (autoroutes / RN, pas de voirie
/// locale) ; incidents ponctuels (pas un flux de vitesses) ; l'endpoint TIPI
/// peut requérir une inscription / un jeton — d'où le défaut [].
///
/// Alternatives payantes pour une couverture totale + données de flux :
/// - TomTom Traffic API (offre gratuite limitée puis ~0,42 €/1000 req).
/// - HERE Traffic API (250k transactions/mois gratuites).
class BisonFuteTrafficService implements TrafficService {
  /// Constructeur const sans argument obligatoire : [datexUrl] / [token]
  /// optionnels. Sans URL, le service est honnêtement vide.
  const BisonFuteTrafficService({this.datexUrl, this.token, this.httpClient});

  /// URL du flux DATEX II XML. null = service désactivé (renvoie []).
  final String? datexUrl;

  /// Jeton d'accès optionnel (header Authorization: Bearer), si le flux
  /// l'exige.
  final String? token;

  /// Client HTTP injectable (tests). Par défaut un http.Client() éphémère.
  final http.Client? httpClient;

  static const _log = AppLogger('traffic.bisonfute');

  @override
  Future<List<TrafficIncident>> incidentsAlong(
    List<GeoPoint> polyline, {
    double corridorMeters = 500,
  }) async {
    final url = datexUrl;
    // Pas d'URL configurée -> honnête : aucune donnée.
    if (url == null || url.isEmpty) return const [];
    if (polyline.isEmpty) return const [];

    final client = httpClient ?? http.Client();
    try {
      final headers = <String, String>{
        'Accept': 'application/xml',
        if (token != null && token!.isNotEmpty) 'Authorization': 'Bearer $token',
      };
      final res = await client
          .get(Uri.parse(url), headers: headers)
          .timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) {
        _log.warn('flux DATEX II HTTP ${res.statusCode} — aucun incident');
        return const [];
      }
      return parseDatex(
        res.body,
        corridor: polyline,
        corridorMeters: corridorMeters,
      );
    } catch (e) {
      // Réseau / parse en échec -> liste vide (jamais de fausses données).
      _log.warn('flux DATEX II indisponible — aucun incident: $e');
      return const [];
    } finally {
      // Ne fermer que le client créé en interne (pas celui injecté).
      if (httpClient == null) client.close();
    }
  }

  // --------------------------------------------------------------------------
  // Cœur PUR (sans I/O) — testable sur fixtures.
  // --------------------------------------------------------------------------

  /// PUR : parse un document DATEX II et retourne les incidents géolocalisés
  /// à moins de [corridorMeters] d'un point du [corridor].
  ///
  /// Extrait chaque `situationRecord`, en déduit le type (accident / travaux /
  /// fermeture / ralentissement) via son attribut `xsi:type` (ou le nom de
  /// l'élément), récupère latitude/longitude, puis filtre au corridor.
  /// XML invalide ou record sans coordonnées -> ignoré (jamais de faux point).
  static List<TrafficIncident> parseDatex(
    String xml, {
    required List<GeoPoint> corridor,
    double corridorMeters = 400,
  }) {
    if (xml.trim().isEmpty || corridor.isEmpty) return const [];
    final XmlDocument doc;
    try {
      doc = XmlDocument.parse(xml);
    } catch (_) {
      return const [];
    }

    final incidents = <TrafficIncident>[];
    for (final record in doc.findAllElements('situationRecord')) {
      final location = _coordsOf(record);
      if (location == null) continue;
      if (!nearCorridor(location, corridor, corridorMeters)) continue;
      incidents.add(TrafficIncident(
        location: location,
        kind: _kindOf(record),
        description: _descriptionOf(record),
        delayMinutes: _delayOf(record),
      ));
    }
    return incidents;
  }

  /// PUR : true si [p] est à moins de [meters] d'au moins un point du
  /// [corridor] (distance Haversine via GeoPoint.distanceTo, en mètres).
  static bool nearCorridor(GeoPoint p, List<GeoPoint> corridor, double meters) {
    for (final c in corridor) {
      if (p.distanceTo(c) <= meters) return true;
    }
    return false;
  }

  // --- Helpers de parsing DATEX II (privés, purs) ---------------------------

  /// Mappe le type DATEX II d'un record vers notre vocabulaire compact.
  static String _kindOf(XmlElement record) {
    final type = _typeToken(record).toLowerCase();
    if (type.contains('accident')) return 'accident';
    if (type.contains('roadworks') ||
        type.contains('maintenance') ||
        type.contains('constructionworks') ||
        type.contains('roadOrCarriagewayOrLaneManagement'.toLowerCase())) {
      return 'works';
    }
    if (type.contains('closure') ||
        type.contains('closed') ||
        type.contains('roadclosed')) {
      return 'closure';
    }
    if (type.contains('abnormaltraffic') ||
        type.contains('queue') ||
        type.contains('slow') ||
        type.contains('congestion')) {
      return 'slowdown';
    }
    // Repli défensif : un évènement non typé est traité comme ralentissement
    // générique plutôt que rejeté (il est déjà géolocalisé sur le corridor).
    return 'slowdown';
  }

  /// L'attribut `xsi:type` (ex. "Accident", "MaintenanceWorks") ou, à défaut,
  /// le nom local de l'élément discriminant porté par le record.
  static String _typeToken(XmlElement record) {
    final xsi = record.getAttribute('xsi:type') ??
        record.getAttribute('type', namespace: '*');
    if (xsi != null && xsi.isNotEmpty) return xsi;
    // Certains flux ne mettent pas xsi:type : on cherche un sous-élément
    // discriminant connu.
    const discriminants = {
      'accident',
      'roadworks',
      'maintenanceWorks',
      'constructionWorks',
      'closure',
      'abnormalTraffic',
    };
    for (final child in record.childElements) {
      if (discriminants.contains(child.localName)) return child.localName;
    }
    return record.localName;
  }

  /// Extrait (latitude, longitude) du premier `pointCoordinates` (ou paire
  /// latitude/longitude) trouvé dans le record. null si absent / non parsable.
  static GeoPoint? _coordsOf(XmlElement record) {
    // Variante standard : <pointCoordinates><latitude/><longitude/>.
    for (final pc in record.findAllElements('pointCoordinates')) {
      final p = _latLngFrom(pc);
      if (p != null) return p;
    }
    // Repli : latitude/longitude directement n'importe où sous le record.
    return _latLngFrom(record);
  }

  static GeoPoint? _latLngFrom(XmlElement scope) {
    final lat = _firstDouble(scope, 'latitude');
    final lng = _firstDouble(scope, 'longitude');
    if (lat == null || lng == null) return null;
    if (lat.abs() > 90 || lng.abs() > 180) return null;
    return GeoPoint(latitude: lat, longitude: lng);
  }

  static double? _firstDouble(XmlElement scope, String name) {
    for (final e in scope.findAllElements(name)) {
      final v = double.tryParse(e.innerText.trim());
      if (v != null) return v;
    }
    return null;
  }

  /// Libellé : premier `comment`/`value`/`generalPublicComment` non vide.
  static String? _descriptionOf(XmlElement record) {
    for (final tag in const ['comment', 'value', 'generalPublicComment']) {
      for (final e in record.findAllElements(tag)) {
        final t = e.innerText.trim();
        if (t.isNotEmpty) return t;
      }
    }
    return null;
  }

  /// Retard estimé (minutes) si `delays`/`delayTimeValue` est présent.
  static int? _delayOf(XmlElement record) {
    for (final tag in const ['delayTimeValue', 'delays']) {
      for (final e in record.findAllElements(tag)) {
        final secs = double.tryParse(e.innerText.trim());
        if (secs != null) return (secs / 60).round();
      }
    }
    return null;
  }
}
