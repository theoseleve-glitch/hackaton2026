import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../domain/eco_coach.dart';
import '../domain/eco_savings.dart';

/// Persistance locale du registre d'économies via shared_preferences.
class EcoStatsStore {
  const EcoStatsStore();

  static const storageKey = 'eco.ledger';

  Future<EcoSavingsLedger> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(storageKey);
    if (raw == null) return const EcoSavingsLedger();
    try {
      return EcoSavingsLedger.fromJson(
          jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      // Donnée corrompue : on repart d'un registre vide plutôt que planter.
      return const EcoSavingsLedger();
    }
  }

  Future<void> save(EcoSavingsLedger ledger) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(storageKey, jsonEncode(ledger.toJson()));
  }
}

/// État Riverpod du registre : charge depuis le disque, écrit à chaque trajet.
class EcoLedgerNotifier extends AsyncNotifier<EcoSavingsLedger> {
  static const _store = EcoStatsStore();

  @override
  Future<EcoSavingsLedger> build() => _store.load();

  Future<void> recordTrip(EcoTripScore score, double distanceKm,
      {DateTime? when}) async {
    final current = state.valueOrNull ?? await _store.load();
    final updated =
        current.addTrip(score, distanceKm, when ?? DateTime.now());
    state = AsyncValue.data(updated);
    await _store.save(updated);
  }

  EcoPeriodStats monthly(DateTime when) =>
      (state.valueOrNull ?? const EcoSavingsLedger()).monthStats(when);

  EcoPeriodStats yearly(int year) =>
      (state.valueOrNull ?? const EcoSavingsLedger()).yearStats(year);

  EcoPeriodStats get allTime =>
      (state.valueOrNull ?? const EcoSavingsLedger()).allTime;
}

final ecoLedgerProvider =
    AsyncNotifierProvider<EcoLedgerNotifier, EcoSavingsLedger>(
        EcoLedgerNotifier.new);
