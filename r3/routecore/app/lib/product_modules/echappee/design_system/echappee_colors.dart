import 'package:flutter/material.dart';

/// L'Échappée color tokens. Screens must never hardcode colors — everything
/// comes from here. See docs/DESIGN_SYSTEM_ECHAPPEE.md.
abstract final class EchappeeColors {
  // -- Palette principale ----------------------------------------------------
  /// Clay Red — CTA, route active, sélection.
  static const primary = Color(0xFFD95F45);

  /// Warm Cream — fond principal de l'app.
  static const background = Color(0xFFFFF7EA);

  /// Soft White — cards, panels, inputs.
  static const surface = Color(0xFFFFFCF5);

  /// Deep Brown — texte principal.
  static const textPrimary = Color(0xFF2B211C);

  /// Stone Taupe — texte secondaire.
  static const textSecondary = Color(0xFF8A7C70);

  /// Olive — nature, producteurs, lieux vérifiés.
  static const nature = Color(0xFF6F7F45);

  /// Soft Gold — badges, coups de cœur, partenaires.
  static const accent = Color(0xFFD9A441);

  /// Mist Blue — carte, eau, routes secondaires.
  static const mapAccent = Color(0xFF7EA8A4);

  /// Leaf Green — validation, ouvert, succès.
  static const success = Color(0xFF587A3A);

  /// Deep Red — erreurs, danger.
  static const error = Color(0xFFB64035);

  /// Warm Stone — contours doux.
  static const border = Color(0xFFE7D8C8);

  /// Pale Taupe — états désactivés.
  static const disabled = Color(0xFFC9BBAE);

  // -- Variantes d'état -------------------------------------------------------
  /// Clay Red pressé (CTA enfoncé).
  static const primaryPressed = Color(0xFFBE4F37);

  /// Teinte Clay Red claire — fond d'une card sélectionnée.
  static const primaryTint = Color(0xFFF9E5DE);

  /// Soft Gold à 20 % — fond du badge "Partenaire local".
  static const accentTint = Color(0x33D9A441);

  /// Card élevée — blanc légèrement cassé.
  static const surfaceElevated = Color(0xFFFFFEFB);

  /// Overlay carte — Soft White à 96 %.
  static const mapOverlay = Color(0xF5FFFCF5);

  /// Overlay sombre (40–60 % selon contexte) — base Deep Brown.
  static const darkOverlay = Color(0x662B211C);

  // -- Couleurs fonctionnelles (routes & catégories) --------------------------
  static const routeDirect = textSecondary; // Trajet direct
  static const routeEchappee = primary; // Échappée recommandée
  static const routeAlternative = mapAccent; // Alternative
  static const routeWalking = nature; // Segment local / à pied

  static const categoryProducteurs = nature;
  static const categoryMarches = accent;
  static const categoryVillages = primary;
  static const categoryArtisans = textPrimary;
  static const categoryPointsDeVue = mapAccent;
  static const categoryBonnesTables = primary;
  static const categoryNature = success;
  static const categoryEvenements = accent;

  static const statusOpen = success; // Ouvert
  static const statusClosed = error; // Fermé
}
