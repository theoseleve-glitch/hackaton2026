import 'package:flutter/material.dart';

import '../shared/models/models.dart';

/// Assembly point for product modules (same role as router.dart): the core
/// screens stay neutral and render whatever is registered here. Adding a
/// product = adding an entry; removing one = deleting its entry. Entries are
/// pure data (routes/labels), so this file does not import module code.
class ProductHomeEntry {
  const ProductHomeEntry({
    required this.mode,
    required this.icon,
    required this.title,
    required this.route,
    this.summaryNote,
  });

  final ProductContext mode;
  final IconData icon;
  final String title;

  /// Entry route of the module flow (declared in router.dart).
  final String route;

  /// Optional note shown on the core TripSummaryScreen for this mode.
  final String? summaryNote;
}

const productHomeEntries = [
  ProductHomeEntry(
    mode: ProductContext.terroir,
    icon: Icons.local_florist,
    title: 'Mode Terroir — trajets de découverte locale',
    route: '/terroir/plan',
  ),
  ProductHomeEntry(
    mode: ProductContext.ecodrive,
    icon: Icons.eco,
    title: 'Mode Écoconduite — trajets sobres',
    route: '/ecodrive/compare',
    summaryNote:
        'Éco-score détaillé disponible dans le dashboard Écoconduite.',
  ),
];

ProductHomeEntry? productEntryFor(ProductContext mode) {
  for (final e in productHomeEntries) {
    if (e.mode == mode) return e;
  }
  return null;
}
