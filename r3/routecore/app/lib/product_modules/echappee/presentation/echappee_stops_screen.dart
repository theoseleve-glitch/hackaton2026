import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../features/routing/presentation/route_planner_controller.dart';
import '../../../shared/models/models.dart';
import '../design_system/design_system.dart';
import 'echappee_page.dart';

/// « Étapes » : ajout manuel d'arrêts entre l'origine et la destination, avec
/// réordonnancement par glisser-déposer. La navigation route ENSUITE à travers
/// ces étapes (vrai tour-par-tour multi-legs via OSRM).
class EchappeeStopsScreen extends ConsumerStatefulWidget {
  const EchappeeStopsScreen({super.key});

  @override
  ConsumerState<EchappeeStopsScreen> createState() =>
      _EchappeeStopsScreenState();
}

class _EchappeeStopsScreenState extends ConsumerState<EchappeeStopsScreen> {
  final _searchController = TextEditingController();
  List<AddressSearchResult> _results = const [];
  bool _searching = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
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

  void _add(AddressSearchResult r) {
    ref.read(routePlannerProvider.notifier).addStop(r);
    _searchController.clear();
    setState(() => _results = const []);
  }

  @override
  Widget build(BuildContext context) {
    final planner = ref.watch(routePlannerProvider);
    final stops = planner.manualStops;
    final canNavigate = planner.isReady;
    return EchappeePage(
      child: Scaffold(
        appBar: AppBar(title: const Text('Étapes')),
        body: ListView(
          padding: const EdgeInsets.all(EchappeeSpacing.screen),
          children: [
            _endpoint(Icons.trip_origin, planner.originLabel ?? 'Ta position'),
            if (stops.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(
                    vertical: EchappeeSpacing.s12, horizontal: EchappeeSpacing.s8),
                child: Text(
                  'Aucune étape. Ajoute un arrêt ci-dessous : la navigation '
                  'passera par là dans l\'ordre.',
                  style: EchappeeTypography.bodySmall
                      .copyWith(color: EchappeeColors.textSecondary),
                ),
              )
            else
              ReorderableListView(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                buildDefaultDragHandles: false,
                // reorderStops applique la compensation d'index standard de
                // onReorder (cf. test) ; on garde ce callback éprouvé.
                // ignore: deprecated_member_use
                onReorder: (oldI, newI) =>
                    ref.read(routePlannerProvider.notifier).reorderStops(oldI, newI),
                children: [
                  for (var i = 0; i < stops.length; i++)
                    Card(
                      key: ValueKey('stop-$i-${stops[i].id}'),
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      child: ListTile(
                        leading: CircleAvatar(
                          radius: 14,
                          backgroundColor: EchappeeColors.primary,
                          child: Text('${i + 1}',
                              style: const TextStyle(
                                  color: EchappeeColors.surface,
                                  fontWeight: FontWeight.w700)),
                        ),
                        title: Text(stops[i].label, maxLines: 2),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              tooltip: 'Retirer',
                              icon: const Icon(Icons.close),
                              onPressed: () => ref
                                  .read(routePlannerProvider.notifier)
                                  .removeStopAt(i),
                            ),
                            ReorderableDragStartListener(
                              index: i,
                              child: const Icon(Icons.drag_handle),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            _endpoint(Icons.flag, planner.destinationLabel ?? 'Destination'),
            const SizedBox(height: EchappeeSpacing.s16),
            TextField(
              controller: _searchController,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Ajouter une étape (ville, adresse)…',
                prefixIcon: const Icon(Icons.add_location_alt_outlined),
                suffixIcon: _searching
                    ? const Padding(
                        padding: EdgeInsets.all(12),
                        child: SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2)),
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
                  leading: const Icon(Icons.place_outlined),
                  title: Text(r.label, maxLines: 2),
                  trailing: const Icon(Icons.add),
                  onTap: () => _add(r),
                ),
              ),
            const SizedBox(height: EchappeeSpacing.section),
            EchappeeButton(
              label: 'Démarrer la navigation',
              icon: Icons.navigation_rounded,
              onPressed:
                  canNavigate ? () => context.push('/echappee/navigation') : null,
            ),
          ],
        ),
      ),
    );
  }

  Widget _endpoint(IconData icon, String label) => Padding(
        padding: const EdgeInsets.symmetric(vertical: EchappeeSpacing.s4),
        child: Row(
          children: [
            Icon(icon, size: 18, color: EchappeeColors.primary),
            const SizedBox(width: EchappeeSpacing.s12),
            Expanded(
                child: Text(label,
                    style: EchappeeTypography.body
                        .copyWith(fontWeight: FontWeight.w600))),
          ],
        ),
      );
}
