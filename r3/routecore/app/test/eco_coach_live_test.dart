import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/features/vehicle/domain/vehicle.dart';
import 'package:routecore/product_modules/ecodrive/domain/eco_coach.dart';
import 'package:routecore/product_modules/ecodrive/presentation/eco_coach_controller.dart';
import 'package:routecore/shared/models/models.dart';

/// Ligne droite plein nord sur le méridien 4.8°E : `meters` mètres après
/// 45.0°N (1° de latitude ≈ 110 574 m).
GeoPoint _north(double meters) =>
    GeoPoint(latitude: 45.0 + meters / 110574.0, longitude: 4.8);

void main() {
  // Polyline droite de 10 km — aucun virage, donc aucun conseil géométrique:
  // seuls les NavHint injectés produisent des conseils planifiés.
  final line = [for (var m = 0.0; m <= 10000; m += 500) _north(m)];

  group('EcoCoachController', () {
    test('déclenche le conseil rond-point une seule fois, dans sa fenêtre',
        () {
      var clock = DateTime(2026, 6, 12, 9, 0, 0);
      final controller = EcoCoachController(now: () => clock);
      controller.start(
        routePolyline: line,
        hints: [NavHint(location: _north(5000), kind: 'roundabout')],
      );

      var emissions = 0;
      String? lastSeen;
      void step(double meters, {int advanceSeconds = 5}) {
        clock = clock.add(Duration(seconds: advanceSeconds));
        controller.onPosition(_north(meters), 22.2); // ~80 km/h
        final advice = controller.state.value.activeAdvice;
        if (advice != null && advice != lastSeen) emissions++;
        lastSeen = advice;
      }

      // Loin du point de conseil : rien.
      step(1000);
      step(2000);
      expect(controller.state.value.activeAdvice, isNull);

      // Le conseil est planifié entre 4400 et 4600 m (lève-le-pied avant le
      // rond-point à 5000 m). On balaye la zone : une seule émission.
      for (var m = 4300.0; m <= 5200; m += 60) {
        step(m, advanceSeconds: 2);
      }
      expect(emissions, 1,
          reason: 'un seul conseil émis en traversant la fenêtre');
      expect(lastSeen ?? '', isNot(contains('Anticipe')),
          reason: 'pas de faux conseil anticipation à vitesse stable');
    });

    test('écart minimal de 12 s entre deux conseils', () {
      var clock = DateTime(2026, 6, 12, 9, 0, 0);
      final controller = EcoCoachController(now: () => clock);
      controller.start(
        routePolyline: line,
        hints: [
          NavHint(location: _north(3000), kind: 'roundabout'),
          // Deuxième conseil planifié presque au même endroit : sa fenêtre
          // sera atteinte quelques secondes après le premier.
          NavHint(location: _north(3300), kind: 'roundabout'),
        ],
      );

      var emissions = 0;
      String? last;
      for (var m = 2000.0; m <= 3400; m += 50) {
        clock = clock.add(const Duration(seconds: 1));
        controller.onPosition(_north(m), 22.2);
        final advice = controller.state.value.activeAdvice;
        if (advice != null && advice != last) emissions++;
        last = advice;
      }
      expect(emissions, lessThanOrEqualTo(1),
          reason: 'le second conseil tombe sous l\'écart minimal de 12 s '
              'et la fenêtre passe : il est abandonné, pas empilé');
    });

    test('finish() note le trajet avec le véhicule injecté', () {
      var clock = DateTime(2026, 6, 12, 9, 0, 0);
      const vehicle = Vehicle(
        brand: 'RENAULT',
        model: 'CLIO',
        engine: '1.5 dCi',
        fuel: 'diesel',
        consL100: 4.4,
        unit: Vehicle.unitLiters,
      );
      final controller = EcoCoachController(
        vehicle: const VehicleSelection(vehicle: vehicle),
        now: () => clock,
      );
      controller.start(routePolyline: line);
      // Profil stable à 80 km/h pendant 2 minutes (1 Hz).
      for (var i = 0; i < 120; i++) {
        clock = clock.add(const Duration(seconds: 1));
        controller.onPosition(_north(i * 22.2), 22.2);
      }
      final score = controller.finish(
        distanceKm: 10,
        durationSeconds: 450,
      );
      expect(score.score, greaterThan(60),
          reason: 'profil régulier et sobre = bon score');
      expect(score.estimatedConsL100, lessThan(4.4),
          reason: 'mieux que le conducteur de référence => conso < véhicule');
      expect(score.fuelSavedL, greaterThan(0));
    });

    test('mode GPS-seul : aucun capteur requis', () {
      var clock = DateTime(2026, 6, 12, 9, 0, 0);
      final controller = EcoCoachController(now: () => clock);
      controller.start(routePolyline: line);
      for (var i = 0; i < 30; i++) {
        clock = clock.add(const Duration(seconds: 1));
        controller.onPosition(_north(i * 20.0), 20.0);
      }
      expect(controller.state.value.samplesCount, 30);
      expect(controller.state.value.liveScoreEstimate,
          inInclusiveRange(0, 100));
    });
  });
}
