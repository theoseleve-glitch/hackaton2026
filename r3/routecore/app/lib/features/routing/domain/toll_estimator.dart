import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

/// Per-autoroute toll model for a French class-1 light car.
///
/// Replaces the flat national 0.118 EUR/km guess with a per-autoroute
/// EUR/km table compiled from ASFA per-network averages, per-concession
/// tariff arretes and known full-route prices (see
/// assets/data/french_tolls.json and docs/TOLL_DATA.md).
///
/// The class is split into a PURE, injectable core (math + ref parsing,
/// fully unit-testable with no asset) and a thin lazy loader for the asset.
class TollEstimator {
  /// Builds an estimator over an in-memory [table] (the parsed dataset).
  /// The math is pure and never touches the asset bundle.
  TollEstimator(this.table);

  /// Builds from the decoded french_tolls.json map.
  factory TollEstimator.fromJson(Map<String, dynamic> json) {
    final autoroutes = <String, TollAutoroute>{};
    final raw = (json['autoroutes'] as Map?) ?? const {};
    raw.forEach((key, value) {
      final m = (value as Map).cast<String, dynamic>();
      autoroutes[_normalizeRef(key.toString())] = TollAutoroute(
        concession: (m['concession'] as String?) ?? 'Inconnu',
        eurPerKm: (m['eurPerKm'] as num?)?.toDouble() ?? 0.0,
        tolled: (m['tolled'] as bool?) ?? true,
      );
    });
    final defaultRate =
        (json['defaultEurPerKm'] as num?)?.toDouble() ?? _fallbackDefault;
    return TollEstimator(
      TollTable(autoroutes: autoroutes, defaultEurPerKm: defaultRate),
    );
  }

  /// Builds an estimator from the const fallback table (no asset needed —
  /// used by unit tests and as the runtime fallback when the asset fails).
  factory TollEstimator.fallback() => TollEstimator(TollTable.fallback());

  final TollTable table;

  static const _fallbackDefault = 0.092;
  static const _assetPath = 'assets/data/french_tolls.json';

  static TollEstimator? _cached;

  /// Lazily loads (and caches) the estimator from the asset bundle. On any
  /// load/parse failure it falls back to the const table so the app never
  /// breaks. The core math stays pure — this is the only impure entry point.
  static Future<TollEstimator> load() async {
    final cached = _cached;
    if (cached != null) return cached;
    try {
      final raw = await rootBundle.loadString(_assetPath);
      final json = jsonDecode(raw) as Map<String, dynamic>;
      return _cached = TollEstimator.fromJson(json);
    } catch (_) {
      return _cached = TollEstimator.fallback();
    }
  }

  /// Matches a French autoroute token inside a `ref` string: 'A7', 'A 7',
  /// 'A6a', 'A 6a'. The `[a-z]?` optional suffix captures bis/ter spurs.
  static final RegExp _refToken = RegExp(r'A\s?\d+[a-z]?', caseSensitive: false);

  /// Normalizes a raw token to canonical form: 'A 7' -> 'A7', 'a6A' -> 'A6A'
  /// keeping any letter suffix uppercased ('A6a' -> 'A6A').
  static String _normalizeRef(String token) =>
      token.replaceAll(RegExp(r'\s+'), '').toUpperCase();

  /// Pure: parses ALL autoroute tokens in an OSRM `ref` value, robustly.
  /// Handles 'A7', 'A 7', 'A7;E15', 'A 6a', 'A6;A7'. Non-A refs (D86, N7,
  /// E15) are ignored. Returns the normalized refs in order of appearance.
  static List<String> parseRefs(String? ref) {
    if (ref == null || ref.isEmpty) return const [];
    return _refToken
        .allMatches(ref)
        .map((m) => _normalizeRef(m.group(0)!))
        .toList(growable: false);
  }

  /// Pure: walks the OSRM route steps and attributes each step's distance
  /// (km) to the autoroute(s) named in its `ref`. This is the "perfect
  /// identification": only steps whose `ref` carries an A-number contribute,
  /// and when a step lists several autoroutes ('A6;A7') its distance is split
  /// evenly between them. Steps with no A-ref are ignored (city streets,
  /// D/N roads). Returns km-per-autoroute, keyed by normalized ref.
  Map<String, double> kmByAutorouteFromRoute(Map<dynamic, dynamic> osrmRouteJson) {
    final result = <String, double>{};
    final legs = (osrmRouteJson['legs'] as List? ?? const []).whereType<Map>();
    for (final leg in legs) {
      final steps = (leg['steps'] as List? ?? const []).whereType<Map>();
      for (final step in steps) {
        final ref = step['ref'];
        final refs = parseRefs(ref is String ? ref : null);
        if (refs.isEmpty) continue;
        final km = ((step['distance'] as num?) ?? 0).toDouble() / 1000.0;
        if (km <= 0) continue;
        final share = km / refs.length;
        for (final r in refs) {
          result[r] = (result[r] ?? 0) + share;
        }
      }
    }
    return result;
  }

  /// Pure: per-autoroute breakdown of the toll (EUR), each rounded to cents.
  /// Free autoroutes -> 0, unknown autoroutes -> defaultEurPerKm. Entries
  /// that round to 0.00 EUR are dropped from the breakdown.
  Map<String, double> breakdown(Map<String, double> kmByAutoroute) {
    final out = <String, double>{};
    kmByAutoroute.forEach((ref, km) {
      final rate = table.rateFor(ref);
      final eur = _round2(km * rate);
      if (eur > 0) out[ref] = eur;
    });
    return out;
  }

  /// Pure: total toll (EUR) = sum of km x rate per autoroute, rounded to
  /// cents. Free -> 0, unknown -> defaultEurPerKm.
  double estimate(Map<String, double> kmByAutoroute) {
    var total = 0.0;
    kmByAutoroute.forEach((ref, km) {
      total += km * table.rateFor(ref);
    });
    return _round2(total);
  }

  /// Default speed (m/s ≈ 90 km/h) above which an un-ref'd step is treated as
  /// tolled autoroute. In France a sustained >90 km/h step is almost always an
  /// autoroute.
  static const double motorwayMps = 25.0;

  /// Pure: total toll (EUR) from a FULL OSRM route, resilient to the public
  /// demo's lossy tagging. The demo returns no intersection `classes` and
  /// often mis-refs long autoroutes (e.g. ~2/3 of the Lyon→Marseille A7 comes
  /// back as `M 7`), so ref-only pricing under-counts badly. Per step:
  ///   - an A-ref (A7, A9…) is priced at its rate — free autoroute → 0;
  ///   - otherwise a step sustained above [motorwayMps] is treated as tolled
  ///     autoroute at the national default rate (recovers mis-ref'd /
  ///     untagged motorway);
  ///   - slower un-ref'd steps (city, D/N roads) are free.
  /// Steps without a usable duration can't yield a speed → heuristic skipped.
  double estimateFromRoute(Map<dynamic, dynamic> osrmRouteJson) =>
      _fromRoute(osrmRouteJson).total;

  /// Pure: per-autoroute EUR breakdown for a full route. Named autoroutes use
  /// their ref; the speed-recovered motorway distance is bucketed under
  /// 'Autres sections'. Entries rounding to 0 are dropped.
  Map<String, double> breakdownFromRoute(Map<dynamic, dynamic> osrmRouteJson) =>
      _fromRoute(osrmRouteJson).breakdown;

  ({double total, Map<String, double> breakdown}) _fromRoute(
      Map<dynamic, dynamic> osrmRouteJson) {
    final byRef = <String, double>{};
    var otherKm = 0.0; // un-ref'd fast (autoroute) distance
    final legs = (osrmRouteJson['legs'] as List? ?? const []).whereType<Map>();
    for (final leg in legs) {
      final steps = (leg['steps'] as List? ?? const []).whereType<Map>();
      for (final step in steps) {
        final km = ((step['distance'] as num?) ?? 0).toDouble() / 1000.0;
        if (km <= 0) continue;
        final refs = parseRefs(step['ref'] is String ? step['ref'] as String : null);
        if (refs.isNotEmpty) {
          final share = km / refs.length;
          for (final r in refs) {
            byRef[r] = (byRef[r] ?? 0) + share;
          }
          continue;
        }
        final dur = ((step['duration'] as num?) ?? 0).toDouble();
        if (dur > 0 && (km * 1000.0 / dur) > motorwayMps) {
          otherKm += km; // probable autoroute mal/non taguée
        }
      }
    }
    final breakdown = <String, double>{};
    var total = 0.0;
    byRef.forEach((ref, km) {
      final eur = km * table.rateFor(ref);
      total += eur;
      final r2 = _round2(eur);
      if (r2 > 0) breakdown[ref] = r2;
    });
    if (otherKm > 1.0) {
      final eur = otherKm * table.defaultEurPerKm;
      total += eur;
      final r2 = _round2(eur);
      if (r2 > 0) breakdown['Autres sections'] = r2;
    }
    return (total: _round2(total), breakdown: breakdown);
  }

  static double _round2(double v) => double.parse(v.toStringAsFixed(2));
}

/// One autoroute's toll entry.
class TollAutoroute {
  const TollAutoroute({
    required this.concession,
    required this.eurPerKm,
    required this.tolled,
  });

  final String concession;
  final double eurPerKm;
  final bool tolled;
}

/// The full per-autoroute table plus the default rate for unknown refs.
class TollTable {
  const TollTable({required this.autoroutes, required this.defaultEurPerKm});

  final Map<String, TollAutoroute> autoroutes;
  final double defaultEurPerKm;

  /// EUR/km for a normalized [ref]: free autoroute -> 0, known tolled ->
  /// its rate, unknown -> [defaultEurPerKm].
  double rateFor(String ref) {
    final entry = autoroutes[ref];
    if (entry == null) return defaultEurPerKm;
    if (!entry.tolled) return 0.0;
    return entry.eurPerKm;
  }

  /// A const fallback table so unit tests and the runtime fallback never
  /// need the asset. Calibrated against the same known prices as the asset.
  factory TollTable.fallback() => const TollTable(
        defaultEurPerKm: 0.092,
        autoroutes: {
          'A1': TollAutoroute(concession: 'Sanef', eurPerKm: 0.087, tolled: true),
          'A4': TollAutoroute(concession: 'Sanef', eurPerKm: 0.090, tolled: true),
          'A6': TollAutoroute(concession: 'APRR', eurPerKm: 0.083, tolled: true),
          'A7': TollAutoroute(concession: 'ASF', eurPerKm: 0.116, tolled: true),
          'A8': TollAutoroute(concession: 'Escota', eurPerKm: 0.130, tolled: true),
          'A9': TollAutoroute(concession: 'ASF', eurPerKm: 0.108, tolled: true),
          'A10': TollAutoroute(concession: 'Cofiroute', eurPerKm: 0.092, tolled: true),
          'A40': TollAutoroute(concession: 'ATMB', eurPerKm: 0.150, tolled: true),
          'A42': TollAutoroute(concession: 'APRR', eurPerKm: 0.105, tolled: true),
          'A62': TollAutoroute(concession: 'ASF', eurPerKm: 0.075, tolled: true),
          'A75': TollAutoroute(concession: 'Etat', eurPerKm: 0.0, tolled: false),
          'A20': TollAutoroute(concession: 'Etat', eurPerKm: 0.0, tolled: false),
          'A35': TollAutoroute(concession: 'Etat', eurPerKm: 0.0, tolled: false),
          'A84': TollAutoroute(concession: 'Etat', eurPerKm: 0.0, tolled: false),
        },
      );
}
