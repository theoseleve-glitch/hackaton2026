import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../domain/vehicle.dart';

/// Base véhicules embarquée (assets/data/vehicles.json, ADEME Car Labelling,
/// chargée paresseusement puis mise en cache) + persistance de la sélection
/// via shared_preferences.
class VehicleRepository {
  /// [vehicles] permet d'injecter une liste en test, sans charger l'asset.
  VehicleRepository({List<Vehicle>? vehicles}) : _cache = vehicles;

  static const _assetPath = 'assets/data/vehicles.json';
  static const _prefsKey = 'vehicle.selection';

  List<Vehicle>? _cache;
  Future<List<Vehicle>>? _loading;

  Future<List<Vehicle>> _vehicles() {
    final cached = _cache;
    if (cached != null) return Future.value(cached);
    return _loading ??= _loadAsset();
  }

  Future<List<Vehicle>> _loadAsset() async {
    final raw = await rootBundle.loadString(_assetPath);
    final json = jsonDecode(raw) as Map<String, dynamic>;
    final vehicles = (json['vehicles'] as List)
        .map((v) => Vehicle.fromJson(v as Map<String, dynamic>))
        .toList(growable: false);
    _cache = vehicles;
    return vehicles;
  }

  /// Recherche insensible à la casse et aux accents sur marque + modèle +
  /// motorisation. Les marques commençant par la requête sortent en premier.
  Future<List<Vehicle>> search(String query, {int limit = 30}) async {
    return rank(await _vehicles(), query, limit: limit);
  }

  /// Cœur pur de la recherche (testable sans asset). Tous les mots de la
  /// requête doivent apparaître dans « marque modèle motorisation ».
  static List<Vehicle> rank(
    List<Vehicle> vehicles,
    String query, {
    int limit = 30,
  }) {
    final tokens =
        _fold(query).split(' ').where((t) => t.isNotEmpty).toList();
    if (tokens.isEmpty) return const [];
    final scored = <(int, Vehicle)>[];
    for (final vehicle in vehicles) {
      final brand = _fold(vehicle.brand);
      final haystack = '$brand ${_fold(vehicle.model)} ${_fold(vehicle.engine)}';
      if (!tokens.every(haystack.contains)) continue;
      scored.add((brand.startsWith(tokens.first) ? 0 : 1, vehicle));
    }
    scored.sort((a, b) {
      final byScore = a.$1.compareTo(b.$1);
      if (byScore != 0) return byScore;
      return a.$2.label.compareTo(b.$2.label);
    });
    return [for (final (_, vehicle) in scored.take(limit)) vehicle];
  }

  /// Marques distinctes, triées.
  Future<List<String>> brands() async {
    final vehicles = await _vehicles();
    return {for (final v in vehicles) v.brand}.toList()..sort();
  }

  // -- Persistance de la sélection --------------------------------------------

  Future<void> saveSelection(VehicleSelection selection) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, jsonEncode(selection.toJson()));
  }

  /// Mémorise « plus tard » pour ne pas redemander à chaque session.
  Future<void> saveSkipped() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, jsonEncode({'skipped': true}));
  }

  /// Sélection persistée, ou null (jamais demandé, « plus tard », ou donnée
  /// corrompue).
  Future<VehicleSelection?> loadSelection() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_prefsKey);
    if (raw == null) return null;
    try {
      final json = jsonDecode(raw) as Map<String, dynamic>;
      if (json['skipped'] == true) return null;
      return VehicleSelection.fromJson(json);
    } catch (_) {
      return null;
    }
  }

  /// L'utilisateur a déjà répondu (sélection ou « plus tard ») ?
  Future<bool> hasChoice() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.containsKey(_prefsKey);
  }

  // -- Normalisation accents ---------------------------------------------------

  static const _foldMap = {
    'à': 'a', 'â': 'a', 'ä': 'a', 'á': 'a', 'ã': 'a', 'å': 'a',
    'ç': 'c',
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'î': 'i', 'ï': 'i', 'í': 'i', 'ì': 'i',
    'ô': 'o', 'ö': 'o', 'ó': 'o', 'ò': 'o', 'õ': 'o',
    'ù': 'u', 'û': 'u', 'ü': 'u', 'ú': 'u',
    'ñ': 'n', 'œ': 'oe', 'æ': 'ae',
  };

  static String _fold(String value) {
    final buffer = StringBuffer();
    for (final rune in value.toLowerCase().runes) {
      final char = String.fromCharCode(rune);
      buffer.write(_foldMap[char] ?? char);
    }
    return buffer.toString();
  }
}

final vehicleRepositoryProvider =
    Provider<VehicleRepository>((ref) => VehicleRepository());

/// Sélection courante du véhicule. `null` tant que rien n'est choisi (jamais
/// demandé ou « plus tard » — voir [VehicleRepository.hasChoice]).
class VehicleSelectionController extends AsyncNotifier<VehicleSelection?> {
  @override
  Future<VehicleSelection?> build() =>
      ref.read(vehicleRepositoryProvider).loadSelection();

  Future<void> select(VehicleSelection selection) async {
    state = AsyncValue.data(selection);
    await ref.read(vehicleRepositoryProvider).saveSelection(selection);
  }

  /// « Plus tard » : mémorisé pour ne pas redemander.
  Future<void> skip() async {
    state = const AsyncValue.data(null);
    await ref.read(vehicleRepositoryProvider).saveSkipped();
  }
}

final vehicleSelectionProvider =
    AsyncNotifierProvider<VehicleSelectionController, VehicleSelection?>(
        VehicleSelectionController.new);
