/// L'Échappée spacing tokens — grille de base 4 px.
/// Tout espacement passe par ces tokens, jamais de valeur magique.
abstract final class EchappeeSpacing {
  static const double s4 = 4;
  static const double s8 = 8;
  static const double s12 = 12;
  static const double s16 = 16;
  static const double s20 = 20;
  static const double s24 = 24;
  static const double s32 = 32;
  static const double s40 = 40;
  static const double s48 = 48;
  static const double s64 = 64;

  // -- Tokens sémantiques ------------------------------------------------------
  /// Padding horizontal d'écran mobile.
  static const double screen = 20;

  /// Padding des overlays denses sur carte.
  static const double mapOverlay = 16;

  /// Padding interne des cards (16–20 selon densité).
  static const double card = 16;
  static const double cardLoose = 20;

  /// Espace entre sections.
  static const double section = 32;
}
