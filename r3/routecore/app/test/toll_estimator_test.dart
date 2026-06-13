import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/features/routing/domain/toll_estimator.dart';

void main() {
  final estimator = TollEstimator.fallback();

  group('TollEstimator.parseRefs (perfect identification)', () {
    test('normalizes a spaced ref: "A 7" -> A7', () {
      expect(TollEstimator.parseRefs('A 7'), ['A7']);
    });

    test('plain ref: "A7" -> A7', () {
      expect(TollEstimator.parseRefs('A7'), ['A7']);
    });

    test('multi-ref with European route: "A7;E15" keeps only the A-number', () {
      expect(TollEstimator.parseRefs('A7;E15'), ['A7']);
    });

    test('several autoroutes: "A6;A7" -> [A6, A7]', () {
      expect(TollEstimator.parseRefs('A6;A7'), ['A6', 'A7']);
    });

    test('bis/ter spur with space: "A 6a" -> A6A', () {
      expect(TollEstimator.parseRefs('A 6a'), ['A6A']);
    });

    test('ignores non-A refs entirely', () {
      expect(TollEstimator.parseRefs('D86'), isEmpty);
      expect(TollEstimator.parseRefs('N7'), isEmpty);
      expect(TollEstimator.parseRefs('E15'), isEmpty);
      expect(TollEstimator.parseRefs(null), isEmpty);
      expect(TollEstimator.parseRefs(''), isEmpty);
    });
  });

  group('TollEstimator.estimate (rate lookup)', () {
    test('free autoroute -> 0 EUR', () {
      expect(estimator.estimate({'A75': 120.0}), 0.0);
      expect(estimator.estimate({'A84': 80.0}), 0.0);
    });

    test('unknown autoroute -> defaultEurPerKm (0.092)', () {
      // A999 is not in the table -> default rate applies.
      expect(estimator.estimate({'A999': 100.0}), closeTo(9.2, 0.001));
    });

    test('known autoroute uses its own rate (A7 = 0.116)', () {
      expect(estimator.estimate({'A7': 100.0}), closeTo(11.6, 0.001));
    });

    test('multi-autoroute route sums per-autoroute correctly', () {
      // A6 460 km (0.083) + A7 0 km is trivial; mix A6 + A7 + free A75.
      final total = estimator.estimate({
        'A6': 100.0, // 8.30
        'A7': 50.0, // 5.80
        'A75': 40.0, // 0.00 (free)
      });
      expect(total, closeTo(8.30 + 5.80, 0.01));
    });

    test('breakdown exposes per-autoroute EUR and drops zeros', () {
      final bd = estimator.breakdown({
        'A6': 100.0,
        'A75': 50.0, // free -> dropped
      });
      expect(bd['A6'], closeTo(8.30, 0.01));
      expect(bd.containsKey('A75'), isFalse,
          reason: 'free autoroute rounds to 0 and is dropped');
    });
  });

  group('TollEstimator.kmByAutorouteFromRoute', () {
    test('attributes step distance to its A-ref, ignores non-A steps', () {
      final route = {
        'legs': [
          {
            'steps': [
              {'distance': 71200.0, 'ref': 'A 7'},
              {'distance': 30000.0, 'name': 'Avenue Berthelot'},
              {'distance': 5000.0, 'ref': 'D86'},
            ],
          },
        ],
      };
      final km = estimator.kmByAutorouteFromRoute(route);
      expect(km.keys, ['A7']);
      expect(km['A7'], closeTo(71.2, 1e-9));
    });

    test('splits a step that lists several autoroutes evenly', () {
      final route = {
        'legs': [
          {
            'steps': [
              {'distance': 20000.0, 'ref': 'A6;A7'},
            ],
          },
        ],
      };
      final km = estimator.kmByAutorouteFromRoute(route);
      expect(km['A6'], closeTo(10.0, 1e-9));
      expect(km['A7'], closeTo(10.0, 1e-9));
    });

    test('route without steps -> empty', () {
      expect(estimator.kmByAutorouteFromRoute({'legs': <Object>[]}), isEmpty);
      expect(estimator.kmByAutorouteFromRoute(<String, dynamic>{}), isEmpty);
    });
  });

  group('fromJson + fallback parity', () {
    test('fromJson loads autoroutes and default rate', () {
      final e = TollEstimator.fromJson({
        'defaultEurPerKm': 0.10,
        'autoroutes': {
          'A 7': {'concession': 'ASF', 'eurPerKm': 0.116, 'tolled': true},
          'A75': {'concession': 'Etat', 'eurPerKm': 0.0, 'tolled': false},
        },
      });
      // 'A 7' key is normalized to A7 on load.
      expect(e.estimate({'A7': 100.0}), closeTo(11.6, 0.001));
      expect(e.estimate({'A75': 100.0}), 0.0);
      expect(e.estimate({'AXX': 100.0}), closeTo(10.0, 0.001));
    });
  });

  group('known-price sanity checks (+/- 25% of real class-1 price)', () {
    // Real published class-1 prices (2025-2026). The model must land
    // within +/-25%. See docs/TOLL_DATA.md for the full table.
    void within25(String label, double computed, double real) {
      final pct = (computed - real).abs() / real;
      expect(pct, lessThanOrEqualTo(0.25),
          reason: '$label: computed EUR$computed vs real EUR$real '
              '(${(pct * 100).toStringAsFixed(1)}% off)');
    }

    test('Paris->Lyon A6 ~460 km ~= EUR38', () {
      within25('Paris-Lyon', estimator.estimate({'A6': 460.0}), 38.0);
    });

    test('Bordeaux->Toulouse A62 ~245 km ~= EUR18', () {
      within25('Bordeaux-Toulouse', estimator.estimate({'A62': 245.0}), 18.0);
    });

    test('Orange->Narbonne A9 ~180 km ~= EUR19', () {
      within25('Orange-Narbonne', estimator.estimate({'A9': 180.0}), 19.0);
    });

    test('Paris->Lille A1 ~210 km ~= EUR18', () {
      within25('Paris-Lille', estimator.estimate({'A1': 210.0}), 18.0);
    });
  });

  group('estimateFromRoute — résilience aux refs OSRM lacunaires', () {
    final estimator = TollEstimator.fallback();

    // Reproduit le cas réel Lyon→Marseille : OSRM démo renvoie ~99 km en
    // 'A 7' et ~196 km de la MÊME autoroute mal taguée 'M 7', plus un tronçon
    // urbain lent sans ref. Le tarif route-niveau doit récupérer le M7.
    Map<String, dynamic> step(double km, double kmh, {String? ref}) => {
          'distance': km * 1000,
          'duration': kmh <= 0 ? 0 : km / kmh * 3600,
          if (ref != null) 'ref': ref,
        };

    final lyonMarseille = {
      'legs': [
        {
          'steps': [
            step(99, 115, ref: 'A 7'),
            step(196, 110, ref: 'M 7'), // A7 mal taguée par OSRM
            step(14, 95, ref: 'A 551'),
            step(5, 35), // tronçon urbain lent, sans ref -> gratuit
          ],
        },
      ],
    };

    test('récupère l\'autoroute mal taguée (M7) -> proche du réel ~30 EUR', () {
      final toll = estimator.estimateFromRoute(lyonMarseille);
      expect(toll, greaterThan(25), reason: 'pas le ~13 EUR sous-estimé');
      expect(toll, lessThan(36));
    });

    test('le tronçon urbain lent (sans ref) reste gratuit', () {
      // A7 99×0.116 + M7 196×0.092 + A551 14×0.092 (inconnu->défaut) ; les 5 km
      // urbains à 35 km/h ne sont PAS facturés.
      final breakdown = estimator.breakdownFromRoute(lyonMarseille);
      expect(breakdown['A7'], closeTo(11.48, 0.2));
      expect(breakdown['Autres sections'], greaterThan(0),
          reason: 'M7 récupérée au tarif national');
    });

    test('une nationale rapide sans ref est tout de même comptée', () {
      final fast = {
        'legs': [
          {'steps': [step(50, 100)]} // 100 km/h, pas de ref -> autoroute probable
        ]
      };
      expect(estimator.estimateFromRoute(fast), greaterThan(0));
    });

    test('un trajet 100% urbain lent ne coûte aucun péage', () {
      final city = {
        'legs': [
          {'steps': [step(8, 30), step(4, 25)]}
        ]
      };
      expect(estimator.estimateFromRoute(city), 0);
    });
  });
}
