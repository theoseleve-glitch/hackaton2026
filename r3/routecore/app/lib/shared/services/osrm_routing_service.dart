import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../core/logging/app_logger.dart';
import '../../features/routing/domain/toll_estimator.dart';
import '../models/models.dart';
import 'routing_service.dart';

/// Real road routing via the public OSRM demo server (router.project-osrm.org)
/// — free, no API key, real road geometry. Demo server policy: light usage
/// only (fine for dev/MVP); self-host or switch provider before production.
///
/// Falls back to the mock synthesis on any network/parse failure so the app
/// keeps working offline.
class OsrmRoutingService extends MockRoutingService {
  OsrmRoutingService({http.Client? client, this.baseUrl, TollEstimator? tollEstimator})
      : _client = client ?? http.Client(),
        _tollEstimator = tollEstimator ?? TollEstimator.fallback();

  final http.Client _client;
  final String? baseUrl;
  static const _log = AppLogger('osrm');

  /// Per-autoroute toll model. Defaults to the const fallback table so the
  /// estimate is accurate even before the asset loads (and in unit tests).
  /// [getRouteOptions] best-effort upgrades it to the asset-backed table.
  TollEstimator _tollEstimator;

  String get _base => baseUrl ?? 'https://router.project-osrm.org';

  @override
  Future<List<RouteOption>> getRouteOptions(RouteRequest request) async {
    // Best-effort upgrade to the asset-backed per-autoroute toll table.
    // Falls back silently to the const table on any failure.
    try {
      _tollEstimator = await TollEstimator.load();
    } catch (_) {/* keep the fallback table */}
    try {
      final coords = '${request.origin.longitude},${request.origin.latitude};'
          '${request.destination.longitude},${request.destination.latitude}';
      // (a) reference request: alternatives + steps. steps=true inflates the
      // payload, so it is requested here ONLY — it feeds the toll estimate.
      final standardUri = Uri.parse(
        '$_base/route/v1/driving/$coords'
        '?overview=full&geometries=geojson&alternatives=true&steps=true',
      );
      // (b) « sans autoroute »: the public OSRM car profile supports
      // exclude=motorway (and exclude=toll) on /route.
      final noMotorwayUri = Uri.parse(
        '$_base/route/v1/driving/$coords'
        '?overview=full&geometries=geojson&alternatives=false'
        '&exclude=motorway',
      );

      // (b) is best-effort: when it fails, assembleOptions falls back to the
      // previous behavior (min-distance alternative of (a)) so the app never
      // breaks.
      Future<Map<String, dynamic>?> noMotorwayJson() async {
        try {
          return await _getJson(noMotorwayUri);
        } catch (e) {
          _log.warn('exclude=motorway request failed (non-fatal): $e');
          return null;
        }
      }

      final results = await Future.wait<Map<String, dynamic>?>(
        [_getJson(standardUri), noMotorwayJson()],
      );
      final options = assembleOptions(results[0]!, results[1], request);
      if (options.isEmpty) throw Exception('OSRM: no route');
      return options;
    } catch (e) {
      _log.warn('falling back to mock routing: $e');
      return super.getRouteOptions(request);
    }
  }

  Future<Map<String, dynamic>> _getJson(Uri uri) async {
    final res = await _client.get(uri).timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) {
      throw Exception('OSRM HTTP ${res.statusCode}');
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  @override
  Future<RouteOption?> getRouteVia({
    required GeoPoint origin,
    required List<GeoPoint> vias,
    required GeoPoint destination,
    String? vehicleType,
  }) async {
    try {
      final coords = [origin, ...vias, destination]
          .map((p) => '${p.longitude},${p.latitude}')
          .join(';');
      final uri = Uri.parse(
        '$_base/route/v1/driving/$coords'
        '?overview=full&geometries=geojson&alternatives=false',
      );
      final res = await _client.get(uri).timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) {
        throw Exception('OSRM HTTP ${res.statusCode}');
      }
      final option = parseViaRoute(
        jsonDecode(res.body) as Map<String, dynamic>,
        origin: origin,
        destination: destination,
        viaCount: vias.length,
        vehicleType: vehicleType,
      );
      if (option == null) throw Exception('OSRM: no via route');
      return option;
    } catch (e) {
      _log.warn('falling back to mock via routing: $e');
      return super.getRouteVia(
        origin: origin,
        vias: vias,
        destination: destination,
        vehicleType: vehicleType,
      );
    }
  }

  /// Pure mapping OSRM JSON -> the échappée route through the haltes
  /// (unit-tested).
  RouteOption? parseViaRoute(
    Map<String, dynamic> json, {
    required GeoPoint origin,
    required GeoPoint destination,
    required int viaCount,
    String? vehicleType,
  }) {
    final routes =
        (json['routes'] as List? ?? const []).cast<Map<String, dynamic>>();
    if (routes.isEmpty) return null;
    final r = routes.first;
    final geometry = r['geometry'] as Map<String, dynamic>;
    final coords = (geometry['coordinates'] as List)
        .cast<List>()
        // GeoJSON is [lng, lat]; polyline format is `lat,lng;...`.
        .map((c) => '${(c[1] as num).toDouble()},${(c[0] as num).toDouble()}')
        .join(';');
    return estimateRouteMetrics(
      RouteOption(
        id: 'osrm-via',
        origin: origin,
        destination: destination,
        polyline: coords,
        distanceMeters: (r['distance'] as num).round(),
        durationSeconds: (r['duration'] as num).round(),
        routeMode: RouteMode.discovery,
        provider: 'osrm',
        metadata: {'polylineFormat': 'latlng-list', 'viaCount': viaCount},
      ),
      vehicleType: vehicleType,
    );
  }

  /// Pure mapping OSRM JSON -> RouteOptions (unit-tested).
  /// fastest = main route; shortest = alternative with min distance;
  /// eco = min-distance route with eco metrics (gentler consumption);
  /// discovery (when requested) = the most scenic (longest) alternative.
  ///
  /// Legacy single-response mapping — [assembleOptions] supersedes it when a
  /// no-motorway response (b) is available.
  List<RouteOption> parseRoutes(
      Map<String, dynamic> json, RouteRequest request) {
    final routes = (json['routes'] as List? ?? const [])
        .cast<Map<String, dynamic>>();
    if (routes.isEmpty) return const [];

    const meta = {'polylineFormat': 'latlng-list'};
    final byDistance = [...routes]..sort((a, b) =>
        (a['distance'] as num).compareTo(b['distance'] as num));

    return <RouteOption>[
      _buildOption(routes.first, request, RouteMode.fastest, 'osrm-fastest',
          meta),
      _buildOption(byDistance.first, request, RouteMode.shortest,
          'osrm-shortest', meta),
      _buildOption(byDistance.first, request, RouteMode.eco, 'osrm-eco', meta),
      if (request.routeMode == RouteMode.discovery)
        _buildOption(byDistance.last, request, RouteMode.discovery,
            'osrm-discovery', meta),
    ];
  }

  /// Pure assembly of the dual OSRM responses into RouteOptions
  /// (unit-tested).
  ///
  /// [aJson] = standard request (alternatives=true & steps=true). Its main
  /// route becomes [RouteMode.fastest] with metadata
  /// `{'highway': true, 'motorwayKm': …, 'tollEstimateEur': …}` — the two
  /// toll keys are present only when (a) carried steps.
  ///
  /// [bJson] = exclude=motorway response. Its route becomes both
  /// [RouteMode.shortest] and [RouteMode.eco] (eco keeps its gentler
  /// consumption via [estimateRouteMetrics]) with metadata
  /// `{'highway': false, 'noHighway': true}`. When [bJson] is null or has no
  /// route (request (b) failed), shortest/eco fall back to the previous
  /// behavior: the min-distance alternative of [aJson].
  ///
  /// discovery (when requested) stays the most scenic alternative of
  /// [aJson].
  List<RouteOption> assembleOptions(
    Map<String, dynamic> aJson,
    Map<String, dynamic>? bJson,
    RouteRequest request,
  ) {
    final aRoutes =
        (aJson['routes'] as List? ?? const []).cast<Map<String, dynamic>>();
    if (aRoutes.isEmpty) return const [];

    final bRoutes =
        (bJson?['routes'] as List? ?? const []).cast<Map<String, dynamic>>();
    final noMotorway = bRoutes.isEmpty ? null : bRoutes.first;

    final main = aRoutes.first;
    final fastestMeta = <String, dynamic>{
      'polylineFormat': 'latlng-list',
      'highway': true,
    };
    if (_hasSteps(main)) {
      final motorwayKm = motorwayKmFromRoute(main);
      fastestMeta['motorwayKm'] = double.parse(motorwayKm.toStringAsFixed(1));
      // Péage par autoroute + rattrapage des tronçons autoroutiers que le
      // serveur démo OSRM laisse sans `ref` (détectés à la vitesse) — voir
      // TollEstimator.estimateFromRoute. Repli forfaitaire seulement si rien
      // n'est détecté du tout.
      final toll = _tollEstimator.estimateFromRoute(main);
      final breakdown = _tollEstimator.breakdownFromRoute(main);
      if (toll <= 0 && motorwayKm > minTollableKm) {
        fastestMeta['tollEstimateEur'] = estimateTollEur(motorwayKm);
      } else {
        fastestMeta['tollEstimateEur'] = toll;
        if (breakdown.isNotEmpty) fastestMeta['tollByAutoroute'] = breakdown;
      }
    }

    final byDistance = [...aRoutes]..sort((a, b) =>
        (a['distance'] as num).compareTo(b['distance'] as num));

    // Fallback « sans autoroute » quand (b) manque : le serveur démo OSRM
    // refuse exclude=motorway (HTTP 400 — classe non activée sur son
    // profil ; un OSRM self-hosté la fournit). On choisit alors parmi les
    // alternatives de (a) celle qui roule le MOINS sur autoroute (mesuré
    // via les steps) et on ne pose noHighway que si c'est vraiment le cas
    // (< 1 km) — honnêteté avant tout : sans certitude, pas de carte
    // « Sans autoroute » dans l'UI.
    Map<String, dynamic> leastMotorwayAlternative() {
      var best = byDistance.first;
      var bestKm = double.infinity;
      for (final route in aRoutes) {
        final km = motorwayKmFromRoute(route);
        if (km < bestKm) {
          bestKm = km;
          best = route;
        }
      }
      return best;
    }

    // HONNÊTETÉ (1/2) : si exclude=motorway renvoie la MÊME route que la
    // rapide, c'est qu'il n'y a aucune autoroute à éviter sur ce trajet — donc
    // tout péage estimé est un faux positif (une voie rapide gratuite que
    // l'heuristique vitesse a prise pour une autoroute). On le remet à zéro.
    if (noMotorway != null && _sameRoute(main, noMotorway)) {
      fastestMeta['tollEstimateEur'] = 0.0;
      fastestMeta.remove('tollByAutoroute');
    }

    final shortestSource = noMotorway ?? leastMotorwayAlternative();
    final shortestIsMotorwayFree = noMotorway != null ||
        (_hasSteps(shortestSource) &&
            motorwayKmFromRoute(shortestSource) < 1.0);
    final shortestMeta = shortestIsMotorwayFree
        ? const <String, dynamic>{
            'polylineFormat': 'latlng-list',
            'highway': false,
            'noHighway': true,
          }
        : const <String, dynamic>{'polylineFormat': 'latlng-list'};

    final options = <RouteOption>[
      _buildOption(main, request, RouteMode.fastest, 'osrm-fastest',
          fastestMeta),
    ];

    // HONNÊTETÉ (2/2) : ne JAMAIS présenter deux fois la même route. « Sans
    // autoroute » / « Éco » ne sont émises que si elles diffèrent vraiment de
    // la rapide. Sinon OSRM n'a pas d'alternative réelle -> une seule carte
    // (évite « même km, même temps, mais un prix différent »).
    if (!_sameRoute(main, shortestSource)) {
      options
        ..add(_buildOption(shortestSource, request, RouteMode.shortest,
            'osrm-shortest', shortestMeta))
        ..add(_buildOption(shortestSource, request, RouteMode.eco, 'osrm-eco',
            shortestMeta));
    }

    if (request.routeMode == RouteMode.discovery) {
      options.add(_buildOption(byDistance.last, request, RouteMode.discovery,
          'osrm-discovery', const {'polylineFormat': 'latlng-list'}));
    }

    return options;
  }

  RouteOption _buildOption(
    Map<String, dynamic> r,
    RouteRequest request,
    RouteMode mode,
    String id,
    Map<String, dynamic> metadata,
  ) {
    final geometry = r['geometry'] as Map<String, dynamic>;
    final coords = (geometry['coordinates'] as List)
        .cast<List>()
        // GeoJSON is [lng, lat]; polyline format is `lat,lng;...`.
        .map((c) => '${(c[1] as num).toDouble()},${(c[0] as num).toDouble()}')
        .join(';');
    return estimateRouteMetrics(
      RouteOption(
        id: id,
        origin: request.origin,
        destination: request.destination,
        polyline: coords,
        distanceMeters: (r['distance'] as num).round(),
        durationSeconds: (r['duration'] as num).round(),
        routeMode: mode,
        provider: 'osrm',
        metadata: metadata,
      ),
      vehicleType: request.vehicleType,
    );
  }

  static bool _hasSteps(Map<String, dynamic> routeJson) =>
      (routeJson['legs'] as List? ?? const []).any((leg) =>
          leg is Map && (leg['steps'] as List? ?? const []).isNotEmpty);

  /// Pure: two OSRM routes are "the same road" when their distance AND
  /// duration match within a tight tolerance (100 m or 1 % on distance,
  /// 30 s or 1 % on duration). Used to avoid presenting the fastest route a
  /// second time as a fake « sans autoroute » / « éco » card when OSRM has no
  /// genuine alternative (or exclude=motorway returns the same road).
  static bool _sameRoute(Map<String, dynamic> a, Map<String, dynamic> b) {
    double num_(Object? v) => (v as num?)?.toDouble() ?? double.nan;
    final da = num_(a['distance']);
    final db = num_(b['distance']);
    final ta = num_(a['duration']);
    final tb = num_(b['duration']);
    if (da.isNaN || db.isNaN || ta.isNaN || tb.isNaN) return false;
    bool near(double x, double y, double absTol, double relTol) {
      final d = (x - y).abs();
      return d <= absTol || (y != 0 && d / y <= relTol);
    }
    return near(da, db, 100, 0.01) && near(ta, tb, 30, 0.01);
  }

  /// French autoroute refs: 'A7', 'A 7', 'A 7;E 15'…
  static final RegExp _motorwayRef = RegExp(r'^A\s?\d+');

  /// Pure: total distance (km) of the steps of [routeJson] that ride a
  /// motorway. A step counts when its `ref` matches `^A\s?\d+` (French
  /// autoroute numbering) or when any of its `intersections` carries a
  /// `classes` list containing 'motorway' or 'toll'. Returns 0 when the
  /// route has no steps (request made without steps=true).
  static double motorwayKmFromRoute(Map<String, dynamic> routeJson) {
    var meters = 0.0;
    final legs =
        (routeJson['legs'] as List? ?? const []).whereType<Map>();
    for (final leg in legs) {
      final steps = (leg['steps'] as List? ?? const []).whereType<Map>();
      for (final step in steps) {
        if (_isMotorwayStep(step)) {
          meters += (step['distance'] as num? ?? 0).toDouble();
        }
      }
    }
    return meters / 1000;
  }

  static bool _isMotorwayStep(Map<dynamic, dynamic> step) {
    final ref = step['ref'];
    if (ref is String && _motorwayRef.hasMatch(ref)) return true;
    final intersections =
        (step['intersections'] as List? ?? const []).whereType<Map>();
    for (final intersection in intersections) {
      final classes = intersection['classes'] as List? ?? const [];
      if (classes.contains('motorway') || classes.contains('toll')) {
        return true;
      }
    }
    return false;
  }

  /// Average French motorway toll rate for a class-1 vehicle (light car):
  /// ≈ 0.118 €/km, network average derived from the 2025–2026 public tariff
  /// grids of the main concessions (APRR, ASF/Vinci Autoroutes, Sanef).
  static const double tollEurPerKm = 0.118;

  /// Below this motorway distance the toll is clamped to 0 € — short/urban
  /// motorway sections are typically free.
  static const double minTollableKm = 5.0;

  /// DEPRECATED flat fallback. Pure ESTIMATE of the toll (EUR) for
  /// [motorwayKm] km of French autoroute, class-1 vehicle, at [tollEurPerKm]
  /// (≈0.118 €/km network average). Superseded by [TollEstimator]'s
  /// per-autoroute model (assets/data/french_tolls.json); kept only as the
  /// fallback used when no A-ref steps can be identified on a route.
  /// Distances under [minTollableKm] km return 0.
  static double estimateTollEur(double motorwayKm) {
    if (motorwayKm < minTollableKm) return 0;
    return double.parse((motorwayKm * tollEurPerKm).toStringAsFixed(2));
  }
}
