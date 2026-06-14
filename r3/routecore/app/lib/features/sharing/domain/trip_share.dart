import 'dart:math';

import '../../../shared/models/models.dart';

/// Un trajet partagé en direct : position courante + ETA, lisible par token.
class TripShare {
  const TripShare({
    required this.token,
    this.originLabel,
    this.destinationLabel,
    this.destLat,
    this.destLng,
    this.lastLat,
    this.lastLng,
    this.etaEpochMs,
    this.remainingMeters,
    this.active = true,
  });

  final String token;
  final String? originLabel;
  final String? destinationLabel;
  final double? destLat;
  final double? destLng;
  final double? lastLat;
  final double? lastLng;
  final int? etaEpochMs;
  final double? remainingMeters;
  final bool active;

  GeoPoint? get lastPoint => (lastLat != null && lastLng != null)
      ? GeoPoint(latitude: lastLat!, longitude: lastLng!)
      : null;

  GeoPoint? get destination => (destLat != null && destLng != null)
      ? GeoPoint(latitude: destLat!, longitude: destLng!)
      : null;

  DateTime? get eta =>
      etaEpochMs == null ? null : DateTime.fromMillisecondsSinceEpoch(etaEpochMs!);

  TripShare copyWith({
    double? lastLat,
    double? lastLng,
    int? etaEpochMs,
    double? remainingMeters,
    bool? active,
  }) =>
      TripShare(
        token: token,
        originLabel: originLabel,
        destinationLabel: destinationLabel,
        destLat: destLat,
        destLng: destLng,
        lastLat: lastLat ?? this.lastLat,
        lastLng: lastLng ?? this.lastLng,
        etaEpochMs: etaEpochMs ?? this.etaEpochMs,
        remainingMeters: remainingMeters ?? this.remainingMeters,
        active: active ?? this.active,
      );

  /// Ligne Supabase (snake_case) pour insert/update.
  Map<String, dynamic> toRow() => {
        'token': token,
        'origin_label': originLabel,
        'destination_label': destinationLabel,
        'dest_lat': destLat,
        'dest_lng': destLng,
        'last_lat': lastLat,
        'last_lng': lastLng,
        'eta_epoch_ms': etaEpochMs,
        'remaining_meters': remainingMeters,
        'active': active,
      };

  static TripShare fromRow(Map<String, dynamic> row) => TripShare(
        token: row['token'] as String,
        originLabel: row['origin_label'] as String?,
        destinationLabel: row['destination_label'] as String?,
        destLat: (row['dest_lat'] as num?)?.toDouble(),
        destLng: (row['dest_lng'] as num?)?.toDouble(),
        lastLat: (row['last_lat'] as num?)?.toDouble(),
        lastLng: (row['last_lng'] as num?)?.toDouble(),
        etaEpochMs: (row['eta_epoch_ms'] as num?)?.toInt(),
        remainingMeters: (row['remaining_meters'] as num?)?.toDouble(),
        active: (row['active'] as bool?) ?? true,
      );

  /// Lien partageable (deep-link interne `/share/:token` aussi).
  static String shareUrl(String token,
          {String base = 'https://lechappee.app/share/'}) =>
      '$base$token';
}

const _tokenAlphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/// Génère un token aléatoire non devinable (par défaut cryptographique).
/// [rng] injectable pour les tests déterministes.
String generateShareToken({int length = 22, Random? rng}) {
  final r = rng ?? Random.secure();
  return String.fromCharCodes(Iterable.generate(
      length, (_) => _tokenAlphabet.codeUnitAt(r.nextInt(_tokenAlphabet.length))));
}
