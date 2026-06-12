import 'dart:math' as math;

import '../../../shared/models/geo.dart';

/// Coach d'écoconduite — pur, sans IO, entièrement testable.
///
/// Deux responsabilités :
/// 1. [EcoCoach.planAdvice] : à partir de la géométrie d'un itinéraire
///    (virages serrés, épingles) et de repères de navigation optionnels
///    ([NavHint] : rond-point, feu, stop), produit des points de conseil
///    "lève le pied" placés en amont, plus une vitesse de croisière sobre.
/// 2. [EcoCoach.scoreTrip] : note un trajet terminé (0-100) et estime le
///    carburant / l'argent / le CO2 économisés vs un conducteur de référence.
///
/// Ordres de grandeur documentés (source ADEME) :
/// - Rouler 110 plutôt que 130 économise ~12-20 % de carburant ; on retient
///   la règle de sobriété classique −10/−20 km/h (130→110, 110→100, 90→80).
/// - Une conduite souple économise jusqu'à ~15 % ; une conduite agressive
///   coûte ~+18 % (facteurs 0.85 / 1.18 utilisés par [scoreTrip]).

/// Nature d'un conseil émis par le coach.
enum EcoAdviceKind { liftOff, slowDown, steadySpeed, anticipate }

/// Repère de navigation optionnel (alimenté plus tard par les manoeuvres
/// OSRM). [kind] : 'roundabout' | 'traffic_light' | 'stop' | 'sharp_turn'.
class NavHint {
  const NavHint({required this.location, required this.kind, this.exitNumber});

  final GeoPoint location;
  final String kind;
  final int? exitNumber;
}

/// Conseil géolocalisé le long de l'itinéraire.
class EcoAdvicePoint {
  const EcoAdvicePoint({
    required this.location,
    required this.distanceAlongMeters,
    required this.kind,
    required this.message,
    this.recommendedKmh,
    this.limitKmh,
  });

  final GeoPoint location;
  final double distanceAlongMeters;
  final EcoAdviceKind kind;
  final String message;
  final int? recommendedKmh;
  final int? limitKmh;
}

/// Bilan d'un trajet : score 0-100, conso estimée et économies vs un
/// conducteur de référence (facteur 1.0).
class EcoTripScore {
  const EcoTripScore({
    required this.score,
    required this.breakdown,
    required this.estimatedConsL100,
    required this.fuelSavedL,
    required this.moneySavedEur,
    required this.co2SavedKg,
    required this.advice,
  });

  final int score; // 0..100
  final Map<String, int> breakdown; // regularite / anticipation / sobriete
  final double estimatedConsL100; // L/100 km (ou kWh/100 km en électrique)
  final double fuelSavedL; // négatif si conduite plus gourmande que la base
  final double moneySavedEur;
  final double co2SavedKg;
  final List<String> advice; // 2 conseils concrets, dimension la plus faible
}

class EcoCoach {
  const EcoCoach({
    this.gentleDecelMps2 = 0.7,
    this.sharpBendThresholdDeg = 45.0,
    this.hairpinThresholdDeg = 135.0,
    this.bendWindowMeters = 200.0,
    this.defaultApproachKmh = 80,
    this.harshBrakeKmhPerS = 8.0,
    this.harshAccelKmhPerS = 6.0,
  });

  /// Décélération douce en roue libre + frein moteur (m/s²).
  final double gentleDecelMps2;

  /// Virage serré : changement de cap cumulé > 45° sur < 200 m.
  final double sharpBendThresholdDeg;

  /// Quasi demi-tour (épingle) : changement de cap cumulé >= 135°.
  final double hairpinThresholdDeg;
  final double bendWindowMeters;

  /// Vitesse d'approche estimée quand aucune limite n'est connue.
  final int defaultApproachKmh;

  /// Seuils d'évènements brusques en km/h par seconde (échantillons 1 Hz,
  /// ajustés via sampleHz dans [scoreTrip]).
  final double harshBrakeKmhPerS;
  final double harshAccelKmhPerS;

  /// Règle de sobriété −10/−20 km/h (ADEME : ~12-20 % d'économie à 130→110).
  /// Retourne null si la limite n'a pas de recommandation dédiée.
  static int? recommendedCruiseKmh(int limitKmh) {
    switch (limitKmh) {
      case 130:
        return 110;
      case 110:
        return 100;
      case 90:
        return 80;
      default:
        return null;
    }
  }

  /// Économie (% carburant) affichée pour chaque palier recommandé.
  static const _cruiseSavingPct = {130: 20, 110: 12, 90: 10};

  // -------------------------------------------------------------------------
  // Planification des conseils le long d'un itinéraire
  // -------------------------------------------------------------------------

  /// Analyse la géométrie de [polyline] (+ [hints] éventuels) et retourne les
  /// conseils triés par distance le long de l'itinéraire.
  ///
  /// Distance de lever de pied avant un virage : d = v² / (2·a) avec
  /// a = [gentleDecelMps2] et v la vitesse d'approche ([cruiseLimitKmh] ou
  /// [defaultApproachKmh]). Ex. 80 km/h → ~353 m.
  ///
  /// Rond-point : d = clamp((v² − v_rp²) / (2·a), 400, 600) avec une vitesse
  /// d'entrée v_rp = 30 km/h — soit 400 m à 90 km/h et 600 m à 110 km/h.
  List<EcoAdvicePoint> planAdvice({
    required List<GeoPoint> polyline,
    List<NavHint> hints = const [],
    int? cruiseLimitKmh,
  }) {
    if (polyline.length < 2) return const [];

    final cum = _cumulativeDistances(polyline);
    final advice = <EcoAdvicePoint>[];
    final approachKmh = cruiseLimitKmh ?? defaultApproachKmh;
    final approachMps = approachKmh / 3.6;

    // Vitesse de croisière sobre (si la limite est connue).
    if (cruiseLimitKmh != null) {
      final rec = recommendedCruiseKmh(cruiseLimitKmh);
      if (rec != null) {
        final pct = _cruiseSavingPct[cruiseLimitKmh] ?? 10;
        advice.add(EcoAdvicePoint(
          location: polyline.first,
          distanceAlongMeters: 0,
          kind: EcoAdviceKind.steadySpeed,
          message: '$rec plutôt que $cruiseLimitKmh : −$pct % de carburant.',
          recommendedKmh: rec,
          limitKmh: cruiseLimitKmh,
        ));
      }
    }

    // Virages détectés par la géométrie seule (les limites de vitesse
    // détaillées ne sont pas encore branchées).
    final liftOffMeters =
        approachMps * approachMps / (2 * gentleDecelMps2);
    for (final bend in _detectBends(polyline, cum)) {
      final at = math.max(0.0, cum[bend.cornerIndex] - liftOffMeters);
      final hairpin = bend.totalAngleDeg >= hairpinThresholdDeg;
      advice.add(EcoAdvicePoint(
        location: _pointAt(polyline, cum, at),
        distanceAlongMeters: at,
        kind: EcoAdviceKind.liftOff,
        message: hairpin
            ? 'Virage en épingle devant : lève le pied ici et laisse rouler.'
            : 'Lève le pied ici, laisse rouler jusqu\'au virage.',
        recommendedKmh: hairpin ? 30 : null,
        limitKmh: cruiseLimitKmh,
      ));
    }

    // Repères de navigation (rond-points, feux, stops…).
    for (final hint in hints) {
      final point = _adviceForHint(
          hint, polyline, cum, approachMps, cruiseLimitKmh);
      if (point != null) advice.add(point);
    }

    advice.sort(
        (a, b) => a.distanceAlongMeters.compareTo(b.distanceAlongMeters));
    return advice;
  }

  EcoAdvicePoint? _adviceForHint(
    NavHint hint,
    List<GeoPoint> polyline,
    List<double> cum,
    double approachMps,
    int? cruiseLimitKmh,
  ) {
    final hintAlong = cum[_nearestVertexIndex(polyline, hint.location)];
    final v2 = approachMps * approachMps;
    switch (hint.kind) {
      case 'roundabout':
        // d = clamp((v² − v_rp²) / (2·a), 400, 600), v_rp = 30 km/h.
        const vRp = 30 / 3.6;
        final d = ((v2 - vRp * vRp) / (2 * gentleDecelMps2))
            .clamp(400.0, 600.0);
        final at = math.max(0.0, hintAlong - d);
        final shown = (d / 50).round() * 50;
        final exit =
            hint.exitNumber != null ? ' (sortie ${hint.exitNumber})' : '';
        return EcoAdvicePoint(
          location: _pointAt(polyline, cum, at),
          distanceAlongMeters: at,
          kind: EcoAdviceKind.liftOff,
          message:
              'Rond-point dans $shown m — lève le pied maintenant$exit.',
          recommendedKmh: 30,
          limitKmh: cruiseLimitKmh,
        );
      case 'traffic_light':
      case 'stop':
        // Arrêt potentiel complet : d = v² / (2·a), borné à [150, 500] m.
        final d = (v2 / (2 * gentleDecelMps2)).clamp(150.0, 500.0);
        final at = math.max(0.0, hintAlong - d);
        return EcoAdvicePoint(
          location: _pointAt(polyline, cum, at),
          distanceAlongMeters: at,
          kind: EcoAdviceKind.anticipate,
          message: hint.kind == 'stop'
              ? 'Stop en approche — laisse rouler, freine en douceur.'
              : 'Feu en approche — lève le pied et laisse rouler.',
          limitKmh: cruiseLimitKmh,
        );
      case 'sharp_turn':
        final d = v2 / (2 * gentleDecelMps2);
        final at = math.max(0.0, hintAlong - d);
        return EcoAdvicePoint(
          location: _pointAt(polyline, cum, at),
          distanceAlongMeters: at,
          kind: EcoAdviceKind.liftOff,
          message: 'Virage serré annoncé — lève le pied ici.',
          limitKmh: cruiseLimitKmh,
        );
      default:
        return null; // repère inconnu : ignoré
    }
  }

  // -------------------------------------------------------------------------
  // Score d'un trajet terminé + économies
  // -------------------------------------------------------------------------

  /// Note un trajet à partir de ses échantillons de vitesse (km/h,
  /// [sampleHz] échantillons par seconde, 1 Hz par défaut).
  ///
  /// Pondération : 40 % régularité, 30 % anticipation (évènements brusques),
  /// 30 % sobriété (part du temps au-dessus de la croisière recommandée pour
  /// le type de route inféré des vitesses).
  ///
  /// Conso estimée = [vehicleConsL100] × facteur(score), linéaire par
  /// morceaux : score 100 → 0.85, 50 → 1.0, 0 → 1.18 (ADEME : l'écoconduite
  /// économise jusqu'à ~15 %, la conduite agressive coûte ~+18 %).
  /// Les économies sont calculées vs un conducteur de référence (facteur 1.0).
  EcoTripScore scoreTrip({
    required double distanceKm,
    required double durationSeconds,
    required List<double> speedsKmh,
    required double vehicleConsL100,
    required String fuel,
    required double fuelPriceEurPerL,
    double sampleHz = 1.0,
  }) {
    if (speedsKmh.length < 2 || distanceKm <= 0) {
      return EcoTripScore(
        score: 50,
        breakdown: const {'regularite': 50, 'anticipation': 50, 'sobriete': 50},
        estimatedConsL100: vehicleConsL100,
        fuelSavedL: 0,
        moneySavedEur: 0,
        co2SavedKg: 0,
        advice: const ['Trajet trop court pour une analyse fiable.'],
      );
    }

    final n = speedsKmh.length;

    // Régularité : écart-type des vitesses.
    final mean = speedsKmh.reduce((a, b) => a + b) / n;
    final variance = speedsKmh
            .map((s) => (s - mean) * (s - mean))
            .reduce((a, b) => a + b) /
        n;
    final stdev = math.sqrt(variance);
    final steadyScore = (100 - stdev * 3).clamp(0, 100).round();

    // Anticipation : évènements brusques par km (delta de vitesse entre
    // échantillons consécutifs, ramené en km/h par seconde via sampleHz).
    var harsh = 0;
    for (var i = 1; i < n; i++) {
      final deltaPerSec = (speedsKmh[i] - speedsKmh[i - 1]) * sampleHz;
      if (deltaPerSec <= -harshBrakeKmhPerS ||
          deltaPerSec >= harshAccelKmhPerS) {
        harsh++;
      }
    }
    final anticipationScore =
        (100 - harsh / math.max(distanceKm, 0.5) * 15).clamp(0, 100).round();

    // Sobriété : type de route inféré du 90e centile des vitesses, puis part
    // des échantillons au-dessus de la croisière recommandée (+2 km/h de
    // tolérance GPS).
    final sorted = [...speedsKmh]..sort();
    final p90 = sorted[((n - 1) * 0.9).round()];
    final avgKmh =
        durationSeconds > 0 ? distanceKm / (durationSeconds / 3600.0) : 0.0;
    final limit = _inferLimitKmh(math.max(p90, avgKmh));
    final cruise = recommendedCruiseKmh(limit) ?? limit;
    final overspeedRatio =
        speedsKmh.where((s) => s > cruise + 2).length / n;
    final soberScore = ((1 - overspeedRatio) * 100).round();

    final score =
        (steadyScore * 0.4 + anticipationScore * 0.3 + soberScore * 0.3)
            .round();

    // Facteur de conso linéaire par morceaux (100→0.85, 50→1.0, 0→1.18).
    final factor = score >= 50
        ? 1.0 - (score - 50) * (0.15 / 50)
        : 1.0 + (50 - score) * (0.18 / 50);
    final estimatedCons = vehicleConsL100 * factor;
    final fuelSaved = vehicleConsL100 * (1.0 - factor) * distanceKm / 100;
    final moneySaved = fuelSaved * fuelPriceEurPerL;
    final co2Saved = fuelSaved * _co2KgPerUnit(fuel);

    final breakdown = {
      'regularite': steadyScore,
      'anticipation': anticipationScore,
      'sobriete': soberScore,
    };
    return EcoTripScore(
      score: score,
      breakdown: breakdown,
      estimatedConsL100: double.parse(estimatedCons.toStringAsFixed(2)),
      fuelSavedL: double.parse(fuelSaved.toStringAsFixed(3)),
      moneySavedEur: double.parse(moneySaved.toStringAsFixed(2)),
      co2SavedKg: double.parse(co2Saved.toStringAsFixed(2)),
      advice: _topAdvice(breakdown, cruise, limit),
    );
  }

  /// Limite plausible d'après la vitesse de référence (90e centile).
  int _inferLimitKmh(double refKmh) {
    if (refKmh <= 60) return 50;
    if (refKmh <= 90) return 90;
    if (refKmh <= 112) return 110;
    return 130;
  }

  /// kg de CO2 par litre (ou par kWh en électrique).
  double _co2KgPerUnit(String fuel) {
    switch (fuel.toLowerCase()) {
      case 'diesel':
      case 'gazole':
        return 2.68;
      case 'electrique':
      case 'électrique':
      case 'elec':
      case 'electric':
        return 0.05; // kg CO2 / kWh, mix électrique français
      default:
        return 2.31; // essence
    }
  }

  /// Deux conseils concrets, ciblés sur les dimensions les plus faibles.
  List<String> _topAdvice(Map<String, int> breakdown, int cruise, int limit) {
    final tips = {
      'regularite':
          'Gardez une vitesse constante : le régulateur est votre allié.',
      'anticipation':
          'Anticipez : lever le pied tôt remplace un freinage brusque.',
      'sobriete': cruise < limit
          ? '$cruise plutôt que $limit km/h : '
              'jusqu\'à −20 % de carburant sur voie rapide.'
          : 'Restez sous la limite : au-delà, la consommation s\'envole.',
    };
    final ordered = breakdown.entries.toList()
      ..sort((a, b) => a.value.compareTo(b.value));
    return [for (final e in ordered.take(2)) tips[e.key]!];
  }

  // -------------------------------------------------------------------------
  // Géométrie
  // -------------------------------------------------------------------------

  List<_Bend> _detectBends(List<GeoPoint> polyline, List<double> cum) {
    final n = polyline.length;
    if (n < 3) return const [];

    // Changement de cap à chaque sommet intérieur, normalisé (-180, 180].
    final turn = List<double>.filled(n, 0);
    for (var i = 1; i <= n - 2; i++) {
      turn[i] = _normalizeDeg(_bearingDeg(polyline[i], polyline[i + 1]) -
          _bearingDeg(polyline[i - 1], polyline[i]));
    }

    final bends = <_Bend>[];
    var i = 1;
    while (i <= n - 2) {
      var sum = 0.0;
      var maxAbs = 0.0;
      var cornerIdx = i;
      var j = i;
      while (j <= n - 2 && cum[j] - cum[i] < bendWindowMeters) {
        final a = turn[j];
        // Une inversion franche de direction termine la fenêtre (courbe en S).
        if (sum.abs() > 15 && a.abs() > 15 && a.sign != sum.sign) break;
        sum += a;
        if (a.abs() > maxAbs) {
          maxAbs = a.abs();
          cornerIdx = j;
        }
        j++;
      }
      if (sum.abs() >= sharpBendThresholdDeg) {
        bends.add(_Bend(cornerIdx, sum.abs()));
        i = j + 1; // saute la fenêtre déjà consommée
      } else {
        i++;
      }
    }
    return bends;
  }

  static List<double> _cumulativeDistances(List<GeoPoint> polyline) {
    final cum = List<double>.filled(polyline.length, 0);
    for (var i = 1; i < polyline.length; i++) {
      cum[i] = cum[i - 1] + polyline[i - 1].distanceTo(polyline[i]);
    }
    return cum;
  }

  /// Point interpolé à [distance] mètres le long de la polyligne.
  static GeoPoint _pointAt(
      List<GeoPoint> polyline, List<double> cum, double distance) {
    if (distance <= 0) return polyline.first;
    if (distance >= cum.last) return polyline.last;
    var i = 1;
    while (cum[i] < distance) {
      i++;
    }
    final segment = cum[i] - cum[i - 1];
    final t = segment <= 0 ? 0.0 : (distance - cum[i - 1]) / segment;
    final a = polyline[i - 1], b = polyline[i];
    return GeoPoint(
      latitude: a.latitude + (b.latitude - a.latitude) * t,
      longitude: a.longitude + (b.longitude - a.longitude) * t,
    );
  }

  /// Sommet le plus proche — suffisant pour des repères posés sur le tracé.
  static int _nearestVertexIndex(List<GeoPoint> polyline, GeoPoint p) {
    var best = 0;
    var bestDist = double.infinity;
    for (var i = 0; i < polyline.length; i++) {
      final d = polyline[i].distanceTo(p);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  static double _bearingDeg(GeoPoint a, GeoPoint b) {
    final phi1 = a.latitude * math.pi / 180;
    final phi2 = b.latitude * math.pi / 180;
    final dLng = (b.longitude - a.longitude) * math.pi / 180;
    final y = math.sin(dLng) * math.cos(phi2);
    final x = math.cos(phi1) * math.sin(phi2) -
        math.sin(phi1) * math.cos(phi2) * math.cos(dLng);
    return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
  }

  static double _normalizeDeg(double deg) {
    var d = deg % 360;
    if (d > 180) d -= 360;
    if (d <= -180) d += 360;
    return d;
  }
}

class _Bend {
  const _Bend(this.cornerIndex, this.totalAngleDeg);

  final int cornerIndex;
  final double totalAngleDeg;
}
