import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../shared/models/models.dart';
import 'route_planner_controller.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final planner = ref.watch(routePlannerProvider);
    final mode = ref.watch(productModeProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('RouteCore'),
        actions: [
          IconButton(
            icon: const Icon(Icons.place),
            tooltip: 'POI proches',
            onPressed: () => context.push('/pois'),
          ),
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () => context.push('/settings'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (mode != ProductContext.common)
            Card(
              child: ListTile(
                leading: Icon(mode == ProductContext.terroir
                    ? Icons.local_florist
                    : Icons.eco),
                title: Text(mode == ProductContext.terroir
                    ? 'Mode Terroir — trajets de découverte locale'
                    : 'Mode Écoconduite — trajets sobres'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.push(mode == ProductContext.terroir
                    ? '/terroir/plan'
                    : '/ecodrive/compare'),
              ),
            ),
          const SizedBox(height: 8),
          _AddressField(
            label: 'Départ',
            currentLabel: planner.originLabel,
            onSelected: (r) =>
                ref.read(routePlannerProvider.notifier).setOrigin(r),
          ),
          const SizedBox(height: 12),
          _AddressField(
            label: 'Destination',
            currentLabel: planner.destinationLabel,
            onSelected: (r) =>
                ref.read(routePlannerProvider.notifier).setDestination(r),
          ),
          const SizedBox(height: 16),
          SegmentedButton<RouteMode>(
            segments: const [
              ButtonSegment(value: RouteMode.fastest, label: Text('Rapide')),
              ButtonSegment(
                  value: RouteMode.discovery, label: Text('Découverte')),
              ButtonSegment(value: RouteMode.eco, label: Text('Éco')),
            ],
            selected: {
              planner.routeMode == RouteMode.shortest
                  ? RouteMode.fastest
                  : planner.routeMode
            },
            onSelectionChanged: (s) =>
                ref.read(routePlannerProvider.notifier).setMode(s.first),
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            icon: const Icon(Icons.alt_route),
            label: const Text('Calculer un trajet'),
            onPressed: planner.isReady
                ? () async {
                    await ref
                        .read(routePlannerProvider.notifier)
                        .computeOptions();
                    if (context.mounted) context.push('/route-options');
                  }
                : null,
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            icon: const Icon(Icons.map),
            label: const Text('Voir la carte'),
            onPressed: () => context.push('/map'),
          ),
        ],
      ),
    );
  }
}

/// Search field with debounced suggestions from MapSearchService.
class _AddressField extends ConsumerStatefulWidget {
  const _AddressField({
    required this.label,
    required this.onSelected,
    this.currentLabel,
  });

  final String label;
  final String? currentLabel;
  final ValueChanged<AddressSearchResult> onSelected;

  @override
  ConsumerState<_AddressField> createState() => _AddressFieldState();
}

class _AddressFieldState extends ConsumerState<_AddressField> {
  final _controller = TextEditingController();
  List<AddressSearchResult> _results = [];

  @override
  void initState() {
    super.initState();
    if (widget.currentLabel != null) _controller.text = widget.currentLabel!;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _search(String query) async {
    final results =
        await ref.read(mapSearchServiceProvider).searchAddress(query);
    if (mounted) setState(() => _results = results);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: _controller,
          decoration: InputDecoration(
            labelText: widget.label,
            prefixIcon: const Icon(Icons.search),
          ),
          onChanged: _search,
        ),
        for (final r in _results)
          ListTile(
            dense: true,
            leading: const Icon(Icons.location_on, size: 18),
            title: Text(r.label),
            onTap: () {
              widget.onSelected(r);
              _controller.text = r.label;
              setState(() => _results = []);
            },
          ),
      ],
    );
  }
}
