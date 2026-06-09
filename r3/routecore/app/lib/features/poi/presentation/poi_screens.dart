import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../shared/models/models.dart';

final poiCategoriesProvider = FutureProvider<List<PoiCategory>>(
    (ref) => ref.read(poiRepositoryProvider).getCategories());

final _selectedCategoryProvider = StateProvider<String?>((ref) => null);

final nearbyPoisProvider = FutureProvider<List<Poi>>((ref) async {
  final slug = ref.watch(_selectedCategoryProvider);
  final center =
      await ref.read(locationRepositoryProvider).getCurrentPosition();
  return ref.read(poiRepositoryProvider).nearbyPois(
        center,
        radiusMeters: 60000,
        categorySlugs: slug == null ? null : [slug],
      );
});

class PoiListScreen extends ConsumerWidget {
  const PoiListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pois = ref.watch(nearbyPoisProvider);
    final categories = ref.watch(poiCategoriesProvider);
    final selected = ref.watch(_selectedCategoryProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Points d\'intérêt')),
      body: Column(
        children: [
          SizedBox(
            height: 52,
            child: categories.when(
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
              data: (cats) => ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: [
                  for (final c in cats)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                      child: FilterChip(
                        label: Text(c.name),
                        selected: selected == c.slug,
                        onSelected: (_) => ref
                            .read(_selectedCategoryProvider.notifier)
                            .state = selected == c.slug ? null : c.slug,
                      ),
                    ),
                ],
              ),
            ),
          ),
          Expanded(
            child: pois.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Erreur : $e')),
              data: (list) => list.isEmpty
                  ? const Center(child: Text('Aucun POI à proximité.'))
                  : ListView.builder(
                      itemCount: list.length,
                      itemBuilder: (context, i) {
                        final p = list[i];
                        return ListTile(
                          leading: Icon(
                            p.isSponsored ? Icons.star : Icons.place,
                            color: p.isSponsored ? Colors.amber : null,
                          ),
                          title: Text(p.name),
                          subtitle: Text(p.city ?? ''),
                          onTap: () {
                            ref.read(analyticsRepositoryProvider).logEvent(
                              'poi_viewed',
                              properties: {'poiId': p.id},
                            );
                            context.push('/poi/${p.id}');
                          },
                        );
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

final poiDetailProvider = FutureProvider.family<Poi?, String>(
    (ref, id) => ref.read(poiRepositoryProvider).getPoi(id));

class PoiDetailScreen extends ConsumerWidget {
  const PoiDetailScreen({super.key, required this.poiId});

  final String poiId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final poi = ref.watch(poiDetailProvider(poiId));
    return Scaffold(
      appBar: AppBar(title: const Text('Détail')),
      body: poi.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erreur : $e')),
        data: (p) => p == null
            ? const Center(child: Text('POI introuvable.'))
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text(p.name,
                      style: Theme.of(context).textTheme.headlineSmall),
                  if (p.isSponsored)
                    const Chip(
                      avatar: Icon(Icons.star, size: 16),
                      label: Text('Partenaire'),
                    ),
                  const SizedBox(height: 8),
                  if (p.description != null) Text(p.description!),
                  const SizedBox(height: 16),
                  if (p.city != null)
                    ListTile(
                        leading: const Icon(Icons.location_city),
                        title: Text(p.city!)),
                  if (p.phone != null)
                    ListTile(
                        leading: const Icon(Icons.phone),
                        title: Text(p.phone!)),
                  if (p.websiteUrl != null)
                    ListTile(
                        leading: const Icon(Icons.link),
                        title: Text(p.websiteUrl!)),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    icon: const Icon(Icons.favorite_border),
                    label: const Text('Ajouter aux favoris'),
                    onPressed: () async {
                      final user =
                          ref.read(authControllerProvider).valueOrNull;
                      if (user == null) return;
                      await ref.read(favoriteRepositoryProvider).addFavorite(
                          user.id, FavoriteTargetType.poi, p.id);
                      ref.read(analyticsRepositoryProvider).logEvent(
                        'poi_favorited',
                        properties: {'poiId': p.id},
                      );
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                                content: Text('Ajouté aux favoris')));
                      }
                    },
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.directions),
                    label: const Text('Y aller'),
                    onPressed: () => context.go('/home'),
                  ),
                ],
              ),
      ),
    );
  }
}
