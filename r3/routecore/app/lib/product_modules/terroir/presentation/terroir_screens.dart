import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../features/routing/presentation/route_planner_controller.dart';
import '../../../shared/models/models.dart';
import '../domain/terroir_analytics.dart';
import '../domain/terroir_relevance_scorer.dart';

/// Step 1 of the Terroir flow: accepted detour + experience preferences.
/// Reuses the core route planner (origin/destination set on Home).
class TerroirPlanScreen extends ConsumerWidget {
  const TerroirPlanScreen({super.key});

  static const _experienceCategories = {
    'producer': 'Producteurs',
    'market': 'Marchés',
    'artisan': 'Artisans',
    'restaurant': 'Restaurants locaux',
    'village': 'Villages',
    'viewpoint': 'Points de vue',
    'event': 'Événements',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final planner = ref.watch(routePlannerProvider);
    final notifier = ref.read(routePlannerProvider.notifier);
    final detour = planner.maxDetourMinutes ?? 20;
    return Scaffold(
      appBar: AppBar(title: const Text('Trajet découverte')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (!planner.isReady)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Text(
                    'Choisissez d\'abord un départ et une destination sur '
                    'l\'écran d\'accueil.'),
              ),
            ),
          Text('Détour accepté',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 10, label: Text('10 min')),
              ButtonSegment(value: 20, label: Text('20 min')),
              ButtonSegment(value: 45, label: Text('45 min')),
            ],
            selected: {detour},
            onSelectionChanged: (s) => notifier.setMaxDetour(s.first),
          ),
          const SizedBox(height: 24),
          Text('Type d\'expérience',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              for (final e in _experienceCategories.entries)
                FilterChip(
                  label: Text(e.value),
                  selected:
                      planner.preferredPoiCategories.contains(e.key),
                  onSelected: (sel) {
                    final cats = [...planner.preferredPoiCategories];
                    sel ? cats.add(e.key) : cats.remove(e.key);
                    notifier.setPreferredCategories(cats);
                  },
                ),
            ],
          ),
          const SizedBox(height: 32),
          FilledButton.icon(
            icon: const Icon(Icons.local_florist),
            label: const Text('Générer mon trajet découverte'),
            onPressed: !planner.isReady
                ? null
                : () async {
                    notifier.setMode(RouteMode.discovery);
                    notifier.setMaxDetour(detour);
                    await notifier.computeOptions();
                    await ref.read(analyticsRepositoryProvider).logEvent(
                          TerroirAnalyticsEvents.routeGenerated,
                          productContext: ProductContext.terroir,
                          properties: {
                            'maxDetourMinutes': detour,
                            'categories': planner.preferredPoiCategories,
                          },
                        );
                    if (context.mounted) context.push('/terroir/results');
                  },
          ),
        ],
      ),
    );
  }
}

final terroirRankedPoisProvider =
    FutureProvider<List<PoiAlongRoute>>((ref) async {
  final planner = ref.watch(routePlannerProvider);
  if (!planner.isReady) return [];
  final raw = await ref.read(poiRepositoryProvider).poisAlongRoute(
        planner.origin!,
        planner.destination!,
        corridorMeters: 25000,
        categorySlugs: planner.preferredPoiCategories.isEmpty
            ? null
            : planner.preferredPoiCategories,
      );
  final categories = await ref.read(poiRepositoryProvider).getCategories();
  final slugByCategoryId = {for (final c in categories) c.id: c.slug};
  return const TerroirRelevanceScorer().rank(
    raw,
    maxDetourMinutes: planner.maxDetourMinutes ?? 20,
    preferredCategorySlugs: planner.preferredPoiCategories,
    categorySlugByPoiId: {
      // Supabase RPC rows carry the slug directly; mock/table rows carry the
      // category uuid and need the lookup.
      for (final item in raw)
        item.poi.id: item.poi.categorySlug ??
            slugByCategoryId[item.poi.categoryId] ??
            ''
    },
  );
});

/// Step 2: the enriched route — POIs ranked by relevance, sponsored entries
/// marked. Partner detail uses the core PoiDetailScreen.
class TerroirResultsScreen extends ConsumerWidget {
  const TerroirResultsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ranked = ref.watch(terroirRankedPoisProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Votre trajet découverte')),
      body: ranked.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erreur : $e')),
        data: (items) => items.isEmpty
            ? const Center(
                child: Text('Aucune pépite locale sur ce trajet.\n'
                    'Essayez un détour plus large.'))
            : ListView.builder(
                itemCount: items.length,
                itemBuilder: (context, i) {
                  final item = items[i];
                  return Card(
                    margin: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 6),
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundColor: item.poi.isSponsored
                            ? Colors.amber
                            : Theme.of(context).colorScheme.primaryContainer,
                        child: Text(
                            '${(item.relevanceScore * 100).round()}'),
                      ),
                      title: Text(item.poi.name),
                      subtitle: Text(
                        '${item.poi.city ?? ''} · '
                        '+${item.detourMinutesEstimate.round()} min de détour'
                        '${item.poi.isSponsored ? ' · Partenaire' : ''}',
                      ),
                      onTap: () => context.push('/poi/${item.poi.id}'),
                    ),
                  );
                },
              ),
      ),
      bottomNavigationBar: Padding(
        padding: const EdgeInsets.all(16),
        child: OutlinedButton.icon(
          icon: const Icon(Icons.map),
          label: const Text('Voir sur la carte'),
          onPressed: () => context.push('/map'),
        ),
      ),
    );
  }
}
