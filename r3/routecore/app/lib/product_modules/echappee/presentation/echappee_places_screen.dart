import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../features/places/data/saved_places_store.dart';
import '../../../features/routing/presentation/route_planner_controller.dart';
import '../../../shared/models/models.dart';
import '../design_system/design_system.dart';
import 'echappee_page.dart';

/// « Mes lieux » : Domicile / Travail (1 tap pour y aller, comme Waze),
/// favoris et destinations récentes — persistés localement (sans compte).
/// Ajout via recherche d'adresse (Nominatim, gratuit).
class EchappeePlacesScreen extends ConsumerStatefulWidget {
  const EchappeePlacesScreen({super.key});

  @override
  ConsumerState<EchappeePlacesScreen> createState() =>
      _EchappeePlacesScreenState();
}

class _EchappeePlacesScreenState extends ConsumerState<EchappeePlacesScreen> {
  final _searchController = TextEditingController();
  List<AddressSearchResult> _results = const [];
  bool _searching = false;

  SavedPlace? _home;
  SavedPlace? _work;
  List<SavedPlace> _favorites = const [];
  List<SavedPlace> _recents = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  SavedPlacesStore get _store => ref.read(savedPlacesStoreProvider);

  Future<void> _refresh() async {
    final results = await Future.wait([
      _store.home(),
      _store.work(),
      _store.favorites(),
      _store.recents(),
    ]);
    if (!mounted) return;
    setState(() {
      _home = results[0] as SavedPlace?;
      _work = results[1] as SavedPlace?;
      _favorites = results[2] as List<SavedPlace>;
      _recents = results[3] as List<SavedPlace>;
      _loading = false;
    });
  }

  Future<void> _search(String query) async {
    if (query.trim().length < 3) {
      setState(() => _results = const []);
      return;
    }
    setState(() => _searching = true);
    final results = await ref.read(mapSearchServiceProvider).searchAddress(query);
    if (!mounted) return;
    setState(() {
      _results = results;
      _searching = false;
    });
  }

  SavedPlace _toPlace(AddressSearchResult r) =>
      SavedPlace(label: r.label, latitude: r.latitude, longitude: r.longitude);

  Future<void> _saveFromResult(
      AddressSearchResult r, SavedPlaceKind kind) async {
    final place = _toPlace(r);
    switch (kind) {
      case SavedPlaceKind.home:
        await _store.setHome(place);
      case SavedPlaceKind.work:
        await _store.setWork(place);
      case SavedPlaceKind.favorite:
        await _store.addFavorite(place);
      case SavedPlaceKind.recent:
        break;
    }
    _searchController.clear();
    setState(() => _results = const []);
    await _refresh();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('« ${r.label} » enregistré.')));
    }
  }

  /// 1 tap → départ de la position actuelle vers le lieu, puis écran des routes.
  Future<void> _goTo(SavedPlace dest) async {
    final notifier = ref.read(routePlannerProvider.notifier);
    try {
      final pos = await ref.read(locationRepositoryProvider).getCurrentPosition();
      notifier.setOrigin(AddressSearchResult(
        id: 'gps',
        label: 'Ma position',
        latitude: pos.latitude,
        longitude: pos.longitude,
        provider: 'gps',
      ));
    } catch (_) {/* l'origine déjà choisie dans l'atelier reste utilisée */}
    notifier.setDestination(AddressSearchResult(
      id: 'saved',
      label: dest.label,
      latitude: dest.latitude,
      longitude: dest.longitude,
      provider: 'saved',
    ));
    notifier.setMode(RouteMode.discovery);
    await _store.addRecent(dest);
    await notifier.computeOptions();
    if (mounted) context.go('/echappee/routes');
  }

  @override
  Widget build(BuildContext context) {
    return EchappeePage(
      child: Scaffold(
        appBar: AppBar(title: const Text('Mes lieux')),
        body: _loading
            ? const Center(child: EchappeeLoadingState())
            : ListView(
                padding: const EdgeInsets.all(EchappeeSpacing.screen),
                children: [
                  TextField(
                    controller: _searchController,
                    textInputAction: TextInputAction.search,
                    decoration: InputDecoration(
                      hintText: 'Ajouter un lieu (adresse, ville)…',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: _searching
                          ? const Padding(
                              padding: EdgeInsets.all(12),
                              child: SizedBox(
                                  width: 16,
                                  height: 16,
                                  child:
                                      CircularProgressIndicator(strokeWidth: 2)),
                            )
                          : null,
                      border: const OutlineInputBorder(),
                    ),
                    onSubmitted: _search,
                    onChanged: (v) {
                      if (v.isEmpty) setState(() => _results = const []);
                    },
                  ),
                  for (final r in _results)
                    Card(
                      child: ListTile(
                        title: Text(r.label, maxLines: 2),
                        subtitle: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            _saveChip('Domicile', Icons.home_outlined,
                                () => _saveFromResult(r, SavedPlaceKind.home)),
                            _saveChip('Travail', Icons.work_outline,
                                () => _saveFromResult(r, SavedPlaceKind.work)),
                            _saveChip('Favori', Icons.star_outline,
                                () => _saveFromResult(r, SavedPlaceKind.favorite)),
                          ],
                        ),
                      ),
                    ),
                  const SizedBox(height: EchappeeSpacing.s16),
                  _shortcut('Domicile', Icons.home_rounded, _home,
                      SavedPlaceKind.home),
                  _shortcut(
                      'Travail', Icons.work_rounded, _work, SavedPlaceKind.work),
                  if (_favorites.isNotEmpty) ...[
                    const SizedBox(height: EchappeeSpacing.s16),
                    const Text('Favoris', style: EchappeeTypography.h3),
                    for (final p in _favorites)
                      _placeTile(p, onRemove: () async {
                        await _store.removeFavorite(p);
                        await _refresh();
                      }),
                  ],
                  if (_recents.isNotEmpty) ...[
                    const SizedBox(height: EchappeeSpacing.s16),
                    const Text('Récents', style: EchappeeTypography.h3),
                    for (final p in _recents)
                      _placeTile(p, onFavorite: () async {
                        await _store.addFavorite(p);
                        await _refresh();
                      }),
                  ],
                ],
              ),
      ),
    );
  }

  Widget _saveChip(String label, IconData icon, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(right: EchappeeSpacing.s4, top: 4),
        child: ActionChip(
          avatar: Icon(icon, size: 16),
          label: Text(label),
          onPressed: onTap,
        ),
      );

  Widget _shortcut(
      String title, IconData icon, SavedPlace? place, SavedPlaceKind kind) {
    return Card(
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: EchappeeColors.primaryTint,
          child: Icon(icon, color: EchappeeColors.primary),
        ),
        title: Text(title, style: EchappeeTypography.body),
        subtitle: Text(place?.label ?? 'Non défini — cherche une adresse'),
        trailing: place == null
            ? null
            : FilledButton(
                onPressed: () => _goTo(place),
                child: const Text('Y aller'),
              ),
      ),
    );
  }

  Widget _placeTile(SavedPlace p,
      {VoidCallback? onRemove, VoidCallback? onFavorite}) {
    return Card(
      child: ListTile(
        leading: const Icon(Icons.place_outlined),
        title: Text(p.label, maxLines: 2),
        onTap: () => _goTo(p),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (onFavorite != null)
              IconButton(
                tooltip: 'Ajouter aux favoris',
                icon: const Icon(Icons.star_outline),
                onPressed: onFavorite,
              ),
            if (onRemove != null)
              IconButton(
                tooltip: 'Retirer',
                icon: const Icon(Icons.delete_outline),
                onPressed: onRemove,
              ),
          ],
        ),
      ),
    );
  }
}
