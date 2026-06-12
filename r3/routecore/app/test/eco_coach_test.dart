import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/product_modules/ecodrive/domain/eco_coach.dart';
import 'package:routecore/product_modules/ecodrive/domain/eco_savings.dart';
import 'package:routecore/shared/models/models.dart';

const _base = GeoPoint(latitude: 45.0, longitude: 5.0);

/// Point décalé de [eastM]/[northM] mètres par rapport à [_base].
GeoPoint _offset(double eastM, double northM) => GeoPoint(
      latitude: _base.latitude + northM / 111320.0,
      longitude: _base.longitude +
          eastM / (111320.0 * math.cos(_base.latitude * math.pi / 180)),
    );

/// Polyligne en L : 1000 m vers l'est puis 500 m vers le nord
/// (virage à 90° au sommet d'indice 10, à ~1000 m du départ).
List<GeoPoint> _lShape() => [
      for (var m = 0; m <= 1000; m += 100) _offset(m.toDouble(), 0),
      for (var m = 100; m <= 500; m += 100) _offset(1000, m.toDouble()),
    ];

/// Ligne droite vers l'est, un sommet tous les 100 m.
List<GeoPoint> _straight(int lengthMeters) =>
    [for (var m = 0; m <= lengthMeters; m += 100) _offset(m.toDouble(), 0)];

/// Profil en dents de scie 50↔110 km/h par pas de 10 km/h (1 Hz).
List<double> _sawtooth(int samples) {
  final speeds = <double>[];
  var v = 50.0;
  var dir = 1;
  for (var i = 0; i < samples; i++) {
    speeds.add(v);
    v += dir * 10;
    if (v >= 110) dir = -1;
    if (v <= 50) dir = 1;
  }
  return speeds;
}

void main() {
  const coach = EcoCoach();

  group('EcoCoach.planAdvice — géométrie', () {
    test('virage en L : lève-le-pied émis avant le virage', () {
      final advice =
          coach.planAdvice(polyline: _lShape(), cruiseLimitKmh: 90);
      final liftOffs =
          advice.where((a) => a.kind == EcoAdviceKind.liftOff).toList();

      expect(liftOffs, isNotEmpty);
      final lift = liftOffs.first;
      // Le virage est à ~1000 m : le conseil doit tomber strictement avant.
      expect(lift.distanceAlongMeters, lessThan(1000));
      expect(lift.distanceAlongMeters, greaterThan(0));
      expect(lift.message, contains('Lève le pied'));
      expect(lift.message, contains('laisse rouler'));
    });

    test('ligne droite : aucun lève-le-pied géométrique', () {
      final advice =
          coach.planAdvice(polyline: _straight(2000), cruiseLimitKmh: 90);
      expect(
          advice.where((a) => a.kind == EcoAdviceKind.liftOff), isEmpty);
    });
  });

  group('EcoCoach.planAdvice — repères de navigation', () {
    test('rond-point : lève-le-pied 400-600 m avant', () {
      for (final limit in [90, 110]) {
        final advice = coach.planAdvice(
          polyline: _straight(2000),
          hints: [NavHint(location: _offset(1500, 0), kind: 'roundabout')],
          cruiseLimitKmh: limit,
        );
        final lift = advice
            .firstWhere((a) => a.message.contains('Rond-point'));
        expect(lift.kind, EcoAdviceKind.liftOff);
        // Le repère est à ~1500 m le long du tracé.
        final delta = 1500 - lift.distanceAlongMeters;
        expect(delta, inInclusiveRange(395, 605),
            reason: 'limite $limit km/h');
        expect(lift.message, contains('lève le pied maintenant'));
      }
    });
  });

  group('EcoCoach — vitesse recommandée (règle −10/−20 km/h)', () {
    test('mapping 130→110, 110→100, 90→80', () {
      expect(EcoCoach.recommendedCruiseKmh(130), 110);
      expect(EcoCoach.recommendedCruiseKmh(110), 100);
      expect(EcoCoach.recommendedCruiseKmh(90), 80);
      expect(EcoCoach.recommendedCruiseKmh(50), isNull);
    });

    test('croisière sobre émise avec message chiffré', () {
      final advice = coach.planAdvice(
          polyline: _straight(500), cruiseLimitKmh: 130);
      final cruise = advice
          .firstWhere((a) => a.kind == EcoAdviceKind.steadySpeed);
      expect(cruise.recommendedKmh, 110);
      expect(cruise.limitKmh, 130);
      expect(cruise.message, contains('110 plutôt que 130'));
    });
  });

  group('EcoCoach.scoreTrip', () {
    EcoTripScore score(List<double> speeds) => coach.scoreTrip(
          distanceKm: 13.3,
          durationSeconds: 600,
          speedsKmh: speeds,
          vehicleConsL100: 6.5,
          fuel: 'essence',
          fuelPriceEurPerL: 1.85,
        );

    test('profil stable à 80 km/h > profil agressif en dents de scie', () {
      final steady = score(List.filled(600, 80.0));
      final aggressive = score(_sawtooth(600));

      expect(steady.score, greaterThan(aggressive.score));
      expect(steady.score, greaterThanOrEqualTo(85));
      expect(steady.breakdown.keys,
          containsAll(['regularite', 'anticipation', 'sobriete']));
      expect(steady.advice, hasLength(2));
    });

    test('économies positives quand le score dépasse la référence (50)', () {
      final steady = score(List.filled(600, 80.0));
      expect(steady.score, greaterThan(50));
      expect(steady.fuelSavedL, greaterThan(0));
      expect(steady.moneySavedEur, greaterThan(0));
      expect(steady.co2SavedKg, greaterThan(0));
      expect(steady.estimatedConsL100, lessThan(6.5));
    });

    test('conduite agressive : surcoût (économies négatives)', () {
      final aggressive = score(_sawtooth(600));
      expect(aggressive.score, lessThan(50));
      expect(aggressive.fuelSavedL, lessThan(0));
      expect(aggressive.estimatedConsL100, greaterThan(6.5));
    });
  });

  group('EcoSavingsLedger', () {
    EcoTripScore trip() => coach.scoreTrip(
          distanceKm: 13.3,
          durationSeconds: 600,
          speedsKmh: List.filled(600, 80.0),
          vehicleConsL100: 6.5,
          fuel: 'essence',
          fuelPriceEurPerL: 1.85,
        );

    test('agrégation mensuelle et annuelle', () {
      var ledger = const EcoSavingsLedger();
      ledger = ledger.addTrip(trip(), 13.3, DateTime(2026, 6, 5));
      ledger = ledger.addTrip(trip(), 13.3, DateTime(2026, 6, 10));
      ledger = ledger.addTrip(trip(), 13.3, DateTime(2025, 3, 1));

      final june = ledger.monthStats(DateTime(2026, 6, 15));
      expect(june.trips, 2);
      expect(june.km, closeTo(26.6, 0.001));
      expect(june.avgScore, trip().score);
      expect(june.fuelSavedL, greaterThan(0));

      expect(ledger.yearStats(2026).trips, 2);
      expect(ledger.yearStats(2025).trips, 1);
      expect(ledger.allTime.trips, 3);
      expect(ledger.allTime.km, closeTo(39.9, 0.001));
    });

    test('sérialisation json aller-retour', () {
      var ledger = const EcoSavingsLedger();
      ledger = ledger.addTrip(trip(), 13.3, DateTime(2026, 6, 5));
      ledger = ledger.addTrip(trip(), 13.3, DateTime(2025, 3, 1));

      final decoded = EcoSavingsLedger.fromJson(
          jsonDecode(jsonEncode(ledger.toJson())) as Map<String, dynamic>);

      final before = ledger.monthStats(DateTime(2026, 6, 1));
      final after = decoded.monthStats(DateTime(2026, 6, 1));
      expect(after.trips, before.trips);
      expect(after.km, closeTo(before.km, 0.0001));
      expect(after.fuelSavedL, closeTo(before.fuelSavedL, 0.0001));
      expect(after.moneySavedEur, closeTo(before.moneySavedEur, 0.0001));
      expect(after.co2SavedKg, closeTo(before.co2SavedKg, 0.0001));
      expect(after.avgScore, before.avgScore);
      expect(decoded.yearStats(2025).trips, 1);
      expect(decoded.allTime.trips, ledger.allTime.trips);
    });
  });
}
