import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart' show LatLng;

import '../../../app/providers.dart';
import '../domain/trip_share.dart';

/// Viewer en lecture seule d'un trajet partagé (`/share/:token`) : suit la
/// position et l'ETA du conducteur en temps réel. Neutre (peut être ouvert par
/// un destinataire sans compte via le lien).
class ShareViewerScreen extends ConsumerWidget {
  const ShareViewerScreen({super.key, required this.token});

  final String token;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(tripShareWatchProvider(token));
    return Scaffold(
      appBar: AppBar(title: const Text('Suivi du trajet')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _Message(
            icon: Icons.wifi_off, text: 'Suivi indisponible.\n$e'),
        data: (share) {
          if (share == null) {
            return const _Message(
                icon: Icons.hourglass_empty,
                text: 'En attente de la position du conducteur…');
          }
          if (!share.active) {
            return const _Message(
                icon: Icons.flag, text: 'Le trajet est terminé. Bonne route !');
          }
          final driver = share.lastPoint;
          final dest = share.destination;
          if (driver == null) {
            return const _Message(
                icon: Icons.hourglass_empty,
                text: 'Le conducteur n\'a pas encore démarré.');
          }
          return Column(
            children: [
              _Banner(share: share),
              Expanded(
                child: FlutterMap(
                  options: MapOptions(
                    initialCenter:
                        LatLng(driver.latitude, driver.longitude),
                    initialZoom: 13,
                  ),
                  children: [
                    TileLayer(
                      urlTemplate:
                          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.routecore.routecore',
                    ),
                    MarkerLayer(
                      markers: [
                        if (dest != null)
                          Marker(
                            point: LatLng(dest.latitude, dest.longitude),
                            width: 30,
                            height: 30,
                            child: const Icon(Icons.flag,
                                color: Colors.red, size: 28),
                          ),
                        Marker(
                          point: LatLng(driver.latitude, driver.longitude),
                          width: 34,
                          height: 34,
                          child: const Icon(Icons.navigation,
                              color: Colors.blue, size: 30),
                        ),
                      ],
                    ),
                    const RichAttributionWidget(attributions: [
                      TextSourceAttribution('© OpenStreetMap'),
                    ]),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.share});
  final TripShare share;

  String _eta() {
    final eta = share.eta;
    if (eta == null) return '—';
    final h = eta.hour.toString().padLeft(2, '0');
    final m = eta.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  String _remaining() {
    final m = share.remainingMeters;
    if (m == null) return '';
    return m >= 1000
        ? '${(m / 1000).toStringAsFixed(m >= 10000 ? 0 : 1)} km restants'
        : '${(m / 10).round() * 10} m restants';
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.surface,
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const Icon(Icons.directions_car, size: 28),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    share.destinationLabel == null
                        ? 'En route'
                        : 'En route vers ${share.destinationLabel}',
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w600),
                  ),
                  Text('Arrivée estimée ${_eta()} · ${_remaining()}'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 48, color: Colors.grey),
              const SizedBox(height: 16),
              Text(text, textAlign: TextAlign.center),
            ],
          ),
        ),
      );
}
