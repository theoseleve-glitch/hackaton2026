import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/eco_vehicle_type.dart';

/// One record of a finished EcoDrive trip.
///
/// MOCK/demo: the EcoDrive trip history is kept in memory for the session only
/// (it resets on app restart). Production would persist these rows to the shared
/// `eco_scores` table via a repository — see `docs/ECODRIVE.md`.
class EcoTripRecord {
  const EcoTripRecord({
    required this.tripId,
    required this.scoreOverall,
    required this.distanceMeters,
    required this.vehicle,
    required this.recordedAt,
    this.adviceText,
    this.fuelEstimateLiters,
    this.co2EstimateKg,
    this.kwhEstimate,
  });

  final String tripId;
  final int scoreOverall;
  final double distanceMeters;
  final EcoVehicleType vehicle;
  final DateTime recordedAt;
  final String? adviceText;
  final double? fuelEstimateLiters;
  final double? co2EstimateKg;
  final double? kwhEstimate;
}

/// In-memory store of finished EcoDrive trips, most recent first.
class EcoHistoryNotifier extends Notifier<List<EcoTripRecord>> {
  @override
  List<EcoTripRecord> build() => const [];

  /// Records [entry] the first time its tripId is seen; ignored if a record for
  /// that tripId already exists, so a finished trip stays immutable in history
  /// (re-opening the dashboard never double-counts or rewrites a past trip).
  void record(EcoTripRecord entry) => state = merge(state, entry);

  /// Pure merge helper (unit-tested): prepend a new trip; keep the existing
  /// record when its tripId is already present (first write wins).
  static List<EcoTripRecord> merge(
    List<EcoTripRecord> current,
    EcoTripRecord entry,
  ) {
    if (current.any((r) => r.tripId == entry.tripId)) return current;
    return [entry, ...current];
  }

  /// Mean overall score across recorded trips (0 when empty).
  static double averageScore(List<EcoTripRecord> records) => records.isEmpty
      ? 0
      : records.map((r) => r.scoreOverall).reduce((a, b) => a + b) /
          records.length;
}

final ecoHistoryProvider =
    NotifierProvider<EcoHistoryNotifier, List<EcoTripRecord>>(
        EcoHistoryNotifier.new);
