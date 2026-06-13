import 'package:flutter/material.dart';

/// L'Échappée color tokens — palette « Forêt & Ocre » (v3) : verts profonds
/// en dominante, ocres profonds en chaleur (pas d'orangé vif). Screens must
/// never hardcode colors — everything comes from here.
/// See docs/DESIGN_SYSTEM_ECHAPPEE.md.
abstract final class EchappeeColors {
  // -- Palette principale ----------------------------------------------------
  /// Pin profond — CTA, route active, sélection.
  static const primary = Color(0xFF265C43);

  /// Papier crème-sauge — fond principal de l'app.
  static const background = Color(0xFFF5F1E6);

  /// Blanc cassé végétal — cards, panels, inputs.
  static const surface = Color(0xFFFBFAF4);

  /// Encre forêt — texte principal.
  static const textPrimary = Color(0xFF1C2A22);

  /// Gris lichen — texte secondaire.
  static const textSecondary = Color(0xFF6E7B6F);

  /// Olive — nature, producteurs, lieux vérifiés.
  static const nature = Color(0xFF6F7F45);

  /// Ocre profond — badges, coups de cœur, partenaires, marchés.
  static const accent = Color(0xFFB07A33);

  /// Terracotta sombre — bonnes tables, touches chaleureuses.
  static const terracotta = Color(0xFFA05B3F);

  /// Bleu-vert ardoise — carte, eau, routes secondaires.
  static const mapAccent = Color(0xFF5E8B87);

  /// Vert feuille — validation, ouvert, succès.
  static const success = Color(0xFF3E7A4A);

  /// Brique sombre — erreurs, danger.
  static const error = Color(0xFFA23B30);

  /// Pierre chaude — contours doux.
  static const border = Color(0xFFDFD8C4);

  /// Lichen pâle — états désactivés.
  static const disabled = Color(0xFFB9BBA8);

  // -- Variantes d'état -------------------------------------------------------
  /// Pin pressé (CTA enfoncé).
  static const primaryPressed = Color(0xFF1C4632);

  /// Teinte pin claire — fond d'une card sélectionnée.
  static const primaryTint = Color(0xFFDFE9E1);

  /// Ocre à 20 % — fond du badge "Partenaire local".
  static const accentTint = Color(0x33B07A33);

  /// Card élevée — blanc légèrement cassé.
  static const surfaceElevated = Color(0xFFFDFCF7);

  /// Overlay carte — surface à 96 %.
  static const mapOverlay = Color(0xF5FBFAF4);

  /// Overlay sombre (40–60 % selon contexte) — base encre forêt.
  static const darkOverlay = Color(0x661C2A22);

  // -- Couleurs fonctionnelles (routes & catégories) --------------------------
  static const routeDirect = textSecondary; // Trajet direct
  static const routeEchappee = primary; // Échappée recommandée
  static const routeAlternative = mapAccent; // Alternative
  static const routeWalking = nature; // Segment local / à pied

  static const categoryProducteurs = nature;
  static const categoryMarches = accent;
  static const categoryVillages = primary;
  static const categoryArtisans = terracotta;
  static const categoryPointsDeVue = mapAccent;
  static const categoryBonnesTables = terracotta;
  static const categoryNature = success;
  static const categoryEvenements = accent;

  static const statusOpen = success; // Ouvert
  static const statusClosed = error; // Fermé
}
