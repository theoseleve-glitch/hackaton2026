import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../shared/models/models.dart';
import 'route_planner_controller.dart';

class RouteOptionsScreen extends ConsumerStatefulWidget {
  const RouteOptionsScreen({super.key});

  @override
  ConsumerState<RouteOptionsScreen> createState() =>
      _RouteOptionsScreenState();
}

class _RouteOptionsScreenState extends ConsumerState<RouteOptionsScreen> {
  bool _creatingTrip = false; // double-tap guard

  @override
  Widget build(BuildContext context) {
    final planner = ref.watch(routePlannerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Itinéraires')),
      body: planner.options.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erreur : $e')),
        data: (options) => options.isEmpty
            ? const Center(child: Text('Aucun itinéraire calculé.'))
            : ListView.builder(
                itemCount: options.length,
                itemBuilder: (context, i) {
                  final o = options[i];
                  final selected = planner.selectedOption?.id == o.id;
                  return Card(
                    margin:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    child: ListTile(
                      leading: Icon(_iconFor(o.routeMode)),
                      title: Text(_labelFor(o.routeMode)),
                      subtitle: Text(
                        '${(o.distanceMeters / 1000).toStringAsFixed(1)} km · '
                        '${(o.durationSeconds / 60).round()} min'
                        '${o.estimatedCo2Kg != null ? ' · ${o.estimatedCo2Kg} kg CO₂' : ''}'
                        '${o.estimatedFuelLiters != null ? ' · ${o.estimatedFuelLiters} L' : ''}',
                      ),
                      trailing: selected
                          ? const Icon(Icons.check_circle, color: Colors.green)
                          : null,
                      onTap: () {
                        ref
                            .read(routePlannerProvider.notifier)
                            .selectOption(o);
                      },
                    ),
                  );
                },
              ),
      ),
      bottomNavigationBar: planner.selectedOption == null
          ? null
          : Padding(
              padding: const EdgeInsets.all(16),
              child: FilledButton.icon(
                icon: const Icon(Icons.play_arrow),
                label: const Text('Créer le trajet et démarrer'),
                onPressed: _creatingTrip
                    ? null
                    : () async {
                        final user =
                            ref.read(authControllerProvider).valueOrNull;
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
                                destinationLabel: planner.destinationLabel,
                                productContext:
                                    ref.read(productModeProvider),
                              );
                          if (context.mounted) {
                            context.push('/tracking/${trip.id}');
                          }
                        } finally {
                          if (mounted) {
                            setState(() => _creatingTrip = false);
                          }
                        }
                      },
              ),
            ),
    );
  }

  IconData _iconFor(RouteMode m) => switch (m) {
        RouteMode.fastest => Icons.speed,
        RouteMode.shortest => Icons.straighten,
        RouteMode.eco => Icons.eco,
        RouteMode.discovery => Icons.local_florist,
      };

  String _labelFor(RouteMode m) => switch (m) {
        RouteMode.fastest => 'Trajet rapide',
        RouteMode.shortest => 'Trajet court',
        RouteMode.eco => 'Trajet éco',
        RouteMode.discovery => 'L\'Échappée',
      };
}
