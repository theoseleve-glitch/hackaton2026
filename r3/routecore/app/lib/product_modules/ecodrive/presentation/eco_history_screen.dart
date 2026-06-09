import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../application/eco_history.dart';

/// Lists past EcoDrive trips with their eco-score and a simple
/// improvement-over-time view: the average score plus a per-trip trend arrow
/// versus the previous trip. Reads the in-memory [ecoHistoryProvider].
class EcoHistoryScreen extends ConsumerWidget {
  const EcoHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(ecoHistoryProvider);
    final avg = EcoHistoryNotifier.averageScore(history).round();
    return Scaffold(
      appBar: AppBar(title: const Text('Mes trajets')),
      body: history.isEmpty
          ? const Center(
              child: Text(
                'Aucun trajet enregistré.\n'
                'Terminez un trajet pour le voir ici.',
                textAlign: TextAlign.center,
              ),
            )
          : Column(
              children: [
                Card(
                  margin: const EdgeInsets.all(16),
                  child: ListTile(
                    leading: const Icon(Icons.insights, color: Colors.green),
                    title: Text('Score moyen : $avg/100'),
                    subtitle: Text(
                        '${history.length} trajet${history.length > 1 ? 's' : ''} '
                        'enregistré${history.length > 1 ? 's' : ''}'),
                  ),
                ),
                Expanded(
                  child: ListView.separated(
                    itemCount: history.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, i) {
                      final r = history[i];
                      // Trend vs the previous (older) trip, if any.
                      final older =
                          i + 1 < history.length ? history[i + 1] : null;
                      final delta = older == null
                          ? null
                          : r.scoreOverall - older.scoreOverall;
                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: _scoreColor(r.scoreOverall),
                          child: Text('${r.scoreOverall}',
                              style: const TextStyle(color: Colors.white)),
                        ),
                        title: Text(
                            '${(r.distanceMeters / 1000).toStringAsFixed(1)} km · ${r.vehicle.label}'),
                        subtitle:
                            Text(r.adviceText ?? _formatDate(r.recordedAt)),
                        trailing: (delta == null || delta == 0)
                            ? null
                            : Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                      delta > 0
                                          ? Icons.trending_up
                                          : Icons.trending_down,
                                      color: delta > 0
                                          ? Colors.green
                                          : Colors.red,
                                      size: 18),
                                  Text('${delta > 0 ? '+' : ''}$delta'),
                                ],
                              ),
                      );
                    },
                  ),
                ),
              ],
            ),
    );
  }

  Color _scoreColor(int s) =>
      s >= 75 ? Colors.green : (s >= 50 ? Colors.orange : Colors.red);

  String _formatDate(DateTime d) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.day)}/${two(d.month)} ${two(d.hour)}:${two(d.minute)}';
  }
}
