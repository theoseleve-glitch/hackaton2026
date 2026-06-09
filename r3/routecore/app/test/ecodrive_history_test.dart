import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/product_modules/ecodrive/application/eco_history.dart';
import 'package:routecore/product_modules/ecodrive/domain/eco_vehicle_type.dart';

EcoTripRecord _rec(String id, int score) => EcoTripRecord(
      tripId: id,
      scoreOverall: score,
      distanceMeters: 1000,
      vehicle: EcoVehicleType.petrol,
      recordedAt: DateTime.utc(2026, 1, 1),
    );

void main() {
  group('EcoHistoryNotifier', () {
    test('prepends new trips (most recent first)', () {
      var list = <EcoTripRecord>[];
      list = EcoHistoryNotifier.merge(list, _rec('a', 60));
      list = EcoHistoryNotifier.merge(list, _rec('b', 80));
      expect(list.map((r) => r.tripId).toList(), ['b', 'a']);
    });

    test('is idempotent per tripId (first write wins, past trips immutable)', () {
      var list = <EcoTripRecord>[];
      list = EcoHistoryNotifier.merge(list, _rec('a', 60));
      list = EcoHistoryNotifier.merge(list, _rec('b', 80));
      list = EcoHistoryNotifier.merge(list, _rec('a', 90)); // same id: ignored
      expect(list.length, 2);
      expect(list.firstWhere((r) => r.tripId == 'a').scoreOverall, 60);
      expect(list.map((r) => r.tripId).toList(), ['b', 'a']); // order kept
    });

    test('averageScore', () {
      expect(EcoHistoryNotifier.averageScore(const []), 0);
      expect(
          EcoHistoryNotifier.averageScore([_rec('a', 60), _rec('b', 80)]), 70);
    });
  });
}
