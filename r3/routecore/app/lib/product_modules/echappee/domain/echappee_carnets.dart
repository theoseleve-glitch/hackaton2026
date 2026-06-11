import 'package:flutter/material.dart';

import '../../../shared/models/models.dart';
import '../design_system/echappee_colors.dart';

/// Carnets de route — des échappées éditorialisées prêtes à rejouer.
/// Chaque carnet préremplit l'atelier (départ, destination, détour, humeurs)
/// puis lance directement le calcul des routes.
class EchappeeCarnet {
  const EchappeeCarnet({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.region,
    required this.detourMinutes,
    required this.stops,
    required this.moodIds,
    required this.origin,
    required this.originLabel,
    required this.destination,
    required this.destinationLabel,
    required this.tone,
  });

  final String id;
  final String title;
  final String subtitle;
  final String region;
  final int detourMinutes;
  final int stops;
  final List<String> moodIds;
  final GeoPoint origin;
  final String originLabel;
  final GeoPoint destination;
  final String destinationLabel;
  final Color tone;

  static const all = [
    EchappeeCarnet(
      id: 'lavandes-ocre-eau-froide',
      title: 'Lavandes, ocre et eau froide',
      subtitle: 'Valence → Nyons',
      region: 'Drôme provençale',
      detourMinutes: 80,
      stops: 5,
      moodIds: ['eau-fraiche', 'photogenique'],
      origin: GeoPoint(latitude: 44.9334, longitude: 4.8924),
      originLabel: 'Valence',
      destination: GeoPoint(latitude: 44.3608, longitude: 5.1404),
      destinationLabel: 'Nyons',
      tone: EchappeeColors.accent,
    ),
    EchappeeCarnet(
      id: 'vignes-soleil-rasant',
      title: 'Vignes au soleil rasant',
      subtitle: 'Lyon → Mâcon',
      region: 'Beaujolais',
      detourMinutes: 45,
      stops: 3,
      moodIds: ['vignoble', 'gouter-local'],
      origin: GeoPoint(latitude: 45.7640, longitude: 4.8357),
      originLabel: 'Lyon',
      destination: GeoPoint(latitude: 46.3069, longitude: 4.8287),
      destinationLabel: 'Mâcon',
      tone: EchappeeColors.primary,
    ),
    EchappeeCarnet(
      id: 'villages-perches-pierres-tiedes',
      title: 'Villages perchés, pierres tièdes',
      subtitle: 'Avignon → Apt',
      region: 'Lubéron',
      detourMinutes: 120,
      stops: 6,
      moodIds: ['photogenique', 'hors-sentier'],
      origin: GeoPoint(latitude: 43.9493, longitude: 4.8055),
      originLabel: 'Avignon',
      destination: GeoPoint(latitude: 43.8762, longitude: 5.3996),
      destinationLabel: 'Apt',
      tone: EchappeeColors.nature,
    ),
  ];
}
