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

/// Implémentation Supabase (Realtime gratuit). Le token public + RLS
/// (active & non expiré) protègent l'accès — voir 0006_trip_shares.sql.
class SupabaseTripShareService implements TripShareService {
  SupabaseTripShareService(this._client);

  final SupabaseClient _client;
  static const _log = AppLogger('trip-share');
  static const _table = 'trip_shares';

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
    await _client.from(_table).insert(share.toRow());
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
      await _client.from(_table).update({
        'last_lat': position.latitude,
        'last_lng': position.longitude,
        'eta_epoch_ms': eta?.millisecondsSinceEpoch,
        'remaining_meters': remainingMeters,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      }).eq('token', token);
    } catch (e) {
      _log.warn('maj partage impossible: $e');
    }
  }

  @override
  Future<void> endShare(String token) async {
    try {
      await _client.from(_table).update({'active': false}).eq('token', token);
    } catch (e) {
      _log.warn('clôture partage impossible: $e');
    }
  }

  @override
  Stream<TripShare?> watch(String token) => _client
      .from(_table)
      .stream(primaryKey: ['id'])
      .eq('token', token)
      .map((rows) => rows.isEmpty ? null : TripShare.fromRow(rows.first));
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
