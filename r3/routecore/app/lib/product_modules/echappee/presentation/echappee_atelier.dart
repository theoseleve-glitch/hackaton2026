import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../features/routing/presentation/route_planner_controller.dart';
import '../../../shared/models/models.dart';
import '../../terroir/presentation/terroir_screens.dart'
    show terroirRankedPoisProvider;
import '../design_system/design_system.dart';
import '../domain/echappee_carnets.dart';
import '../domain/echappee_moods.dart';
import 'echappee_carnets_section.dart';
import 'echappee_page.dart';

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

/// L'ATELIER une-page : destination, détour, humeur et estimation live sur un
/// seul écran — fidèle à la landing validée. Les Carnets de route préremplis
/// permettent de rejouer une échappée éditorialisée en un tap.
class EchappeeHomeScreen extends ConsumerStatefulWidget {
  const EchappeeHomeScreen({super.key});

  @override
  ConsumerState<EchappeeHomeScreen> createState() =>
      _EchappeeHomeScreenState();
}

class _EchappeeHomeScreenState extends ConsumerState<EchappeeHomeScreen> {
  static const int _detourMin = 5;
  static const int _detourMax = 120;
  static const int _detourDivisions = 23;
  static const int _detourDefault = 45;
  static const int _pauseMaxMinutes = 25;
  static const int _afternoonMaxMinutes = 70;
  static const _searchDebounceDelay = Duration(milliseconds: 300);
  static const _computeDebounceDelay = Duration(milliseconds: 800);

  final _originController = TextEditingController();
  final _destinationController = TextEditingController();
  List<AddressSearchResult> _originSuggestions = const [];
  List<AddressSearchResult> _destinationSuggestions = const [];
  Timer? _searchDebounce;
  Timer? _computeDebounce;
  int _searchSeq = 0; // Compteur monotone : ignore les réponses obsolètes.
  int _detourMinutes = _detourDefault;
  final Set<String> _moodIds = {};

  @override
  void initState() {
    super.initState();
    final planner = ref.read(routePlannerProvider);
    _detourMinutes = (planner.maxDetourMinutes ?? _detourDefault)
        .clamp(_detourMin, _detourMax)
        .toInt();
    if (planner.maxDetourMinutes == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ref.read(routePlannerProvider.notifier).setMaxDetour(_detourMinutes);
      });
    }
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _computeDebounce?.cancel();
    _originController.dispose();
    _destinationController.dispose();
    super.dispose();
  }

  // -- 01 · Destination -------------------------------------------------------

  void _setSuggestions(List<AddressSearchResult> results,
      {required bool isOrigin}) {
    if (isOrigin) {
      _originSuggestions = results;
    } else {
      _destinationSuggestions = results;
    }
  }

  void _onQueryChanged(String value, {required bool isOrigin}) {
    _searchDebounce?.cancel();
    final seq = ++_searchSeq;
    final query = value.trim();
    if (query.isEmpty) {
      setState(() => _setSuggestions(const [], isOrigin: isOrigin));
      return;
    }
    _searchDebounce = Timer(_searchDebounceDelay, () async {
      final results =
          await ref.read(mapSearchServiceProvider).searchAddress(query);
      if (!mounted || seq != _searchSeq) return;
      setState(() => _setSuggestions(results, isOrigin: isOrigin));
    });
  }

  void _selectSuggestion(AddressSearchResult result, {required bool isOrigin}) {
    _searchDebounce?.cancel();
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
    _scheduleEstimation();
  }

  /// Dès que les deux champs sont choisis : mode découverte + estimation live
  /// (debounce 800 ms pour ne pas recalculer à chaque retouche).
  void _scheduleEstimation() {
    final notifier = ref.read(routePlannerProvider.notifier);
    if (!ref.read(routePlannerProvider).isReady) return;
    notifier.setMode(RouteMode.discovery);
    _computeDebounce?.cancel();
    _computeDebounce = Timer(_computeDebounceDelay, () {
      if (!mounted) return;
      ref.read(routePlannerProvider.notifier).computeOptions();
    });
  }

  // -- 02 · Détour --------------------------------------------------------------

  int get _zoneIndex => _detourMinutes <= _pauseMaxMinutes
      ? 0
      : _detourMinutes <= _afternoonMaxMinutes
          ? 1
          : 2;

  void _onDetourChanged(double value) {
    setState(() => _detourMinutes = value.round());
    ref.read(routePlannerProvider.notifier).setMaxDetour(_detourMinutes);
  }

  // -- 03 · Humeur --------------------------------------------------------------

  void _toggleMood(String moodId, bool selected) {
    setState(
        () => selected ? _moodIds.add(moodId) : _moodIds.remove(moodId));
    ref
        .read(routePlannerProvider.notifier)
        .setPreferredCategories(EchappeeMood.slugsFor(_moodIds));
  }

  // -- Actions -------------------------------------------------------------------

  void _createEchappee() {
    // Flush l'estimation en attente pour arriver sur des routes fraîches.
    if (_computeDebounce?.isActive ?? false) {
      _computeDebounce!.cancel();
      ref.read(routePlannerProvider.notifier).computeOptions();
    }
    context.push('/echappee/routes');
  }

  void _applyCarnet(EchappeeCarnet carnet) {
    _searchDebounce?.cancel();
    _computeDebounce?.cancel();
    _searchSeq++;
    final notifier = ref.read(routePlannerProvider.notifier);
    notifier.setOrigin(AddressSearchResult(
      id: 'carnet',
      label: carnet.originLabel,
      latitude: carnet.origin.latitude,
      longitude: carnet.origin.longitude,
      provider: 'carnet',
    ));
    notifier.setDestination(AddressSearchResult(
      id: 'carnet',
      label: carnet.destinationLabel,
      latitude: carnet.destination.latitude,
      longitude: carnet.destination.longitude,
      provider: 'carnet',
    ));
    notifier.setMaxDetour(carnet.detourMinutes);
    notifier
        .setPreferredCategories(EchappeeMood.slugsFor(carnet.moodIds.toSet()));
    notifier.setMode(RouteMode.discovery);
    notifier.computeOptions();
    setState(() {
      _originController.text = carnet.originLabel;
      _destinationController.text = carnet.destinationLabel;
      _detourMinutes =
          carnet.detourMinutes.clamp(_detourMin, _detourMax).toInt();
      _moodIds
        ..clear()
        ..addAll(carnet.moodIds);
      _originSuggestions = const [];
      _destinationSuggestions = const [];
    });
    context.push('/echappee/routes');
  }

  // -- Helpers d'affichage ---------------------------------------------------------

  /// 8040 s -> '2h14' ; 2700 s -> '45 min'.
  String _formatDuration(int seconds) {
    final totalMinutes = (seconds / 60).round();
    final hours = totalMinutes ~/ 60;
    final minutes = totalMinutes % 60;
    if (hours == 0) return '$minutes min';
    return '${hours}h${minutes.toString().padLeft(2, '0')}';
  }

  RouteOption? _fastestOption(List<RouteOption>? options) {
    if (options == null || options.isEmpty) return null;
    for (final option in options) {
      if (option.routeMode == RouteMode.fastest) return option;
    }
    return options.first;
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

  // -- Sections de la card atelier ---------------------------------------------------

  Widget _sectionDivider() {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: EchappeeSpacing.s20),
      child: Divider(height: 1, color: EchappeeColors.border),
    );
  }

  Widget _destinationSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const EchappeeEyebrow('01 · Destination'),
        const SizedBox(height: EchappeeSpacing.s16),
        EchappeeRouteField(
          label: 'Départ',
          hint: 'Ta position actuelle',
          controller: _originController,
          icon: Icons.trip_origin,
          onChanged: (value) => _onQueryChanged(value, isOrigin: true),
        ),
        _suggestions(_originSuggestions, isOrigin: true),
        const SizedBox(height: EchappeeSpacing.s16),
        EchappeeRouteField(
          label: 'Destination',
          hint: 'Où veux-tu aller ?',
          controller: _destinationController,
          onChanged: (value) => _onQueryChanged(value, isOrigin: false),
        ),
        _suggestions(_destinationSuggestions, isOrigin: false),
      ],
    );
  }

  Widget _zoneLabel(String label, int zone) {
    final active = zone == _zoneIndex;
    return Text(
      label,
      style: EchappeeTypography.caption.copyWith(
        color:
            active ? EchappeeColors.primary : EchappeeColors.textSecondary,
        fontWeight: active ? FontWeight.w600 : FontWeight.w500,
      ),
    );
  }

  Widget _detourSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const Expanded(
              child: EchappeeEyebrow('02 · Combien de temps t\'offres-tu ?'),
            ),
            const SizedBox(width: EchappeeSpacing.s12),
            Text(
              '+ $_detourMinutes min',
              style: EchappeeTypography.h2
                  .copyWith(color: EchappeeColors.primary),
            ),
          ],
        ),
        const SizedBox(height: EchappeeSpacing.s8),
        SliderTheme(
          data: SliderTheme.of(context).copyWith(
            activeTrackColor: EchappeeColors.primary,
            inactiveTrackColor: EchappeeColors.border,
            thumbColor: EchappeeColors.primary,
            overlayColor: EchappeeColors.primaryTint,
          ),
          child: Slider(
            value: _detourMinutes.toDouble(),
            min: _detourMin.toDouble(),
            max: _detourMax.toDouble(),
            divisions: _detourDivisions,
            onChanged: _onDetourChanged,
          ),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _zoneLabel('Une pause', 0),
            _zoneLabel('Une après-midi', 1),
            _zoneLabel('Une journée', 2),
          ],
        ),
      ],
    );
  }

  Widget _moodSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const EchappeeEyebrow('03 · Ton humeur'),
        const SizedBox(height: EchappeeSpacing.s16),
        Wrap(
          spacing: EchappeeSpacing.s8,
          runSpacing: EchappeeSpacing.s8,
          children: [
            for (final mood in EchappeeMood.all)
              EchappeeCategoryChip(
                label: mood.label,
                icon: mood.icon,
                color: mood.color,
                selected: _moodIds.contains(mood.id),
                onSelected: (selected) => _toggleMood(mood.id, selected),
              ),
          ],
        ),
      ],
    );
  }

  Widget _estimationSection(RoutePlannerState planner) {
    final stops = planner.isReady
        ? ref.watch(terroirRankedPoisProvider).valueOrNull?.length
        : null;
    final fastest = _fastestOption(planner.options.valueOrNull);
    final duration =
        fastest == null ? '…' : _formatDuration(fastest.durationSeconds);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '~ ${stops?.toString() ?? '…'} arrêts choisis',
          style: EchappeeTypography.h3,
        ),
        const SizedBox(height: EchappeeSpacing.s4),
        Text(
          'Trajet total estimé · $duration + $_detourMinutes min',
          style: EchappeeTypography.bodySmall
              .copyWith(color: EchappeeColors.textSecondary),
        ),
        const SizedBox(height: EchappeeSpacing.s20),
        EchappeeButton(
          label: 'Créer mon échappée',
          icon: Icons.east,
          onPressed: planner.isReady ? _createEchappee : null,
        ),
      ],
    );
  }

  Widget _atelierCard(RoutePlannerState planner) {
    return Container(
      padding: const EdgeInsets.all(EchappeeSpacing.cardLoose),
      decoration: const BoxDecoration(
        color: EchappeeColors.surface,
        borderRadius: EchappeeRadius.xlAll,
        boxShadow: EchappeeShadows.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _destinationSection(),
          _sectionDivider(),
          _detourSection(),
          _sectionDivider(),
          _moodSection(),
          _sectionDivider(),
          _estimationSection(planner),
        ],
      ),
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
            _accentTitle('Combien de temps veux-tu ', 't\'offrir', ' ?'),
            const SizedBox(height: EchappeeSpacing.s12),
            Text(
              'Quelques minutes de détour, une boulangerie qui sent bon, '
              'un point de vue oublié — l\'itinéraire dessine ton humeur, '
              'pas l\'inverse.',
              style: EchappeeTypography.body
                  .copyWith(color: EchappeeColors.textSecondary),
            ),
            const SizedBox(height: EchappeeSpacing.section),
            _atelierCard(planner),
            const SizedBox(height: EchappeeSpacing.section),
            EchappeeCarnetsSection(onCarnetTap: _applyCarnet),
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
