import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../shared/models/models.dart';
import '../../analytics/domain/analytics_repository.dart'
    show AnalyticsEvents;

/// Holds the current planning session: origin/destination, selected mode,
/// computed options and the selected option. Shared by Home, Map,
/// RouteOptions and the product modules.
class RoutePlannerState {
  const RoutePlannerState({
    this.origin,
    this.destination,
    this.originLabel,
    this.destinationLabel,
    this.routeMode = RouteMode.fastest,
    this.maxDetourMinutes,
    this.preferredPoiCategories = const [],
    this.preferredPoiTags = const [],
    this.departureAt,
    this.surpriseMode = false,
    this.manualStops = const [],
    this.options = const AsyncValue.data([]),
    this.selectedOption,
  });

  final GeoPoint? origin;
  final GeoPoint? destination;
  final String? originLabel;
  final String? destinationLabel;
  final RouteMode routeMode;
  final int? maxDetourMinutes;
  final List<String> preferredPoiCategories;

  /// Affinity tags (mood vocabulary) refining the relevance scoring beyond
  /// the category filter — e.g. « vignoble » vs any producer.
  final List<String> preferredPoiTags;

  /// « Partir plus tard » : départ différé choisi par l'utilisateur
  /// (null = maintenant). Sert au calcul de l'heure d'arrivée et au filtre
  /// d'ouverture des haltes.
  final DateTime? departureAt;

  /// « Surprends-moi » : ignore le budget détour et choisit LA meilleure
  /// halte, quel que soit le temps, tant qu'on finit à destination.
  final bool surpriseMode;

  /// Étapes ajoutées MANUELLEMENT par l'utilisateur, dans l'ordre de passage
  /// (origine → manualStops → destination). La navigation route à travers
  /// elles (vrai tour-par-tour multi-legs).
  final List<AddressSearchResult> manualStops;

  final AsyncValue<List<RouteOption>> options;
  final RouteOption? selectedOption;

  bool get isReady => origin != null && destination != null;

  RoutePlannerState copyWith({
    GeoPoint? origin,
    GeoPoint? destination,
    String? originLabel,
    String? destinationLabel,
    RouteMode? routeMode,
    int? maxDetourMinutes,
    bool clearMaxDetour = false,
    List<String>? preferredPoiCategories,
    List<String>? preferredPoiTags,
    DateTime? departureAt,
    bool clearDeparture = false,
    bool? surpriseMode,
    List<AddressSearchResult>? manualStops,
    AsyncValue<List<RouteOption>>? options,
    RouteOption? selectedOption,
    bool clearSelection = false,
  }) =>
      RoutePlannerState(
        origin: origin ?? this.origin,
        destination: destination ?? this.destination,
        originLabel: originLabel ?? this.originLabel,
        destinationLabel: destinationLabel ?? this.destinationLabel,
        routeMode: routeMode ?? this.routeMode,
        // `??` cannot reset a nullable field, hence the explicit clear flag.
        maxDetourMinutes:
            clearMaxDetour ? null : (maxDetourMinutes ?? this.maxDetourMinutes),
        preferredPoiCategories:
            preferredPoiCategories ?? this.preferredPoiCategories,
        preferredPoiTags: preferredPoiTags ?? this.preferredPoiTags,
        departureAt:
            clearDeparture ? null : (departureAt ?? this.departureAt),
        surpriseMode: surpriseMode ?? this.surpriseMode,
        manualStops: manualStops ?? this.manualStops,
        options: options ?? this.options,
        selectedOption:
            clearSelection ? null : (selectedOption ?? this.selectedOption),
      );
}

class RoutePlannerController extends Notifier<RoutePlannerState> {
  // Monotonic id so a stale computeOptions() can never overwrite the result
  // of a newer one.
  int _computeSeq = 0;

  @override
  RoutePlannerState build() => const RoutePlannerState();

  void setOrigin(AddressSearchResult r) =>
      state = state.copyWith(origin: r.point, originLabel: r.label);

  void setDestination(AddressSearchResult r) =>
      state = state.copyWith(destination: r.point, destinationLabel: r.label);

  void setMode(RouteMode mode) => state = state.copyWith(routeMode: mode);

  void setMaxDetour(int? minutes) => state = minutes == null
      ? state.copyWith(clearMaxDetour: true)
      : state.copyWith(maxDetourMinutes: minutes);

  void setPreferredCategories(List<String> slugs) =>
      state = state.copyWith(preferredPoiCategories: slugs);

  void setPreferredTags(List<String> tags) =>
      state = state.copyWith(preferredPoiTags: tags);

  void setDeparture(DateTime? when) => state = when == null
      ? state.copyWith(clearDeparture: true)
      : state.copyWith(departureAt: when);

  void setSurpriseMode(bool enabled) =>
      state = state.copyWith(surpriseMode: enabled);

  void addStop(AddressSearchResult stop) =>
      state = state.copyWith(manualStops: [...state.manualStops, stop]);

  void removeStopAt(int index) {
    if (index < 0 || index >= state.manualStops.length) return;
    final next = [...state.manualStops]..removeAt(index);
    state = state.copyWith(manualStops: next);
  }

  /// Réordonne les étapes (ReorderableListView : retire à [oldIndex], insère
  /// à [newIndex] en compensant le décalage d'index).
  void reorderStops(int oldIndex, int newIndex) {
    final next = [...state.manualStops];
    if (oldIndex < 0 || oldIndex >= next.length) return;
    final item = next.removeAt(oldIndex);
    final target = newIndex > oldIndex ? newIndex - 1 : newIndex;
    next.insert(target.clamp(0, next.length), item);
    state = state.copyWith(manualStops: next);
  }

  void clearStops() => state = state.copyWith(manualStops: const []);

  void selectOption(RouteOption option) {
    state = state.copyWith(selectedOption: option);
    ref.read(analyticsRepositoryProvider).logEvent(
      AnalyticsEvents.routeOptionSelected,
      properties: {'mode': option.routeMode.name, 'provider': option.provider},
    );
  }

  Future<void> computeOptions() async {
    if (!state.isReady) return;
    final seq = ++_computeSeq;
    state = state.copyWith(
        options: const AsyncValue.loading(), clearSelection: true);
    await ref.read(analyticsRepositoryProvider).logEvent(
      AnalyticsEvents.routeSearchStarted,
      properties: {'mode': state.routeMode.name},
    );
    try {
      final request = RouteRequest(
        origin: state.origin!,
        destination: state.destination!,
        routeMode: state.routeMode,
        maxDetourMinutes: state.maxDetourMinutes,
        preferredPoiCategories: state.preferredPoiCategories.isEmpty
            ? null
            : state.preferredPoiCategories,
      );
      final options =
          await ref.read(routingServiceProvider).getRouteOptions(request);
      if (seq != _computeSeq) return; // superseded by a newer request
      state = state.copyWith(options: AsyncValue.data(options));
    } catch (e, st) {
      if (seq != _computeSeq) return;
      state = state.copyWith(options: AsyncValue.error(e, st));
    }
  }
}

final routePlannerProvider =
    NotifierProvider<RoutePlannerController, RoutePlannerState>(
        RoutePlannerController.new);
