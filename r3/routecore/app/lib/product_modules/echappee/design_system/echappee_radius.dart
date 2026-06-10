import 'package:flutter/material.dart';

/// L'Échappée radius tokens. Règle : arrondi, mais pas enfantin.
abstract final class EchappeeRadius {
  /// Badges, petits tags.
  static const double sm = 8;

  /// Inputs, petites cards.
  static const double md = 12;

  /// Boutons, chips de catégorie.
  static const double lg = 18;

  /// Cards flottantes, modales.
  static const double xl = 24;

  /// Panneaux d'onboarding, hero cards.
  static const double xxl = 32;

  /// Pills, avatars.
  static const double full = 999;

  // -- Raccourcis BorderRadius -------------------------------------------------
  static const smAll = BorderRadius.all(Radius.circular(sm));
  static const mdAll = BorderRadius.all(Radius.circular(md));
  static const lgAll = BorderRadius.all(Radius.circular(lg));
  static const xlAll = BorderRadius.all(Radius.circular(xl));
  static const xxlAll = BorderRadius.all(Radius.circular(xxl));
  static const fullAll = BorderRadius.all(Radius.circular(full));

  /// Haut arrondi pour bottom sheets.
  static const xlTop = BorderRadius.vertical(top: Radius.circular(xl));
}
