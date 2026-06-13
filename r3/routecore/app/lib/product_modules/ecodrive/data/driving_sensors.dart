import 'dart:async';
import 'dart:math' as math;

import 'package:sensors_plus/sensors_plus.dart';

/// Échantillon fusionné accéléromètre + gyroscope (~10 Hz).
///
/// [longitudinalAccel] est la magnitude de l'accélération hors gravité
/// (userAccelerometer), lissée (passe-bas EMA) puis **signée par la tendance
/// de vitesse GPS** ([DrivingSensors.updateSpeed]) : la magnitude seule est
/// insensible à l'orientation du téléphone, mais ne distingue pas freinage
/// et accélération — le GPS tranche.
///
/// Limite honnête (docs/ECO_COACHING_RESEARCH.md §4) : téléphone non fixé →
/// l'accéléro capte aussi les manipulations. Un échantillon est invalidé
/// ([valid] = false, drapeaux brusques inhibés) quand le gyroscope dépasse
/// [DrivingSensors.handlingGyroRadS] (téléphone manipulé).
class DrivingSample {
  const DrivingSample({
    required this.longitudinalAccel,
    required this.harshBrake,
    required this.harshAccel,
    required this.corneringRate,
    required this.valid,
    required this.timestamp,
  });

  /// m/s², signé (négatif = décélération) — voir caveat de classe.
  final double longitudinalAccel;

  /// Freinage brusque (magnitude validée >= seuil, signe négatif).
  final bool harshBrake;

  /// Accélération brusque.
  final bool harshAccel;

  /// Vitesse de lacet (gyro z, rad/s) — proxy virage.
  final double corneringRate;

  /// false = fenêtre de validation rejetée (téléphone manipulé).
  final bool valid;

  final DateTime timestamp;
}

/// Capteurs de conduite : enveloppe sensors_plus en deux flux —
/// [samples] (accéléro + gyro pour le coaching) et [compassHeadings] (cap
/// magnétomètre pour l'orientation carte à l'arrêt) — avec dégradation totale
/// en mode GPS-seul.
///
/// Sur un appareil sans capteurs (émulateur !) les flux sensors_plus émettent
/// une erreur : on n'émet alors **rien** et [available] / [compassAvailable]
/// passent à false — tout le coaching doit fonctionner à partir de la seule
/// vitesse GPS, et la carte garde le cap route.
class DrivingSensors {
  /// [accelerometer]/[gyroscope]/[magnetometer] sont injectables en test ; par
  /// défaut les flux sensors_plus à ~10 Hz ([samplingPeriod]).
  DrivingSensors({
    Stream<UserAccelerometerEvent>? accelerometer,
    Stream<GyroscopeEvent>? gyroscope,
    Stream<MagnetometerEvent>? magnetometer,
    this.samplingPeriod = const Duration(milliseconds: 100),
    this.harshBrakeMps2 = 3.0,
    this.harshAccelMps2 = 2.5,
    this.handlingGyroRadS = 1.5,
    this.lowPassAlpha = 0.25,
    this.compassAlpha = 0.2,
  })  : _accelerometerSource = accelerometer,
        _gyroscopeSource = gyroscope,
        _magnetometerSource = magnetometer {
    _controller = StreamController<DrivingSample>.broadcast(
      onListen: _start,
    );
    _compassController = StreamController<double>.broadcast(
      onListen: _startCompass,
    );
  }

  /// Période d'échantillonnage demandée aux capteurs (~10 Hz).
  final Duration samplingPeriod;

  /// Seuils brusques accéléro (littérature : 2,5-5 m/s², voir recherche §3).
  final double harshBrakeMps2;
  final double harshAccelMps2;

  /// Magnitude gyro au-delà de laquelle le téléphone est considéré manipulé.
  final double handlingGyroRadS;

  /// Coefficient du passe-bas EMA sur la magnitude accéléro.
  final double lowPassAlpha;

  /// Coefficient de l'EMA wrap-aware lissant le cap magnétomètre.
  final double compassAlpha;

  final Stream<UserAccelerometerEvent>? _accelerometerSource;
  final Stream<GyroscopeEvent>? _gyroscopeSource;
  final Stream<MagnetometerEvent>? _magnetometerSource;

  late final StreamController<DrivingSample> _controller;
  late final StreamController<double> _compassController;
  StreamSubscription<UserAccelerometerEvent>? _accelSub;
  StreamSubscription<GyroscopeEvent>? _gyroSub;
  StreamSubscription<MagnetometerEvent>? _magnetoSub;
  bool _started = false;
  bool _compassStarted = false;

  bool _available = true;
  bool _compassAvailable = true;
  double _filteredMagnitude = 0;
  double _gyroZ = 0;
  double _gyroMagnitude = 0;

  /// Dernier cap boussole lissé (degrés 0..360), null tant qu'aucun
  /// échantillon valide n'a été reçu.
  double? _compassHeading;

  /// -1 (vitesse GPS en baisse) ou +1 ; mis à jour par [updateSpeed].
  int _speedTrendSign = 1;
  double? _lastSpeedMps;
  DateTime? _lastSpeedAt;

  /// false dès qu'un capteur est indisponible — basculer en GPS-seul.
  bool get available => _available;

  /// false dès que le magnétomètre est indisponible (émulateur) — la carte
  /// garde alors le cap route à l'arrêt.
  bool get compassAvailable => _compassAvailable;

  /// Dernier cap boussole lissé en degrés (0 = nord, 90 = est), ou null si le
  /// magnétomètre n'a encore rien donné / est indisponible.
  ///
  /// Caveat honnête : il s'agit d'un cap MAGNÉTIQUE plan-écran NON compensé en
  /// tilt — pas de correction de déclinaison (donc pas le vrai nord) et faux
  /// si le téléphone est incliné. Acceptable car il n'est utilisé QU'À L'ARRÊT
  /// (NavigationEngine.cameraHeading) : en roulant, c'est le cap route qui
  /// commande la rotation de la carte.
  double? get compassHeading => _compassHeading;

  /// Flux fusionné, cadencé par l'accéléromètre. Jamais d'erreur : en cas de
  /// capteur indisponible le flux se ferme simplement ([available] = false).
  Stream<DrivingSample> get samples => _controller.stream;

  /// Flux de cap boussole lissé (degrés 0..360), cadencé par le magnétomètre.
  /// Jamais d'erreur : magnétomètre indisponible → le flux se ferme
  /// simplement ([compassAvailable] = false). Voir [compassHeading] pour le
  /// caveat (cap magnétique plan-écran, non compensé en tilt).
  Stream<double> get compassHeadings => _compassController.stream;

  /// À appeler à chaque fix GPS (~1-2 Hz) : la dérivée de vitesse donne le
  /// signe de [DrivingSample.longitudinalAccel].
  void updateSpeed(double speedMps, {DateTime? at}) {
    final now = at ?? DateTime.now();
    final last = _lastSpeedMps;
    final lastAt = _lastSpeedAt;
    if (last != null && lastAt != null) {
      final dt = now.difference(lastAt).inMilliseconds / 1000.0;
      if (dt > 0) {
        final accel = (speedMps - last) / dt;
        // Zone morte de 0,15 m/s² : bruit GPS, on garde le signe précédent.
        if (accel > 0.15) _speedTrendSign = 1;
        if (accel < -0.15) _speedTrendSign = -1;
      }
    }
    _lastSpeedMps = speedMps;
    _lastSpeedAt = now;
  }

  void _start() {
    if (_started || !_available) return;
    _started = true;
    final accel = _accelerometerSource ??
        userAccelerometerEventStream(samplingPeriod: samplingPeriod);
    final gyro =
        _gyroscopeSource ?? gyroscopeEventStream(samplingPeriod: samplingPeriod);

    _gyroSub = gyro.listen((event) {
      _gyroZ = event.z;
      _gyroMagnitude = math.sqrt(
          event.x * event.x + event.y * event.y + event.z * event.z);
    }, onError: (Object _) => _markUnavailable(), cancelOnError: true);

    _accelSub = accel.listen((event) {
      final magnitude = math.sqrt(
          event.x * event.x + event.y * event.y + event.z * event.z);
      _filteredMagnitude = _filteredMagnitude +
          lowPassAlpha * (magnitude - _filteredMagnitude);
      final signed = _speedTrendSign * _filteredMagnitude;
      final valid = _gyroMagnitude <= handlingGyroRadS;
      if (_controller.isClosed) return;
      _controller.add(DrivingSample(
        longitudinalAccel: signed,
        harshBrake: valid && signed <= -harshBrakeMps2,
        harshAccel: valid && signed >= harshAccelMps2,
        corneringRate: _gyroZ,
        valid: valid,
        timestamp: event.timestamp,
      ));
    }, onError: (Object _) => _markUnavailable(), cancelOnError: true);
  }

  void _startCompass() {
    if (_compassStarted || !_compassAvailable) return;
    _compassStarted = true;
    final magneto = _magnetometerSource ??
        magnetometerEventStream(samplingPeriod: samplingPeriod);
    _magnetoSub = magneto.listen((event) {
      // Cap plan-écran à partir du champ magnétique horizontal : x pointe à
      // droite de l'écran, y vers le haut. atan2(-y, x) mesuré depuis l'est
      // (axe x) en sens horaire ⇒ donne directement un cap où 0 = nord (champ
      // aligné +y) et 90 = est, ramené dans [0, 360). NON compensé en tilt.
      final heading = (math.atan2(-event.y, event.x) * 180 / math.pi + 360) % 360;
      _compassHeading = _smoothCompass(heading);
      if (!_compassController.isClosed) {
        _compassController.add(_compassHeading!);
      }
    }, onError: (Object _) => _markCompassUnavailable(), cancelOnError: true);
  }

  /// EMA wrap-aware sur le cap (359 → 1 passe par 0, pas par 358°).
  double _smoothCompass(double degrees) {
    final target = degrees % 360;
    final current = _compassHeading;
    if (current == null) return target;
    final delta = (target - current + 540) % 360 - 180;
    return (current + compassAlpha * delta + 360) % 360;
  }

  void _markUnavailable() {
    _available = false;
    _accelSub?.cancel();
    _gyroSub?.cancel();
    if (!_controller.isClosed) _controller.close();
  }

  void _markCompassUnavailable() {
    _compassAvailable = false;
    _compassHeading = null;
    _magnetoSub?.cancel();
    if (!_compassController.isClosed) _compassController.close();
  }

  Future<void> dispose() async {
    await _accelSub?.cancel();
    await _gyroSub?.cancel();
    await _magnetoSub?.cancel();
    if (!_controller.isClosed) await _controller.close();
    if (!_compassController.isClosed) await _compassController.close();
  }
}
