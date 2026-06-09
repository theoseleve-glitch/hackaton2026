import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/product_registry.dart';
import '../../../app/providers.dart';
import '../../../shared/models/models.dart';
import 'tracking_controller.dart';

class TripTrackingScreen extends ConsumerWidget {
  const TripTrackingScreen({super.key, required this.tripId});

  final String tripId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(trackingControllerProvider);
    final controller = ref.read(trackingControllerProvider.notifier);
    // Don't show a previous trip's figures on a fresh tracking screen.
    final tracking =
        state.tripId == tripId ? state : const TrackingState();
    // Another trip is being tracked: starting this one is blocked by the
    // controller's re-entrancy guard, so say it and offer to stop the other.
    final otherTripActive = state.isTracking && state.tripId != tripId;
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
            // Only this trip's error (or a global one like missing consent).
            if (state.error != null &&
                (state.tripId == null || state.tripId == tripId))
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  state.error!,
                  textAlign: TextAlign.center,
                  style:
                      TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            if (otherTripActive)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    const Text('Un autre trajet est déjà en cours de suivi.'),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      icon: const Icon(Icons.stop_circle_outlined),
                      label: const Text('Arrêter le trajet en cours'),
                      onPressed: () => controller.stop(),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 32),
            if (!tracking.isTracking)
              FilledButton.icon(
                icon: const Icon(Icons.play_arrow),
                label: const Text('Démarrer le trajet'),
                onPressed:
                    otherTripActive ? null : () => controller.start(tripId),
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
    final score = ref.read(scoringServiceProvider).scoreTrip(
          trip: Trip(
            id: tripId,
            userId: 'current',
            origin: const GeoPoint(latitude: 0, longitude: 0),
            destination: const GeoPoint(latitude: 0, longitude: 0),
          ),
          trackPoints: tracking.points,
        );
    final km = (tracking.distanceMeters / 1000).toStringAsFixed(2);
    return Scaffold(
      appBar: AppBar(title: const Text('Résumé du trajet')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Text('Score : ${score.scoreOverall}/100',
                      style: Theme.of(context).textTheme.headlineMedium),
                  if (score.adviceText != null) ...[
                    const SizedBox(height: 8),
                    Text(score.adviceText!),
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
          // Product-specific hint comes from the registry; the core summary
          // screen stays neutral.
          if (productEntryFor(mode)?.summaryNote case final String note)
            Card(
              child: ListTile(
                leading: Icon(productEntryFor(mode)!.icon),
                title: Text(note),
              ),
            ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () => context.go('/home'),
            child: const Text('Retour à l\'accueil'),
          ),
        ],
      ),
    );
  }
}
