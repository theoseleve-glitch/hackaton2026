import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/product_registry.dart';
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
          // Neutral: the card comes from the product registry (assembly
          // layer), the core screen knows nothing about specific products.
          if (productEntryFor(mode) case final ProductHomeEntry entry)
            Card(
              child: ListTile(
                leading: Icon(entry.icon),
                title: Text(entry.title),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.push(entry.route),
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
  Timer? _debounce;
  int _searchSeq = 0; // drop out-of-order responses

  @override
  void initState() {
    super.initState();
    if (widget.currentLabel != null) _controller.text = widget.currentLabel!;
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String query) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () => _search(query));
  }

  Future<void> _search(String query) async {
    final seq = ++_searchSeq;
    final results =
        await ref.read(mapSearchServiceProvider).searchAddress(query);
    if (mounted && seq == _searchSeq) setState(() => _results = results);
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
          onChanged: _onChanged,
        ),
        for (final r in _results)
          ListTile(
            dense: true,
            leading: const Icon(Icons.location_on, size: 18),
            title: Text(r.label),
            onTap: () {
              // Cancel any pending debounce so a stale search can't reopen
              // the suggestion list after selection.
              _debounce?.cancel();
              _searchSeq++;
              widget.onSelected(r);
              _controller.text = r.label;
              setState(() => _results = []);
            },
          ),
      ],
    );
  }
}
