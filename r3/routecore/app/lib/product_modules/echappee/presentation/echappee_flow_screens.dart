import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../features/routing/presentation/route_planner_controller.dart';
import '../../../shared/models/models.dart';
import '../../terroir/domain/terroir_analytics.dart';
import '../../terroir/presentation/terroir_screens.dart'
    show terroirRankedPoisProvider;
import '../design_system/design_system.dart';
import 'echappee_page.dart';

export 'echappee_onboarding_login_screens.dart';

/// Titre Fraunces h1 avec UN mot accentué en Clay Red italique.
Widget _accentTitle(String before, String accent, String after) {
  const style = EchappeeTypography.h1;
  return Text.rich(
    TextSpan(style: style, children: [
      TextSpan(text: before),
      TextSpan(
        text: accent,
        style: style.copyWith(
            color: EchappeeColors.primary, fontStyle: FontStyle.italic),
      ),
      TextSpan(text: after),
    ]),
  );
}

/// Envies du moment : (slug planner, libellé, icône, couleur de marque).
const _categories = <(String, String, IconData, Color)>[
  ('producer', 'Producteurs', Icons.agriculture,
      EchappeeColors.categoryProducteurs),
  ('market', 'Marchés', Icons.storefront, EchappeeColors.categoryMarches),
  ('village', 'Villages', Icons.church, EchappeeColors.categoryVillages),
  ('artisan', 'Artisans', Icons.handyman, EchappeeColors.categoryArtisans),
  ('viewpoint', 'Points de vue', Icons.landscape,
      EchappeeColors.categoryPointsDeVue),
  ('restaurant', 'Bonnes tables', Icons.restaurant,
      EchappeeColors.categoryBonnesTables),
  ('nature', 'Nature', Icons.park, EchappeeColors.categoryNature),
  ('event', 'Événements', Icons.celebration,
      EchappeeColors.categoryEvenements),
];

/// 01 — Accueil : départ/destination avec autosuggestion (debounce 300 ms).
class EchappeeHomeScreen extends ConsumerStatefulWidget {
  const EchappeeHomeScreen({super.key});

  @override
  ConsumerState<EchappeeHomeScreen> createState() =>
      _EchappeeHomeScreenState();
}

class _EchappeeHomeScreenState extends ConsumerState<EchappeeHomeScreen> {
  final _originController = TextEditingController();
  final _destinationController = TextEditingController();
  List<AddressSearchResult> _originSuggestions = const [];
  List<AddressSearchResult> _destinationSuggestions = const [];
  Timer? _debounce;
  int _searchSeq = 0; // Compteur monotone : ignore les réponses obsolètes.

  @override
  void dispose() {
    _debounce?.cancel();
    _originController.dispose();
    _destinationController.dispose();
    super.dispose();
  }

  void _setSuggestions(List<AddressSearchResult> results,
      {required bool isOrigin}) {
    if (isOrigin) {
      _originSuggestions = results;
    } else {
      _destinationSuggestions = results;
    }
  }

  void _onQueryChanged(String value, {required bool isOrigin}) {
    _debounce?.cancel();
    final seq = ++_searchSeq;
    final query = value.trim();
    if (query.isEmpty) {
      setState(() => _setSuggestions(const [], isOrigin: isOrigin));
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      final results =
          await ref.read(mapSearchServiceProvider).searchAddress(query);
      if (!mounted || seq != _searchSeq) return;
      setState(() => _setSuggestions(results, isOrigin: isOrigin));
    });
  }

  void _selectSuggestion(AddressSearchResult result, {required bool isOrigin}) {
    _debounce?.cancel();
    _searchSeq++;
    final notifier = ref.read(routePlannerProvider.notifier);
    if (isOrigin) {
      notifier.setOrigin(result);
      _originController.text = result.label;
    } else {
      notifier.setDestination(result);
      _destinationController.text = result.label;
    }
    setState(() => _setSuggestions(const [], isOrigin: isOrigin));
  }

  void _startEchappee() {
    ref.read(routePlannerProvider.notifier).setMode(RouteMode.discovery);
    context.push('/echappee/detour');
  }

  Widget _suggestions(List<AddressSearchResult> results,
      {required bool isOrigin}) {
    if (results.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        for (final result in results)
          ListTile(
            dense: true,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: EchappeeSpacing.s8),
            leading: const Icon(Icons.place_outlined,
                size: 18, color: EchappeeColors.textSecondary),
            title: Text(result.label, style: EchappeeTypography.body),
            onTap: () => _selectSuggestion(result, isOrigin: isOrigin),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final planner = ref.watch(routePlannerProvider);
    return EchappeePage(
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          leading: const Center(child: EchappeeLogo(size: 32)),
          actions: [
            IconButton(
              icon: const Icon(Icons.settings_outlined),
              tooltip: 'Réglages',
              onPressed: () => context.push('/settings'),
            ),
          ],
        ),
        body: ListView(
          padding: const EdgeInsets.all(EchappeeSpacing.screen),
          children: [
            const EchappeeEyebrow('Le GPS des routes qui respirent'),
            const SizedBox(height: EchappeeSpacing.s12),
            _accentTitle('Où vas-tu ', 'aujourd\'hui', ' ?'),
            const SizedBox(height: EchappeeSpacing.s12),
            Text(
              'On te trouve les plus belles haltes autour de ta route.',
              style: EchappeeTypography.body
                  .copyWith(color: EchappeeColors.textSecondary),
            ),
            const SizedBox(height: EchappeeSpacing.section),
            Container(
              padding: const EdgeInsets.all(EchappeeSpacing.cardLoose),
              decoration: const BoxDecoration(
                color: EchappeeColors.surface,
                borderRadius: EchappeeRadius.xlAll,
                boxShadow: EchappeeShadows.sm,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const EchappeeEyebrow('01 — Destination'),
                  const SizedBox(height: EchappeeSpacing.s16),
                  EchappeeRouteField(
                    label: 'Départ',
                    hint: 'D\'où pars-tu ?',
                    controller: _originController,
                    icon: Icons.trip_origin,
                    onChanged: (value) =>
                        _onQueryChanged(value, isOrigin: true),
                  ),
                  _suggestions(_originSuggestions, isOrigin: true),
                  const SizedBox(height: EchappeeSpacing.s16),
                  EchappeeRouteField(
                    label: 'Destination',
                    hint: 'Où veux-tu aller ?',
                    controller: _destinationController,
                    onChanged: (value) =>
                        _onQueryChanged(value, isOrigin: false),
                  ),
                  _suggestions(_destinationSuggestions, isOrigin: false),
                  const SizedBox(height: EchappeeSpacing.s24),
                  EchappeeButton(
                    label: 'Créer mon échappée',
                    icon: Icons.east,
                    onPressed: planner.isReady ? _startEchappee : null,
                  ),
                ],
              ),
            ),
            const SizedBox(height: EchappeeSpacing.section),
            const Center(
              child: Text(
                '2 400 lieux choisis à la main · +12 min en moyenne',
                style: EchappeeTypography.bodySmall,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 02 — Le détour : « Combien de temps veux-tu t'offrir ? ».
class EchappeeDetourScreen extends ConsumerStatefulWidget {
  const EchappeeDetourScreen({super.key});

  @override
  ConsumerState<EchappeeDetourScreen> createState() =>
      _EchappeeDetourScreenState();
}

class _EchappeeDetourScreenState extends ConsumerState<EchappeeDetourScreen> {
  int _selectedIndex = 1; // Défaut : « 25 min — Je prends le temps ».

  void _select(int index, EchappeeDetourOption option) {
    setState(() => _selectedIndex = index);
    ref.read(routePlannerProvider.notifier).setMaxDetour(option.minutes ?? 45);
  }

  void _continue() {
    final option = EchappeeDetourOption.presets[_selectedIndex];
    ref.read(routePlannerProvider.notifier).setMaxDetour(option.minutes ?? 45);
    context.push('/echappee/categories');
  }

  @override
  Widget build(BuildContext context) {
    const presets = EchappeeDetourOption.presets;
    return EchappeePage(
      child: Scaffold(
        appBar: AppBar(),
        body: ListView(
          padding: const EdgeInsets.all(EchappeeSpacing.screen),
          children: [
            const EchappeeEyebrow('02 — Combien de temps ?'),
            const SizedBox(height: EchappeeSpacing.s12),
            _accentTitle('Combien de temps veux-tu ', 't\'offrir', ' ?'),
            const SizedBox(height: EchappeeSpacing.section),
            for (var i = 0; i < presets.length; i++) ...[
              if (i > 0) const SizedBox(height: EchappeeSpacing.s12),
              EchappeeDetourCard(
                option: presets[i],
                selected: i == _selectedIndex,
                onTap: () => _select(i, presets[i]),
              ),
            ],
            const SizedBox(height: EchappeeSpacing.section),
            EchappeeButton(label: 'Voir les détours', onPressed: _continue),
          ],
        ),
      ),
    );
  }
}

/// 03 — L'humeur : les envies du moment, en sélection multiple.
class EchappeeCategoriesScreen extends ConsumerStatefulWidget {
  const EchappeeCategoriesScreen({super.key});

  @override
  ConsumerState<EchappeeCategoriesScreen> createState() =>
      _EchappeeCategoriesScreenState();
}

class _EchappeeCategoriesScreenState
    extends ConsumerState<EchappeeCategoriesScreen> {
  final Set<String> _selectedSlugs = {};
  bool _computing = false;

  void _toggle(String slug, bool selected) {
    setState(() =>
        selected ? _selectedSlugs.add(slug) : _selectedSlugs.remove(slug));
    ref
        .read(routePlannerProvider.notifier)
        .setPreferredCategories(_selectedSlugs.toList());
  }

  Future<void> _findEchappee() async {
    final notifier = ref.read(routePlannerProvider.notifier);
    notifier.setMode(RouteMode.discovery);
    setState(() => _computing = true);
    await notifier.computeOptions();
    final planner = ref.read(routePlannerProvider);
    await ref.read(analyticsRepositoryProvider).logEvent(
      TerroirAnalyticsEvents.routeGenerated,
      productContext: ProductContext.terroir,
      properties: {
        'maxDetourMinutes': planner.maxDetourMinutes,
        'categories': _selectedSlugs.toList(),
      },
    );
    if (!mounted) return;
    setState(() => _computing = false);
    context.push('/echappee/routes');
  }

  @override
  Widget build(BuildContext context) {
    return EchappeePage(
      child: Scaffold(
        appBar: AppBar(),
        body: ListView(
          padding: const EdgeInsets.all(EchappeeSpacing.screen),
          children: [
            const EchappeeEyebrow('03 — Ton humeur'),
            const SizedBox(height: EchappeeSpacing.s12),
            _accentTitle(
                'Qu\'est-ce qui te ferait ', 'plaisir', ' en chemin ?'),
            const SizedBox(height: EchappeeSpacing.section),
            Wrap(
              spacing: EchappeeSpacing.s8,
              runSpacing: EchappeeSpacing.s8,
              children: [
                for (final (slug, label, icon, color) in _categories)
                  EchappeeCategoryChip(
                    label: label,
                    icon: icon,
                    color: color,
                    selected: _selectedSlugs.contains(slug),
                    onSelected: (selected) => _toggle(slug, selected),
                  ),
              ],
            ),
            const SizedBox(height: EchappeeSpacing.section),
            EchappeeButton(
              label: 'Trouver mon échappée',
              loading: _computing,
              onPressed: _computing ? null : _findEchappee,
            ),
          ],
        ),
      ),
    );
  }
}

/// 04 — Ta route : trajet direct vs échappée recommandée.
class EchappeeRouteOptionsScreen extends ConsumerWidget {
  const EchappeeRouteOptionsScreen({super.key});

  RouteOption? _byMode(List<RouteOption> options, RouteMode mode) {
    for (final option in options) {
      if (option.routeMode == mode) return option;
    }
    return null;
  }

  String _formatDuration(int seconds) {
    // 8040 s -> '2h14' ; 2700 s -> '45 min'.
    final totalMinutes = (seconds / 60).round();
    final hours = totalMinutes ~/ 60;
    final minutes = totalMinutes % 60;
    if (hours == 0) return '$minutes min';
    return '${hours}h${minutes.toString().padLeft(2, '0')}';
  }

  String _formatDistance(int meters) => '${(meters / 1000).round()} km';

  Widget _options(
    BuildContext context,
    WidgetRef ref,
    RoutePlannerState planner,
    List<RouteOption> options,
  ) {
    final notifier = ref.read(routePlannerProvider.notifier);
    if (options.isEmpty) {
      return EchappeeEmptyState(
        title: 'Pas de route trouvée par ici.',
        message: 'Essaie d\'ajuster ton départ ou ta destination.',
        actionLabel: 'Réessayer',
        onAction: notifier.computeOptions,
      );
    }
    final fastest = _byMode(options, RouteMode.fastest) ?? options.first;
    final echappee = _byMode(options, RouteMode.discovery) ??
        _byMode(options, RouteMode.eco) ??
        options.first;
    final stops =
        ref.watch(terroirRankedPoisProvider).valueOrNull ?? const [];
    final detourMinutes = stops
        .fold<double>(0, (sum, stop) => sum + stop.detourMinutesEstimate)
        .round();
    final selectedId = planner.selectedOption?.id;
    return ListView(
      padding: const EdgeInsets.all(EchappeeSpacing.screen),
      children: [
        EchappeeRouteOptionCard(
          title: 'Trajet direct',
          duration: _formatDuration(fastest.durationSeconds),
          distance: _formatDistance(fastest.distanceMeters),
          subtitle: 'Le plus rapide',
          selected: selectedId == fastest.id,
          onTap: () => notifier.selectOption(fastest),
        ),
        const SizedBox(height: EchappeeSpacing.s12),
        EchappeeRouteOptionCard(
          title: 'Échappée recommandée',
          duration: _formatDuration(echappee.durationSeconds),
          distance: _formatDistance(echappee.distanceMeters),
          subtitle: '${stops.length} haltes · +$detourMinutes min',
          isEchappee: true,
          selected: selectedId == echappee.id,
          onTap: () => notifier.selectOption(echappee),
        ),
        const SizedBox(height: EchappeeSpacing.s16),
        Center(
          child: Text(
            'Trajet total estimé · '
            '${_formatDuration(echappee.durationSeconds)}'
            ' + $detourMinutes min',
            style: EchappeeTypography.bodySmall,
            textAlign: TextAlign.center,
          ),
        ),
        const SizedBox(height: EchappeeSpacing.section),
        EchappeeButton(
          label: 'Choisir cette échappée',
          onPressed: planner.selectedOption == null
              ? null
              : () => context.push('/echappee/map'),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final planner = ref.watch(routePlannerProvider);
    return EchappeePage(
      child: Scaffold(
        appBar: AppBar(),
        body: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Padding(
              padding:
                  EdgeInsets.symmetric(horizontal: EchappeeSpacing.screen),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  EchappeeEyebrow('04 — Ta route'),
                  SizedBox(height: EchappeeSpacing.s12),
                  Text('Deux façons d\'y aller', style: EchappeeTypography.h2),
                ],
              ),
            ),
            Expanded(
              child: planner.options.when(
                loading: () => const Center(child: EchappeeLoadingState()),
                error: (error, _) => EchappeeEmptyState(
                  title: 'Oups, la route s\'est dérobée.',
                  message: '$error',
                  actionLabel: 'Réessayer',
                  onAction:
                      ref.read(routePlannerProvider.notifier).computeOptions,
                ),
                data: (options) => _options(context, ref, planner, options),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
