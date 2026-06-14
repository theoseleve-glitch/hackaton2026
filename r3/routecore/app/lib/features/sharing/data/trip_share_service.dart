import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/logging/app_logger.dart';
import '../../../shared/models/models.dart';
import '../domain/trip_share.dart';

/// Partage de trajet en direct : le conducteur publie sa position/ETA, le
/// destinataire les suit en temps réel par token.
abstract class TripShareService {
  Future<TripShare> createShare({
    required GeoPoint destination,
    String? originLabel,
    String? destinationLabel,
  });

  Future<void> updateProgress(
    String token, {
    required GeoPoint position,
    DateTime? eta,
    double? remainingMeters,
  });

  Future<void> endShare(String token);

  /// Flux temps réel de l'état partagé (null tant qu'introuvable/expiré).
  Stream<TripShare?> watch(String token);
}

/// Implémentation Supabase. Accès STRICTEMENT token-scopé via des RPC
/// SECURITY DEFINER (la table n'est pas accessible directement, ni publiée en
/// Realtime — voir 0006_trip_shares.sql). Le viewer interroge get_trip_share
/// en polling. Le token (non devinable) est la capacité d'accès.
class SupabaseTripShareService implements TripShareService {
  SupabaseTripShareService(this._client, {Duration? pollInterval})
      : _pollInterval = pollInterval ?? const Duration(seconds: 5);

  final SupabaseClient _client;
  final Duration _pollInterval;
  static const _log = AppLogger('trip-share');

  @override
  Future<TripShare> createShare({
    required GeoPoint destination,
    String? originLabel,
    String? destinationLabel,
  }) async {
    final share = TripShare(
      token: generateShareToken(),
      originLabel: originLabel,
      destinationLabel: destinationLabel,
      destLat: destination.latitude,
      destLng: destination.longitude,
    );
    await _client.rpc('create_trip_share', params: {
      'p_token': share.token,
      'p_origin_label': originLabel,
      'p_destination_label': destinationLabel,
      'p_dest_lat': destination.latitude,
      'p_dest_lng': destination.longitude,
    });
    return share;
  }

  @override
  Future<void> updateProgress(
    String token, {
    required GeoPoint position,
    DateTime? eta,
    double? remainingMeters,
  }) async {
    try {
      await _client.rpc('update_trip_progress', params: {
        'p_token': token,
        'p_lat': position.latitude,
        'p_lng': position.longitude,
        'p_eta_epoch_ms': eta?.millisecondsSinceEpoch,
        'p_remaining': remainingMeters,
      });
    } catch (e) {
      _log.warn('maj partage impossible: $e');
    }
  }

  @override
  Future<void> endShare(String token) async {
    try {
      await _client.rpc('end_trip_share', params: {'p_token': token});
    } catch (e) {
      _log.warn('clôture partage impossible: $e');
    }
  }

  Future<TripShare?> _fetch(String token) async {
    try {
      final result =
          await _client.rpc('get_trip_share', params: {'p_token': token});
      final rows = (result as List?) ?? const [];
      if (rows.isEmpty) return null;
      return TripShare.fromRow((rows.first as Map).cast<String, dynamic>());
    } catch (e) {
      _log.warn('lecture partage impossible: $e');
      return null;
    }
  }

  @override
  Stream<TripShare?> watch(String token) async* {
    // Polling (pas de Realtime sur la table pour éviter tout fan-out) :
    // un fix immédiat, puis toutes les [_pollInterval].
    yield await _fetch(token);
    yield* Stream.periodic(_pollInterval).asyncMap((_) => _fetch(token));
  }
}

/// Implémentation locale (sans Supabase) : partage VISIBLE dans la même
/// instance d'app uniquement (démo) — honnête, pas de partage inter-appareils
/// sans backend configuré.
class MockTripShareService implements TripShareService {
  final Map<String, TripShare> _shares = {};
  final Map<String, StreamController<TripShare?>> _controllers = {};

  StreamController<TripShare?> _controllerFor(String token) =>
      _controllers.putIfAbsent(token, () => StreamController.broadcast());

  void _emit(String token) => _controllers[token]?.add(_shares[token]);

  @override
  Future<TripShare> createShare({
    required GeoPoint destination,
    String? originLabel,
    String? destinationLabel,
  }) async {
    final share = TripShare(
      token: generateShareToken(),
      originLabel: originLabel,
      destinationLabel: destinationLabel,
      destLat: destination.latitude,
      destLng: destination.longitude,
    );
    _shares[share.token] = share;
    _emit(share.token);
    return share;
  }

  @override
  Future<void> updateProgress(
    String token, {
    required GeoPoint position,
    DateTime? eta,
    double? remainingMeters,
  }) async {
    final current = _shares[token];
    if (current == null) return;
    _shares[token] = current.copyWith(
      lastLat: position.latitude,
      lastLng: position.longitude,
      etaEpochMs: eta?.millisecondsSinceEpoch,
      remainingMeters: remainingMeters,
    );
    _emit(token);
  }

  @override
  Future<void> endShare(String token) async {
    final current = _shares[token];
    if (current == null) return;
    _shares[token] = current.copyWith(active: false);
    _emit(token);
  }

  @override
  Stream<TripShare?> watch(String token) {
    final controller = _controllerFor(token);
    scheduleMicrotask(() => controller.add(_shares[token]));
    return controller.stream;
  }
}
