import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/features/sharing/domain/trip_share.dart';

void main() {
  group('TripShare row mapping', () {
    test('toRow / fromRow round-trip', () {
      const share = TripShare(
        token: 'abc123',
        originLabel: 'Lyon',
        destinationLabel: 'Valence',
        destLat: 44.93,
        destLng: 4.89,
        lastLat: 45.5,
        lastLng: 4.85,
        etaEpochMs: 1700000000000,
        remainingMeters: 42000,
      );
      final back = TripShare.fromRow(share.toRow());
      expect(back.token, 'abc123');
      expect(back.destinationLabel, 'Valence');
      expect(back.lastPoint!.latitude, 45.5);
      expect(back.destination!.longitude, 4.89);
      expect(back.remainingMeters, 42000);
      expect(back.active, isTrue);
      expect(back.eta, DateTime.fromMillisecondsSinceEpoch(1700000000000));
    });

    test('coordonnées absentes -> points null', () {
      const s = TripShare(token: 't');
      expect(s.lastPoint, isNull);
      expect(s.destination, isNull);
      expect(s.eta, isNull);
    });

    test('copyWith met à jour la progression', () {
      const s = TripShare(token: 't');
      final u = s.copyWith(lastLat: 1, lastLng: 2, etaEpochMs: 9, remainingMeters: 5);
      expect(u.lastPoint, isNotNull);
      expect(u.etaEpochMs, 9);
      expect(u.token, 't');
    });
  });

  group('share token + url', () {
    test('shareUrl concatène le token', () {
      expect(TripShare.shareUrl('xyz'), endsWith('/share/xyz'));
    });

    test('generateShareToken : longueur + alphabet sûr, déterministe avec seed',
        () {
      final t = generateShareToken(length: 22, rng: Random(1));
      expect(t.length, 22);
      expect(RegExp(r'^[a-zA-Z0-9]+$').hasMatch(t), isTrue);
      // Déterministe pour une même graine (utile aux tests).
      expect(generateShareToken(length: 22, rng: Random(1)), t);
    });
  });
}
