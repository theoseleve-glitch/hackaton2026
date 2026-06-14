import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData, HapticFeedback;
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart' show LatLng;
import 'package:shared_preferences/shared_preferences.dart';

import '../../../app/providers.dart';
import '../../../core/logging/app_logger.dart';
import '../../../product_modules/ecodrive/data/driving_sensors.dart';
import '../../../product_modules/echappee/design_system/design_system.dart';
import '../../../product_modules/echappee/presentation/echappee_page.dart';
import '../../../features/sharing/domain/trip_share.dart';
import '../../../shared/models/models.dart';
import '../../location/data/location_repositories.dart';
import '../../../shared/services/traffic_service.dart';
import '../../routing/presentation/route_planner_controller.dart';
import '../../safety/data/safety_alerts_service.dart';
import '../../safety/data/speed_camera_service.dart';
import '../data/nav_voice.dart';
import '../data/osrm_directions_service.dart';
import '../data/road_speed_service.dart';
import '../domain/navigation_engine.dart';
import '../domain/voice_announcer.dart';

/// Navigation guidée L'Échappée, façon Waze : carte course-up qui tourne avec
/// le cap (la voiture reste fixe et pointe vers le haut de l'écran), caméra
/// décalée en avant du véhicule pour voir plus de route, instruction en haut,
/// ETA et distance en bas. Sur émulateur (pas de GPS réel branché), la
/// conduite est simulée le long du trajet — chip « Simulation » affichée.
///
/// La route est câblée ailleurs ('/echappee/navigation') — ce fichier
/// n'exporte que le widget.
class EchappeeNavigationScreen extends ConsumerStatefulWidget {
  const EchappeeNavigationScreen({
    super.key,
    this.coachOverlay,
    this.onPositionUpdate,
    this.onArrived,
  });

  /// Slot EcoCoach : rendu bottom-center, juste au-dessus de la barre basse,
  /// quand non-null. Le contenu (overlay éco-conduite) est construit
  /// ailleurs — cet écran ne fait qu'héberger l'emplacement.
  final Widget? coachOverlay;

  /// Invoqué à chaque mise à jour moteur avec la position brute et la vitesse
  /// sol en m/s (0 quand la source ne la fournit pas). Point d'accroche du
  /// contrôleur éco.
  final void Function(GeoPoint position, double speedMps)? onPositionUpdate;

  /// Invoqué UNE fois à l'arrivée (< 30 m restants) — bilan de trajet.
  final void Function(double distanceKm, double durationSeconds)? onArrived;

  @override
  ConsumerState<EchappeeNavigationScreen> createState() =>
      _EchappeeNavigationScreenState();
}

class _EchappeeNavigationScreenState
    extends ConsumerState<EchappeeNavigationScreen> {
  static const _log = AppLogger('echappee-nav');

  /// Zoom de croisière / zoom « anticipation » au-delà de 80 km/h.
  static const double _cruiseZoom = 16.5;
  static const double _fastZoom = 15.5;
  static const double _maneuverZoom = 17.5; // zoom serré à l'approche d'un virage
  static const double _maneuverZoomMeters = 160; // distance d'enclenchement
  static const double _fastSpeedMps = 80 / 3.6;

  /// Lissage du zoom : fraction du chemin vers la cible parcourue à chaque
  /// fix (~2 fixes/s en simulation → transition douce en ~3 s).
  static const double _zoomEase = 0.15;

  /// Fraction de la hauteur visible de carte dont la caméra devance la
  /// voiture (voiture rendue vers ~60 % de l'écran, plus de route devant).
  static const double _lookAheadFraction = 0.18;

  static const double _routeCasingWidth = 12;
  static const double _routeStrokeWidth = 8;
  static const double _positionMarkerSize = 22;
  static const double _carMarkerSize = 44;
  static const double _carIconSize = 24;
  static const Duration _recalcCooldown = Duration(seconds: 10);

  /// Style tuiles « navigation » (OSM gratuit + ColorFilter) : base
  /// légèrement désaturée pour calmer le fond, contraste et luminosité
  /// relevés pour faire ressortir le réseau routier, pointe de vert qui
  /// garde la teinte de marque discrète. Dérivation, repliée en UNE matrice :
  ///   C' = 1.15 × Sat(0.75, poids Rec. 709) · C + (128 × (1 − 1.15) + 6),
  ///   canal vert : +4 d'offset supplémentaire.
  /// → coefficients = 1.15 × matrice de désaturation ; offsets −13.2 (R, B)
  ///   et −9.2 (G).
  static const List<double> _navTileMatrix = [
    0.9236, 0.2056, 0.0208, 0, -13.2, // R
    0.0611, 1.0681, 0.0208, 0, -9.2, // G
    0.0611, 0.2056, 0.8833, 0, -13.2, // B
    0, 0, 0, 1, 0, // A
  ];

  /// Variante NUIT (bascule auto sur la luminosité système) : on assombrit et
  /// on désature le fond OSM tout en gardant le réseau lisible — confort de
  /// conduite de nuit, sans changer de fournisseur de tuiles (toujours OSM
  /// gratuit). Luminosité ~0,5, légère teinte froide.
  static const List<double> _navTileMatrixDark = [
    0.50, 0.10, 0.02, 0, -28, // R
    0.04, 0.55, 0.02, 0, -26, // G
    0.04, 0.10, 0.58, 0, -20, // B
    0, 0, 0, 1, 0, // A
  ];

  /// Clé de persistance du réglage voix (shared_preferences).
  static const _voicePrefKey = 'nav.voiceEnabled';

  /// Marge de tolérance avant l'alerte de survitesse (km/h).
  static const int _overSpeedToleranceKmh = 7;

  /// Sources d'événements carte déclenchées par un geste utilisateur : la
  /// caméra se déverrouille dès qu'on en voit une (le suivi reprend via le
  /// FAB de recentrage). Les événements `mapController` (nos propres
  /// moveAndRotate) ne déverrouillent évidemment pas.
  static const Set<MapEventSource> _userGestureSources = {
    MapEventSource.dragStart,
    MapEventSource.onDrag,
    MapEventSource.dragEnd,
    MapEventSource.flingAnimationController,
    MapEventSource.multiFingerGestureStart,
    MapEventSource.onMultiFinger,
    MapEventSource.multiFingerEnd,
    MapEventSource.doubleTap,
    MapEventSource.doubleTapHold,
    MapEventSource.scrollWheel,
  };

  final _mapController = MapController();
  final _directions = OsrmDirectionsService();

  GeoPoint? _origin;
  GeoPoint? _destination;
  List<GeoPoint> _routePolyline = const [];

  // Bilan d'arrivée (onArrived) : déclenché une seule fois.
  bool _arrivedFired = false;
  DateTime? _navStartedAt;

  double get _routeLengthMeters {
    var meters = 0.0;
    for (var i = 0; i < _routePolyline.length - 1; i++) {
      meters += _routePolyline[i].distanceTo(_routePolyline[i + 1]);
    }
    return meters;
  }

  NavigationEngine? _engine;
  NavState? _nav;
  GeoPoint? _position;
  bool _simulated = false;
  bool _recalculating = false;
  DateTime? _lastRecalcAt;
  String? _error;
  StreamSubscription<GpsTrackPoint>? _gpsSub;
  StreamSubscription<GeoPoint>? _simSub;

  /// Boussole magnétomètre pour la rotation carte À L'ARRÊT (cap route en
  /// roulant). Dégradation totale sur émulateur : flux silencieux, on garde le
  /// cap route. Le coaching éco n'utilise PAS cette instance (il a la sienne
  /// dans EchappeeGuidedNavigationScreen) — ici on n'écoute que la boussole.
  final DrivingSensors _compass = DrivingSensors();
  StreamSubscription<double>? _compassSub;
  double? _compassHeading;

  /// Caméra de poursuite : verrouillée tant que l'utilisateur n'a pas
  /// touché la carte ; le FAB de recentrage re-verrouille.
  bool _cameraLocked = true;
  double _zoom = _cruiseZoom;

  // --- Voix (guidage vocal TTS) ---
  final NavVoice _voice = NavVoice();
  final VoiceAnnouncer _announcer = VoiceAnnouncer();
  bool _voiceOn = true;

  // --- Données route (limites, radars, dangers) pré-chargées au plan ---
  final RoadSpeedService _roadSpeed = RoadSpeedService();
  List<SpeedZone> _speedZones = const [];
  List<SpeedCamera> _cameras = const [];
  List<SafetyPoint> _hazards = const [];
  List<TrafficIncident> _incidents = const [];

  /// Vitesse sol courante (km/h) et limite réglementaire au point courant.
  double _speedKmh = 0;
  int? _currentLimit;
  bool _overSpeed = false;
  SpeedCamera? _nextCamera;
  SafetyPoint? _nextHazard;

  // --- Partage de trajet en direct ---
  String? _shareToken;
  DateTime? _lastSharePush;
  static const _sharePushInterval = Duration(seconds: 8);

  @override
  void initState() {
    super.initState();
    final planner = ref.read(routePlannerProvider);
    final options = planner.options.valueOrNull ?? const <RouteOption>[];
    final option =
        planner.selectedOption ?? (options.isEmpty ? null : options.first);
    if (planner.isReady && option != null) {
      _origin = planner.origin;
      _destination = planner.destination;
      // Tracé initial : la géométrie de l'option choisie, remplacée dès que
      // la géométrie portée par les steps OSRM arrive.
      _routePolyline = _decodePolyline(option);
      unawaited(_init());
    }
    // Boussole : on garde juste le dernier cap lissé pour la caméra à l'arrêt.
    _compassSub = _compass.compassHeadings.listen((h) => _compassHeading = h);
    // Réglage voix persisté + radars embarqués (asset, gratuit).
    unawaited(_restoreVoicePref());
    unawaited(_loadCameras());
  }

  Future<void> _restoreVoicePref() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final on = prefs.getBool(_voicePrefKey) ?? true;
      if (!mounted) return;
      setState(() {
        _voiceOn = on;
        _voice.muted = !on;
      });
    } catch (_) {/* défaut : voix active */}
  }

  Future<void> _loadCameras() async {
    final cams = await SpeedCameraService.load();
    if (mounted) setState(() => _cameras = cams);
  }

  /// Limites de vitesse (Overpass) + dangers (passages à niveau / écoles) le
  /// long du tracé — pré-chargés UNE fois, best-effort, jamais bloquant.
  Future<void> _loadRoadData() async {
    if (_routePolyline.length < 2) return;
    final line = _routePolyline;
    final results = await Future.wait([
      _roadSpeed.speedLimitsAlong(line),
      SafetyAlertsService().hazardsAlong(line),
      // Incidents trafic nationaux (vide tant qu'aucun flux DATEX configuré).
      ref.read(trafficServiceProvider).incidentsAlong(line),
    ]);
    if (!mounted) return;
    final zones = results[0] as List<SpeedZone>;
    final hazards = [
      ...results[1] as List<SafetyPoint>,
      ...SafetyAlertsService.parseCurves(line),
    ];
    setState(() {
      _speedZones = zones;
      _hazards = hazards;
      _incidents = results[2] as List<TrafficIncident>;
    });
  }

  void _toggleVoice() {
    setState(() {
      _voiceOn = !_voiceOn;
      _voice.muted = !_voiceOn;
    });
    if (!_voiceOn) unawaited(_voice.stop());
    SharedPreferences.getInstance()
        .then((p) => p.setBool(_voicePrefKey, _voiceOn))
        .ignore();
  }

  /// Démarre / arrête le partage de trajet en direct. Au démarrage, copie le
  /// lien de suivi (la position/ETA sont poussées ensuite à chaque fix).
  Future<void> _toggleShare() async {
    final destination = _destination;
    if (destination == null) return;
    final service = ref.read(tripShareServiceProvider);
    if (_shareToken != null) {
      final token = _shareToken!;
      setState(() => _shareToken = null);
      await service.endShare(token);
      _snack('Partage du trajet arrêté.');
      return;
    }
    final planner = ref.read(routePlannerProvider);
    final share = await service.createShare(
      destination: destination,
      originLabel: planner.originLabel,
      destinationLabel: planner.destinationLabel,
    );
    if (!mounted) return;
    setState(() => _shareToken = share.token);
    final url = TripShare.shareUrl(share.token);
    await Clipboard.setData(ClipboardData(text: url));
    _snack('Lien de suivi copié : $url');
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  void dispose() {
    _gpsSub?.cancel();
    _simSub?.cancel();
    _compassSub?.cancel();
    unawaited(_compass.dispose());
    unawaited(_voice.dispose());
    // Clôt le partage en cours (best-effort) pour ne pas laisser un lien actif.
    final token = _shareToken;
    if (token != null) {
      unawaited(ref.read(tripShareServiceProvider).endShare(token));
    }
    _mapController.dispose();
    super.dispose();
  }

  /// Décode le polyline `lat,lng;lat,lng` quand
  /// metadata['polylineFormat'] == 'latlng-list' (mock + OSRM). Autre format
  /// (encodé Google/Mapbox) : ligne droite en attendant la géométrie OSRM.
  static List<GeoPoint> _decodePolyline(RouteOption option) {
    if (option.metadata['polylineFormat'] != 'latlng-list') {
      return [option.origin, option.destination];
    }
    return [
      for (final pair in option.polyline.split(';'))
        GeoPoint(
          latitude: double.parse(pair.split(',')[0]),
          longitude: double.parse(pair.split(',')[1]),
        ),
    ];
  }

  Future<void> _init() async {
    final origin = _origin!;
    final destination = _destination!;
    // MVP : même si l'option sélectionnée passe par des haltes
    // (metadata['viaCount']), on redemande à OSRM le trajet direct avec les
    // MÊMES origine/destination et on navigue sur la géométrie retournée
    // avec les steps — instructions et tracé restent ainsi alignés.
    //
    // Résilience : si OSRM directions est lent/indisponible (serveur démo
    // limité), on NE BLOQUE PAS sur « Préparation ». On navigue alors sur la
    // géométrie de l'option déjà sélectionnée, sans instructions tour-par-tour
    // (la carte suit et tourne quand même, ETA et progression restent calculés).
    // Étapes manuelles : la nav route à travers elles (vrai tour-par-tour).
    final vias =
        ref.read(routePlannerProvider).manualStops.map((s) => s.point).toList();
    List<NavInstruction> instructions = const [];
    try {
      instructions = await _directions
          .getDirections(
              origin: origin, destination: destination, vias: vias)
          .timeout(const Duration(seconds: 9));
    } catch (e) {
      _log.warn('directions indisponibles, navigation sur la géométrie '
          'de l\'option (sans instructions): $e');
    }
    if (!mounted) return;
    final geometry =
        instructions.isEmpty ? const <GeoPoint>[] : stitchGeometry(instructions);
    if (_routePolyline.length < 2 && geometry.length < 2) {
      // Aucune géométrie exploitable du tout : là seulement, on signale.
      setState(() =>
          _error = 'La navigation ne répond pas. Réessaie dans un instant.');
      return;
    }
    setState(() {
      if (geometry.length > 1) _routePolyline = geometry;
      _engine = NavigationEngine(
          instructions: instructions, polyline: _routePolyline);
    });
    _startPositionStream();
    unawaited(_loadRoadData());
  }

  /// GPS réel quand le device en a un (repo Geolocator) ; sinon — émulateur,
  /// desktop, démo — on rejoue le trajet en accéléré.
  void _startPositionStream() {
    final repo = ref.read(locationRepositoryProvider);
    if (repo is GeolocatorLocationRepository) {
      _gpsSub = repo
          .watchPosition(
            tripId: 'nav-${DateTime.now().millisecondsSinceEpoch}',
            userId: 'navigation',
          )
          .listen(
            (pt) => _onPosition(pt.point, speedMps: pt.speedMps),
            onError: (Object e) {
              _log.warn('GPS indisponible, bascule en simulation: $e');
              _startSimulation();
            },
          );
    } else {
      _startSimulation();
    }
  }

  void _startSimulation() {
    if (!mounted || _simulated) return;
    _gpsSub?.cancel();
    final drive = SimulatedDrive(polyline: _routePolyline);
    setState(() => _simulated = true);
    _simSub = drive
        .positions()
        .listen((p) => _onPosition(p, speedMps: drive.speedMps));
  }

  void _onPosition(GeoPoint p, {double? speedMps}) {
    final engine = _engine;
    if (!mounted || engine == null) return;
    final nav = engine.update(p, speedMps: speedMps);
    widget.onPositionUpdate?.call(p, speedMps ?? 0);

    // Vitesse sol + limite réglementaire (Overpass) au point courant.
    final speedKmh = (speedMps ?? 0) * 3.6;
    final limit = RoadSpeedService.limitAt(p, _speedZones);
    final over = limit != null && speedKmh > limit + _overSpeedToleranceKmh;
    // Radar / danger le plus proche DEVANT (dans le couloir, selon le cap).
    final camera =
        SpeedCameraService.nextCamera(p, nav.headingDegrees, _cameras);
    final hazard =
        SafetyAlertsService.nextHazardAhead(p, nav.headingDegrees, _hazards);

    setState(() {
      _position = p;
      _nav = nav;
      _speedKmh = speedKmh;
      _currentLimit = limit;
      _nextCamera = camera;
      _nextHazard = hazard;
    });

    // Guidage vocal : la bonne consigne au bon moment + haptique à l'imminence.
    if (_voiceOn) {
      final phrase = _announcer.onNav(nav);
      if (phrase != null) {
        unawaited(_voice.speak(phrase));
        if (_announcer.isImminent) HapticFeedback.mediumImpact();
      }
    }
    // Alerte survitesse au FRONT MONTANT (une annonce, une vibration franche).
    if (over && !_overSpeed) {
      HapticFeedback.heavyImpact();
      if (_voiceOn) unawaited(_voice.speak('Tu dépasses la limite'));
    }
    _overSpeed = over;

    // Partage en direct : pousse position + ETA, au plus toutes les 8 s.
    if (_shareToken != null) {
      final now = DateTime.now();
      if (_lastSharePush == null ||
          now.difference(_lastSharePush!) >= _sharePushInterval) {
        _lastSharePush = now;
        unawaited(ref.read(tripShareServiceProvider).updateProgress(
              _shareToken!,
              position: p,
              eta: now.add(Duration(seconds: nav.etaSeconds.round())),
              remainingMeters: nav.remainingMeters,
            ));
      }
    }

    if (_cameraLocked) _followCamera(p, nav.headingDegrees, speedMps);
    if (nav.offRoute && !_simulated) unawaited(_maybeRecalculate(p));
    // Arrivée : un seul déclenchement, avec la distance réellement parcourue
    // et la durée écoulée depuis le premier fix.
    if (!_arrivedFired && nav.remainingMeters < 30) {
      _arrivedFired = true;
      _navStartedAt ??= DateTime.now();
      final elapsed =
          DateTime.now().difference(_navStartedAt!).inMilliseconds / 1000.0;
      final traveledKm = _routeLengthMeters * nav.progress / 1000.0;
      widget.onArrived?.call(traveledKm, elapsed);
    }
    _navStartedAt ??= DateTime.now();
  }

  /// Caméra de poursuite course-up, signe de rotation VÉRIFIÉ sur
  /// flutter_map 7.0.2 : la caméra applique sa rotation au contenu via
  /// `Transform.rotate(angle: rotationRad)` (MobileLayerTransformer), et un
  /// angle positif tourne le contenu en sens HORAIRE à l'écran. Pour amener
  /// le cap H (0 = N, 90 = E) vers le haut, on passe donc `-H` : en roulant
  /// vers l'est (H = 90), la carte tourne de 90° anti-horaire et l'est pointe
  /// en haut. Le centre visé est décalé EN AVANT du cap pour que la voiture
  /// s'affiche vers ~60 % de la hauteur, façon Waze.
  ///
  /// Cap caméra FUSIONNÉ (NavigationEngine.cameraHeading) : cap route en
  /// roulant (> 3 m/s, stable), boussole magnétomètre à l'arrêt (la carte
  /// reste orientée comme pointe le téléphone). Boussole absente (émulateur) →
  /// repli sur le cap route. [routeHeading] est le cap NavState (segment
  /// polyline apparié, lissé).
  void _followCamera(GeoPoint p, double routeHeading, double? speedMps) {
    final heading = NavigationEngine.cameraHeading(
      routeHeading: routeHeading,
      compass: _compassHeading,
      speedMps: speedMps ?? 0,
    );
    // Auto-zoom : on resserre à l'approche d'une manœuvre (distance déjà
    // calculée par le moteur), sinon zoom de croisière, dézoomé à haute vitesse.
    final maneuverAhead = _nav?.distanceToManeuverMeters ?? double.infinity;
    final double targetZoom;
    if (maneuverAhead < _maneuverZoomMeters) {
      targetZoom = _maneuverZoom;
    } else if ((speedMps ?? 0) > _fastSpeedMps) {
      targetZoom = _fastZoom;
    } else {
      targetZoom = _cruiseZoom;
    }
    _zoom += (targetZoom - _zoom) * _zoomEase;
    final ahead =
        NavigationEngine.offsetBy(p, heading, _lookAheadMeters(p.latitude));
    try {
      _mapController.moveAndRotate(
        LatLng(ahead.latitude, ahead.longitude),
        _zoom,
        -heading,
      );
    } catch (_) {
      // Carte pas encore rendue : le prochain fix recadrera.
    }
  }

  /// Distance d'avance caméra ≈ 18 % de la hauteur visible de carte.
  /// Approximation : hauteur visible ≈ hauteur écran (carte plein écran) ×
  /// résolution Mercator au zoom courant (156543.03392 × cos(lat) / 2^zoom
  /// m/px). À zoom 16.5 cela donne ~150–220 m selon l'appareil — du même
  /// ordre que la constante ~250 m à zoom 16 communément utilisée.
  double _lookAheadMeters(double latitude) {
    final metersPerPixel = 156543.03392 *
        math.cos(latitude * math.pi / 180) /
        math.pow(2, _zoom);
    return _lookAheadFraction *
        MediaQuery.sizeOf(context).height *
        metersPerPixel;
  }

  /// Un geste utilisateur libère la caméra (on arrête de la déplacer) ; le
  /// FAB de recentrage la re-verrouille.
  void _onMapEvent(MapEvent event) {
    if (_cameraLocked && _userGestureSources.contains(event.source)) {
      setState(() => _cameraLocked = false);
    }
  }

  void _recenter() {
    setState(() => _cameraLocked = true);
    final p = _position;
    if (p != null) _followCamera(p, _nav?.headingDegrees ?? 0, null);
  }

  /// Hors route → re-demande les directions depuis la position courante,
  /// au plus une fois toutes les 10 s.
  Future<void> _maybeRecalculate(GeoPoint from) async {
    final destination = _destination;
    if (destination == null || _recalculating) return;
    final last = _lastRecalcAt;
    if (last != null && DateTime.now().difference(last) < _recalcCooldown) {
      return;
    }
    _lastRecalcAt = DateTime.now();
    setState(() => _recalculating = true);
    // Annonce le recalcul (voix + réarme l'annonceur pour le nouveau tracé).
    _announcer.reset();
    if (_voiceOn) unawaited(_voice.speak('Recalcul de l\'itinéraire'));
    try {
      final instructions = await _directions.getDirections(
          origin: from, destination: destination);
      if (!mounted) return;
      final geometry = stitchGeometry(instructions);
      setState(() {
        if (geometry.length > 1) _routePolyline = geometry;
        _engine = NavigationEngine(
            instructions: instructions, polyline: _routePolyline);
      });
      unawaited(_loadRoadData());
    } catch (e) {
      _log.warn('recalcul impossible: $e');
    } finally {
      if (mounted) setState(() => _recalculating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final origin = _origin;
    if (origin == null || _destination == null) {
      return EchappeePage(
        child: Scaffold(
          body: EchappeeEmptyState(
            title: "Choisis d'abord un itinéraire.",
            message: 'La navigation démarre depuis un trajet calculé.',
            actionLabel: 'Retour',
            onAction: () => context.pop(),
            icon: Icons.navigation_outlined,
          ),
        ),
      );
    }
    if (_error != null) {
      return EchappeePage(
        child: Scaffold(
          body: EchappeeEmptyState(
            title: 'La route se dérobe.',
            message: _error!,
            actionLabel: 'Réessayer',
            onAction: () {
              setState(() => _error = null);
              unawaited(_init());
            },
            icon: Icons.wifi_off,
          ),
        ),
      );
    }
    return EchappeePage(
      child: Scaffold(
        body: Stack(
          children: [
            Positioned.fill(child: _buildMap(origin)),
            SafeArea(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(EchappeeSpacing.screen,
                        EchappeeSpacing.s12, EchappeeSpacing.screen, 0),
                    child: _buildInstructionCard(),
                  ),
                  _buildLaneStrip(),
                  _buildStreetBanner(),
                  Padding(
                    padding: const EdgeInsets.only(
                        top: EchappeeSpacing.s8,
                        left: EchappeeSpacing.screen,
                        right: EchappeeSpacing.screen),
                    child: Row(
                      children: [
                        _VoiceToggle(on: _voiceOn, onTap: _toggleVoice),
                        const SizedBox(width: EchappeeSpacing.s8),
                        _RoundButton(
                          icon: _shareToken == null
                              ? Icons.share_outlined
                              : Icons.share,
                          active: _shareToken != null,
                          tooltip: _shareToken == null
                              ? 'Partager mon trajet'
                              : 'Arrêter le partage',
                          onTap: _toggleShare,
                        ),
                        const Spacer(),
                        if (_simulated) const _SimulationChip(),
                      ],
                    ),
                  ),
                  _buildAlertBanner(),
                  const Spacer(),
                  // Slot EcoCoach : bottom-center, au-dessus de la barre basse.
                  if (widget.coachOverlay != null)
                    Padding(
                      padding:
                          const EdgeInsets.only(bottom: EchappeeSpacing.s8),
                      child: Center(child: widget.coachOverlay),
                    ),
                  if (!_cameraLocked)
                    Padding(
                      padding: const EdgeInsets.only(
                          right: EchappeeSpacing.screen,
                          bottom: EchappeeSpacing.s8),
                      child: Align(
                        alignment: Alignment.centerRight,
                        child: FloatingActionButton.small(
                          heroTag: null,
                          backgroundColor: EchappeeColors.primary,
                          foregroundColor: EchappeeColors.surface,
                          tooltip: 'Recentrer',
                          onPressed: _recenter,
                          child: const Icon(Icons.navigation_rounded),
                        ),
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.only(
                        left: EchappeeSpacing.screen,
                        right: EchappeeSpacing.screen,
                        bottom: EchappeeSpacing.s4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        _Speedometer(speedKmh: _speedKmh, overSpeed: _overSpeed),
                        if (_currentLimit != null) ...[
                          const SizedBox(width: EchappeeSpacing.s8),
                          _SpeedLimitSign(limitKmh: _currentLimit!),
                        ],
                        const Spacer(),
                        const Text('© OpenStreetMap',
                            style: EchappeeTypography.bodySmall),
                      ],
                    ),
                  ),
                  _buildBottomBar(context),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMap(GeoPoint origin) {
    final position = _position;
    final nav = _nav;
    final route = [
      for (final p in _routePolyline) LatLng(p.latitude, p.longitude),
    ];
    final car = position == null
        ? null
        : LatLng(position.latitude, position.longitude);
    // Découpe parcouru / à venir au droit du segment apparié par le moteur ;
    // la voiture sert de joint (elle est à quelques mètres de la ligne).
    var traveled = const <LatLng>[];
    var aheadRoute = route;
    final matched = nav?.matchedIndex ?? 0;
    if (car != null && route.length > 1 && matched < route.length - 1) {
      traveled = [...route.sublist(0, matched + 1), car];
      aheadRoute = [car, ...route.sublist(matched + 1)];
    }
    return FlutterMap(
      mapController: _mapController,
      options: MapOptions(
        initialCenter: LatLng(
            (position ?? origin).latitude, (position ?? origin).longitude),
        initialZoom: _cruiseZoom,
        // Pendant le guidage : drag + pinch zoom autorisés (exploration),
        // rotation utilisateur désactivée — c'est la caméra qui tient le cap.
        interactionOptions: const InteractionOptions(
          flags: InteractiveFlag.drag |
              InteractiveFlag.flingAnimation |
              InteractiveFlag.pinchMove |
              InteractiveFlag.pinchZoom |
              InteractiveFlag.doubleTapZoom |
              InteractiveFlag.scrollWheelZoom,
        ),
        onMapEvent: _onMapEvent,
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.routecore.routecore',
          tileBuilder: (context, tileWidget, tile) => ColorFiltered(
            // Bascule jour/nuit auto sur la luminosité système (gratuit, même
            // fournisseur OSM — la nuit assombrit/désature le fond).
            colorFilter: ColorFilter.matrix(
                MediaQuery.platformBrightnessOf(context) == Brightness.dark
                    ? _navTileMatrixDark
                    : _navTileMatrix),
            child: tileWidget,
          ),
        ),
        if (route.length > 1)
          PolylineLayer(
            polylines: [
              // Liseré clair sous tout le tracé, puis la portion parcourue
              // en gris et la route à venir en vert de marque.
              Polyline(
                points: route,
                color: EchappeeColors.surface,
                strokeWidth: _routeCasingWidth,
              ),
              if (traveled.length > 1)
                Polyline(
                  points: traveled,
                  color: EchappeeColors.disabled,
                  strokeWidth: _routeStrokeWidth,
                ),
              Polyline(
                points: aheadRoute,
                color: EchappeeColors.primary,
                strokeWidth: _routeStrokeWidth,
              ),
            ],
          ),
        MarkerLayer(
          markers: [
            // Radars fixes (asset officiel) le long du tracé.
            for (final cam in _cameras)
              Marker(
                point: LatLng(cam.location.latitude, cam.location.longitude),
                width: 26,
                height: 26,
                child: _MapBadge(
                    icon: Icons.speed_rounded, color: Colors.red.shade700),
              ),
            // Dangers ponctuels (passage à niveau, zone scolaire) — pas les
            // virages (utilisés seulement pour l'alerte de proximité).
            for (final h in _hazards)
              if (h.kind != SafetyKind.sharpCurve)
                Marker(
                  point: LatLng(h.location.latitude, h.location.longitude),
                  width: 26,
                  height: 26,
                  child: _MapBadge(
                      icon: _hazardIcon(h.kind), color: Colors.amber.shade800),
                ),
            // Incidents trafic (Bison Futé) le long du tracé.
            for (final inc in _incidents)
              Marker(
                point:
                    LatLng(inc.location.latitude, inc.location.longitude),
                width: 26,
                height: 26,
                child: const _MapBadge(
                    icon: Icons.warning_amber_rounded,
                    color: EchappeeColors.error),
              ),
            if (route.isNotEmpty)
              Marker(
                point: route.last,
                width: _positionMarkerSize,
                height: _positionMarkerSize,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: EchappeeColors.primary,
                    shape: BoxShape.circle,
                    border:
                        Border.all(color: EchappeeColors.surface, width: 2.5),
                    boxShadow: EchappeeShadows.sm,
                  ),
                ),
              ),
            if (car != null)
              Marker(
                point: car,
                width: _carMarkerSize,
                height: _carMarkerSize,
                // Marker.rotate reste à false : le chevron vit dans la couche
                // tournée avec la carte, et on l'oriente du cap de la route
                // (sens horaire depuis le nord carte). Caméra verrouillée
                // (rotation carte = -cap), il pointe donc exactement vers le
                // haut de l'écran ; caméra libérée, il continue d'indiquer la
                // vraie direction de déplacement.
                child: Transform.rotate(
                  angle: (nav?.headingDegrees ?? 0) * math.pi / 180,
                  child: Container(
                    decoration: BoxDecoration(
                      color: EchappeeColors.primary,
                      shape: BoxShape.circle,
                      border:
                          Border.all(color: EchappeeColors.surface, width: 3),
                      boxShadow: EchappeeShadows.sm,
                    ),
                    child: const Icon(
                      Icons.navigation,
                      size: _carIconSize,
                      color: EchappeeColors.surface,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }

  Widget _buildInstructionCard() {
    final nav = _nav;
    if (_recalculating) {
      return const _InstructionCard(
          icon: Icons.refresh, title: 'Recalcul…', loading: true);
    }
    // Tant que le moteur n'est pas prêt : vraie préparation.
    if (_engine == null) {
      return const _InstructionCard(
        icon: Icons.route,
        title: "Préparation de l'itinéraire…",
        loading: true,
      );
    }
    // Moteur prêt mais pas d'instruction tour-par-tour (directions OSRM
    // indisponibles) : la carte suit et tourne, on invite juste à suivre.
    final current = nav?.current;
    if (current == null) {
      return const _InstructionCard(
        icon: Icons.navigation_rounded,
        title: 'Suis l\'itinéraire',
      );
    }
    return _InstructionCard(
      icon: _maneuverIcon(current),
      title: frenchText(current),
      distanceLabel: current.maneuverType == 'arrive'
          ? null
          : _formatDistance(nav!.distanceToManeuverMeters),
    );
  }

  /// Bande de guidage de file (flèches de voie) pour la manœuvre à venir ;
  /// les voies invalides sont grisées. Vide quand OSRM ne porte pas de lanes.
  Widget _buildLaneStrip() {
    final lanes = _nav?.current?.lanes ?? const <NavLane>[];
    if (lanes.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(
          top: EchappeeSpacing.s8,
          left: EchappeeSpacing.screen,
          right: EchappeeSpacing.screen),
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: EchappeeSpacing.s12, vertical: EchappeeSpacing.s8),
        decoration: const BoxDecoration(
          color: EchappeeColors.surface,
          borderRadius: EchappeeRadius.lgAll,
          boxShadow: EchappeeShadows.sm,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (final lane in lanes)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: Icon(
                  _laneIcon(lane),
                  size: 26,
                  color: lane.valid
                      ? EchappeeColors.primary
                      : EchappeeColors.disabled,
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// Bandeau discret « rue courante » (nom de la voie en cours).
  Widget _buildStreetBanner() {
    final road = _nav?.currentRoadName;
    if (road == null || road.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(
          top: EchappeeSpacing.s8,
          left: EchappeeSpacing.screen,
          right: EchappeeSpacing.screen),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(
              horizontal: EchappeeSpacing.s12, vertical: EchappeeSpacing.s4),
          decoration: const BoxDecoration(
            color: EchappeeColors.surface,
            borderRadius: EchappeeRadius.fullAll,
            boxShadow: EchappeeShadows.sm,
          ),
          child: Text(road,
              style: EchappeeTypography.body
                  .copyWith(fontWeight: FontWeight.w600)),
        ),
      ),
    );
  }

  /// Bandeau d'alerte de proximité : radar (priorité) ou danger géo imminent.
  Widget _buildAlertBanner() {
    final cam = _nextCamera;
    final hazard = _nextHazard;
    String? label;
    IconData icon = Icons.warning_amber_rounded;
    Color color = Colors.amber.shade800;
    if (cam != null) {
      icon = Icons.speed_rounded;
      color = EchappeeColors.error;
      label = cam.limitKmh != null ? 'Radar ${cam.limitKmh} km/h' : 'Radar';
    } else if (hazard != null) {
      icon = _hazardIcon(hazard.kind);
      label = _hazardLabel(hazard.kind);
    }
    if (label == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(
          top: EchappeeSpacing.s8,
          left: EchappeeSpacing.screen,
          right: EchappeeSpacing.screen),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Container(
          padding: const EdgeInsets.symmetric(
              horizontal: EchappeeSpacing.s12, vertical: EchappeeSpacing.s8),
          decoration: BoxDecoration(
            color: color,
            borderRadius: EchappeeRadius.fullAll,
            boxShadow: EchappeeShadows.sm,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 18, color: Colors.white),
              const SizedBox(width: EchappeeSpacing.s8),
              Text(label,
                  style: EchappeeTypography.caption.copyWith(
                      color: Colors.white, fontWeight: FontWeight.w700)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBottomBar(BuildContext context) {
    final nav = _nav;
    final etaClock = nav == null
        ? '—'
        : _formatClock(
            DateTime.now().add(Duration(seconds: nav.etaSeconds.round())));
    final remaining = nav == null ? '—' : _formatRemaining(nav.etaSeconds);
    final distance = nav == null ? '—' : _formatDistance(nav.remainingMeters);
    return Padding(
      padding: const EdgeInsets.fromLTRB(EchappeeSpacing.screen,
          EchappeeSpacing.s8, EchappeeSpacing.screen, EchappeeSpacing.s16),
      child: Container(
        padding: const EdgeInsets.all(EchappeeSpacing.card),
        decoration: const BoxDecoration(
          color: EchappeeColors.surface,
          borderRadius: EchappeeRadius.xlAll,
          boxShadow: EchappeeShadows.lg,
        ),
        child: Row(
          children: [
            Expanded(child: _Stat(label: 'Arrivée', value: etaClock)),
            Expanded(child: _Stat(label: 'Durée', value: remaining)),
            Expanded(child: _Stat(label: 'Distance', value: distance)),
            EchappeeButton(
              label: 'Quitter',
              variant: EchappeeButtonVariant.secondary,
              expanded: false,
              onPressed: () => context.pop(),
            ),
          ],
        ),
      ),
    );
  }
}

IconData _maneuverIcon(NavInstruction instruction) {
  final modifier = instruction.modifier ?? '';
  final left = modifier.contains('left');
  switch (instruction.maneuverType) {
    case 'depart':
      return Icons.navigation_rounded;
    case 'arrive':
      return Icons.sports_score;
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
    case 'exit roundabout':
    case 'exit rotary':
      return left ? Icons.roundabout_left : Icons.roundabout_right;
    case 'merge':
      return Icons.merge;
    case 'on ramp':
    case 'off ramp':
      return left ? Icons.ramp_left : Icons.ramp_right;
    case 'fork':
      return left ? Icons.fork_left : Icons.fork_right;
  }
  switch (modifier) {
    case 'left':
      return Icons.turn_left;
    case 'right':
      return Icons.turn_right;
    case 'slight left':
      return Icons.turn_slight_left;
    case 'slight right':
      return Icons.turn_slight_right;
    case 'sharp left':
      return Icons.turn_sharp_left;
    case 'sharp right':
      return Icons.turn_sharp_right;
    case 'uturn':
      return Icons.u_turn_left;
  }
  return Icons.straight;
}

/// Flèche d'une voie (guidage de file) — première indication OSRM connue.
IconData _laneIcon(NavLane lane) {
  final ind = lane.indications.isEmpty ? 'straight' : lane.indications.first;
  if (ind.contains('uturn')) return Icons.u_turn_left;
  if (ind.contains('sharp left')) return Icons.turn_sharp_left;
  if (ind.contains('sharp right')) return Icons.turn_sharp_right;
  if (ind.contains('slight left')) return Icons.turn_slight_left;
  if (ind.contains('slight right')) return Icons.turn_slight_right;
  if (ind.contains('left')) return Icons.turn_left;
  if (ind.contains('right')) return Icons.turn_right;
  return Icons.straight;
}

IconData _hazardIcon(SafetyKind kind) => switch (kind) {
      SafetyKind.railwayCrossing => Icons.train_rounded,
      SafetyKind.school => Icons.school_rounded,
      SafetyKind.sharpCurve => Icons.turn_sharp_right,
    };

String _hazardLabel(SafetyKind kind) => switch (kind) {
      SafetyKind.railwayCrossing => 'Passage à niveau',
      SafetyKind.school => 'Zone scolaire',
      SafetyKind.sharpCurve => 'Virage serré',
    };

/// « 300 m », « 1,2 km », « 42 km ».
String _formatDistance(double meters) {
  if (meters < 1000) return '${(meters / 10).round() * 10} m';
  final km = meters / 1000;
  if (km >= 10) return '${km.round()} km';
  return '${km.toStringAsFixed(1).replaceAll('.', ',')} km';
}

/// « 1h12 », « 8 min ».
String _formatRemaining(double seconds) {
  final total = seconds.round();
  final h = total ~/ 3600;
  final m = (total % 3600) ~/ 60;
  if (h > 0) return '${h}h${m.toString().padLeft(2, '0')}';
  return '${m < 1 ? 1 : m} min';
}

/// « 14:07 ».
String _formatClock(DateTime t) =>
    '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

/// Card du haut : grosse icône de manœuvre, distance en Fraunces (h2) et
/// consigne en français dessous.
class _InstructionCard extends StatelessWidget {
  const _InstructionCard({
    required this.icon,
    required this.title,
    this.distanceLabel,
    this.loading = false,
  });

  final IconData icon;
  final String title;
  final String? distanceLabel;
  final bool loading;

  static const double _iconDiscSize = 64;
  static const double _iconSize = 40;
  static const double _spinnerSize = 18;
  static const double _spinnerStroke = 2;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(EchappeeSpacing.card),
      decoration: const BoxDecoration(
        color: EchappeeColors.surface,
        borderRadius: EchappeeRadius.xlAll,
        boxShadow: EchappeeShadows.lg,
      ),
      child: Row(
        children: [
          Container(
            width: _iconDiscSize,
            height: _iconDiscSize,
            decoration: const BoxDecoration(
              color: EchappeeColors.primaryTint,
              shape: BoxShape.circle,
            ),
            child: loading
                ? const Center(
                    child: SizedBox(
                      width: _spinnerSize,
                      height: _spinnerSize,
                      child: CircularProgressIndicator(
                        strokeWidth: _spinnerStroke,
                        color: EchappeeColors.primary,
                      ),
                    ),
                  )
                : Icon(icon, size: _iconSize, color: EchappeeColors.primary),
          ),
          const SizedBox(width: EchappeeSpacing.s16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (distanceLabel != null)
                  Text(
                    distanceLabel!,
                    style: EchappeeTypography.h2
                        .copyWith(color: EchappeeColors.primary),
                  ),
                Text(
                  title,
                  style: EchappeeTypography.body
                      .copyWith(fontWeight: FontWeight.w600),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Pill discret signalant la conduite simulée (démo émulateur).
class _SimulationChip extends StatelessWidget {
  const _SimulationChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: EchappeeSpacing.s12, vertical: EchappeeSpacing.s4),
      decoration: const BoxDecoration(
        color: EchappeeColors.accentTint,
        borderRadius: EchappeeRadius.fullAll,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.play_arrow_rounded,
              size: 14, color: EchappeeColors.textPrimary),
          const SizedBox(width: EchappeeSpacing.s4),
          Text(
            'Simulation',
            style: EchappeeTypography.caption.copyWith(
              color: EchappeeColors.textPrimary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

/// Petite stat du bandeau bas (valeur + libellé).
class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value, style: EchappeeTypography.h3),
        Text(label, style: EchappeeTypography.caption),
      ],
    );
  }
}

/// Bouton de bascule de la voix (guidage vocal on/off).
class _VoiceToggle extends StatelessWidget {
  const _VoiceToggle({required this.on, required this.onTap});

  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: EchappeeColors.surface,
      shape: const CircleBorder(),
      elevation: 2,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(EchappeeSpacing.s8),
          child: Icon(
            on ? Icons.volume_up_rounded : Icons.volume_off_rounded,
            size: 22,
            color: on ? EchappeeColors.primary : EchappeeColors.disabled,
            semanticLabel: on ? 'Couper la voix' : 'Activer la voix',
          ),
        ),
      ),
    );
  }
}

/// Petit bouton rond générique (carte de navigation).
class _RoundButton extends StatelessWidget {
  const _RoundButton({
    required this.icon,
    required this.onTap,
    this.active = false,
    this.tooltip,
  });

  final IconData icon;
  final VoidCallback onTap;
  final bool active;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: EchappeeColors.surface,
      shape: const CircleBorder(),
      elevation: 2,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(EchappeeSpacing.s8),
          child: Icon(
            icon,
            size: 22,
            color: active ? EchappeeColors.primary : EchappeeColors.textSecondary,
            semanticLabel: tooltip,
          ),
        ),
      ),
    );
  }
}

/// Compteur de vitesse (km/h). Anneau rouge quand on dépasse la limite.
class _Speedometer extends StatelessWidget {
  const _Speedometer({required this.speedKmh, required this.overSpeed});

  final double speedKmh;
  final bool overSpeed;

  static const double _size = 58;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: _size,
      height: _size,
      decoration: BoxDecoration(
        color: EchappeeColors.surface,
        shape: BoxShape.circle,
        border: Border.all(
          color: overSpeed ? EchappeeColors.error : EchappeeColors.surface,
          width: 3,
        ),
        boxShadow: EchappeeShadows.sm,
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            '${speedKmh.round()}',
            style: EchappeeTypography.h3.copyWith(
              height: 1,
              color: overSpeed
                  ? EchappeeColors.error
                  : EchappeeColors.textPrimary,
            ),
          ),
          Text('km/h',
              style: EchappeeTypography.caption
                  .copyWith(height: 1, color: EchappeeColors.textSecondary)),
        ],
      ),
    );
  }
}

/// Panneau de limite de vitesse façon européen (disque blanc, cerclé rouge).
class _SpeedLimitSign extends StatelessWidget {
  const _SpeedLimitSign({required this.limitKmh});

  final int limitKmh;

  static const double _size = 50;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: _size,
      height: _size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        border: Border.all(color: EchappeeColors.error, width: 4),
        boxShadow: EchappeeShadows.sm,
      ),
      child: Text(
        '$limitKmh',
        style: EchappeeTypography.h3.copyWith(
          color: Colors.black,
          fontWeight: FontWeight.w800,
          height: 1,
        ),
      ),
    );
  }
}

/// Pastille de carte (radar, danger) — petit disque coloré avec icône.
class _MapBadge extends StatelessWidget {
  const _MapBadge({required this.icon, required this.color});

  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2),
        boxShadow: EchappeeShadows.sm,
      ),
      child: Icon(icon, size: 14, color: Colors.white),
    );
  }
}
