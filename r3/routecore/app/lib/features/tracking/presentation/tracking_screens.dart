import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../shared/models/models.dart';
import 'tracking_controller.dart';

class TripTrackingScreen extends ConsumerWidget {
  const TripTrackingScreen({super.key, required this.tripId});

  final String tripId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tracking = ref.watch(trackingControllerProvider);
    final controller = ref.read(trackingControllerProvider.notifier);
    final km = (tracking.distanceMeters / 1000).toStringAsFixed(2);
    final minutes = tracking.elapsed.inMinutes;
    final seconds = tracking.elapsed.inSeconds % 60;
    return Scaffold(
      appBar: AppBar(title: const Text('Suivi du trajet')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              tracking.isTracking ? Icons.gps_fixed : Icons.gps_off,
              size: 64,
              color: tracking.isTracking ? Colors.green : Colors.grey,
            ),
            const SizedBox(height: 16),
            Text('$km km',
                style: Theme.of(context).textTheme.displaySmall),
            Text('$minutes min ${seconds.toString().padLeft(2, '0')} s'),
            Text('${tracking.points.length} points GPS'),
            const SizedBox(height: 32),
            if (!tracking.isTracking)
              FilledButton.icon(
                icon: const Icon(Icons.play_arrow),
                label: const Text('Démarrer le trajet'),
                onPressed: () => _startWithConsent(context, ref, controller),
              )
            else
              FilledButton.icon(
                style: FilledButton.styleFrom(
                    backgroundColor: Theme.of(context).colorScheme.error),
                icon: const Icon(Icons.stop),
                label: const Text('Arrêter le trajet'),
                onPressed: () async {
                  final id = await controller.stop();
                  if (context.mounted && id != null) {
                    context.pushReplacement('/summary/$id');
                  }
                },
              ),
          ],
        ),
      ),
    );
  }

  /// Privacy by design: obtain explicit location-tracking consent before the
  /// first trip, then remember it for the session ([consentAcceptedProvider]).
  Future<void> _startWithConsent(
    BuildContext context,
    WidgetRef ref,
    TrackingController controller,
  ) async {
    if (!ref.read(consentAcceptedProvider)) {
      final accepted = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Suivi de votre position'),
          content: const Text(
            "Pour calculer votre éco-score, l'application enregistre votre "
            'position GPS pendant le trajet. Ces données restent privées et '
            'liées à votre compte ; vous pouvez arrêter le suivi à tout moment.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Refuser'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text("J'accepte"),
            ),
          ],
        ),
      );
      if (accepted != true) return;
      ref.read(consentAcceptedProvider.notifier).state = true;
    }
    await controller.start(tripId);
  }
}

class TripSummaryScreen extends ConsumerWidget {
  const TripSummaryScreen({super.key, required this.tripId});

  final String tripId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Tracking state still holds the finished trip's points; good enough for
    // the MVP summary. A production version would reload from the repository.
    final tracking = ref.watch(trackingControllerProvider);
    final mode = ref.watch(productModeProvider);
    // The active ScoringService (selected by product mode) decides what the
    // metrics map contains; this screen renders whatever it produced — no
    // dependency on any product module.
    final score = ref.watch(scoringServiceProvider).scoreTrip(
          trip: Trip(
            id: tripId,
            userId: 'current',
            origin: const GeoPoint(latitude: 0, longitude: 0),
            destination: const GeoPoint(latitude: 0, longitude: 0),
          ),
          trackPoints: tracking.points,
        );
    final km = (tracking.distanceMeters / 1000).toStringAsFixed(2);
    final isEco = mode == ProductContext.ecodrive;
    final hasEcoBreakdown =
        isEco && score.metrics.containsKey('scoreAcceleration');
    return Scaffold(
      appBar: AppBar(title: const Text('Résumé du trajet')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: isEco
                ? (score.scoreOverall >= 75
                    ? Colors.green.shade50
                    : score.scoreOverall >= 50
                        ? Colors.orange.shade50
                        : Colors.red.shade50)
                : null,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Text('Score : ${score.scoreOverall}/100',
                      style: Theme.of(context).textTheme.headlineMedium),
                  if (score.adviceText != null) ...[
                    const SizedBox(height: 8),
                    Text(score.adviceText!, textAlign: TextAlign.center),
                  ],
                ],
              ),
            ),
          ),
          ListTile(
              leading: const Icon(Icons.straighten),
              title: Text('$km km parcourus')),
          ListTile(
              leading: const Icon(Icons.timer),
              title: Text('${tracking.elapsed.inMinutes} minutes')),
          ListTile(
              leading: const Icon(Icons.gps_fixed),
              title: Text('${tracking.points.length} points GPS')),
          if (hasEcoBreakdown) _EcoSummarySection(metrics: score.metrics),
          const SizedBox(height: 16),
          if (isEco)
            OutlinedButton.icon(
              icon: const Icon(Icons.dashboard),
              label: const Text('Dashboard conducteur'),
              onPressed: () => context.push('/ecodrive/dashboard'),
            ),
          FilledButton(
            onPressed: () => context.go('/home'),
            child: const Text('Retour à l\'accueil'),
          ),
        ],
      ),
    );
  }
}

/// Renders the EcoDrive sub-score breakdown + fuel/CO2 from a generic metrics
/// map (the keys emitted by the eco scoring service). Lives in the shared
/// tracking screen but reads only `Map<String, dynamic>` — no product import.
class _EcoSummarySection extends StatelessWidget {
  const _EcoSummarySection({required this.metrics});

  final Map<String, dynamic> metrics;

  int _i(String key) => metrics[key] is int ? metrics[key] as int : 0;
  String _n(String key) => '${metrics[key] ?? '?'}';

  @override
  Widget build(BuildContext context) {
    final compliance = metrics['scoreSpeedCompliance'];
    final isEv = metrics['kwhEstimate'] != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 16),
        Text('Éco-conduite — détail',
            style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        _ScoreBar('Accélération', _i('scoreAcceleration')),
        _ScoreBar('Freinage', _i('scoreBraking')),
        _ScoreBar('Stabilité de vitesse', _i('scoreSpeedStability')),
        _ScoreBar('Efficacité de l\'itinéraire', _i('scoreRouteEfficiency')),
        if (compliance is int) _ScoreBar('Respect des limites', compliance),
        const SizedBox(height: 8),
        ListTile(
          leading: Icon(isEv ? Icons.bolt : Icons.local_gas_station),
          title: Text(isEv ? 'Énergie estimée' : 'Carburant estimé'),
          trailing: Text(
              isEv ? '${_n('kwhEstimate')} kWh' : '${_n('fuelEstimate')} L'),
        ),
        ListTile(
          leading: const Icon(Icons.cloud),
          title: const Text('CO₂ estimé'),
          trailing: Text('${_n('co2Estimate')} kg'),
        ),
        ListTile(
          leading: const Icon(Icons.savings, color: Colors.green),
          title: const Text('Économie estimée'),
          trailing: Text(isEv
              ? '${_n('estimatedKwhSavedKwh')} kWh · ${_n('estimatedCo2SavedKg')} kg'
              : '${_n('estimatedFuelSavedLiters')} L · ${_n('estimatedCo2SavedKg')} kg'),
        ),
      ],
    );
  }
}

/// A labelled 0..100 progress bar for one sub-score.
class _ScoreBar extends StatelessWidget {
  const _ScoreBar(this.label, this.value);

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    final color = value >= 75
        ? Colors.green
        : value >= 50
            ? Colors.orange
            : Colors.red;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [Text(label), Text('$value/100')],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: (value / 100).clamp(0.0, 1.0),
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
