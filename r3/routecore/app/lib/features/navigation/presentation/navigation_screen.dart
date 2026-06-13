import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart' show LatLng;

import '../../../app/providers.dart';
import '../../../core/logging/app_logger.dart';
import '../../../product_modules/ecodrive/data/driving_sensors.dart';
import '../../../product_modules/echappee/design_system/design_system.dart';
import '../../../product_modules/echappee/presentation/echappee_page.dart';
import '../../../shared/models/models.dart';
import '../../location/data/location_repositories.dart';
import '../../routing/presentation/route_planner_controller.dart';
import '../data/osrm_directions_service.dart';
import '../domain/navigation_engine.dart';

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
  }

  @override
  void dispose() {
    _gpsSub?.cancel();
    _simSub?.cancel();
    _compassSub?.cancel();
    unawaited(_compass.dispose());
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
    List<NavInstruction> instructions = const [];
    try {
      instructions = await _directions
          .getDirections(origin: origin, destination: destination)
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
    setState(() {
      _position = p;
      _nav = nav;
    });
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
    final targetZoom =
        (speedMps ?? 0) > _fastSpeedMps ? _fastZoom : _cruiseZoom;
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
                  if (_simulated)
                    const Padding(
                      padding: EdgeInsets.only(
                          top: EchappeeSpacing.s8,
                          right: EchappeeSpacing.screen),
                      child: Align(
                        alignment: Alignment.centerRight,
                        child: _SimulationChip(),
                      ),
                    ),
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
                  const Padding(
                    padding: EdgeInsets.only(
                        right: EchappeeSpacing.screen,
                        bottom: EchappeeSpacing.s4),
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: Text('© OpenStreetMap',
                          style: EchappeeTypography.bodySmall),
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
            colorFilter: const ColorFilter.matrix(_navTileMatrix),
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
