import 'package:flutter/material.dart';

import 'echappee_colors.dart';

/// L'Échappée elevation — ombres douces uniquement, jamais dures.
/// Les cards doivent flotter comme du papier au-dessus de la route.
/// Base : Deep Brown à 8–12 % d'opacité, blur 16–32, offset Y 4–12.
abstract final class EchappeeShadows {
  /// Chips, petites cards.
  static const sm = [
    BoxShadow(
      color: Color(0x142B211C), // Deep Brown 8%
      blurRadius: 16,
      offset: Offset(0, 4),
    ),
  ];

  /// Cards flottantes (POI cards).
  static const md = [
    BoxShadow(
      color: Color(0x1A2B211C), // Deep Brown 10%
      blurRadius: 24,
      offset: Offset(0, 8),
    ),
  ];

  /// Bottom sheets et overlays carte.
  static const lg = [
    BoxShadow(
      color: Color(0x1F2B211C), // Deep Brown 12%
      blurRadius: 32,
      offset: Offset(0, 12),
    ),
  ];

  /// Couleur de base si une ombre custom est nécessaire.
  static const shadowBase = EchappeeColors.textPrimary;
}
