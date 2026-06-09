import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../features/analytics/domain/analytics_repository.dart';
import '../../../features/routing/presentation/route_planner_controller.dart';
import '../../../features/scoring/domain/scoring_service.dart';
import '../../../features/tracking/presentation/tracking_controller.dart';
import '../../../shared/models/models.dart';
import '../application/ecodrive_providers.dart';
import '../domain/eco_driving_analyzer.dart';
import '../domain/eco_vehicle_type.dart';
import '../domain/fuel_co2_estimator.dart';

/// Compares fast / short / eco options side by side, with per-vehicle fuel + CO2.
///
/// The fuel/CO2 numbers shown here are re-estimated by [FuelCo2Estimator] for
/// the [selectedEcoVehicleProvider] vehicle, so they react to the vehicle the
/// driver picks. APPROX — see `docs/ECODRIVE.md`.
class EcoCompareScreen extends ConsumerWidget {
  const EcoCompareScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final planner = ref.watch(routePlannerProvider);
    final vehicle = ref.watch(selectedEcoVehicleProvider);
    const estimator = FuelCo2Estimator();

    return Scaffold(
      appBar: AppBar(title: const Text('Comparer les trajets')),
      body: Column(
        children: [
          const _VehicleSelector(),
          const Divider(height: 1),
          Expanded(
            child: !planner.isReady
                ? const Center(
                    child: Text(
                        'Choisissez départ et destination sur l\'accueil.'))
                : planner.options.when(
                    loading: () =>
                        const Center(child: CircularProgressIndicator()),
                    error: (e, _) => Center(child: Text('Erreur : $e')),
                    data: (rawOptions) {
                      if (rawOptions.isEmpty) {
                        return Center(
                          child: FilledButton(
                            onPressed: () {
                              ref.read(analyticsRepositoryProvider).logEvent(
                                    AnalyticsEvents.ecodriveRouteSearchStarted,
                                    productContext: ProductContext.ecodrive,
                                    properties: {'vehicle': vehicle.name},
                                  );
                              ref
                                  .read(routePlannerProvider.notifier)
                                  .computeOptions();
                            },
                            child: const Text('Calculer les options'),
                          ),
                        );
                      }
                      // Re-estimate fuel/CO2 for the selected vehicle.
                      final options = rawOptions
                          .map((o) => estimator.annotate(o, vehicle))
                          .toList();
                      final eco = options
                          .where((o) => o.routeMode == RouteMode.eco)
                          .toList();
                      final fastest = options
                          .where((o) => o.routeMode == RouteMode.fastest)
                          .toList();
                      final ecoCo2 =
                          eco.isEmpty ? null : eco.first.estimatedCo2Kg;
                      final savings = (eco.isNotEmpty && fastest.isNotEmpty)
                          ? estimator.savingsVs(
                              candidate: eco.first,
                              reference: fastest.first,
                              vehicle: vehicle,
                            )
                          : null;

                      return ListView(
                        padding: const EdgeInsets.all(16),
                        children: [
                          if (savings != null &&
                              (savings.fuelLiters > 0.01 ||
                                  savings.co2Kg > 0.01))
                            _SavingsBanner(
                              fuelSaved: savings.fuelLiters,
                              co2Saved: savings.co2Kg,
                            ),
                          for (final o in options)
                            _RouteOptionCard(
                              option: o,
                              selected: planner.selectedOption?.id == o.id,
                              ecoCo2Reference: ecoCo2,
                              onTap: () {
                                ref
                                    .read(routePlannerProvider.notifier)
                                    .selectOption(o);
                                ref.read(analyticsRepositoryProvider).logEvent(
                                      AnalyticsEvents.ecodriveRouteOptionSelected,
                                      productContext: ProductContext.ecodrive,
                                      properties: {
                                        'mode': o.routeMode.name,
                                        'vehicle': vehicle.name,
                                      },
                                    );
                              },
                            ),
                          const SizedBox(height: 12),
                          FilledButton.icon(
                            icon: const Icon(Icons.play_arrow),
                            label: const Text('Lancer le trajet'),
                            onPressed: planner.selectedOption == null
                                ? null
                                : () => _launchTrip(context, ref, planner),
                          ),
                          OutlinedButton.icon(
                            icon: const Icon(Icons.dashboard),
                            label: const Text('Mon dashboard conducteur'),
                            onPressed: () =>
                                context.push('/ecodrive/dashboard'),
                          ),
                        ],
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Future<void> _launchTrip(
    BuildContext context,
    WidgetRef ref,
    RoutePlannerState planner,
  ) async {
    // Ensure the shared trip summary uses the eco scoring strategy.
    ref.read(productModeProvider.notifier).state = ProductContext.ecodrive;
    final user = ref.read(authControllerProvider).valueOrNull;
    if (user == null) return;
    final trip = await ref.read(tripRepositoryProvider).createTrip(
          userId: user.id,
          origin: planner.origin!,
          destination: planner.destination!,
          originLabel: planner.originLabel,
          destinationLabel: planner.destinationLabel,
          productContext: ProductContext.ecodrive,
        );
    // ecodrive_trip_started / _trip_completed are emitted by TrackingController
    // at the real lifecycle moments (start/stop), guarded by product mode.
    if (context.mounted) context.push('/tracking/${trip.id}');
  }
}

/// Vehicle chooser used by the EcoDrive comparison + scoring.
class _VehicleSelector extends ConsumerWidget {
  const _VehicleSelector();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(selectedEcoVehicleProvider);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(left: 4, bottom: 4),
            child: Text('Véhicule', style: TextStyle(fontSize: 12)),
          ),
          Wrap(
            spacing: 8,
            children: [
              for (final v in EcoVehicleType.values)
                ChoiceChip(
                  label: Text(v.label),
                  selected: selected == v,
                  onSelected: (_) => ref
                      .read(selectedEcoVehicleProvider.notifier)
                      .state = v,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A single route option card with mode badge, time/distance and fuel/CO2.
class _RouteOptionCard extends StatelessWidget {
  const _RouteOptionCard({
    required this.option,
    required this.selected,
    required this.ecoCo2Reference,
    required this.onTap,
  });

  final RouteOption option;
  final bool selected;
  final double? ecoCo2Reference;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final co2 = option.estimatedCo2Kg;
    final showDelta = ecoCo2Reference != null &&
        option.routeMode != RouteMode.eco &&
        co2 != null;
    // `co2`/`ecoCo2Reference` are guaranteed non-null when `showDelta` is true.
    final delta = showDelta ? (co2! - ecoCo2Reference!) : null;
    return Card(
      color: option.routeMode == RouteMode.eco ? Colors.green.shade50 : null,
      child: ListTile(
        leading: Icon(switch (option.routeMode) {
          RouteMode.fastest => Icons.speed,
          RouteMode.shortest => Icons.straighten,
          RouteMode.eco => Icons.eco,
          RouteMode.discovery => Icons.local_florist,
        }),
        title: Text(switch (option.routeMode) {
          RouteMode.fastest => 'Rapide',
          RouteMode.shortest => 'Court',
          RouteMode.eco => 'Éco',
          RouteMode.discovery => 'Découverte',
        }),
        subtitle: Text(
          '${(option.distanceMeters / 1000).toStringAsFixed(1)} km · '
          '${(option.durationSeconds / 60).round()} min\n'
          '${option.estimatedFuelLiters ?? '?'} L · '
          '${option.estimatedCo2Kg ?? '?'} kg CO₂'
          '${delta != null ? ' (+${delta.toStringAsFixed(2)} kg vs éco)' : ''}',
        ),
        isThreeLine: true,
        onTap: onTap,
        trailing: selected
            ? const Icon(Icons.check_circle, color: Colors.green)
            : null,
      ),
    );
  }
}

/// Highlights the fuel/CO2 saved by the eco route versus the fastest route.
class _SavingsBanner extends StatelessWidget {
  const _SavingsBanner({required this.fuelSaved, required this.co2Saved});

  final double fuelSaved;
  final double co2Saved;

  @override
  Widget build(BuildContext context) {
    final parts = <String>[
      if (fuelSaved > 0.01) '−${fuelSaved.toStringAsFixed(1)} L',
      if (co2Saved > 0.01) '−${co2Saved.toStringAsFixed(1)} kg CO₂',
    ];
    return Card(
      color: Colors.green.shade100,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const Icon(Icons.eco, color: Colors.green),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'Itinéraire éco : ${parts.join(' · ')} vs le plus rapide (est.)',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Driver dashboard: the eco-score of the latest tracked trip + a breakdown of
/// the five sub-scores and the fuel/CO2 estimate (incl. estimated savings).
///
/// The enterprise/fleet version aggregates eco-scores by organization — data
/// model prepared in the DB; UI out of scope for the MVP (see `docs/ECODRIVE.md`).
class EcoDashboardScreen extends ConsumerStatefulWidget {
  const EcoDashboardScreen({super.key});

  @override
  ConsumerState<EcoDashboardScreen> createState() => _EcoDashboardScreenState();
}

class _EcoDashboardScreenState extends ConsumerState<EcoDashboardScreen> {
  bool _logged = false;

  @override
  Widget build(BuildContext context) {
    final tracking = ref.watch(trackingControllerProvider);
    final vehicle = ref.watch(selectedEcoVehicleProvider);
    final TripScoreResult? score = tracking.points.length >= 2
        ? BasicEcoDrivingScoringService(vehicle: vehicle).scoreTrip(
            trip: Trip(
              id: tracking.tripId ?? 'last',
              userId: 'current',
              origin: const GeoPoint(latitude: 0, longitude: 0),
              destination: const GeoPoint(latitude: 0, longitude: 0),
            ),
            trackPoints: tracking.points,
          )
        : null;

    // Fire the view events ONCE per screen entry (not on every rebuild), via a
    // post-frame callback so no async work happens during build.
    if (score != null && !_logged) {
      _logged = true;
      final analytics = ref.read(analyticsRepositoryProvider);
      final overall = score.scoreOverall;
      final advice = score.adviceText;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        analytics.logEvent(
          AnalyticsEvents.ecodriveScoreViewed,
          productContext: ProductContext.ecodrive,
          properties: {'score': overall},
        );
        if (advice != null) {
          analytics.logEvent(
            AnalyticsEvents.ecodriveAdviceViewed,
            productContext: ProductContext.ecodrive,
            properties: {'advice': advice},
          );
        }
      });
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Dashboard conducteur')),
      body: score == null
          ? const Center(
              child: Text('Aucun trajet suivi pour le moment.\n'
                  'Lancez un trajet pour obtenir votre éco-score.'))
          : _DashboardBody(score: score),
    );
  }
}

class _DashboardBody extends StatelessWidget {
  const _DashboardBody({required this.score});

  final TripScoreResult score;

  @override
  Widget build(BuildContext context) {
    final m = score.metrics;
    final compliance = m['scoreSpeedCompliance'];
    final isEv = m['kwhEstimate'] != null;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          color: score.scoreOverall >= 75
              ? Colors.green.shade50
              : score.scoreOverall >= 50
                  ? Colors.orange.shade50
                  : Colors.red.shade50,
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                Text('${score.scoreOverall}',
                    style: Theme.of(context).textTheme.displayLarge),
                const Text('Éco-score / 100'),
                if (score.adviceText != null) ...[
                  const SizedBox(height: 8),
                  Text(score.adviceText!, textAlign: TextAlign.center),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text('Détail du score',
            style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        _ScoreBar('Accélération', m['scoreAcceleration']),
        _ScoreBar('Freinage', m['scoreBraking']),
        _ScoreBar('Stabilité de vitesse', m['scoreSpeedStability']),
        _ScoreBar('Efficacité de l\'itinéraire', m['scoreRouteEfficiency']),
        if (compliance is int) _ScoreBar('Respect des limites', compliance),
        const SizedBox(height: 16),
        Text('Mesures', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        _metricTile(Icons.flash_on, 'Accélérations brusques',
            '${m['harshAccelerationCount']}'),
        _metricTile(Icons.report, 'Freinages brusques',
            '${m['harshBrakingCount']}'),
        _metricTile(
            Icons.speed,
            'Vitesse moyenne',
            '${((m['averageSpeed'] as double? ?? 0) * 3.6).toStringAsFixed(0)} km/h'),
        if (isEv)
          _metricTile(Icons.bolt, 'Énergie estimée', '${m['kwhEstimate']} kWh')
        else
          _metricTile(Icons.local_gas_station, 'Carburant estimé',
              '${m['fuelEstimate']} L'),
        _metricTile(Icons.cloud, 'CO₂ estimé', '${m['co2Estimate']} kg'),
        if (isEv)
          _metricTile(Icons.savings, 'Énergie économisée (est.)',
              '${m['estimatedKwhSavedKwh']} kWh')
        else
          _metricTile(Icons.savings, 'Carburant économisé (est.)',
              '${m['estimatedFuelSavedLiters']} L'),
        _metricTile(Icons.eco, 'CO₂ évité (est.)',
            '${m['estimatedCo2SavedKg']} kg'),
        const SizedBox(height: 16),
        const Card(
          child: ListTile(
            leading: Icon(Icons.business),
            title: Text('Dashboard entreprise'),
            subtitle: Text('À venir : agrégation des éco-scores par flotte '
                '(modèle de données préparé). Voir docs/ECODRIVE.md.'),
          ),
        ),
      ],
    );
  }

  Widget _metricTile(IconData icon, String label, String value) => ListTile(
        leading: Icon(icon),
        title: Text(label),
        trailing: Text(value, style: const TextStyle(fontSize: 16)),
      );
}

/// A labelled 0..100 progress bar for one eco sub-score.
class _ScoreBar extends StatelessWidget {
  const _ScoreBar(this.label, this.value);

  final String label;
  final Object? value; // expected int 0..100

  @override
  Widget build(BuildContext context) {
    final v = value is int ? value as int : 0;
    final color = v >= 75
        ? Colors.green
        : v >= 50
            ? Colors.orange
            : Colors.red;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [Text(label), Text('$v/100')],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: (v / 100).clamp(0.0, 1.0),
              minHeight: 8,
              color: color,
              backgroundColor: color.withOpacity(0.15),
            ),
          ),
        ],
      ),
    );
  }
}
