import '../data/osrm_directions_service.dart' show NavInstruction, frenchText;
import 'navigation_engine.dart' show NavState;

/// Phase d'annonce d'une manœuvre : préparation (loin) puis imminente.
enum AnnouncePhase { prepare, now }

/// Décide, de façon PURE, QUOI prononcer et QUAND pour le guidage vocal —
/// sans aucune dépendance audio (testable sans plugin). La sortie audio
/// réelle est confiée à [NavVoice].
///
/// Anti-répétition : chaque manœuvre est annoncée au plus une fois par phase.
/// Le moteur [NavigationEngine] renvoie la MÊME instance [NavInstruction] tant
/// que la manœuvre courante ne change pas, donc `identical` suffit à détecter
/// le passage à la manœuvre suivante (pas besoin d'identifiant).
class VoiceAnnouncer {
  VoiceAnnouncer({
    this.prepareDistanceMeters = 350,
    this.nowDistanceMeters = 90,
  });

  /// Distance d'annonce « préparatoire » (« Dans 300 m, tourne… »).
  final double prepareDistanceMeters;

  /// Distance d'annonce « imminente » (« Tourne à droite »).
  final double nowDistanceMeters;

  NavInstruction? _lastInstruction;
  AnnouncePhase? _lastPhase;

  /// Renvoie la phrase à prononcer pour cet état, ou null si rien de nouveau.
  /// À appeler à chaque fix GPS.
  String? onNav(NavState nav) {
    final current = nav.current;
    if (current == null) return null;

    // Nouvelle manœuvre -> on réarme les phases.
    if (!identical(current, _lastInstruction)) {
      _lastInstruction = current;
      _lastPhase = null;
    }

    final type = current.maneuverType;

    // Départ : une annonce immédiate, une seule fois.
    if (type == 'depart') {
      if (_lastPhase == null) {
        _lastPhase = AnnouncePhase.now;
        return frenchText(current);
      }
      return null;
    }

    // Arrivée : une annonce unique.
    if (type == 'arrive') {
      if (_lastPhase != AnnouncePhase.now) {
        _lastPhase = AnnouncePhase.now;
        return frenchText(current);
      }
      return null;
    }

    final distance = nav.distanceToManeuverMeters;

    // Imminent : « Tourne à droite sur X » (ou la consigne telle quelle).
    if (distance <= nowDistanceMeters) {
      if (_lastPhase != AnnouncePhase.now) {
        _lastPhase = AnnouncePhase.now;
        return frenchText(current);
      }
      return null;
    }

    // Préparation : « Dans 300 m, tourne à droite sur X ».
    if (distance <= prepareDistanceMeters) {
      if (_lastPhase == null) {
        _lastPhase = AnnouncePhase.prepare;
        return 'Dans ${_roundDistance(distance)}, '
            '${_lowerFirst(frenchText(current))}';
      }
      return null;
    }

    return null;
  }

  /// True quand l'annonce courante est imminente (sert à déclencher l'haptique
  /// côté écran sans dupliquer la logique de phase).
  bool get isImminent => _lastPhase == AnnouncePhase.now;

  /// Oublie l'état (changement d'itinéraire / recalcul).
  void reset() {
    _lastInstruction = null;
    _lastPhase = null;
  }

  /// « 300 m », « 1,2 km » — arrondi parlé (centaines de m, dixièmes de km).
  static String _roundDistance(double meters) {
    if (meters < 1000) {
      final rounded = (meters / 50).round() * 50;
      return '${rounded < 50 ? 50 : rounded} mètres';
    }
    final km = meters / 1000;
    if (km >= 10) return '${km.round()} kilomètres';
    return '${km.toStringAsFixed(1).replaceAll('.', ',')} kilomètres';
  }

  /// Met la première lettre en minuscule pour enchaîner « Dans X, tourne… ».
  static String _lowerFirst(String s) =>
      s.isEmpty ? s : s[0].toLowerCase() + s.substring(1);
}
