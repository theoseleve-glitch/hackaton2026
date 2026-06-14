import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/features/routing/presentation/route_planner_controller.dart';
import 'package:routecore/shared/models/models.dart';

void main() {
  AddressSearchResult stop(String id) => AddressSearchResult(
      id: id, label: id, latitude: 45.0, longitude: 4.0, provider: 'test');

  List<String> labels(ProviderContainer c) =>
      c.read(routePlannerProvider).manualStops.map((s) => s.label).toList();

  ProviderContainer make() {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final n = c.read(routePlannerProvider.notifier);
    n
      ..addStop(stop('a'))
      ..addStop(stop('b'))
      ..addStop(stop('c'));
    return c;
  }

  group('RoutePlannerController étapes manuelles', () {
    test('addStop ajoute dans l\'ordre', () {
      expect(labels(make()), ['a', 'b', 'c']);
    });

    test('removeStopAt retire la bonne étape', () {
      final c = make();
      c.read(routePlannerProvider.notifier).removeStopAt(1);
      expect(labels(c), ['a', 'c']);
    });

    test('removeStopAt hors bornes ne fait rien', () {
      final c = make();
      c.read(routePlannerProvider.notifier)
        ..removeStopAt(-1)
        ..removeStopAt(9);
      expect(labels(c), ['a', 'b', 'c']);
    });

    test('reorderStops vers le bas (compensation d\'index onReorder)', () {
      final c = make();
      // déplacer 'a' (0) tout en bas : onReorder(0, 3) -> [b, c, a]
      c.read(routePlannerProvider.notifier).reorderStops(0, 3);
      expect(labels(c), ['b', 'c', 'a']);
    });

    test('reorderStops vers le haut', () {
      final c = make();
      // déplacer 'c' (2) en tête : onReorder(2, 0) -> [c, a, b]
      c.read(routePlannerProvider.notifier).reorderStops(2, 0);
      expect(labels(c), ['c', 'a', 'b']);
    });

    test('clearStops vide la liste', () {
      final c = make();
      c.read(routePlannerProvider.notifier).clearStops();
      expect(labels(c), isEmpty);
    });
  });
}
