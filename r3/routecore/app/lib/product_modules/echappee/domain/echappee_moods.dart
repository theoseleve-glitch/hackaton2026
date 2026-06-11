import 'package:flutter/material.dart';

import '../design_system/echappee_colors.dart';

/// Les 8 humeurs de l'atelier (« 03 — Ton humeur »). Chaque humeur regroupe
/// des catégories de POI (slugs core) et des tags affinitaires — la sélection
/// d'humeurs pilote le filtre `poisAlongRoute` et le scorer de pertinence.
class EchappeeMood {
  const EchappeeMood({
    required this.id,
    required this.label,
    required this.icon,
    required this.color,
    required this.categorySlugs,
    this.tags = const [],
  });

  final String id;
  final String label;
  final IconData icon;
  final Color color;
  final List<String> categorySlugs;
  final List<String> tags;

  static const all = [
    EchappeeMood(
      id: 'gouter-local',
      label: 'Goûter local',
      icon: Icons.bakery_dining,
      color: EchappeeColors.categoryBonnesTables,
      categorySlugs: ['producer', 'restaurant'],
      tags: ['fromage', 'pain', 'gourmand', 'bio'],
    ),
    EchappeeMood(
      id: 'vignoble',
      label: 'Vignoble',
      icon: Icons.wine_bar,
      color: EchappeeColors.accent,
      categorySlugs: ['producer'],
      tags: ['vignoble', 'vin', 'cave'],
    ),
    EchappeeMood(
      id: 'eau-fraiche',
      label: 'Eau fraîche',
      icon: Icons.water,
      color: EchappeeColors.mapAccent,
      categorySlugs: ['viewpoint', 'nature'],
      tags: ['eau', 'rivière', 'lac', 'cascade', 'baignade'],
    ),
    EchappeeMood(
      id: 'panorama',
      label: 'Panorama',
      icon: Icons.landscape,
      color: EchappeeColors.categoryPointsDeVue,
      categorySlugs: ['viewpoint'],
      tags: ['vue', 'coucher de soleil'],
    ),
    EchappeeMood(
      id: 'foret',
      label: 'Forêt',
      icon: Icons.forest,
      color: EchappeeColors.categoryNature,
      categorySlugs: ['nature'],
      tags: ['forêt', 'balade', 'ombre'],
    ),
    EchappeeMood(
      id: 'hors-sentier',
      label: 'Hors sentier',
      icon: Icons.explore,
      color: EchappeeColors.textSecondary,
      categorySlugs: ['village', 'artisan'],
      tags: ['secret', 'caché', 'insolite'],
    ),
    EchappeeMood(
      id: 'marche-paysan',
      label: 'Marché paysan',
      icon: Icons.storefront,
      color: EchappeeColors.categoryMarches,
      categorySlugs: ['market'],
      tags: ['marché', 'producteurs'],
    ),
    EchappeeMood(
      id: 'photogenique',
      label: 'Photogénique',
      icon: Icons.photo_camera,
      color: EchappeeColors.primary,
      categorySlugs: ['village', 'viewpoint'],
      tags: ['patrimoine', 'pierre', 'photo'],
    ),
  ];

  /// Union des slugs de catégories pour un ensemble d'humeurs sélectionnées
  /// (vide = pas de filtre).
  static List<String> slugsFor(Set<String> moodIds) {
    final slugs = <String>{};
    for (final mood in all) {
      if (moodIds.contains(mood.id)) slugs.addAll(mood.categorySlugs);
    }
    return slugs.toList();
  }

  /// Union des tags (pour le scorer de pertinence).
  static List<String> tagsFor(Set<String> moodIds) {
    final tags = <String>{};
    for (final mood in all) {
      if (moodIds.contains(mood.id)) tags.addAll(mood.tags);
    }
    return tags.toList();
  }
}
