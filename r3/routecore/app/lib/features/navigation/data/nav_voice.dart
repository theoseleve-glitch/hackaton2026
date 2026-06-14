import 'package:audio_session/audio_session.dart';
import 'package:flutter_tts/flutter_tts.dart';

import '../../../core/logging/app_logger.dart';

/// Sortie vocale du guidage : synthèse 100 % on-device via le moteur natif
/// (Android TextToSpeech / iOS AVSpeechSynthesizer) — gratuit, sans clé,
/// français inclus. Ne dépend d'AUCUNE donnée externe.
///
/// Tout est défensif : une init/synthèse qui échoue est avalée (log) et NE
/// CASSE JAMAIS la navigation. Le « ducking » (baisser la musique pendant
/// l'annonce) passe par audio_session.
class NavVoice {
  NavVoice();

  static const _log = AppLogger('nav-voice');

  final FlutterTts _tts = FlutterTts();
  AudioSession? _session;
  bool _ready = false;
  bool _initFailed = false;

  /// Coupe la voix sans détruire le moteur (toggle utilisateur).
  bool muted = false;

  Future<void> _ensureReady() async {
    if (_ready || _initFailed) return;
    try {
      _session = await AudioSession.instance;
      // Configuration « parole » : demande un focus audio transitoire qui
      // baisse (duck) les autres sources au lieu de les couper.
      await _session!.configure(const AudioSessionConfiguration.speech());
      await _tts.setLanguage('fr-FR');
      await _tts.setSpeechRate(0.5); // débit posé, intelligible en conduite
      await _tts.setVolume(1.0);
      await _tts.setPitch(1.0);
      // speak() attend la fin de l'élocution -> on peut relâcher le focus après.
      await _tts.awaitSpeakCompletion(true);
      _ready = true;
    } catch (e) {
      _initFailed = true;
      _log.warn('TTS indisponible (voix désactivée): $e');
    }
  }

  /// Prononce [phrase] en baissant la musique le temps de l'annonce.
  /// No-op si coupé ou si le moteur est indisponible.
  Future<void> speak(String phrase) async {
    if (muted || phrase.isEmpty) return;
    await _ensureReady();
    if (!_ready) return;
    try {
      await _session?.setActive(true);
      await _tts.speak(phrase);
    } catch (e) {
      _log.warn('échec synthèse vocale: $e');
    } finally {
      try {
        await _session?.setActive(
          false,
          androidAudioFocusGainType:
              AndroidAudioFocusGainType.gainTransientMayDuck,
        );
      } catch (_) {/* relâche du focus best-effort */}
    }
  }

  /// Coupe immédiatement l'élocution en cours (ex. avant un recalcul).
  Future<void> stop() async {
    if (!_ready) return;
    try {
      await _tts.stop();
    } catch (_) {}
  }

  Future<void> dispose() async {
    await stop();
    try {
      await _session?.setActive(false);
    } catch (_) {}
  }
}
