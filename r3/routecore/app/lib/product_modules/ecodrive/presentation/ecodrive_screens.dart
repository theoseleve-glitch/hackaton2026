import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../features/routing/presentation/route_planner_controller.dart';
import '../../../features/scoring/domain/scoring_service.dart';
import '../../../features/tracking/presentation/tracking_controller.dart';
import '../../../shared/models/models.dart';
import '../domain/eco_driving_analyzer.dart';
import '../domain/ecodrive_analytics.dart';

/// Compares fast / short / eco options side by side with CO2 + fuel.
class EcoCompareScreen extends ConsumerStatefulWidget {
  const EcoCompareScreen({super.key});

  @override
  ConsumerState<EcoCompareScreen> createState() => _EcoCompareScreenState();
}

class _EcoCompareScreenState extends ConsumerState<EcoCompareScreen> {
  bool _creatingTrip = false; // double-tap guard

  @override
  Widget build(BuildContext context) {
    final planner = ref.watch(routePlannerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Comparer les trajets')),
      body: !planner.isReady
          ? const Center(
              child: Text('Choisissez départ et destination sur l\'accueil.'))
          : planner.options.when(
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Erreur : $e')),
              data: (options) {
                if (options.isEmpty) {
                  return Center(
                    child: FilledButton(
                      onPressed: () => ref
                          .read(routePlannerProvider.notifier)
                          .computeOptions(),
                      child: const Text('Calculer les options'),
                    ),
                  );
                }
                final eco = options
                    .where((o) => o.routeMode == RouteMode.eco)
                    .toList();
                final ecoCo2 =
                    eco.isEmpty ? null : eco.first.estimatedCo2Kg;
                return ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    for (final o in options)
                      Card(
                        color: o.routeMode == RouteMode.eco
                            ? Colors.green.shade50
                            : null,
                        child: ListTile(
                          leading: Icon(switch (o.routeMode) {
                            RouteMode.fastest => Icons.speed,
                            RouteMode.shortest => Icons.straighten,
                            RouteMode.eco => Icons.eco,
                            RouteMode.discovery => Icons.local_florist,
                          }),
                          title: Text(switch (o.routeMode) {
                            RouteMode.fastest => 'Rapide',
                            RouteMode.shortest => 'Court',
                            RouteMode.eco => 'Éco',
                            RouteMode.discovery => 'Découverte',
                          }),
                          subtitle: Text(
                            '${(o.distanceMeters / 1000).toStringAsFixed(1)} km · '
                            '${(o.durationSeconds / 60).round()} min\n'
                            '${o.estimatedFuelLiters ?? '?'} L · '
                            '${o.estimatedCo2Kg ?? '?'} kg CO₂'
                            '${ecoCo2 != null && o.routeMode != RouteMode.eco && o.estimatedCo2Kg != null ? ' (+${(o.estimatedCo2Kg! - ecoCo2).toStringAsFixed(2)} vs éco)' : ''}',
                          ),
                          isThreeLine: true,
                          onTap: () => ref
                              .read(routePlannerProvider.notifier)
                              .selectOption(o),
                          trailing: planner.selectedOption?.id == o.id
                              ? const Icon(Icons.check_circle,
                                  color: Colors.green)
                              : null,
                        ),
                      ),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      icon: const Icon(Icons.play_arrow),
                      label: const Text('Lancer le trajet'),
                      onPressed:
                          planner.selectedOption == null || _creatingTrip
                              ? null
                              : () async {
                                  final user = ref
                                      .read(authControllerProvider)
                                      .valueOrNull;
                                  if (user == null) return;
                                  setState(() => _creatingTrip = true);
                                  try {
                                    final trip = await ref
                                        .read(tripRepositoryProvider)
                                        .createTrip(
                                          userId: user.id,
                                          origin: planner.origin!,
                                          destination: planner.destination!,
                                          originLabel: planner.originLabel,
                                          destinationLabel:
                                              planner.destinationLabel,
                                          productContext:
                                              ProductContext.ecodrive,
                                        );
                                    if (context.mounted) {
                                      context.push('/tracking/${trip.id}');
                                    }
                                  } finally {
                                    if (mounted) {
                                      setState(
                                          () => _creatingTrip = false);
                                    }
                                  }
                                },
                    ),
                    OutlinedButton.icon(
                      icon: const Icon(Icons.dashboard),
                      label: const Text('Mon dashboard conducteur'),
                      onPressed: () => context.push('/ecodrive/dashboard'),
                    ),
                  ],
                );
              },
            ),
    );
  }
}

/// Driver dashboard: eco-score of the latest tracked trip + key metrics.
/// The "enterprise/fleet" version will aggregate eco_scores by organization
/// — structure prepared in the DB (partner_organizations), UI out of scope.
class EcoDashboardScreen extends ConsumerStatefulWidget {
  const EcoDashboardScreen({super.key});

  @override
  ConsumerState<EcoDashboardScreen> createState() =>
      _EcoDashboardScreenState();
}

class _EcoDashboardScreenState extends ConsumerState<EcoDashboardScreen> {
  TripScoreResult? _computeScore(TrackingState tracking) =>
      tracking.points.length >= 2
          ? const BasicEcoDrivingScoringService().scoreTrip(
              trip: Trip(
                id: tracking.tripId ?? 'last',
                userId: 'current',
                origin: const GeoPoint(latitude: 0, longitude: 0),
                destination: const GeoPoint(latitude: 0, longitude: 0),
              ),
              trackPoints: tracking.points,
            )
          : null;

  @override
  void initState() {
    super.initState();
    // Side effect kept out of build(): log the view exactly once per visit.
    final score = _computeScore(ref.read(trackingControllerProvider));
    if (score != null) {
      ref.read(analyticsRepositoryProvider).logEvent(
            EcoDriveAnalyticsEvents.ecoScoreViewed,
            productContext: ProductContext.ecodrive,
            properties: {'score': score.scoreOverall},
          );
    }
  }

  @override
  Widget build(BuildContext context) {
    final tracking = ref.watch(trackingControllerProvider);
    final TripScoreResult? score = _computeScore(tracking);
    return Scaffold(
      appBar: AppBar(title: const Text('Dashboard conducteur')),
      body: score == null
          ? const Center(
              child: Text('Aucun trajet suivi pour le moment.\n'
                  'Lancez un trajet pour obtenir votre éco-score.'))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  color: score.scoreOverall >= 70
                      ? Colors.green.shade50
                      : Colors.orange.shade50,
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      children: [
                        Text('${score.scoreOverall}',
                            style:
                                Theme.of(context).textTheme.displayLarge),
                        const Text('Éco-score / 100'),
                        const SizedBox(height: 8),
                        if (score.adviceText != null)
                          Text(score.adviceText!,
                              textAlign: TextAlign.center),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                _metricTile(Icons.flash_on, 'Accélérations brusques',
                    '${score.metrics['harshAccelerationCount']}'),
                _metricTile(Icons.report, 'Freinages brusques',
                    '${score.metrics['harshBrakingCount']}'),
                _metricTile(
                    Icons.speed,
                    'Vitesse moyenne',
                    '${((score.metrics['averageSpeed'] as double? ?? 0) * 3.6).toStringAsFixed(0)} km/h'),
                _metricTile(Icons.local_gas_station, 'Carburant estimé',
                    '${score.metrics['fuelEstimate']} L'),
                _metricTile(Icons.cloud, 'CO₂ estimé',
                    '${score.metrics['co2Estimate']} kg'),
                const SizedBox(height: 16),
                const Card(
                  child: ListTile(
                    leading: Icon(Icons.business),
                    title: Text('Dashboard entreprise'),
                    subtitle: Text(
                        'À venir : agrégation des éco-scores par flotte '
                        '(structure DB prête : partner_organizations).'),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _metricTile(IconData icon, String label, String value) => ListTile(
        leading: Icon(icon),
        title: Text(label),
        trailing: Text(value, style: const TextStyle(fontSize: 16)),
      );
}
