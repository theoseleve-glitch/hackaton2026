import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../features/routing/presentation/route_planner_controller.dart';
import '../../../shared/models/models.dart';
import '../../terroir/domain/terroir_analytics.dart';
import '../design_system/design_system.dart';
import '../domain/echappee_itinerary.dart';
import 'echappee_page.dart';

export 'echappee_atelier.dart';
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
    final noHighway = _byMode(options, RouteMode.shortest);
    final eco = _byMode(options, RouteMode.eco);
    // L'échappée réelle : la route OSRM qui passe par les haltes choisies
    // sous budget détour. Honnêteté : sans halte qui vaille le détour, on ne
    // propose QUE les routes de base.
    final itineraryAsync = ref.watch(echappeeItineraryProvider);
    final itinerary = itineraryAsync.valueOrNull;
    final stops = itinerary?.stops ?? const <PoiAlongRoute>[];
    final hasEchappee = stops.isNotEmpty;
    final selectedId = planner.selectedOption?.id;

    // Péage estimé sur la route autoroute (metadata posée par le service).
    final toll = (fastest.metadata['tollEstimateEur'] as num?)?.toDouble();
    final fastestSubtitle = toll != null && toll > 0
        ? 'Autoroute · péage ~${toll.round()} €'
        : 'Le plus rapide';

    return ListView(
      padding: const EdgeInsets.all(EchappeeSpacing.screen),
      children: [
        EchappeeRouteOptionCard(
          title: 'Le plus rapide',
          duration: _formatDuration(fastest.durationSeconds),
          distance: _formatDistance(fastest.distanceMeters),
          subtitle: fastestSubtitle,
          selected: selectedId == fastest.id,
          onTap: () => notifier.selectOption(fastest),
        ),
        if (noHighway != null &&
            noHighway.metadata['noHighway'] == true) ...[
          const SizedBox(height: EchappeeSpacing.s12),
          EchappeeRouteOptionCard(
            title: 'Sans autoroute',
            duration: _formatDuration(noHighway.durationSeconds),
            distance: _formatDistance(noHighway.distanceMeters),
            subtitle: 'Zéro péage',
            selected: selectedId == noHighway.id,
            onTap: () => notifier.selectOption(noHighway),
          ),
        ],
        if (eco != null) ...[
          const SizedBox(height: EchappeeSpacing.s12),
          EchappeeRouteOptionCard(
            title: 'Éco',
            duration: _formatDuration(eco.durationSeconds),
            distance: _formatDistance(eco.distanceMeters),
            subtitle: eco.estimatedFuelLiters == null
                ? 'Conduite souple'
                : '${eco.estimatedFuelLiters} L · '
                    '${eco.estimatedCo2Kg} kg CO₂',
            selected: selectedId == eco.id,
            onTap: () => notifier.selectOption(eco),
          ),
        ],
        if (hasEchappee) ...[
          const SizedBox(height: EchappeeSpacing.s12),
          EchappeeRouteOptionCard(
            title: planner.surpriseMode ? 'La surprise' : 'L\'Échappée',
            duration: _formatDuration(itinerary!.route.durationSeconds),
            distance: _formatDistance(itinerary.route.distanceMeters),
            subtitle: planner.surpriseMode
                ? '${stops.first.poi.name} · +${itinerary.detourMinutes} min'
                : '${stops.length} haltes · +${itinerary.detourMinutes} min',
            isEchappee: true,
            selected: selectedId == itinerary.route.id,
            onTap: () => notifier.selectOption(itinerary.route),
          ),
        ] else if (itineraryAsync.isLoading) ...[
          const SizedBox(height: EchappeeSpacing.s16),
          const Center(child: EchappeeLoadingState(message: '')),
        ] else ...[
          const SizedBox(height: EchappeeSpacing.s16),
          Text(
            'Pas de halte qui vaille le détour ici — on te laisse '
            'la route directe.',
            style: EchappeeTypography.bodySmall
                .copyWith(color: EchappeeColors.textSecondary),
            textAlign: TextAlign.center,
          ),
        ],
        const SizedBox(height: EchappeeSpacing.s16),
        // Heure d'arrivée selon le départ choisi (maintenant ou différé).
        Builder(builder: (context) {
          final reference = planner.selectedOption ??
              (hasEchappee ? itinerary!.route : fastest);
          final departure = planner.departureAt ?? DateTime.now();
          final arrival = departure
              .add(Duration(seconds: reference.durationSeconds));
          final hh = arrival.hour.toString().padLeft(2, '0');
          final mm = arrival.minute.toString().padLeft(2, '0');
          final prefix = planner.departureAt == null
              ? 'Arrivée estimée'
              : 'Départ différé — arrivée estimée';
          return Center(
            child: Text(
              '$prefix · $hh:$mm',
              style: EchappeeTypography.bodySmall,
            ),
          );
        }),
        const SizedBox(height: EchappeeSpacing.section),
        EchappeeButton(
          label: 'Voir sur la carte',
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
                  Text('Choisis ta route.', style: EchappeeTypography.h2),
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
