import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../features/vehicle/data/vehicle_repository.dart';
import '../../../features/vehicle/domain/vehicle.dart';
import '../../../shared/models/geo.dart';
import '../data/driving_sensors.dart';
import '../domain/eco_coach.dart';

/// État live du coach, consommé par EcoCoachOverlay (ValueListenable).
class EcoCoachState {
  const EcoCoachState({
    this.activeAdvice,
    this.activeKind,
    this.adviceSeq = 0,
    this.liveScoreEstimate = 80,
    this.samplesCount = 0,
  });

  /// Conseil affiché (null = pastille score seule). Un seul à la fois.
  final String? activeAdvice;
  final EcoAdviceKind? activeKind;

  /// Numéro d'émission, incrémenté à chaque nouveau conseil — permet à
  /// l'overlay de distinguer deux émissions du même message.
  final int adviceSeq;

  /// Estimation 0-100 (EMA régularité + sobriété, corrigée pente via VSP).
  final int liveScoreEstimate;

  /// Nombre de fixes GPS intégrés (debug/HUD).
  final int samplesCount;

  EcoCoachState copyWith({
    String? activeAdvice,
    EcoAdviceKind? activeKind,
    int? adviceSeq,
    int? liveScoreEstimate,
    int? samplesCount,
    bool clearAdvice = false,
  }) =>
      EcoCoachState(
        activeAdvice: clearAdvice ? null : (activeAdvice ?? this.activeAdvice),
        activeKind: clearAdvice ? null : (activeKind ?? this.activeKind),
        adviceSeq: adviceSeq ?? this.adviceSeq,
        liveScoreEstimate: liveScoreEstimate ?? this.liveScoreEstimate,
        samplesCount: samplesCount ?? this.samplesCount,
      );
}

/// Pilote le coaching live : précalcule les conseils ([EcoCoach.planAdvice]),
/// les déclenche au passage (fenêtre 0-80 m), applique les garde-fous issus
/// de la recherche (1 conseil actif max, >= 12 s d'écart, effacement 8 s —
/// docs/ECO_COACHING_RESEARCH.md §1), maintient un score live et note le
/// trajet à l'arrivée ([finish] → [EcoCoach.scoreTrip]).
///
/// Aucun timer : tout est cadencé par [onPosition] (1-2 Hz, branché sur le
/// callback `onPositionUpdate` de l'écran de navigation) et par l'horloge
/// injectable [now] (testabilité). Les capteurs sont optionnels
/// ([onDrivingSample]) : tout fonctionne en mode GPS-seul.
class EcoCoachController {
  EcoCoachController({
    this.coach = const EcoCoach(),
    this.vehicle,
    VehicleSelection? Function()? vehicleResolver,
    DateTime Function()? now,
    this.triggerWindowMeters = 80.0,
    this.minAdviceGap = const Duration(seconds: 12),
    this.adviceDisplay = const Duration(seconds: 8),
  })  : _vehicleResolver = vehicleResolver,
        _now = now ?? DateTime.now;

  final EcoCoach coach;

  /// Véhicule fixé (tests) ; sinon [_vehicleResolver] est interrogé à
  /// [finish] (la sélection peut arriver après le départ).
  final VehicleSelection? vehicle;
  final VehicleSelection? Function()? _vehicleResolver;
  final DateTime Function() _now;

  /// Un conseil se déclenche quand son point est à moins de cette distance
  /// devant le véhicule (~4 s à 70 km/h).
  final double triggerWindowMeters;

  /// Anti-surcharge cognitive : écart minimal entre deux conseils.
  final Duration minAdviceGap;

  /// Durée d'affichage d'un conseil avant effacement automatique.
  final Duration adviceDisplay;

  /// Repli quand aucun véhicule n'est choisi : 6,5 L/100 essence à 1,85 €/L.
  static const fallbackConsL100 = 6.5;
  static const fallbackFuel = 'essence';
  static const fallbackPriceEur = 1.85;

  /// Fenêtre glissante du conseil « anticipe » : >= 2 décélérations brusques
  /// en 8 s (recherche §3).
  static const _decelWindow = Duration(seconds: 8);
  static const _decelEventsForAdvice = 2;
  static const _anticipateMessage = 'Anticipe : regarde plus loin devant.';

  /// Lissage altitude + fenêtre de pente (bruit GPS : jamais point à point).
  static const _altitudeEmaAlpha = 0.15;
  static const _gradeWindowMeters = 100.0;
  static const _maxAbsGrade = 0.10;

  /// État exposé à l'overlay.
  final ValueNotifier<EcoCoachState> state =
      ValueNotifier(const EcoCoachState());

  // -- Route & conseils --------------------------------------------------------
  List<GeoPoint> _polyline = const [];
  List<double> _cumulative = const [];
  List<EcoAdvicePoint> _advice = const [];
  int _nextAdvice = 0;
  double _along = 0;
  DateTime? _lastAdviceAt;
  DateTime? _adviceShownAt;

  // -- Échantillons vitesse (pour scoreTrip) ------------------------------------
  final List<double> _speedsKmh = [];
  DateTime? _firstSampleAt;
  DateTime? _lastSampleAt;
  double? _lastSpeedMps;

  // -- Score live ----------------------------------------------------------------
  static const _rollingWindow = 30;
  final List<double> _recentKmh = [];
  final List<DateTime> _harshDecelEvents = [];
  double _liveScore = 80;

  // -- Pente (VSP) ---------------------------------------------------------------
  double? _smoothedAltitude;
  double? _gradeAnchorAlong;
  double? _gradeAnchorAltitude;
  double _gradePct = 0;

  bool get isStarted => _polyline.length >= 2;

  /// Liste figée des conseils planifiés (debug / affichage carte).
  List<EcoAdvicePoint> get plannedAdvice => _advice;

  /// Précalcule les points de conseil pour l'itinéraire. À appeler au départ.
  void start({
    required List<GeoPoint> routePolyline,
    List<NavHint> hints = const [],
    int? cruiseLimitKmh,
  }) {
    _polyline = List.unmodifiable(routePolyline);
    _cumulative = _cumulativeDistances(_polyline);
    _advice = coach.planAdvice(
      polyline: routePolyline,
      hints: hints,
      cruiseLimitKmh: cruiseLimitKmh,
    );
    _nextAdvice = 0;
    _along = 0;
    _lastAdviceAt = null;
    _adviceShownAt = null;
    _speedsKmh.clear();
    _recentKmh.clear();
    _harshDecelEvents.clear();
    _firstSampleAt = null;
    _lastSampleAt = null;
    _lastSpeedMps = null;
    _liveScore = 80;
    _smoothedAltitude = null;
    _gradeAnchorAlong = null;
    _gradeAnchorAltitude = null;
    _gradePct = 0;
    state.value = const EcoCoachState();
  }

  /// Fix GPS (~1-2 Hz). [altitudeMeters] optionnelle (souvent bruitée :
  /// lissée puis convertie en pente sur fenêtres de 100 m).
  void onPosition(GeoPoint position, double speedMps,
      {double? altitudeMeters}) {
    final now = _now();
    final kmh = speedMps * 3.6;

    // Décélération brusque vue du GPS (km/h par seconde, comme scoreTrip).
    final lastAt = _lastSampleAt;
    final lastSpeed = _lastSpeedMps;
    if (lastAt != null && lastSpeed != null) {
      final dt = now.difference(lastAt).inMilliseconds / 1000.0;
      if (dt > 0) {
        final deltaKmhPerS = (speedMps - lastSpeed) * 3.6 / dt;
        if (deltaKmhPerS <= -coach.harshBrakeKmhPerS) {
          _harshDecelEvents.add(now);
        }
      }
    }
    _firstSampleAt ??= now;
    _lastSampleAt = now;
    _lastSpeedMps = speedMps;
    _speedsKmh.add(kmh);
    _recentKmh.add(kmh);
    if (_recentKmh.length > _rollingWindow) _recentKmh.removeAt(0);
    _harshDecelEvents
        .removeWhere((t) => now.difference(t) > _decelWindow);

    if (isStarted) {
      _along = math.max(_along, _projectAlong(position));
    }
    _updateGrade(altitudeMeters, speedMps);
    _updateLiveScore(speedMps);

    // Effacement automatique du conseil affiché.
    var next = state.value;
    final shownAt = _adviceShownAt;
    if (next.activeAdvice != null &&
        shownAt != null &&
        now.difference(shownAt) >= adviceDisplay) {
      next = next.copyWith(clearAdvice: true);
      _adviceShownAt = null;
    }

    next = _maybeEmitAdvice(next, now);
    state.value = next.copyWith(
      samplesCount: _speedsKmh.length,
      liveScoreEstimate: _liveScore.round().clamp(0, 100),
    );
  }

  /// Échantillon capteurs optionnel (DrivingSensors) : alimente la fenêtre
  /// « anticipe » entre deux fixes GPS. Tout fonctionne sans.
  void onDrivingSample(DrivingSample sample) {
    if (!sample.valid) return;
    if (sample.harshBrake) {
      final now = _now();
      _harshDecelEvents.add(now);
      _harshDecelEvents
          .removeWhere((t) => now.difference(t) > _decelWindow);
    }
  }

  /// Note le trajet terminé avec le véhicule de l'utilisateur (repli
  /// générique sinon). L'appelant enregistre dans le ledger
  /// (`ecoLedgerProvider.recordTrip`) et route vers ArrivalSummaryScreen.
  EcoTripScore finish({
    required double distanceKm,
    required double durationSeconds,
  }) {
    final selection = _vehicleResolver?.call() ?? vehicle;
    final first = _firstSampleAt;
    final last = _lastSampleAt;
    final elapsed = (first != null && last != null)
        ? last.difference(first).inMilliseconds / 1000.0
        : 0.0;
    final sampleHz = (_speedsKmh.length > 1 && elapsed > 0)
        ? (_speedsKmh.length - 1) / elapsed
        : 1.0;
    return coach.scoreTrip(
      distanceKm: distanceKm,
      durationSeconds: durationSeconds,
      speedsKmh: List.unmodifiable(_speedsKmh),
      vehicleConsL100: selection?.consL100 ?? fallbackConsL100,
      fuel: selection?.vehicle.fuel ?? fallbackFuel,
      fuelPriceEurPerL: selection?.fuelPriceEurPerUnit ?? fallbackPriceEur,
      sampleHz: sampleHz,
    );
  }

  void dispose() => state.dispose();

  // -- Conseils ------------------------------------------------------------------

  EcoCoachState _maybeEmitAdvice(EcoCoachState current, DateTime now) {
    final lastAt = _lastAdviceAt;
    final gapOk =
        lastAt == null || now.difference(lastAt) >= minAdviceGap;

    // Conseils planifiés : on saute ceux dont la fenêtre est passée
    // (supplantés), on émet le premier dans la fenêtre si l'écart le permet.
    while (_nextAdvice < _advice.length) {
      final point = _advice[_nextAdvice];
      final ahead = point.distanceAlongMeters - _along;
      if (ahead < 0) {
        _nextAdvice++; // fenêtre dépassée : conseil abandonné
        continue;
      }
      if (ahead > triggerWindowMeters) break; // encore trop loin
      if (!gapOk || current.activeAdvice != null) break; // garde-fous
      _nextAdvice++;
      _lastAdviceAt = now;
      _adviceShownAt = now;
      return current.copyWith(
        activeAdvice: point.message,
        activeKind: point.kind,
      );
    }

    // Feedback doux générique : décélérations brusques répétées sur 8 s.
    if (gapOk &&
        current.activeAdvice == null &&
        _harshDecelEvents.length >= _decelEventsForAdvice) {
      _harshDecelEvents.clear();
      _lastAdviceAt = now;
      _adviceShownAt = now;
      return current.copyWith(
        activeAdvice: _anticipateMessage,
        activeKind: EcoAdviceKind.anticipate,
      );
    }
    return current;
  }

  // -- Score live ------------------------------------------------------------------

  void _updateLiveScore(double speedMps) {
    if (_recentKmh.length < 5) return;
    final n = _recentKmh.length;
    final mean = _recentKmh.reduce((a, b) => a + b) / n;
    final variance = _recentKmh
            .map((s) => (s - mean) * (s - mean))
            .reduce((a, b) => a + b) /
        n;
    final steady = (100 - math.sqrt(variance) * 3).clamp(0.0, 100.0);

    // Sobriété : part du temps sous la croisière recommandée (+2 km/h GPS).
    final sorted = [..._recentKmh]..sort();
    final p90 = sorted[((n - 1) * 0.9).round()];
    final limit = _inferLimitKmh(p90);
    final cruise = EcoCoach.recommendedCruiseKmh(limit) ?? limit;
    final sober =
        _recentKmh.where((s) => s <= cruise + 2).length / n * 100.0;

    // Correction de pente via le terme VSP `9,81·grade·v` (W/kg) — bonus en
    // montée, malus en descente gourmande, borné ±3 points (recherche §2 :
    // VSP ≈ v·(1,1·a + 9,81·grade + 0,132) + 3,02e-4·v³, Jiménez-Palacios).
    final vspGradeTerm = 9.81 * _gradePct * speedMps;
    final gradeAdjust = (vspGradeTerm / 2.0).clamp(-3.0, 3.0);

    final raw =
        (steady * 0.5 + sober * 0.5 + gradeAdjust).clamp(0.0, 100.0);
    _liveScore += 0.2 * (raw - _liveScore); // EMA
  }

  void _updateGrade(double? altitudeMeters, double speedMps) {
    if (altitudeMeters == null) return;
    final smoothed = _smoothedAltitude == null
        ? altitudeMeters
        : _smoothedAltitude! +
            _altitudeEmaAlpha * (altitudeMeters - _smoothedAltitude!);
    _smoothedAltitude = smoothed;
    final anchorAlong = _gradeAnchorAlong;
    final anchorAlt = _gradeAnchorAltitude;
    if (anchorAlong == null || anchorAlt == null) {
      _gradeAnchorAlong = _along;
      _gradeAnchorAltitude = smoothed;
      return;
    }
    final run = _along - anchorAlong;
    if (run >= _gradeWindowMeters) {
      _gradePct =
          ((smoothed - anchorAlt) / run).clamp(-_maxAbsGrade, _maxAbsGrade);
      _gradeAnchorAlong = _along;
      _gradeAnchorAltitude = smoothed;
    }
  }

  /// Limite plausible d'après le 90e centile des vitesses récentes
  /// (même heuristique que EcoCoach.scoreTrip).
  int _inferLimitKmh(double refKmh) {
    if (refKmh <= 60) return 50;
    if (refKmh <= 90) return 90;
    if (refKmh <= 112) return 110;
    return 130;
  }

  // -- Géométrie (copie privée équirectangulaire, cf. NavigationEngine) -----------

  static const double _metersPerDegLat = 110574.0;

  static double _metersPerDegLng(double latitude) =>
      111320.0 * math.cos(latitude * math.pi / 180);

  double _projectAlong(GeoPoint p) {
    if (_polyline.length < 2) return 0;
    var bestOffset = double.infinity;
    var bestAlong = 0.0;
    for (var i = 0; i < _polyline.length - 1; i++) {
      final a = _polyline[i], b = _polyline[i + 1];
      final mLng = _metersPerDegLng((a.latitude + b.latitude) / 2);
      final px = p.longitude * mLng, py = p.latitude * _metersPerDegLat;
      final ax = a.longitude * mLng, ay = a.latitude * _metersPerDegLat;
      final bx = b.longitude * mLng, by = b.latitude * _metersPerDegLat;
      final dx = bx - ax, dy = by - ay;
      final len2 = dx * dx + dy * dy;
      var t = len2 == 0 ? 0.0 : ((px - ax) * dx + (py - ay) * dy) / len2;
      t = t.clamp(0.0, 1.0);
      final cx = ax + t * dx, cy = ay + t * dy;
      final ddx = px - cx, ddy = py - cy;
      final offset = math.sqrt(ddx * ddx + ddy * ddy);
      if (offset < bestOffset) {
        bestOffset = offset;
        bestAlong =
            _cumulative[i] + (_cumulative[i + 1] - _cumulative[i]) * t;
      }
    }
    return bestAlong;
  }

  static List<double> _cumulativeDistances(List<GeoPoint> polyline) {
    if (polyline.isEmpty) return const [];
    final cumulative = List<double>.filled(polyline.length, 0);
    for (var i = 1; i < polyline.length; i++) {
      cumulative[i] =
          cumulative[i - 1] + polyline[i - 1].distanceTo(polyline[i]);
    }
    return cumulative;
  }
}

/// Contrôleur du coach live, câblé sur la sélection véhicule. autoDispose :
/// vit le temps de l'écran de navigation qui le consomme.
final ecoCoachControllerProvider =
    Provider.autoDispose<EcoCoachController>((ref) {
  final controller = EcoCoachController(
    vehicleResolver: () => ref.read(vehicleSelectionProvider).valueOrNull,
  );
  ref.onDispose(controller.dispose);
  return controller;
});
